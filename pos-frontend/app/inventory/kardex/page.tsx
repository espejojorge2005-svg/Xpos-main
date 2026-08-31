'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, ArrowLeft, Search, Loader2, AlertCircle, CalendarDays, TrendingDown, Plus, RefreshCw } from 'lucide-react';
import { getApiUrl } from '@/utils/api';
import { getScopedStorage, setScopedStorage, getRestaurantId } from '@/utils/storage';
import { subscribeToStockMovements, subscribeToProducts } from '@/utils/firebaseSync';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

interface KardexRow {
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  minStock: number;
  dailyClosing: Record<string, number | null>; // 'YYYY-MM-DD' -> stock
}

interface KardexData {
  dates: string[];
  kardex: KardexRow[];
}

/**
 * Obtiene la representación 'YYYY-MM-DD' respetando la zona horaria local del usuario.
 */
function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calcula el Kardex resiliente usando los productos y movimientos del almacenamiento local.
 */
function computeLocalKardex(days = 7): KardexData {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(getLocalDateString(d));
  }

  const products = getScopedStorage<any[]>('pos_registered_products', []);
  const movements = getScopedStorage<any[]>('pos_stock_movements', []);

  // Mapear el último movimiento de cada producto en cada fecha
  const closingByProductDate: Record<string, Record<string, number>> = {};
  if (Array.isArray(movements)) {
    // Ordenar de más antiguo a más reciente para que el último del día prevalezca
    const sortedMovements = [...movements].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    for (const mov of sortedMovements) {
      if (!mov.createdAt) continue;
      const movDate = new Date(mov.createdAt);
      if (isNaN(movDate.getTime())) continue;

      const dateKey = getLocalDateString(movDate);
      const pid = mov.productId;
      if (!closingByProductDate[pid]) closingByProductDate[pid] = {};
      closingByProductDate[pid][dateKey] = Number(mov.stockAfter) || 0;
    }
  }

  const todayKey = getLocalDateString();

  const kardex: KardexRow[] = (products || []).map((product) => {
    const dailyClosing: Record<string, number | null> = {};
    let lastKnown: number | null = null;
    const currentStockNum = typeof product.stock === 'number' ? product.stock : 0;

    for (const date of dates) {
      const closing = closingByProductDate[product.id]?.[date];
      if (closing !== undefined) {
        lastKnown = closing;
        dailyClosing[date] = closing;
      } else if (date === todayKey) {
        // En la fecha de hoy, si no hay cierre registrado, mostrar el stock actual
        dailyClosing[date] = currentStockNum;
      } else {
        dailyClosing[date] = lastKnown;
      }
    }

    return {
      productId: product.id,
      productName: product.name,
      category: product.category || 'General',
      currentStock: currentStockNum,
      minStock: typeof product.minStock === 'number' ? product.minStock : 0,
      dailyClosing,
    };
  });

  return { dates, kardex };
}

/**
 * Formatea la cabecera de fecha del Kardex (Hoy, Ayer o día abreviado con fecha).
 */
function formatDateLabel(dateStr: string): { day: string; weekday: string } {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day, 12, 0, 0); // Mediodía para evitar saltos

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isoToday = getLocalDateString(today);
  const isoYesterday = getLocalDateString(yesterday);

  if (dateStr === isoToday) {
    return { day: 'Hoy', weekday: d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) };
  }
  if (dateStr === isoYesterday) {
    return { day: 'Ayer', weekday: d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) };
  }
  return {
    day: d.toLocaleDateString('es-PE', { weekday: 'short' }),
    weekday: d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }),
  };
}

export default function KardexPage() {
  const router = useRouter();
  useGuardedRoute('kardex');

  const [data, setData] = useState<KardexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadKardexData = async () => {
    let loadedData: KardexData | null = null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;

    // 1. Intentar consultar el backend si hay token disponible
    if (token) {
      try {
        const res = await fetch(getApiUrl('/products/kardex'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.kardex) && json.kardex.length > 0) {
            loadedData = json;
          }
        }
      } catch {
        // Silencioso en modo local: el backend puede estar apagado
      }
    }

    // 2. Fallback resiliente: calcular localmente desde scopedStorage
    if (!loadedData || !Array.isArray(loadedData.kardex) || loadedData.kardex.length === 0) {
      loadedData = computeLocalKardex(7);
    }

    setData(loadedData);
    setLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadKardexData();

    const currentRestId = getRestaurantId() || 'main';
    let unsubMovs: (() => void) | undefined;
    let unsubProds: (() => void) | undefined;

    unsubMovs = subscribeToStockMovements(currentRestId, (cloudMovements) => {
      if (Array.isArray(cloudMovements)) {
        setScopedStorage('pos_stock_movements', cloudMovements);
        setData(computeLocalKardex(7));
      }
    });

    unsubProds = subscribeToProducts(currentRestId, (cloudProducts) => {
      if (Array.isArray(cloudProducts) && cloudProducts.length > 0) {
        setScopedStorage('pos_registered_products', cloudProducts);
        setData(computeLocalKardex(7));
      }
    });

    return () => {
      if (typeof unsubMovs === 'function') unsubMovs();
      if (typeof unsubProds === 'function') unsubProds();
    };
  }, [router]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadKardexData();
  };

  const filteredRows = data?.kardex.filter((row) =>
    row.productName.toLowerCase().includes(search.toLowerCase()) ||
    row.category.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/inventory')}
            className="p-3 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-2xl transition-colors border border-slate-200"
            title="Volver al Inventario"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <LayoutGrid className="text-violet-600 w-8 h-8" />
              Kardex de Inventario
            </h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-sm tracking-widest">
              Stock de cierre por día — últimos 7 días
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-violet-600' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={() => router.push('/inventory')}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md shadow-emerald-200"
          >
            <Plus className="w-4 h-4" />
            Gestionar Stock
          </button>
        </div>
      </header>

      {/* Barra de Búsqueda y Leyenda */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por producto o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-slate-900 shadow-sm"
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-500 bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-violet-100 border border-violet-300 inline-block" /> Cierre de hoy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-100 border border-rose-300 inline-block" /> Stock bajo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-slate-100 border border-slate-200 inline-block" /> Histórico
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-slate-300 font-bold">—</span> Sin datos
          </span>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
          </div>
        ) : !data || filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-slate-200" />
            <div>
              <p className="font-black text-slate-700 text-base">No hay productos disponibles en el Kardex</p>
              <p className="text-sm text-slate-400 mt-1">
                {search ? 'Ningún producto coincide con la búsqueda.' : 'Agrega productos en el módulo de Inventario para visualizarlos aquí.'}
              </p>
            </div>
            <button
              onClick={() => router.push('/inventory')}
              className="mt-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-all"
            >
              Ir a Inventario
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  {/* Product header (sticky) */}
                  <th className="p-4 font-black text-xs uppercase tracking-widest text-slate-400 sticky left-0 bg-slate-50/90 backdrop-blur-sm z-10 min-w-[220px]">
                    Producto
                  </th>
                  <th className="p-4 font-black text-xs uppercase tracking-widest text-slate-400 text-center min-w-[100px]">
                    Stock Actual
                  </th>
                  {/* Day columns */}
                  {data.dates.map((date) => {
                    const label = formatDateLabel(date);
                    const isToday = date === getLocalDateString();
                    return (
                      <th
                        key={date}
                        className={`p-4 text-center min-w-[110px] ${isToday ? 'bg-violet-50/60' : ''}`}
                      >
                        <div className={`font-black text-sm ${isToday ? 'text-violet-700' : 'text-slate-700'}`}>
                          {label.day}
                        </div>
                        <div className="text-xs text-slate-400 font-normal">{label.weekday}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const isLow = row.currentStock <= row.minStock;
                  return (
                    <tr key={row.productId} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Product name (sticky) */}
                      <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50/90 backdrop-blur-sm z-10 border-r border-slate-100">
                        <div className="font-bold text-slate-800 truncate max-w-[200px]">{row.productName}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{row.category}</div>
                      </td>

                      {/* Current stock badge */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black ${
                            isLow
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isLow && <TrendingDown className="w-3.5 h-3.5" />}
                          {row.currentStock} un.
                        </span>
                      </td>

                      {/* Daily closing cells */}
                      {data.dates.map((date) => {
                        const val = row.dailyClosing[date];
                        const isToday = date === getLocalDateString();
                        const hasVal = val !== null && val !== undefined;
                        const lowOnDay = hasVal && val! <= row.minStock;

                        return (
                          <td
                            key={date}
                            className={`p-3 text-center ${isToday ? 'bg-violet-50/40' : ''}`}
                          >
                            {!hasVal ? (
                              <span className="text-slate-300 text-xs font-medium">—</span>
                            ) : (
                              <div
                                className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-black min-w-[56px] shadow-xs ${
                                  lowOnDay
                                    ? 'bg-rose-100 text-rose-700'
                                    : isToday
                                    ? 'bg-violet-100 text-violet-800 border border-violet-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {val}
                                <span className="font-normal text-[10px] opacity-60">un.</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {data && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 font-medium gap-2">
            <span>{filteredRows.length} productos listados</span>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-violet-400" />
              <span>
                Actualizado: {new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
