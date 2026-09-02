'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BarChart3, Calendar, DollarSign, Receipt, TrendingUp, CreditCard,
  ChefHat, AlertTriangle, Loader2 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';
import { getApiUrl } from '@/utils/api';
import { getScopedStorage } from '@/utils/storage';

interface KPI {
  totalRevenue: number;
  totalTips: number;
  totalOrders: number;
  avgTicket: number;
  topPaymentMethod: string;
}

interface AnalyticsData {
  kpis: KPI;
  revenueByDay: { date: string; revenue: number; orders: number }[];
  topProducts: { name: string; category: string; quantity: number; revenue: number }[];
  paymentMethods: { method: string; amount: number; count: number }[];
  hourlyHeatmap: { hour: number; orders: number; revenue: number }[];
}

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

function parseLocalDate(dateInput: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === 'string') {
    if (dateInput.includes('/')) {
      const parts = dateInput.split(/[/,\s:]+/);
      if (parts.length >= 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const h = parts[3] ? parseInt(parts[3], 10) : 0;
        const min = parts[4] ? parseInt(parts[4], 10) : 0;
        const dateObj = new Date(y, m, d, h, min);
        if (!isNaN(dateObj.getTime())) return dateObj;
      }
    }
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function computeLocalAnalytics(fromStr: string, toStr: string): AnalyticsData {
  const fromParts = fromStr.split('-');
  const fromDate = new Date(Number(fromParts[0]), Number(fromParts[1]) - 1, Number(fromParts[2]), 0, 0, 0, 0);
  const toParts = toStr.split('-');
  const toDate = new Date(Number(toParts[0]), Number(toParts[1]) - 1, Number(toParts[2]), 23, 59, 59, 999);

  const currentShift = getScopedStorage<any>('mock_cash_shift', null);
  const pastClosures = getScopedStorage<any[]>('pos_shift_history', []);

  let totalRevenue = 0;
  let totalTips = 0;
  let totalOrders = 0;
  const methodTotals: Record<string, { amount: number; count: number }> = {};
  const byDay: Record<string, { date: string; revenue: number; orders: number }> = {};
  const prodMap: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};
  const hourlyMap: Record<number, { hour: number; orders: number; revenue: number }> = {};
  for (let h = 0; h < 24; h++) hourlyMap[h] = { hour: h, orders: 0, revenue: 0 };

  const processedOrderIds = new Set<string>();

  // 1. Pagos del turno actual
  if (currentShift && Array.isArray(currentShift.payments)) {
    for (const p of currentShift.payments) {
      const pDate = parseLocalDate(p.timestamp) || new Date();
      if (pDate >= fromDate && pDate <= toDate) {
        const amt = Number(p.amount) || 0;
        const tip = Number(p.tipAmount) || 0;
        totalRevenue += amt;
        totalTips += tip;

        const orderId = p.orderId || p.id;
        if (orderId && !processedOrderIds.has(orderId)) {
          processedOrderIds.add(orderId);
          totalOrders += 1;
        }

        let method = String(p.method || 'EFECTIVO').toUpperCase();
        if (method === 'CASH') method = 'EFECTIVO';
        if (method === 'CARD') method = 'TARJETA';
        if (method === 'TRANSFER' || method === 'YAPE' || method === 'PLIN') method = 'TRANSFERENCIA';
        if (!methodTotals[method]) methodTotals[method] = { amount: 0, count: 0 };
        methodTotals[method].amount += amt;
        methodTotals[method].count += 1;

        const dayStr = pDate.toISOString().slice(0, 10);
        if (!byDay[dayStr]) byDay[dayStr] = { date: dayStr, revenue: 0, orders: 0 };
        byDay[dayStr].revenue += amt;
        byDay[dayStr].orders += 1;

        const h = pDate.getHours();
        if (hourlyMap[h]) {
          hourlyMap[h].revenue += amt;
          hourlyMap[h].orders += 1;
        }

        if (Array.isArray(p.items)) {
          for (const item of p.items) {
            const name = item.name || 'Producto';
            const cat = item.category || 'General';
            const qty = Number(item.quantity) || 1;
            const rev = (Number(item.price) || 0) * qty;
            if (!prodMap[name]) prodMap[name] = { name, category: cat, quantity: 0, revenue: 0 };
            prodMap[name].quantity += qty;
            prodMap[name].revenue += rev;
          }
        }
      }
    }
  }

  // 2. Historial de cierres de caja pasados
  if (Array.isArray(pastClosures)) {
    for (const closure of pastClosures) {
      const cDate = parseLocalDate(closure.date) || parseLocalDate(closure.id) || new Date();
      if (cDate >= fromDate && cDate <= toDate) {
        const rep = closure.report || {};
        const orders = rep.ordersDetail || [];

        for (const order of orders) {
          const orderId = order.id;
          if (orderId && processedOrderIds.has(orderId)) continue;
          if (orderId) processedOrderIds.add(orderId);

          const amt = Number(order.amount) || 0;
          totalRevenue += amt;
          totalOrders += 1;

          const dayStr = cDate.toISOString().slice(0, 10);
          if (!byDay[dayStr]) byDay[dayStr] = { date: dayStr, revenue: 0, orders: 0 };
          byDay[dayStr].revenue += amt;
          byDay[dayStr].orders += 1;

          if (Array.isArray(order.payments)) {
            for (const p of order.payments) {
              let method = String(p.method || 'EFECTIVO').toUpperCase();
              if (method === 'CASH') method = 'EFECTIVO';
              if (method === 'CARD') method = 'TARJETA';
              if (method === 'TRANSFER' || method === 'YAPE' || method === 'PLIN') method = 'TRANSFERENCIA';
              if (!methodTotals[method]) methodTotals[method] = { amount: 0, count: 0 };
              methodTotals[method].amount += Number(p.amount) || 0;
              methodTotals[method].count += 1;
            }
          }
        }

        totalTips += Number(rep.totalTips) || 0;

        if (Array.isArray(rep.soldProducts)) {
          for (const sp of rep.soldProducts) {
            const name = sp.name || 'Producto';
            const cat = sp.category || 'General';
            const qty = Number(sp.quantity) || 0;
            const rev = (Number(sp.price) || 0) * qty;
            if (!prodMap[name]) prodMap[name] = { name, category: cat, quantity: 0, revenue: 0 };
            prodMap[name].quantity += qty;
            prodMap[name].revenue += rev;
          }
        }
      }
    }
  }

  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const topMethodEntry = Object.entries(methodTotals).sort((a, b) => b[1].amount - a[1].amount)[0];
  const topPaymentMethod = topMethodEntry ? topMethodEntry[0] : 'N/A';

  const revenueByDay = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  const topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const paymentMethods = Object.entries(methodTotals).map(([method, val]) => ({
    method,
    amount: val.amount,
    count: val.count
  }));
  const hourlyHeatmap = Object.values(hourlyMap);

  return {
    kpis: {
      totalRevenue,
      totalTips,
      totalOrders,
      avgTicket,
      topPaymentMethod
    },
    revenueByDay,
    topProducts,
    paymentMethods,
    hourlyHeatmap
  };
}

function formatLocalDate(d: Date): string {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  useGuardedRoute('analytics');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM'>('TODAY');
  
  // Custom date range state (Fecha Local Exacta)
  const [fromDate, setFromDate] = useState(() => formatLocalDate(new Date()));
  const [toDate, setToDate] = useState(() => formatLocalDate(new Date()));

  const fetchAnalytics = async (from: string, to: string) => {
    setLoading(true);
    let serverData: AnalyticsData | null = null;
    try {
      const token = localStorage.getItem('pos_token') || '';
      const res = await fetch(getApiUrl(`/analytics?from=${from}&to=${to}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        serverData = await res.json();
      }
    } catch (err) {
      console.warn('Backend no disponible para métricas analíticas, calculando desde datos locales:', err);
    } finally {
      if (serverData) {
        setData(serverData);
      } else {
        const localData = computeLocalAnalytics(from, to);
        setData(localData);
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = new Date();
    let from = formatLocalDate(today);
    const to = formatLocalDate(today);

    if (dateRange === 'LAST_7_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      from = formatLocalDate(d);
    } else if (dateRange === 'LAST_30_DAYS') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      from = formatLocalDate(d);
    }

    if (dateRange !== 'CUSTOM') {
      setFromDate(from);
      setToDate(to);
      fetchAnalytics(from, to);
    }
  }, [dateRange]);

  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAnalytics(fromDate, toDate);
  };

  // Custom tooltips
  const formatCurrency = (val: number) => `S/ ${val.toFixed(2)}`;

  if (loading && !data) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4 text-violet-600">
        <Loader2 className="w-12 h-12 animate-spin" />
        <p className="font-bold">Calculando métricas...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8 font-sans pb-24">
      {/* Header & Date Selector */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <BarChart3 className="text-violet-600 w-7 h-7 sm:w-8 sm:h-8" />
            Reporte
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-xs sm:text-sm tracking-widest">
            Métricas de Negocio y Rendimiento
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          {['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM'].map(r => (
            <button
              key={r}
              onClick={() => setDateRange(r as any)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all text-center ${
                dateRange === r 
                  ? 'bg-violet-100 text-violet-700 border-2 border-violet-200 shadow-inner' 
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {r === 'TODAY' ? 'Hoy' : r === 'LAST_7_DAYS' ? '7 Días' : r === 'LAST_30_DAYS' ? '30 Días' : 'Rango'}
            </button>
          ))}
        </div>
      </header>

      {/* Custom Date Form (Only visible if CUSTOM) */}
      {dateRange === 'CUSTOM' && (
        <form onSubmit={handleCustomSearch} className="flex flex-col sm:flex-row sm:items-end gap-4 mb-6 sm:mb-8 bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-fit">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Desde</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} 
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 ring-violet-500 text-slate-700 text-sm" required />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Hasta</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} 
               className="w-full sm:w-auto px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 ring-violet-500 text-slate-700 text-sm" required />
          </div>
          <button type="submit" disabled={loading} className="w-full sm:w-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl flex items-center gap-2 min-w-[120px] justify-center mt-2 sm:mt-0 text-sm">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Aplicar Rango'}
          </button>
        </form>
      )}

      {/* No Data State */}
      {data?.kpis.totalOrders === 0 ? (
        <div className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-100 shadow-sm text-center">
          <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">Sin datos de ventas</h2>
          <p className="text-slate-500 text-sm">No hay ventas registradas en el rango de fechas seleccionado.</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          
          {/* ── KPI CARDS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <DollarSign className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest truncate">Ingresos</p>
                <p className="text-xl sm:text-2xl font-black text-slate-800 truncate">S/ {data.kpis.totalRevenue.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                <Receipt className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest truncate">Órdenes</p>
                <p className="text-xl sm:text-2xl font-black text-slate-800 truncate">{data.kpis.totalOrders}</p>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest truncate">Ticket Promedio</p>
                <p className="text-xl sm:text-2xl font-black text-slate-800 truncate">S/ {data.kpis.avgTicket.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
                <CreditCard className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-widest truncate">Método Top</p>
                <p className="text-xl font-black text-slate-800 truncate">{data.kpis.topPaymentMethod}</p>
              </div>
            </div>
          </div>

          {/* ── CHARTS ROW 1 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Revenue Area Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col min-h-[400px]">
              <div className="mb-6">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Evolución de Ingresos</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monto por día vs Órdenes</p>
              </div>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueByDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} 
                      tickFormatter={(val) => {
                        const [, m, d] = val.split('-');
                        return `${d}/${m}`;
                      }}
                    />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `S/ ${val}`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                      formatter={(val: any, name: any) => [name === 'revenue' ? `S/ ${Number(val).toFixed(2)}` : val, name === 'revenue' ? 'Ingresos' : 'Órdenes']}
                      labelFormatter={(l) => `Fecha: ${l}`}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Payment Methods Pie */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
              <div className="mb-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Métodos de Pago</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Distribución de Ingresos</p>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center -mt-4">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data.paymentMethods}
                      cx="50%" cy="50%"
                      innerRadius={65} outerRadius={90}
                      paddingAngle={5}
                      dataKey="amount"
                      nameKey="method"
                      stroke="none"
                    >
                      {data.paymentMethods.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => `S/ ${Number(val).toFixed(2)}`}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Custom list summary under chart */}
                <div className="w-full space-y-2 mt-2">
                  {data.paymentMethods.map((pm, i) => (
                    <div key={pm.method} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length]}}></div>
                        <span className="font-bold text-slate-600">{pm.method}</span>
                      </div>
                      <span className="font-black text-slate-800">S/ {pm.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
          </div>

          {/* ── CHARTS ROW 2 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Top Products Barchart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
              <div className="mb-6 flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Top 10 Productos</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Los más vendidos por ingreso</p>
                </div>
                <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex justify-center items-center">
                  <ChefHat className="w-5 h-5" />
                </div>
              </div>
              <div className="flex-1 mt-2 space-y-5">
                {data.topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-8 font-black text-slate-300 text-xl shrink-0 text-center">#{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-end mb-1">
                        <p className="font-bold text-sm text-slate-800 truncate pr-2">{p.name}</p>
                        <p className="font-black text-sm text-slate-900 shrink-0">S/ {p.revenue.toFixed(2)}</p>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-violet-500 h-full rounded-full" 
                          style={{ width: `${Math.max(5, (p.revenue / data.topProducts[0].revenue) * 100)}%`}}
                        ></div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {p.quantity} unid. vendidos
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hourly Heatmap (Simplified as Bar Chart for easier reading) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
              <div className="mb-6">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Mapa de Horarios</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">¿A qué hora se vende más?</p>
              </div>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourlyHeatmap} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} dy={10} 
                      tickFormatter={(val) => `${val}h`} 
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `S/${v}`} />
                    <Tooltip 
                      cursor={{fill: '#F1F5F9'}}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                      labelFormatter={(h) => `Hora: ${h}:00 - ${h}:59`}
                      formatter={(val: any) => `S/ ${Number(val).toFixed(2)}`}
                    />
                    <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      ) : null}
      
    </div>
  );
}
