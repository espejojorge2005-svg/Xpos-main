'use client';
import { getApiUrl } from '@/utils/api';


import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, Clock, AlertTriangle, ArrowLeft, UtensilsCrossed, XCircle, Undo2, Check, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

// Interfaces actualizadas para incluir status
interface KitchenItem {
  id: string;
  quantity: number;
  notes?: string;
  parentItemId?: string | null;
  status: 'ACTIVE' | 'CANCELED' | 'CANCELLED' | 'SERVED'; // <-- Añadido SERVED
  product: {
    name: string;
    category?: {
      name: string;
    };
    stations?: {
      id: string;
      name: string;
      colorHex: string;
    }[];
  };
}

interface KitchenOrder {
  id: string;
  createdAt: string;
  // Asumimos que agregaste status a la orden también en tu DB, ej: 'OPEN', 'CANCELLED'
  status: string; // <-- NUEVO: Status de la orden completa
  previousTableName?: string | null;
  table: {
    name: string;
    number: number;
  } | null;
  items: KitchenItem[];
}

// Componente inteligente para el Cronómetro (Sin cambios, se mantiene igual)
const OrderTimer = ({ createdAt }: { createdAt: string }) => {
  const [timeText, setTimeText] = useState('');
  const [isDelayed, setIsDelayed] = useState(false);
  const [isVeryDelayed, setIsVeryDelayed] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const orderDate = new Date(createdAt).getTime();
      const now = new Date().getTime();
      const diffMs = now - orderDate;
      if (diffMs < 0) return setTimeText('0s');
      const diffSecs = Math.floor(diffMs / 1000);
      const minutes = Math.floor(diffSecs / 60);
      const seconds = diffSecs % 60;
      if (minutes >= 20) setIsVeryDelayed(true);
      else if (minutes >= 10) setIsDelayed(true);
      setTimeText(`${minutes}m ${seconds.toString().padStart(2, '0')}s`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black shadow-inner transition-colors
      ${isVeryDelayed ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse' : 
        isDelayed ? 'bg-orange-100 text-orange-700 border border-orange-200' : 
        'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}
    >
      <Clock className="w-4 h-4" />
      {timeText}
    </div>
  );
};

export default function CocinaPage() {
  const router = useRouter();
  useGuardedRoute('cocina');
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackedOrders, setAckedOrders] = useState<string[]>([]);
  const isUpdatingRef = useRef(false);

  // NUEVO: Estados para filtrar estaciones
  const [stations, setStations] = useState<{id: string, name: string, colorHex: string}[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [finishedCount, setFinishedCount] = useState<number>(0);

  // Referencia para comparar estados anteriores y lanzar alertas
  const prevOrdersRef = useRef<KitchenOrder[]>([]);

  // Simple sonido de alerta de error/cancelación
  const playAlertSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Tono de error (dos pitidos rápidos pitch descendente)
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(300, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.warn('Audio play failed (maybe needs interaction)', e);
    }
  };

  const fetchKitchenOrders = async () => {
    if (isUpdatingRef.current) return;
    const token = localStorage.getItem('pos_token');
    if (!token) return router.push('/login');
    try {
      const response = await fetch(getApiUrl('/orders/kitchen'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
             // Lógica para comparar con el estado anterior y lanzar notificaciones Toast
        if (prevOrdersRef.current.length > 0) {
          data.orders.forEach((newOrder: KitchenOrder) => {
            const oldOrder = prevOrdersRef.current.find(o => o.id === newOrder.id);
            if (oldOrder) {
              const tableName = newOrder.table?.name || (newOrder.table?.number ? `MESA ${newOrder.table.number}` : 'MOSTRADOR');
              
              // 1. Verificar si la orden COMPLETA fue cancelada
              if (oldOrder.status !== 'CANCELLED' && newOrder.status === 'CANCELLED') {
                toast.error(`¡ORDEN ANULADA: ${tableName}!`, {
                  description: 'El mozo ha cancelado la mesa completa. ¡DETENER PREPARACIÓN!',
                  duration: 10000,
                  icon: <XCircle className="w-5 h-5 text-white" />
                });
                playAlertSound();
              }
              // 2. Si la orden sigue activa, verificar si algún PLATO en específico fue cancelado
              else if (newOrder.status !== 'CANCELLED') {
                newOrder.items.forEach(newItem => {
                  const oldItem = oldOrder.items.find(i => i.id === newItem.id);
                  if (oldItem && oldItem.status !== 'CANCELED' && newItem.status === 'CANCELED') {
                    toast.error(`¡PLATO CANCELADO EN ${tableName}!`, {
                      description: `Se canceló: ${newItem.quantity}x ${newItem.product.name}. ¡NO PREPARAR!`,
                      duration: 8000,
                    });
                    playAlertSound();
                  } else if (oldItem && oldItem.notes !== newItem.notes && newItem.status !== 'CANCELED') {
                    toast.warning(`¡NOTA ALERTA EN ${tableName}!`, {
                      description: `${newItem.quantity}x ${newItem.product.name} cambió su nota a: "${newItem.notes || 'Sin nota'}".`,
                      duration: 10000,
                    });
                    playAlertSound();
                  }
                });

                // 3. Verificar si la mesa ha cambiado
                if (!oldOrder.previousTableName && newOrder.previousTableName) {
                  toast(`¡CAMBIO DE MESA!`, {
                    description: `El pedido que estaba en ${newOrder.previousTableName} se movió a ${tableName}.`,
                    duration: 12000,
                    icon: <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                  });
                  playAlertSound();
                }
              }
            }
          });
        }
        
        prevOrdersRef.current = data.orders;
        setOrders(data.orders);
        setFinishedCount(data.finishedCount || 0);
      } else if (response.status === 401) { router.push('/login'); }
    } catch (error) { console.error("Error KDS:", error);
    } finally { setLoading(false); }
  };

  const markItemAsServed = async (orderId: string, itemId: string) => {
    isUpdatingRef.current = true;
    // Optimistic Update
    setOrders(current => current.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: o.items.map(i => i.id === itemId ? { ...i, status: 'SERVED' as const } : i)
        };
      }
      return o;
    }));

    try {
      const token = localStorage.getItem('pos_token');
      await fetch(getApiUrl(`/orders/${orderId}/items/${itemId}/serve`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Esperar un instante para que BD consolide antes de permitir el próximo poll
      setTimeout(() => { isUpdatingRef.current = false; }, 400);
    } catch (error) {
      console.error("Error marking item served", error);
      isUpdatingRef.current = false;
      fetchKitchenOrders(); // Revert on error
    }
  };

  const unmarkItemAsServed = async (orderId: string, itemId: string) => {
    isUpdatingRef.current = true;
    // Optimistic Update
    setOrders(current => current.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: o.items.map(i => i.id === itemId ? { ...i, status: 'ACTIVE' as const } : i)
        };
      }
      return o;
    }));

    try {
      const token = localStorage.getItem('pos_token');
      await fetch(getApiUrl(`/orders/${orderId}/items/${itemId}/unserve`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setTimeout(() => { isUpdatingRef.current = false; }, 400);
    } catch (error) {
      console.error("Error unmarking item as served", error);
      isUpdatingRef.current = false;
      fetchKitchenOrders(); // Revert on error
    }
  };

  const markOrderAsServed = async (orderId: string, itemIds: string[]) => {
    isUpdatingRef.current = true;
    // Optimistic Update
    setOrders(current => current.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: o.items.map(i => i.status === 'ACTIVE' ? { ...i, status: 'SERVED' as const } : i)
        };
      }
      return o;
    }).filter(o => o.status === 'CANCELLED' || o.items.some(i => i.status === 'ACTIVE'))); // Hide if none active

    try {
      const token = localStorage.getItem('pos_token');
      await fetch(getApiUrl(`/orders/${orderId}/serve`), {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ itemIds })
      });
      setTimeout(() => { isUpdatingRef.current = false; }, 400);
    } catch (error) {
      console.error("Error marking order served", error);
      isUpdatingRef.current = false;
      fetchKitchenOrders(); // Revert on error
    }
  };

  const acknowledgeCanceledOrder = (orderId: string) => {
    const newAcked = [...ackedOrders, orderId];
    setAckedOrders(newAcked);
    localStorage.setItem('kds_acked_orders', JSON.stringify(newAcked));
  };

  useEffect(() => {
    const fetchStations = async () => {
      const token = localStorage.getItem('pos_token');
      try {
        const response = await fetch(getApiUrl('/kitchen-stations'), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) setStations(await response.json());
      } catch (e) {}
    };
    fetchStations();

    const savedAcked = localStorage.getItem('kds_acked_orders');
    if (savedAcked) {
      try { setAckedOrders(JSON.parse(savedAcked)); } catch (e) {}
    }
    fetchKitchenOrders();
    const interval = setInterval(fetchKitchenOrders, 5000); // Polling cada 5s
    return () => clearInterval(interval);
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 font-sans">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl mb-6 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button onClick={() => router.push('/')} className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors text-white mt-1.5 md:mt-0 self-start md:self-auto">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3 tracking-wide">
              <ChefHat className="text-emerald-400 w-8 h-8" />
              MONITOR DE COCINA (KDS)
            </h1>
            <p className="text-slate-400 text-sm font-medium mt-1">Sincronización en tiempo real</p>
          </div>
        </div>
        <div className="flex gap-3 md:gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none snap-x">
          <div className="bg-slate-700 px-4 py-2 rounded-xl border border-slate-600 flex items-center flex-1 md:flex-none justify-between md:justify-start min-w-[160px] snap-center">
            <span className="text-slate-300 font-bold text-sm mr-2 leading-tight">Pedidos<br className="md:hidden"/> Terminados:</span>
            <span className="text-2xl font-black text-slate-300">{finishedCount}</span>
          </div>
          <div className="bg-slate-700 px-4 py-2 rounded-xl border border-slate-600 flex items-center flex-1 md:flex-none justify-between md:justify-start min-w-[160px] snap-center">
            <span className="text-slate-300 font-bold text-sm mr-2 leading-tight">Pedidos<br className="md:hidden"/> Activos:</span>
            <span className="text-2xl font-black text-emerald-400">
              {orders.filter(o => !ackedOrders.includes(o.id) && o.status !== 'CANCELLED').length}
            </span>
          </div>
        </div>
      </header>

      {/* FILTROS POR ÁREA DE PREPARACIÓN */}
      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedStation(null)}
          className={`px-6 py-2.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-sm whitespace-nowrap ${
            !selectedStation 
              ? 'bg-emerald-500 text-white shadow-emerald-500/20 scale-105' 
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          Todas las Áreas
        </button>
        {stations.map(st => (
          <button
            key={st.id}
            onClick={() => setSelectedStation(st.id)}
            className={`px-6 py-2.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-sm whitespace-nowrap ${
               selectedStation === st.id ? 'scale-105' : 'hover:scale-105 opacity-80 hover:opacity-100'
            }`}
             style={{ 
              backgroundColor: selectedStation === st.id ? st.colorHex : '#1e293b', 
              color: selectedStation === st.id ? '#0f172a' : st.colorHex,
              border: `2px solid ${st.colorHex}`
            }}
          >
            {st.name}
          </button>
        ))}
      </div>

      {/* ÁREA DE TICKETS */}
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 gap-4">
          <UtensilsCrossed className="w-24 h-24 text-slate-700 opacity-50" />
          <h2 className="text-3xl font-black text-slate-600">Cocina Despejada</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-6 gap-4 items-start">
          {orders.filter(o => {
            if (ackedOrders.includes(o.id)) return false;
            // Si no hay filtro, mostrar todas
            if (!selectedStation) return true;
            return o.items.some(i => i.product.stations?.some((s: any) => s.id === selectedStation));
          }).map((order) => {
            // NUEVO: Verificamos si la orden completa fue cancelada por el mozo
            const isOrderCanceled = order.status === 'CANCELLED';
            const tableName = order.table?.name || `MESA ${order.table?.number}` || 'MOSTRADOR';

            return (
              <div 
                key={order.id} 
                className={`rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-t-8 overflow-hidden animate-in fade-in zoom-in-95 duration-300 relative flex flex-col transition-all
                  ${isOrderCanceled 
                    ? 'bg-rose-50 border-rose-500 scale-105 shadow-xl shadow-rose-950/20 z-10' // Estilo crítico para orden cancelada
                    : 'bg-[#fdfbf7] border-emerald-500'}`}
                style={{ minHeight: '320px' }}
              >
                {/* Diseño perforaciones */}
                <div className="absolute top-0 w-full h-3 flex justify-around px-2 opacity-10">
                  {[...Array(12)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-slate-900 -mt-1"></div>)}
                </div>

                {/* Cabecera Ticket */}
                <div className={`p-5 border-b-2 border-dashed mt-1 ${isOrderCanceled ? 'bg-rose-100 border-rose-400' : 'bg-white border-slate-300'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className={`text-3xl font-black uppercase tracking-tighter flex flex-col ${isOrderCanceled ? 'text-rose-900 line-through decoration-rose-400' : 'text-slate-800'}`}>
                      {order.previousTableName && (
                        <span className="text-xl text-slate-400 line-through decoration-slate-400 mb-1 leading-none">{order.previousTableName}</span>
                      )}
                      <span>{tableName}</span>
                    </h3>
                    {isOrderCanceled && (
                       <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 text-white rounded-lg font-bold text-sm shadow-sm animate-pulse">
                         <XCircle className="w-4 h-4" />
                         ¡ANULADA!
                       </div>
                    )}
                  </div>
                  {!isOrderCanceled ? (
                    <OrderTimer createdAt={order.createdAt} />
                  ) : (
                    <p className="text-rose-700 font-bold text-sm mt-2 leading-tight">
                      El mozo canceló esta mesa.<br/>¡Detener preparaciones!
                    </p>
                  )}
                </div>

                {/* Lista Platos */}
                <div className="p-5 flex-1 relative flex flex-col">
                  <ul className="flex flex-col gap-4">
                    {(() => {
                      const visibleItems = order.items.filter(item => {
                         if (!selectedStation) return true;
                         return item.product.stations?.some((s: any) => s.id === selectedStation);
                      });

                      const rootItems = visibleItems.filter(item => {
                         if (!item.parentItemId) return true;
                         const parentInView = visibleItems.some(parent => parent.id === item.parentItemId);
                         return !parentInView;
                      });

                      return rootItems.map((item, index) => {
                         const isItemCanceled = item.status === 'CANCELED' || item.status === 'CANCELLED';
                         const isItemServed = item.status === 'SERVED';
                         const catName = item.product?.category?.name?.toUpperCase() || '';
                         // Si hay filtro, usamos el color de la estación seleccionada, de lo contrario la primera
                         const station = item.product?.stations?.find((s: any) => s.id === selectedStation) || item.product?.stations?.[0];
                         const isBar = ['JUGOS', 'CAFES', 'BEBIDAS', 'BAR', 'COCTELERIA', 'REFRESCOS'].includes(catName);
                         const parentItem = item.parentItemId ? order.items.find(i => i.id === item.parentItemId) : null;
                         const parentName = parentItem?.product?.name || 'COMBO';

                         const childItems = visibleItems.filter(child => child.parentItemId === item.id);

                         let customBg: string | undefined = undefined;
                         let defaultTailwindBg = 'bg-transparent';
                         
                         if (isItemCanceled) { customBg = '#fff1f2'; }
                         else if (isOrderCanceled) { defaultTailwindBg = ''; }
                         else if (station?.colorHex) { customBg = station.colorHex; }
                         else if (isBar) { defaultTailwindBg = 'bg-cyan-50/50'; }

                         return (
                           <li 
                             key={item.id} 
                             className={`flex flex-col gap-1 border-b pb-3 pt-3 px-3 -mx-2 rounded-xl last:border-0 last:pb-3 transition-opacity ${isOrderCanceled ? 'border-rose-200' : 'border-slate-100'} ${defaultTailwindBg}`}
                             style={customBg ? { backgroundColor: customBg } : {}}
                           >
                             <div className={`flex items-start justify-between relative ${isItemCanceled || isItemServed ? 'opacity-50' : ''}`}>
                               
                               <div className="flex items-start gap-3">
                                 {isItemCanceled && (
                                   <div className="absolute inset-x-0 top-1/2 h-0.5 bg-rose-600 rounded-full z-10 -translate-y-1/2 animate-in slide-in-from-left duration-300"></div>
                                 )}
                                 
                                 {isItemServed && (
                                   <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-500 rounded-full z-10 -translate-y-1/2 animate-in slide-in-from-left duration-300"></div>
                                 )}
  
                                 <div className={`font-black text-lg w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors
                                   ${isOrderCanceled ? 'bg-rose-300 text-rose-900' : 
                                     isItemCanceled ? 'bg-rose-600 text-white' :
                                     isItemServed ? 'bg-emerald-600 text-white' :
                                     isBar ? 'bg-cyan-600 text-white' :
                                     'bg-slate-800 text-white'}`}>
                                   {item.quantity}
                                 </div>
                                 
                                 <div className="flex flex-col flex-1">
                                   <h4 className={`font-black uppercase text-lg leading-tight tracking-tight flex items-center flex-wrap gap-2 ${isItemCanceled ? 'text-slate-500' : 'text-slate-800'}`}>
                                    {item.product.name}
                                    {item.parentItemId && (
                                        <span className="text-[10px] bg-indigo-100/90 text-indigo-700 font-black px-2 py-0.5 rounded-md uppercase tracking-widest border border-indigo-200/50 shadow-sm shrink-0 whitespace-nowrap">
                                          ✨ PARTE DE {parentName}
                                        </span>
                                     )}
                                  </h4>
                                  {isItemCanceled && <p className="text-rose-600 font-bold text-xs mt-0.5">Plato CANCELADO - NO PREPARAR</p>}
                                     {isItemServed && <span className="text-xs font-black ml-2 text-emerald-500 whitespace-nowrap">(SERVIDO)</span>}
                                   
                                   {!isItemCanceled && !isItemServed && isBar && !station && (
                                      <span className="text-xs font-bold text-cyan-600 uppercase tracking-widest leading-none mt-1">{catName}</span>
                                   )}
                                 </div>
                               </div>
  
                             {item.status === 'ACTIVE' && (
                               <button 
                                 onClick={() => markItemAsServed(order.id, item.id)}
                                 className="ml-auto w-10 h-10 rounded-xl bg-emerald-100/50 hover:bg-emerald-200 text-emerald-600 flex items-center justify-center transition-colors flex-shrink-0 border-2 border-emerald-200/50"
                               >
                                 <Check className="w-6 h-6 stroke-[3]" />
                               </button>
                             )}
  
                             {item.status === 'SERVED' && (
                               <button 
                                 onClick={() => unmarkItemAsServed(order.id, item.id)}
                                 className="ml-auto w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors flex-shrink-0 hover:text-rose-500 hover:bg-rose-100"
                                 title="Desmarcar plato"
                               >
                                 <Undo2 className="w-5 h-5 stroke-[2.5]" />
                               </button>
                             )}
                             </div>
                             
                             {item.notes && !isItemCanceled && !isItemServed && (
                               <div className={`ml-11 border text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 mt-1 ${isOrderCanceled ? 'bg-rose-100 text-rose-900 border-rose-200' : 'bg-amber-100 text-amber-900 border-amber-200'}`}>
                                 <AlertTriangle className="w-4 h-4 shrink-0" />
                                 <span>{item.notes}</span>
                               </div>
                             )}

                             {childItems.length > 0 && (
                               <ul className="mt-2 ml-11 flex flex-col gap-1.5 border-l-2 border-indigo-200/60 pl-3">
                                 {childItems.map(child => {
                                   const isChildCanceled = child.status === 'CANCELED' || child.status === 'CANCELLED';
                                   const isChildServed = child.status === 'SERVED';
                                   return (
                                     <li key={child.id} className={`flex flex-col relative ${isChildCanceled || isChildServed ? 'opacity-50' : ''}`}>
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-start gap-2">
                                            {isChildCanceled && (
                                              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-rose-600 rounded-full z-10 -translate-y-1/2"></div>
                                            )}
                                            {isChildServed && (
                                              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-500 rounded-full z-10 -translate-y-1/2"></div>
                                            )}
                                            <span className={`font-bold text-sm leading-tight flex items-center ${isChildCanceled ? 'text-slate-400' : 'text-slate-700'}`}>
                                              <span className="text-indigo-400 mr-1.5 font-black text-xs">▼</span>
                                              <span className="font-black mr-1">{child.quantity}x</span> <span className="uppercase">{child.product.name}</span>
                                            </span>
                                          </div>
                                          
                                          {/* Mini Check Button for child */}
                                          {child.status === 'ACTIVE' && (
                                            <button 
                                              onClick={() => markItemAsServed(order.id, child.id)}
                                              className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors flex-shrink-0"
                                            >
                                              <Check className="w-4 h-4 stroke-[3]" />
                                            </button>
                                          )}
                                          {child.status === 'SERVED' && (
                                            <button 
                                              onClick={() => unmarkItemAsServed(order.id, child.id)}
                                              className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center transition-colors flex-shrink-0"
                                            >
                                              <Undo2 className="w-3.5 h-3.5 stroke-[3]" />
                                            </button>
                                          )}
                                        </div>
                                        {child.notes && !isChildCanceled && !isChildServed && (
                                          <span className="text-xs font-semibold text-amber-700 flex items-center gap-1 mt-0.5 ml-5">
                                            <AlertTriangle className="w-3 h-3" /> {child.notes}
                                          </span>
                                        )}
                                     </li>
                                   );
                                 })}
                               </ul>
                             )}
                           </li>
                         );
                      });
                    })()}
                  </ul>
                  
                  {/* Botón de Despachar Todo al final del ticket si la orden no está cancelada */}
                  {!isOrderCanceled ? (
                    <div className="pt-4 mt-auto border-t border-slate-200">
                      <button 
                        onClick={() => markOrderAsServed(order.id, order.items.map(i => i.id))}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-lg shadow-sm shadow-emerald-500/30 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        DESPACHAR ORDEN
                      </button>
                    </div>
                  ) : (
                    <div className="pt-4 mt-auto border-t border-rose-200">
                      <button 
                        onClick={() => acknowledgeCanceledOrder(order.id)}
                        className="w-full py-3 bg-rose-700 hover:bg-rose-800 text-white font-black rounded-xl text-lg shadow-sm shadow-rose-900/30 transition-colors flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-6 h-6" />
                        OCULTAR TICKET
                      </button>
                    </div>
                  )}

                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}