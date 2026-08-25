/**
 * POS Print Agent - Agente local de impresión térmica
 * Corre en http://localhost:4001
 * 
 * Endpoints:
 *   GET  /health          → Estado del agente
 *   GET  /printers        → Lista de impresoras instaladas/disponibles en el sistema
 *   POST /print/kitchen   → Imprime un ticket de cocina
 *   POST /print/receipt   → Imprime un recibo/boleta
 */

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

const app = express();
const PORT = 4001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ============================================
// LISTAR IMPRESORAS DEL SISTEMA
// ============================================
app.get('/printers', (req, res) => {
  // En Windows usamos PowerShell para obtener todas las impresoras y sus nombres compartidos
  const command = process.platform === 'win32'
    ? `powershell -Command "Get-Printer | Select-Object -Property Name, ShareName, Shared | ConvertTo-Json -Compress"`
    : `lpstat -a 2>/dev/null | awk '{print $1}'`; // Linux/Mac fallback

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al obtener impresoras:', error);
      return res.json({ printers: [], error: 'No se pudieron listar las impresoras' });
    }

    try {
      if (process.platform === 'win32') {
        let parsed = JSON.parse(stdout);
        if (!Array.isArray(parsed)) parsed = [parsed];
        
        // Retornamos el ShareName si la impresora está compartida.
        // El agente local requiere el ShareName para conectarse mediante SMB (\\\\localhost\\ShareName).
        const printers = parsed.map(p => (p.Shared && p.ShareName) ? p.ShareName : p.Name);
        
        // Hacemos un set para evitar repetidos por si acaso
        const uniquePrinters = [...new Set(printers)];
        return res.json({ printers: uniquePrinters });
      } else {
        const printers = stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('--'));
        return res.json({ printers });
      }
    } catch (parseErr) {
      console.error('Error parseando JSON de impresoras:', parseErr);
      return res.json({ printers: [] });
    }
  });
});

// ============================================
// IMPRIMIR TICKET DE COCINA
// ============================================
app.post('/print/kitchen', async (req, res) => {
  const { printerName, tableName, time, items, notes } = req.body;

  if (!printerName) {
    return res.status(400).json({ error: 'printerName es requerido' });
  }

  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `\\\\localhost\\${printerName}`, // Windows shared printer
      characterSet: CharacterSet.PC858_EURO,
      breakLine: BreakLine.WORD,
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: { timeout: 3000 }
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return res.status(503).json({ error: `Impresora "${printerName}" no disponible` });
    }

    // ---- DISEÑO DEL TICKET DE COCINA ----
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`*** COCINA ***`);
    printer.bold(false);
    printer.drawLine();

    printer.alignLeft();
    printer.bold(true);
    printer.println(`Mesa: ${tableName || 'Sin mesa'}`);
    printer.bold(false);
    printer.println(`Hora: ${time || new Date().toLocaleTimeString('es-PE')}`);
    printer.drawLine();

    // Ítems
    if (items && items.length > 0) {
      items.forEach(item => {
        printer.bold(true);
        printer.println(`  ${item.quantity}x ${item.name}`);
        printer.bold(false);
        if (item.notes) {
          printer.println(`     Nota: ${item.notes}`);
        }
      });
    }

    if (notes) {
      printer.drawLine();
      printer.println(`Nota general: ${notes}`);
    }

    printer.drawLine();
    printer.cut();

    await printer.execute();
    console.log(`✅ Ticket de cocina enviado a: ${printerName}`);
    res.json({ success: true, printer: printerName });

  } catch (err) {
    console.error('Error al imprimir ticket de cocina:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// IMPRIMIR RECIBO / BOLETA
// ============================================
app.post('/print/receipt', async (req, res) => {
  const { printerName, tableName, items, payments, totalAmount, tipAmount, restaurantName } = req.body;

  if (!printerName) {
    return res.status(400).json({ error: 'printerName es requerido' });
  }

  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `\\\\localhost\\${printerName}`,
      characterSet: CharacterSet.PC858_EURO,
      breakLine: BreakLine.WORD,
      removeSpecialCharacters: false,
      options: { timeout: 3000 }
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return res.status(503).json({ error: `Impresora "${printerName}" no disponible` });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-PE');
    const timeStr = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    // ---- DISEÑO DEL RECIBO ----
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(restaurantName || 'RESTAURANTE');
    printer.setTextSize(0, 0);
    printer.bold(false);
    printer.println(`${dateStr}  ${timeStr}`);
    printer.println(`Mesa: ${tableName || 'Sin mesa'}`);
    printer.drawLine();

    // Ítems
    printer.alignLeft();
    if (items && items.length > 0) {
      items.forEach(item => {
        const subtotal = (item.quantity * item.unitPrice).toFixed(2);
        printer.tableCustom([
          { text: `${item.quantity}x ${item.name}`, align: 'LEFT', width: 0.7 },
          { text: `S/${subtotal}`, align: 'RIGHT', width: 0.3 }
        ]);
      });
    }

    printer.drawLine();

    // Totales
    printer.tableCustom([
      { text: 'SUBTOTAL', align: 'LEFT', width: 0.6 },
      { text: `S/${Number(totalAmount).toFixed(2)}`, align: 'RIGHT', width: 0.4 }
    ]);

    if (tipAmount && Number(tipAmount) > 0) {
      printer.tableCustom([
        { text: 'PROPINA', align: 'LEFT', width: 0.6 },
        { text: `S/${Number(tipAmount).toFixed(2)}`, align: 'RIGHT', width: 0.4 }
      ]);
    }

    printer.bold(true);
    printer.tableCustom([
      { text: 'TOTAL', align: 'LEFT', width: 0.6 },
      { text: `S/${(Number(totalAmount) + Number(tipAmount || 0)).toFixed(2)}`, align: 'RIGHT', width: 0.4 }
    ]);
    printer.bold(false);

    printer.drawLine();
    printer.alignCenter();
    printer.println('¡Gracias por su visita!');
    printer.newLine();
    printer.cut();

    await printer.execute();
    console.log(`✅ Recibo enviado a: ${printerName}`);
    res.json({ success: true, printer: printerName });

  } catch (err) {
    console.error('Error al imprimir recibo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`\n🖨️  POS Print Agent corriendo en http://localhost:${PORT}`);
  console.log(`   → GET  /health       — Estado del agente`);
  console.log(`   → GET  /printers     — Listar impresoras disponibles`);
  console.log(`   → POST /print/kitchen — Imprimir ticket de cocina`);
  console.log(`   → POST /print/receipt — Imprimir recibo\n`);
});
