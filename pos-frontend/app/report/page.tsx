'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calculator, DollarSign, CreditCard, Printer, Wallet,
  ArrowDownToLine, ReceiptText, Smartphone, TrendingDown,
  PiggyBank, Plus, X, Edit2, Trash2, List, Heart, CheckCircle2, RefreshCw, History, Utensils, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

// Interfaces
interface Expense { id: string; amount: number; description: string; }
interface TipDetail { id: string; table: string; amount: number; method: string; }
interface SoldProduct { id: string; name: string; quantity: number; }
interface OrderDetail {
  id: string;
  table: string;
  amount: number;
  tip: number;
  methods: string[];
  payments: { id: string; method: string; amount: number }[];
  items?: { productId: string; name: string; quantity: number }[];
}
interface PastClosure {
  id: string;
  date: string;
  report: any;
  expenses: Expense[];
  closureNote: string;
}

export default function CashRegisterPage() {
  const router = useRouter();
  useGuardedRoute('caja');
  const [loading, setLoading] = useState(true);

  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [report, setReport] = useState({
    shiftId: null as string | null,
    totalSales: 0,
    cash: 0,
    card: 0,
    yapePlin: 0,
    ticketCount: 0,
    openingCash: 0,
    totalExpenses: 0,
    expectedCashInDrawer: 0,
    totalTips: 0,
    tipsDetail: [] as TipDetail[],
    ordersDetail: [] as OrderDetail[],
    soldProducts: [] as SoldProduct[],
    tipsBreakdown: { CASH: 0, CARD: 0, TRANSFER: 0 } as Record<string, number>
  });

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pastClosures, setPastClosures] = useState<PastClosure[]>([]);

  // Modales
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [isEditingOpening, setIsEditingOpening] = useState(false);
  const [showExpensesList, setShowExpensesList] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showTipsModal, setShowTipsModal] = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Formularios y Filtros
  const [openingAmount, setOpeningAmount] = useState('');
  const [expenseForm, setExpenseForm] = useState({ id: '', amount: '', description: '' });
  const [closureNote, setClosureNote] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState(''); // NUEVO: Filtro de fecha para historial

  const [editOrderForm, setEditOrderForm] = useState({
    id: '', table: '',
    cashAmount: '', cardAmount: '', transferAmount: '',
    tip: '', tipMethod: 'CASH'
  });

  // 1. CARGAR DATOS 
  const fetchDailyReport = async () => {
    const token = localStorage.getItem('pos_token');
    if (!token) return router.push('/login');

    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${API_URL}/api/v1/payments/closure`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = response.ok ? await response.json() : {};

      const historyData = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
      setPastClosures(historyData);
      const closedItemsIds = JSON.parse(localStorage.getItem('pos_closed_items') || '[]');

      const localShiftData = localStorage.getItem('mock_cash_shift');
      let localOpeningCash = 0, localExpensesArray: Expense[] = [], isLocalShiftOpen = false;

      if (localShiftData) {
        const parsedData = JSON.parse(localShiftData);
        localOpeningCash = parsedData.openingCash || 0;
        localExpensesArray = parsedData.expenses || [];
        isLocalShiftOpen = true;
      }

      const ordersToUse: OrderDetail[] = data.ordersDetail || [];
      const tipsToUse: TipDetail[] = data.tipsDetail || [];

      const activeOrders = ordersToUse.filter(o => !closedItemsIds.includes(o.id));
      const activeTips = tipsToUse.filter(t => !closedItemsIds.includes(t.id));

      // Calcular platos VENDIDOS SOLO EN ESTE TURNO
      const productSalesMap: Record<string, SoldProduct> = {};

      activeOrders.forEach(order => {
        if (order.items) {
          order.items.forEach(item => {
            if (!productSalesMap[item.productId]) {
              productSalesMap[item.productId] = {
                id: item.productId, name: item.name, quantity: 0
              };
            }
            productSalesMap[item.productId].quantity += item.quantity;
          });
        }
      });

      const activeProducts = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);

      let initCash = 0, initCard = 0, initTransfer = 0, initTotalSales = 0;
      let tb = { CASH: 0, CARD: 0, TRANSFER: 0 };

      activeOrders.forEach(o => {
        initTotalSales += o.amount;
        o.payments.forEach(p => {
          if (p.method === 'CASH') initCash += p.amount;
          if (p.method === 'CARD') initCard += p.amount;
          if (p.method === 'TRANSFER') initTransfer += p.amount;
        });
      });

      activeTips.forEach(t => {
        if (t.method === 'CASH') { initCash += t.amount; tb.CASH += t.amount; }
        if (t.method === 'CARD') { initCard += t.amount; tb.CARD += t.amount; }
        if (t.method === 'TRANSFER') { initTransfer += t.amount; tb.TRANSFER += t.amount; }
      });

      const initTotalTips = activeTips.reduce((sum, t) => sum + t.amount, 0);
      const totalLocalExpenses = localExpensesArray.reduce((sum, exp) => sum + exp.amount, 0);

      setExpenses(localExpensesArray);
      setReport({
        shiftId: data.shiftId || (isLocalShiftOpen ? 'mock-id' : null),
        totalSales: initTotalSales,
        cash: initCash,
        card: initCard,
        yapePlin: initTransfer,
        ticketCount: activeOrders.length,
        openingCash: localOpeningCash,
        totalExpenses: totalLocalExpenses,
        expectedCashInDrawer: localOpeningCash + initCash - totalLocalExpenses,
        totalTips: initTotalTips,
        tipsDetail: activeTips,
        ordersDetail: activeOrders,
        soldProducts: activeProducts,
        tipsBreakdown: tb
      });

      setIsShiftOpen(isLocalShiftOpen);
      if (!isLocalShiftOpen) { setIsEditingOpening(false); setShowOpenModal(true); }

    } catch (error) { toast.error('Error al cargar reporte'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchDailyReport(); }, [router]);

  // ==========================================
  // FUNCIONES DE CAJA Y GASTOS
  // ==========================================
  const handleSaveOpeningCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingAmount || isNaN(Number(openingAmount))) return toast.error('Monto inválido');
    const amount = Number(openingAmount);
    const currentData = JSON.parse(localStorage.getItem('mock_cash_shift') || '{"expenses": []}');
    localStorage.setItem('mock_cash_shift', JSON.stringify({ ...currentData, openingCash: amount }));
    setReport(prev => ({ ...prev, openingCash: amount, expectedCashInDrawer: amount + prev.cash - prev.totalExpenses }));
    setIsShiftOpen(true); setShowOpenModal(false); toast.success('Caja actualizada');
  };

  const openEditOpeningCash = () => { setOpeningAmount(report.openingCash.toString()); setIsEditingOpening(true); setShowOpenModal(true); };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expenseForm.amount);
    let updated = [...expenses];
    if (expenseForm.id) { updated = updated.map(exp => exp.id === expenseForm.id ? { ...exp, amount, description: expenseForm.description } : exp); }
    else { updated.push({ id: Date.now().toString(), amount, description: expenseForm.description }); }

    const newTotal = updated.reduce((s, exp) => s + exp.amount, 0);
    const local = JSON.parse(localStorage.getItem('mock_cash_shift') || '{}');
    local.expenses = updated; localStorage.setItem('mock_cash_shift', JSON.stringify(local));
    setExpenses(updated);
    setReport(prev => ({ ...prev, totalExpenses: newTotal, expectedCashInDrawer: prev.openingCash + prev.cash - newTotal }));
    setShowExpenseModal(false); setExpenseForm({ id: '', amount: '', description: '' }); toast.success('Gasto guardado');
  };

  const handleDeleteExpense = (id: string) => {
    if (!confirm('¿Eliminar gasto?')) return;
    const updated = expenses.filter(exp => exp.id !== id);
    const newTotal = updated.reduce((s, exp) => s + exp.amount, 0);
    const local = JSON.parse(localStorage.getItem('mock_cash_shift') || '{}');
    local.expenses = updated; localStorage.setItem('mock_cash_shift', JSON.stringify(local));
    setExpenses(updated);
    setReport(prev => ({ ...prev, totalExpenses: newTotal, expectedCashInDrawer: prev.openingCash + prev.cash - newTotal }));
  };

  const openNewExpense = () => { setExpenseForm({ id: '', amount: '', description: '' }); setShowExpenseModal(true); };
  const openEditExpense = (expense: Expense) => { setExpenseForm({ id: expense.id, amount: expense.amount.toString(), description: expense.description }); setShowExpenseModal(true); };

  // ==========================================
  // FLUJO DE CIERRE DEFINITIVO Y RESETEO
  // ==========================================
  const confirmCloseRegister = () => setShowCloseConfirmModal(true);

  const executeCloseRegister = async () => {
    handlePrint('detailed', closureNote, report, expenses);

    const newHistoryRecord: PastClosure = {
      id: Date.now().toString(),
      date: new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      report: { ...report },
      expenses: [...expenses],
      closureNote
    };
    const currentHistory = JSON.parse(localStorage.getItem('pos_shift_history') || '[]');
    localStorage.setItem('pos_shift_history', JSON.stringify([newHistoryRecord, ...currentHistory]));
    setPastClosures([newHistoryRecord, ...currentHistory]);

    const currentClosedItems = JSON.parse(localStorage.getItem('pos_closed_items') || '[]');
    const itemsToArchive = [...report.ordersDetail.map(o => o.id), ...report.tipsDetail.map(t => t.id)];
    localStorage.setItem('pos_closed_items', JSON.stringify([...currentClosedItems, ...itemsToArchive]));

    localStorage.removeItem('mock_cash_shift');
    toast.success('Caja cerrada con éxito. Turno reseteado a cero.');

    setIsShiftOpen(false);
    setOpeningAmount('');
    setExpenses([]);
    setClosureNote('');

    setReport({
      shiftId: null, totalSales: 0, cash: 0, card: 0, yapePlin: 0,
      ticketCount: 0, openingCash: 0, totalExpenses: 0, expectedCashInDrawer: 0, totalTips: 0,
      tipsDetail: [], ordersDetail: [], soldProducts: [],
      tipsBreakdown: { CASH: 0, CARD: 0, TRANSFER: 0 }
    });

    setShowCloseConfirmModal(false);
    setIsEditingOpening(false);
    setShowOpenModal(true);
  };

  // NUEVO: ELIMINAR CIERRE DEL HISTORIAL
  const handleDeleteClosure = (closureId: string) => {
    if (!confirm('¿Estás seguro de ELIMINAR este registro de cierre? Esta acción no se puede deshacer y borrará el historial de ese turno.')) return;

    const updatedHistory = pastClosures.filter(c => c.id !== closureId);
    setPastClosures(updatedHistory);
    localStorage.setItem('pos_shift_history', JSON.stringify(updatedHistory));
    toast.success('Cierre eliminado del historial exitosamente.');
  };

  // ==========================================
  // LÓGICA DE ÓRDENES Y PAGOS DIVIDIDOS
  // ==========================================
  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('¿Estás seguro de ANULAR esta orden? Se restará de tus ingresos del día.')) return;
    try {
      const orderToAnul = report.ordersDetail.find(o => o.id === orderId);
      if (!orderToAnul) return;
      let oldCash = 0, oldCard = 0, oldTransfer = 0;
      orderToAnul.payments.forEach(p => {
        if (p.method === 'CASH') oldCash += p.amount;
        if (p.method === 'CARD') oldCard += p.amount;
        if (p.method === 'TRANSFER') oldTransfer += p.amount;
      });
      const oldTipDetail = report.tipsDetail.find(t => t.table === orderToAnul.table);
      let updatedTipsBreakdown = { ...report.tipsBreakdown };
      if (oldTipDetail) {
        if (oldTipDetail.method === 'CASH') oldCash += oldTipDetail.amount;
        if (oldTipDetail.method === 'CARD') oldCard += oldTipDetail.amount;
        if (oldTipDetail.method === 'TRANSFER') oldTransfer += oldTipDetail.amount;
        updatedTipsBreakdown[oldTipDetail.method] -= oldTipDetail.amount;
      }
      setReport(prev => ({
        ...prev,
        totalSales: prev.totalSales - orderToAnul.amount,
        totalTips: prev.totalTips - (oldTipDetail ? oldTipDetail.amount : 0),
        cash: prev.cash - oldCash,
        card: prev.card - oldCard,
        yapePlin: prev.yapePlin - oldTransfer,
        ticketCount: prev.ticketCount - 1,
        expectedCashInDrawer: prev.expectedCashInDrawer - oldCash,
        ordersDetail: prev.ordersDetail.filter(o => o.id !== orderId),
        tipsDetail: prev.tipsDetail.filter(t => t.table !== orderToAnul.table),
        tipsBreakdown: updatedTipsBreakdown
      }));
      toast.success('Orden anulada. Caja re-calculada.');
    } catch (e) { toast.error('Error al anular orden'); }
  };

  const openEditOrderModal = (order: OrderDetail) => {
    let c = 0, cd = 0, t = 0;
    order.payments.forEach(p => {
      if (p.method === 'CASH') c += p.amount;
      if (p.method === 'CARD') cd += p.amount;
      if (p.method === 'TRANSFER') t += p.amount;
    });
    const tipDetail = report.tipsDetail.find(td => td.table === order.table);
    setEditOrderForm({
      id: order.id, table: order.table,
      cashAmount: c > 0 ? c.toString() : '', cardAmount: cd > 0 ? cd.toString() : '', transferAmount: t > 0 ? t.toString() : '',
      tip: tipDetail ? tipDetail.amount.toString() : '', tipMethod: tipDetail ? tipDetail.method : (order.methods[0] || 'CASH')
    });
    setShowEditOrderModal(true);
  };

  const handleSaveOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nCash = parseFloat(editOrderForm.cashAmount || '0');
    const nCard = parseFloat(editOrderForm.cardAmount || '0');
    const nTrans = parseFloat(editOrderForm.transferAmount || '0');
    const newTip = parseFloat(editOrderForm.tip || '0');
    const newTipMethod = editOrderForm.tipMethod;

    if (nCash < 0 || nCard < 0 || nTrans < 0 || newTip < 0) return toast.error('Los montos no pueden ser negativos');
    const newAmount = nCash + nCard + nTrans;
    if (newAmount === 0 && newTip === 0) return toast.error('El monto total de la cuenta no puede ser 0');

    try {
      const orderToEdit = report.ordersDetail.find(o => o.id === editOrderForm.id);
      if (!orderToEdit) return;
      let oldCash = 0, oldCard = 0, oldTransfer = 0;
      orderToEdit.payments.forEach(p => {
        if (p.method === 'CASH') oldCash += p.amount;
        if (p.method === 'CARD') oldCard += p.amount;
        if (p.method === 'TRANSFER') oldTransfer += p.amount;
      });
      const oldTipDetail = report.tipsDetail.find(t => t.table === orderToEdit.table);
      let updatedTipsBreakdown = { ...report.tipsBreakdown };
      if (oldTipDetail) {
        if (oldTipDetail.method === 'CASH') oldCash += oldTipDetail.amount;
        if (oldTipDetail.method === 'CARD') oldCard += oldTipDetail.amount;
        if (oldTipDetail.method === 'TRANSFER') oldTransfer += oldTipDetail.amount;
        updatedTipsBreakdown[oldTipDetail.method] -= oldTipDetail.amount;
      }
      let newCashTotal = nCash, newCardTotal = nCard, newTransTotal = nTrans;
      if (newTipMethod === 'CASH') newCashTotal += newTip;
      if (newTipMethod === 'CARD') newCardTotal += newTip;
      if (newTipMethod === 'TRANSFER') newTransTotal += newTip;
      if (newTip > 0) updatedTipsBreakdown[newTipMethod] += newTip;

      const diffCash = newCashTotal - oldCash;
      const diffCard = newCardTotal - oldCard;
      const diffTransfer = newTransTotal - oldTransfer;
      const diffTotalSales = newAmount - orderToEdit.amount;
      const diffTotalTips = newTip - (oldTipDetail ? oldTipDetail.amount : 0);

      const newPayments: { id: string; method: string; amount: number }[] = [];
      const newMethods: string[] = [];
      if (nCash > 0) { newPayments.push({ id: `p-c-${Date.now()}`, method: 'CASH', amount: nCash }); newMethods.push('CASH'); }
      if (nCard > 0) { newPayments.push({ id: `p-cd-${Date.now()}`, method: 'CARD', amount: nCard }); newMethods.push('CARD'); }
      if (nTrans > 0) { newPayments.push({ id: `p-t-${Date.now()}`, method: 'TRANSFER', amount: nTrans }); newMethods.push('TRANSFER'); }
      if (newTip > 0 && !newMethods.includes(newTipMethod)) newMethods.push(newTipMethod);

      setReport(prev => {
        let updatedTipsDetail = prev.tipsDetail.filter(t => t.table !== orderToEdit.table);
        if (newTip > 0) updatedTipsDetail.push({ id: `t-${orderToEdit.id}-${Date.now()}`, table: orderToEdit.table, amount: newTip, method: newTipMethod });
        return {
          ...prev,
          totalSales: prev.totalSales + diffTotalSales,
          totalTips: prev.totalTips + diffTotalTips,
          cash: prev.cash + diffCash,
          card: prev.card + diffCard,
          yapePlin: prev.yapePlin + diffTransfer,
          expectedCashInDrawer: prev.expectedCashInDrawer + diffCash,
          ordersDetail: prev.ordersDetail.map(o => o.id === editOrderForm.id ? { ...o, amount: newAmount, tip: newTip, methods: newMethods, payments: newPayments } : o),
          tipsDetail: updatedTipsDetail,
          tipsBreakdown: updatedTipsBreakdown
        };
      });
      toast.success('Orden dividida actualizada correctamente.');
      setShowEditOrderModal(false);
    } catch (e) { toast.error('Error al editar orden'); }
  };

  // ==========================================
  // SISTEMA DE IMPRESIÓN 
  // ==========================================
  const handlePrint = (type: 'summary' | 'detailed' | 'products', finalNote: string = closureNote, targetReport: any = report, targetExpenses: Expense[] = expenses) => {
    const dateStr = new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    let printHTML = `
      <style>
        @page { margin: 0; }
        body { font-family: 'Courier New', Courier, monospace; width: 80mm; margin: 0 auto; padding: 15px; color: #000; font-size: 13px; }
        h2 { text-align: center; margin: 5px 0; font-size: 18px; font-weight: bold; }
        h3 { text-align: center; margin: 2px 0; font-size: 14px; }
        .divider { border-top: 1px dashed #000; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        .bold { font-weight: bold; }
        .text-center { text-align: center; }
        .text-xs { font-size: 11px; }
        ul { list-style-type: none; padding: 0; margin: 5px 0; }
        li { display: flex; justify-content: space-between; margin-bottom: 3px; }
      </style>
    `;

    if (type === 'products') {
      printHTML += `
        <div class="text-center">
          <h2>REPORTE DE VENTAS</h2>
          <h3>PLATOS VENDIDOS</h3>
          <p class="text-xs">Impreso: ${dateStr}</p>
        </div>
        <div class="divider"></div>
        <div class="row bold"><span>Producto</span> <span>Cant.</span></div>
        <div class="divider"></div>
        <ul>
      `;
      if (!targetReport.soldProducts || targetReport.soldProducts.length === 0) {
        printHTML += `<div class="text-center text-xs mt-2">No hay productos registrados.</div>`;
      } else {
        targetReport.soldProducts.forEach((p: SoldProduct) => {
          printHTML += `<li><span>${p.name}</span> <span>${p.quantity}</span></li>`;
        });
      }
      printHTML += `</ul><div class="divider"></div>`;
      const totalItems = targetReport.soldProducts?.reduce((sum: number, p: SoldProduct) => sum + p.quantity, 0) || 0;
      printHTML += `<div class="row bold" style="font-size: 15px;"><span>TOTAL ÍTEMS:</span> <span>${totalItems}</span></div>`;
      printHTML += `<div class="text-center text-xs" style="margin-top:15px;">--- Fin del Reporte ---</div>`;
    }
    else {
      const subtotalIngresos = targetReport.cash + targetReport.card + targetReport.yapePlin;
      const propinasTotales = targetReport.totalTips;
      const totalVentasReales = targetReport.totalSales;

      printHTML += `
        <div class="text-center">
          <h2>CIERRE DE CAJA</h2>
          <h3>${type === 'summary' ? 'RESUMEN' : 'DETALLADO'}</h3>
          <p class="text-xs">Impreso: ${dateStr}</p>
        </div>
        <div class="divider"></div>
        <div class="row"><span>Fondo Inicial:</span> <span>S/ ${targetReport.openingCash.toFixed(2)}</span></div>
        <div class="divider"></div>
      `;

      if (type === 'detailed') {
        printHTML += `<div class="bold text-center">PROPINAS DETALLADAS</div>`;
        if (!targetReport.tipsDetail || targetReport.tipsDetail.length === 0) {
          printHTML += `<div class="text-center text-xs mt-2">No hay propinas registradas.</div>`;
        } else {
          printHTML += `<ul>`;
          targetReport.tipsDetail.forEach((tip: TipDetail) => { printHTML += `<li><span>${tip.table} (${tip.method})</span> <span>S/ ${tip.amount.toFixed(2)}</span></li>`; });
          printHTML += `</ul>`;
        }
        printHTML += `<div class="divider"></div>`;

        printHTML += `<div class="bold text-center">GASTOS DETALLADOS</div>`;
        if (!targetExpenses || targetExpenses.length === 0) {
          printHTML += `<div class="text-center text-xs mt-2">No hay gastos registrados.</div>`;
        } else {
          printHTML += `<ul>`;
          targetExpenses.forEach(exp => { printHTML += `<li><span style="max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${exp.description}</span> <span>S/ ${exp.amount.toFixed(2)}</span></li>`; });
          printHTML += `</ul>`;
        }
        printHTML += `<div class="divider"></div>`;
      }

      printHTML += `<div class="bold text-center">INGRESOS POR MÉTODO</div>`;
      printHTML += `<div class="row"><span>Efectivo:</span> <span>S/ ${targetReport.cash.toFixed(2)}</span></div>`;
      printHTML += `<div class="row"><span>Tarjeta (POS):</span> <span>S/ ${targetReport.card.toFixed(2)}</span></div>`;
      printHTML += `<div class="row"><span>Yape/Plin:</span> <span>S/ ${targetReport.yapePlin.toFixed(2)}</span></div>`;
      printHTML += `<div class="divider"></div>`;

      printHTML += `<div class="row"><span>SUBTOTAL:</span> <span>S/ ${subtotalIngresos.toFixed(2)}</span></div>`;
      printHTML += `<div class="row"><span>Propinas (-):</span> <span>S/ ${propinasTotales.toFixed(2)}</span></div>`;
      printHTML += `<div class="divider"></div>`;
      printHTML += `<div class="row bold" style="font-size: 15px;"><span>TOTAL REAL:</span> <span>S/ ${totalVentasReales.toFixed(2)}</span></div>`;
      printHTML += `<div class="divider"></div>`;

      if (type === 'detailed') {
        printHTML += `<div class="bold text-center">CUADRE DE EFECTIVO GAVETA</div>`;
        printHTML += `<div class="row mt-2"><span>Fondo Inicial:</span> <span>S/ ${targetReport.openingCash.toFixed(2)}</span></div>`;
        printHTML += `<div class="row"><span>Ingresos Efectivo:</span> <span>S/ ${targetReport.cash.toFixed(2)}</span></div>`;
        printHTML += `<div class="row"><span>Gastos (-):</span> <span>S/ ${targetReport.totalExpenses.toFixed(2)}</span></div>`;
        printHTML += `<div class="divider"></div>`;
        printHTML += `<div class="row bold" style="font-size: 15px;"><span>EFECTIVO FINAL:</span> <span>S/ ${targetReport.expectedCashInDrawer.toFixed(2)}</span></div>`;
        printHTML += `<div class="divider"></div>`;

        if (finalNote.trim()) {
          printHTML += `<div class="bold text-center" style="margin-top: 10px;">OBSERVACIONES</div>`;
          printHTML += `<div style="font-size: 11px; margin-top: 5px; border: 1px dashed #000; padding: 5px;">${finalNote.replace(/\n/g, '<br>')}</div>`;
          printHTML += `<div class="divider"></div>`;
        }
      }
      printHTML += `<div class="text-center text-xs" style="margin-top:15px;">--- Fin del Reporte ---</div>`;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Ticket de Cierre</title></head><body>${printHTML}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    } else {
      toast.error('Por favor permite ventanas emergentes en tu navegador.');
    }
    setShowPrintModal(false);
  };

  const getMethodBadge = (method: string) => {
    const badges = {
      CASH: <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold border border-blue-200">Efectivo</span>,
      CARD: <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold border border-purple-200">Tarjeta</span>,
      TRANSFER: <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-[10px] font-bold border border-sky-200">Yape/Plin</span>
    };
    return badges[method as keyof typeof badges] || method;
  };

  const liveTotal = parseFloat(editOrderForm.cashAmount || '0') + parseFloat(editOrderForm.cardAmount || '0') + parseFloat(editOrderForm.transferAmount || '0');

  // LÓGICA DE FILTRO PARA HISTORIAL
  const filteredClosures = pastClosures.filter(closure => {
    if (!historyDateFilter) return true;

    // historyDateFilter viene en formato YYYY-MM-DD
    const [year, month, day] = historyDateFilter.split('-');

    // Convertimos para comparar con el string de fecha guardado ej: "19/03/2026, 10:00 PM"
    const paddedDay = day;
    const unpaddedDay = parseInt(day, 10).toString();
    const paddedMonth = month;
    const unpaddedMonth = parseInt(month, 10).toString();

    // Verificamos si la fecha guardada contiene alguna de las posibles combinaciones generadas
    return closure.date.includes(`${paddedDay}/${paddedMonth}/${year}`) ||
      closure.date.includes(`${unpaddedDay}/${unpaddedMonth}/${year}`) ||
      closure.date.includes(`${paddedDay}-${paddedMonth}-${year}`);
  });

  if (loading && !report.totalSales && !showOpenModal) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans pb-24">

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3"><Calculator className="text-emerald-600 w-8 h-8" /> Control y Cierre</h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-sm tracking-widest flex items-center gap-2">
            {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isShiftOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {isShiftOpen ? 'TURNO ABIERTO' : 'CAJA CERRADA'}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowHistoryModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-2xl font-bold transition-colors">
            <History className="w-5 h-5" /> Historial
          </button>

          {!isShiftOpen ? (
            <button onClick={() => setShowOpenModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-2xl font-bold transition-colors shadow-lg shadow-emerald-200">
              <Wallet className="w-5 h-5" /> Abrir Turno
            </button>
          ) : (
            <button onClick={() => setShowPrintModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-2xl font-bold transition-colors">
              <Printer className="w-5 h-5" /> Imprimir
            </button>
          )}
        </div>
      </header>

      <div className="flex justify-between items-end mb-4">
        <h2 className="text-xl font-bold text-slate-800">Flujo de Efectivo Físico</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowExpensesList(true)} disabled={!isShiftOpen} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-xl font-bold transition-colors disabled:opacity-50"><List className="w-4 h-4" /> Ver Gastos</button>
          <button onClick={openNewExpense} disabled={!isShiftOpen} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold transition-colors disabled:opacity-50"><Plus className="w-4 h-4" /> Registrar Gasto</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between group">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Fondo Inicial</p>
              {isShiftOpen && <button onClick={openEditOpeningCash} className="text-slate-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 className="w-3.5 h-3.5" /></button>}
            </div>
            <h3 className="text-2xl font-black text-slate-800">S/ {report.openingCash.toFixed(2)}</h3>
          </div>
          <div className="bg-amber-50 p-4 rounded-2xl"><PiggyBank className="w-8 h-8 text-amber-500" /></div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Efectivo (+)</p>
            <h3 className="text-2xl font-black text-slate-800">S/ {report.cash.toFixed(2)}</h3>
            {report.tipsBreakdown.CASH > 0 && (
              <p className="text-[11px] font-bold text-violet-500 mt-1 flex items-center gap-1">
                <Heart className="w-3 h-3 fill-violet-200" /> Incluye S/ {report.tipsBreakdown.CASH.toFixed(2)} propina
              </p>
            )}
          </div>
          <div className="bg-blue-50 p-4 rounded-2xl"><Wallet className="w-8 h-8 text-blue-600" /></div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-rose-200 transition-colors" onClick={() => setShowExpensesList(true)}>
          <div><p className="text-xs text-rose-500 font-bold uppercase tracking-widest mb-1">Gastos del Día (-)</p><h3 className="text-2xl font-black text-rose-600">S/ {report.totalExpenses.toFixed(2)}</h3></div>
          <div className="bg-rose-50 p-4 rounded-2xl"><TrendingDown className="w-8 h-8 text-rose-500" /></div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-4 mt-8">Resumen de Ingresos</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Ingresos Totales</p>
            <h3 className="text-2xl font-black text-slate-800">S/ {(report.totalSales + report.totalTips).toFixed(2)}</h3>
            {report.totalTips > 0 && (
              <p className="text-[11px] font-bold text-violet-500 mt-1 flex items-center gap-1">
                <Heart className="w-3 h-3 fill-violet-200" /> Incluye S/ {report.totalTips.toFixed(2)} propina
              </p>
            )}
          </div>
          <div className="bg-emerald-50 p-4 rounded-2xl"><DollarSign className="w-8 h-8 text-emerald-600" /></div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">POS / Tarjeta</p>
            <h3 className="text-2xl font-black text-slate-800">S/ {report.card.toFixed(2)}</h3>
            {report.tipsBreakdown.CARD > 0 && (
              <p className="text-[11px] font-bold text-violet-500 mt-1 flex items-center gap-1">
                <Heart className="w-3 h-3 fill-violet-200" /> Incluye S/ {report.tipsBreakdown.CARD.toFixed(2)}
              </p>
            )}
          </div>
          <div className="bg-purple-50 p-4 rounded-2xl"><CreditCard className="w-8 h-8 text-purple-600" /></div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Yape / Plin</p>
            <h3 className="text-2xl font-black text-slate-800">S/ {report.yapePlin.toFixed(2)}</h3>
            {report.tipsBreakdown.TRANSFER > 0 && (
              <p className="text-[11px] font-bold text-violet-500 mt-1 flex items-center gap-1">
                <Heart className="w-3 h-3 fill-violet-200" /> Incluye S/ {report.tipsBreakdown.TRANSFER.toFixed(2)}
              </p>
            )}
          </div>
          <div className="bg-sky-50 p-4 rounded-2xl"><Smartphone className="w-8 h-8 text-sky-600" /></div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-violet-300 transition-all group" onClick={() => setShowTipsModal(true)}>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">Propinas <List className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
            <h3 className="text-2xl font-black text-violet-600">S/ {report.totalTips.toFixed(2)}</h3>
          </div>
          <div className="bg-violet-50 p-4 rounded-2xl"><Heart className="w-8 h-8 text-violet-500" /></div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-4 mt-8">Resumen Operativo</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-slate-300 transition-all group" onClick={() => setShowOrdersModal(true)}>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">Órdenes <List className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
            <h3 className="text-2xl font-black text-slate-800">{report.ticketCount} emitidas</h3>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl"><ReceiptText className="w-8 h-8 text-slate-600" /></div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-slate-300 transition-all group" onClick={() => setShowProductsModal(true)}>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">Platos <List className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
            <h3 className="text-2xl font-black text-slate-800">{report.soldProducts.reduce((sum, p) => sum + p.quantity, 0)} ítems</h3>
          </div>
          <div className="bg-orange-50 p-4 rounded-2xl"><Utensils className="w-8 h-8 text-orange-500" /></div>
        </div>
      </div>

      <div className="bg-emerald-900 p-10 rounded-3xl shadow-xl max-w-4xl mx-auto text-center relative overflow-hidden text-white">
        <h2 className="text-2xl font-black mb-2 opacity-90">Efectivo Esperado en Gaveta</h2>
        <div className="text-6xl md:text-7xl font-black mb-8 tracking-tighter text-emerald-50">S/ {report.expectedCashInDrawer.toFixed(2)}</div>
        <button onClick={confirmCloseRegister} disabled={!isShiftOpen} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-black text-lg py-5 px-10 rounded-2xl shadow-xl shadow-emerald-950 transition-all mx-auto flex items-center gap-3"><Calculator className="w-6 h-6" /> Efectuar Cierre Definitivo</button>
      </div>

      {/* ========================================= */}
      {/* MODAL HISTORIAL DE CIERRES ACTUALIZADO CON FILTRO */}
      {/* ========================================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><History className="text-blue-500" /> Historial de Cierres</h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>

            {/* SECCIÓN DE FILTRO DE FECHA */}
            <div className="mb-4 flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <Calendar className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-bold text-slate-600">Buscar por fecha:</span>
              <input
                type="date"
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {historyDateFilter && (
                <button onClick={() => setHistoryDateFilter('')} className="text-xs text-rose-500 font-bold hover:underline px-2">Limpiar</button>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-2">
              {filteredClosures.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-medium">
                  {historyDateFilter ? 'No hay cierres registrados en esta fecha.' : 'No hay cierres anteriores registrados.'}
                </div>
              ) : (
                <ul className="space-y-4">
                  {filteredClosures.map((closure) => (
                    <li key={closure.id} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-blue-200 transition-colors">
                      <div className="flex flex-col gap-1 w-full md:w-auto">
                        <span className="font-bold text-slate-800 text-lg">Cierre del {closure.date}</span>
                        <div className="flex gap-3 text-xs font-bold text-slate-500">
                          <span>Ventas: S/ {closure.report.totalSales.toFixed(2)}</span><span>•</span><span>Tickets: {closure.report.ticketCount}</span>
                        </div>
                        {closure.closureNote && <p className="text-xs text-slate-400 mt-1 italic max-w-sm truncate">Nota: {closure.closureNote}</p>}
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Gaveta Final</p>
                          <p className="text-slate-900 font-black text-xl">S/ {closure.report.expectedCashInDrawer.toFixed(2)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handlePrint('detailed', closure.closureNote, closure.report, closure.expenses)} className="p-3 bg-white text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200 flex items-center gap-2 font-bold text-sm" title="Imprimir Ticket">
                            <Printer className="w-4 h-4" />
                          </button>
                          {/* BOTÓN ELIMINAR */}
                          <button onClick={() => handleDeleteClosure(closure.id)} className="p-3 bg-white text-rose-500 hover:bg-rose-50 rounded-xl border border-slate-200 flex items-center gap-2 font-bold text-sm" title="Eliminar Registro">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* RESTO DE MODALES (Mismos que tu versión anterior) */}
      {/* ========================================= */}

      {/* Modal Productos Vendidos */}
      {showProductsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Utensils className="text-orange-500" /> Platos Vendidos</h2>
              <div className="flex gap-2">
                <button onClick={() => handlePrint('products')} className="p-2 bg-slate-50 text-slate-700 hover:bg-slate-200 rounded-full transition-colors" title="Imprimir Reporte"><Printer className="w-5 h-5" /></button>
                <button onClick={() => setShowProductsModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto pr-2">
              {report.soldProducts.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-medium">No se han registrado productos.</div>
              ) : (
                <ul className="space-y-3">
                  {report.soldProducts.map((product) => (
                    <li key={product.id} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex justify-between items-center">
                      <span className="font-bold text-slate-800 text-lg">{product.name}</span>
                      <div className="bg-white px-4 py-1.5 rounded-lg border border-slate-200"><span className="text-orange-600 font-black text-xl">{product.quantity}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-6 bg-orange-50 rounded-2xl p-4 flex justify-between items-center border border-orange-100">
              <span className="font-bold text-orange-800 uppercase tracking-widest text-sm">Total Ítems Vendidos</span>
              <span className="text-2xl font-black text-orange-600">{report.soldProducts.reduce((sum, p) => sum + p.quantity, 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lista de Gastos */}
      {showExpensesList && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><List className="text-rose-500" /> Detalle de Gastos</h2>
              <button onClick={() => setShowExpensesList(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-2">
              {expenses.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-medium">No se han registrado gastos en este turno.</div>
              ) : (
                <ul className="space-y-3">
                  {expenses.map((expense) => (
                    <li key={expense.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group hover:border-rose-200 transition-colors">
                      <div className="flex flex-col gap-1 max-w-full md:max-w-[60%]">
                        <span className="font-bold text-slate-800">{expense.description}</span>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <p className="text-rose-600 font-black text-lg">S/ {expense.amount.toFixed(2)}</p>
                        <div className="flex gap-2">
                          <button onClick={() => { setShowExpensesList(false); openEditExpense(expense); }} className="p-2 bg-slate-50 text-blue-600 hover:bg-blue-100 rounded-xl border border-slate-200 transition-colors" title="Editar">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteExpense(expense.id)} className="p-2 bg-slate-50 text-rose-600 hover:bg-rose-100 rounded-xl border border-slate-200 transition-colors" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {expenses.length > 0 && (
              <div className="mt-6 bg-rose-50 rounded-2xl p-4 flex justify-between items-center border border-rose-100">
                <span className="font-bold text-rose-800 uppercase tracking-widest text-sm">Total Gastos</span>
                <span className="text-2xl font-black text-rose-600">S/ {report.totalExpenses.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Confirmar Cierre */}
      {showCloseConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800">Confirmar Cierre</h2>
              <button onClick={() => setShowCloseConfirmModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <p className="text-slate-600 mb-6 font-medium">¿Estás seguro de cerrar la caja de este turno? Los montos volverán a cero y se imprimirá el reporte detallado automáticamente.</p>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Observaciones para el Jefe (Opcional)</label>
              <textarea value={closureNote} onChange={(e) => setClosureNote(e.target.value)} placeholder="Ej. Faltaron 2 soles..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 resize-none h-24" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCloseConfirmModal(false)} className="flex-1 py-4 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
              <button onClick={executeCloseRegister} className="flex-1 py-4 font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex justify-center items-center gap-2 transition-colors"><Calculator className="w-5 h-5" /> Cerrar Caja</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Opciones de Impresión */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Printer className="text-slate-500 w-6 h-6" /> Imprimir Reporte</h2>
              <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Notas / Observaciones (Opcional)</label>
              <textarea value={closureNote} onChange={(e) => setClosureNote(e.target.value)} placeholder="Ej. Cuadre de medio turno..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 resize-none h-20" />
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => handlePrint('summary')} className="w-full py-3.5 px-5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 flex justify-between items-center transition-colors">
                <span>Resumen de Cierre</span><span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-1 rounded-md uppercase">Rápido</span>
              </button>
              <button onClick={() => handlePrint('detailed')} className="w-full py-3.5 px-5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-emerald-700 flex justify-between items-center transition-colors">
                <span>Cierre Detallado</span><span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-1 rounded-md uppercase">Completo</span>
              </button>
              <button onClick={() => handlePrint('products')} className="w-full mt-2 py-3.5 px-5 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl font-bold text-orange-700 flex justify-between items-center transition-colors">
                <span className="flex items-center gap-2"><Utensils className="w-4 h-4" /> Platos Vendidos</span><span className="text-[10px] bg-orange-200 text-orange-800 px-2 py-1 rounded-md uppercase">Cocina</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Órdenes */}
      {showOrdersModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                <ReceiptText className="text-slate-500" /> Órdenes del Turno
              </h2>
              <button onClick={() => setShowOrdersModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {report.ordersDetail.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-medium">No hay órdenes cerradas en este turno.</div>
              ) : (
                <ul className="space-y-3">
                  {report.ordersDetail.map((order) => (
                    <li key={order.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group hover:border-emerald-200 transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-800 text-lg">{order.table}</span>
                        <div className="flex gap-1">
                          {order.methods.map((m, i) => <span key={i}>{getMethodBadge(m)}</span>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-slate-900 font-black text-xl">S/ {order.amount.toFixed(2)}</p>
                          {order.tip > 0 && (
                            <span className="text-violet-600 text-xs font-bold bg-violet-50 px-2 py-0.5 rounded-md flex items-center gap-1 border border-violet-100">
                              <Heart className="w-3 h-3 fill-violet-200" /> + S/ {order.tip.toFixed(2)} propina
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEditOrderModal(order)} className="p-2 bg-slate-50 text-blue-600 hover:bg-blue-100 rounded-xl border border-slate-200 transition-colors" title="Editar Montos y Métodos">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteOrder(order.id)} className="p-2 bg-slate-50 text-rose-600 hover:bg-rose-100 rounded-xl border border-slate-200 transition-colors" title="Anular Orden">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Orden */}
      {showEditOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800">Modificar Orden</h2>
                <p className="text-slate-500 font-bold text-sm">{editOrderForm.table}</p>
              </div>
              <button onClick={() => setShowEditOrderModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>

            <form onSubmit={handleSaveOrderEdit}>
              <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Pagos de la Cuenta (Venta Neta)</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Wallet className="w-4 h-4 text-blue-400" /></div>
                    <input type="number" step="0.10" placeholder="Efectivo" value={editOrderForm.cashAmount} onChange={(e) => setEditOrderForm({ ...editOrderForm, cashAmount: e.target.value })} className="w-full pl-9 pr-2 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><CreditCard className="w-4 h-4 text-purple-400" /></div>
                    <input type="number" step="0.10" placeholder="Tarjeta" value={editOrderForm.cardAmount} onChange={(e) => setEditOrderForm({ ...editOrderForm, cardAmount: e.target.value })} className="w-full pl-9 pr-2 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Smartphone className="w-4 h-4 text-sky-400" /></div>
                    <input type="number" step="0.10" placeholder="Yape/Plin" value={editOrderForm.transferAmount} onChange={(e) => setEditOrderForm({ ...editOrderForm, transferAmount: e.target.value })} className="w-full pl-9 pr-2 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-sky-500" />
                  </div>
                </div>
                <p className="text-right text-xs font-bold text-slate-400 mt-3 flex justify-end gap-2 items-center">
                  TOTAL CUENTA: <span className="text-slate-800 text-lg">S/ {liveTotal.toFixed(2)}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8 bg-violet-50/50 p-4 rounded-2xl border border-violet-100">
                <div>
                  <label className="block text-xs font-bold text-violet-500 uppercase tracking-wide mb-2 flex items-center gap-1">Propina <Heart className="w-3 h-3" /></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-violet-400 font-bold">S/</span></div>
                    <input type="number" step="0.10" placeholder="0.00" value={editOrderForm.tip} onChange={(e) => setEditOrderForm({ ...editOrderForm, tip: e.target.value })} className="w-full pl-8 pr-3 py-2.5 bg-white border border-violet-200 rounded-xl font-bold text-violet-800 focus:ring-2 focus:ring-violet-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-violet-500 uppercase tracking-wide mb-2">Método Propina</label>
                  <select value={editOrderForm.tipMethod} onChange={(e) => setEditOrderForm({ ...editOrderForm, tipMethod: e.target.value })} className="w-full px-3 py-2.5 bg-white border border-violet-200 rounded-xl font-bold text-violet-800 focus:ring-2 focus:ring-violet-500 appearance-none">
                    <option value="CASH">Efectivo</option>
                    <option value="CARD">Tarjeta (POS)</option>
                    <option value="TRANSFER">Yape / Plin</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowEditOrderModal(false)} className="flex-1 py-4 font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-4 font-black text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex justify-center items-center gap-2 transition-colors">
                  <CheckCircle2 className="w-5 h-5" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Propinas */}
      {showTipsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Heart className="text-violet-500" /> Resumen de Propinas</h2>
              <button onClick={() => setShowTipsModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto pr-2">
              {report.tipsDetail.length === 0 ? <p className="text-center text-slate-400 py-4">No hay propinas.</p> : (
                <ul className="space-y-3">
                  {report.tipsDetail.map((tip) => (
                    <li key={tip.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex justify-between items-center">
                      <div className="flex flex-col gap-1"><span className="font-bold text-slate-800">{tip.table}</span>{getMethodBadge(tip.method)}</div>
                      <p className="text-slate-900 font-black text-lg">S/ {tip.amount.toFixed(2)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Apertura */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className={`${isEditingOpening ? 'bg-amber-500' : 'bg-slate-900'} p-6 text-white text-center relative`}>
              <button onClick={() => setShowOpenModal(false)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Wallet className="w-8 h-8" /></div>
              <h2 className="text-2xl font-black">{isEditingOpening ? 'Editar Fondo Inicial' : 'Apertura de Turno'}</h2>
            </div>
            <form onSubmit={handleSaveOpeningCash} className="p-8">
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">Monto en Efectivo Físico (S/)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-slate-400 font-bold text-lg">S/</span></div>
                  <input type="number" step="0.10" autoFocus required value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-800 focus:ring-4 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => router.push('/')} className="flex-1 py-4 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors">Volver al Inicio</button>
                <button type="submit" className={`flex-1 py-4 font-black text-white rounded-2xl ${isEditingOpening ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} transition-colors`}>{isEditingOpening ? 'Actualizar' : 'Abrir Caja'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gastos */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800">{expenseForm.id ? 'Editar Gasto' : 'Nuevo Gasto'}</h2>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSaveExpense}>
              <div className="mb-5">
                <label className="block text-sm font-bold text-slate-700 mb-2">Monto Retirado (S/)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-slate-400 font-bold">S/</span></div>
                  <input type="number" step="0.10" required autoFocus value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800" />
                </div>
              </div>
              <div className="mb-8">
                <label className="block text-sm font-bold text-slate-700 mb-2">Motivo / Descripción</label>
                <input type="text" required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800" placeholder="Ej. Pago proveedor de hielo" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="flex-1 py-4 font-bold text-slate-600 bg-slate-100 rounded-xl">Cancelar</button>
                <button type="submit" className="flex-1 py-4 font-black text-white bg-rose-600 rounded-xl">{expenseForm.id ? 'Actualizar' : 'Guardar Gasto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}