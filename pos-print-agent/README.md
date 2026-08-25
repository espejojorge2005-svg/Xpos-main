# 🖨️ POS Print Agent

Agente local de impresión térmica para el sistema POS del restaurante.

## Requisitos

- Node.js 18+
- Windows (para detectar impresoras por nombre del sistema)
- Las impresoras deben estar instaladas en Windows (USB) o compartidas en red

## Instalación

```bash
cd pos-print-agent
npm install
```

## Uso

```bash
# Iniciar el agente
npm start

# Modo desarrollo (con auto-reload)
npm run dev
```

El agente correrá en **http://localhost:4001**

## Endpoints

| Método | Ruta              | Descripción                          |
|--------|-------------------|--------------------------------------|
| GET    | /health           | Estado del agente                    |
| GET    | /printers         | Lista impresoras instaladas/en red   |
| POST   | /print/kitchen    | Imprime un ticket de cocina          |
| POST   | /print/receipt    | Imprime un recibo / boleta           |

## Iniciar automáticamente con Windows

Para que el agente inicie automáticamente con Windows, ejecuta este comando como Administrador:

```powershell
# Instala el agente como servicio de Windows (usando node-windows)
npm install -g node-windows
```

O simplemente agrega el script a las **Aplicaciones de inicio** de Windows.

## Compatibilidad

- ✅ Impresoras térmicas Epson (TM-T20, TM-T88, etc.)
- ✅ Impresoras USB instaladas en Windows
- ✅ Impresoras de red compartidas en Windows
- ✅ Modo fallback: si el agente no está activo, el POS usa `window.print()`
