'use client';
import { getApiUrl } from '@/utils/api';
import { subscribeToKitchenOrders, serveKitchenItemInFirebase, updateKitchenOrderStatusInFirebase } from '@/utils/firebaseSync';
import { getScopedStorage, setScopedStorage, getRestaurantId } from '@/utils/storage';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, Clock, AlertTriangle, ArrowLeft, UtensilsCrossed, XCircle, Undo2, Check, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

import { formatWaitTime } from '@/utils/date';

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
      colorHex?: string;
    }[];
  };
}

interface KitchenOrder {
  id: string;
  createdAt: string;
  status: string; // 'OPEN', 'CANCELLED', 'SERVED'
  waiterName?: string;
  customerName?: string;
  previousTableName?: string | null;
  table: {
    name: string;
    number: number;
  } | null;
  items: KitchenItem[];
}

// Componente inteligente para el Cronómetro sincronizado con horario de Perú
const OrderTimer = ({ createdAt }: { createdAt: string }) => {
  const [timeText, setTimeText] = useState('');
  const [isDelayed, setIsDelayed] = useState(false);
  const [isVeryDelayed, setIsVeryDelayed] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const formatted = formatWaitTime(createdAt);
      setTimeText(formatted);

      const orderDate = new Date(createdAt).getTime();
      const diffMs = Date.now() - (isNaN(orderDate) ? Date.now() : orderDate);
      const minutes = Math.floor(diffMs / 60000);
      if (minutes >= 20) setIsVeryDelayed(true);
      else if (minutes >= 10) setIsDelayed(true);
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

  // Registro de órdenes e ítems despachados para prevenir que reaparezcan por polling
  const servedOrderIdsRef = useRef<Set<string>>(new Set());
  const servedItemIdsRef = useRef<Set<string>>(new Set());

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
    const currentRestId = getRestaurantId();
    if (!token) return router.push('/login');
    let serverOrders: KitchenOrder[] = [];
    try {
      const response = await fetch(getApiUrl('/orders/kitchen'), {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId || ''
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.orders)) {
          serverOrders = data.orders;
          setFinishedCount(data.finishedCount || 0);
        }
      }
    } catch (error) {
      console.warn("KDS Server fetch fallback:", error);
    }

    // Merge with local kitchen orders for standalone / local mode
    try {
      const localOrders = getScopedStorage<KitchenOrder[]>('pos_local_kitchen_orders', []);
      if (Array.isArray(localOrders) && localOrders.length > 0) {
        // Filtrar solo las órdenes locales que sigan activas y tengan platos activos
        const activeLocalOrders = localOrders.filter(lo => 
          lo.status !== 'SERVED' && 
          lo.status !== 'CANCELLED' && 
          !servedOrderIdsRef.current.has(lo.id) &&
          Array.isArray(lo.items) && 
          lo.items.some(it => it.status === 'ACTIVE' && !servedItemIdsRef.current.has(it.id))
        );
        const map = new Map<string, KitchenOrder>();
        serverOrders.forEach(o => map.set(o.id, o));
        activeLocalOrders.forEach(lo => {
          if (!map.has(lo.id)) {
            map.set(lo.id, lo);
          }
        });
        serverOrders = Array.from(map.values());
      }
    } catch {}

    // Filtrar aquellas que ya fueron despachadas en esta pantalla
    serverOrders = serverOrders
      .filter(o => !servedOrderIdsRef.current.has(o.id))
      .map(o => ({
        ...o,
        items: o.items.map(it => servedItemIdsRef.current.has(it.id) ? { ...it, status: 'SERVED' as const } : it)
      }))
      .filter(o => o.status === 'CANCELLED' || o.items.some(it => it.status === 'ACTIVE'));

    prevOrdersRef.current = serverOrders;
    setOrders(serverOrders);
    setLoading(false);
  };

  const markItemAsServed = async (orderId: string, itemId: string) => {
    isUpdatingRef.current = true;
    servedItemIdsRef.current.add(itemId);
    
    // Update local kitchen cache
    try {
      let localOrders = getScopedStorage<KitchenOrder[]>('pos_local_kitchen_orders', []);
      if (Array.isArray(localOrders) && localOrders.length > 0) {
        localOrders = localOrders.map(o => {
          if (o.id === orderId) {
            return {
              ...o,
              items: o.items.map(i => i.id === itemId ? { ...i, status: 'SERVED' as const } : i)
            };
          }
          return o;
        }).filter(o => o.items.some(i => i.status === 'ACTIVE'));
        setScopedStorage('pos_local_kitchen_orders', localOrders);
      }
    } catch {}

    // Optimistic Update: Remove ticket if all items are served
    setOrders(current => current.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          items: o.items.map(i => i.id === itemId ? { ...i, status: 'SERVED' as const } : i)
        };
      }
      return o;
    }).filter(o => o.items.some(i => i.status === 'ACTIVE')));

    setFinishedCount(prev => prev + 1);
    toast.success('Plato despachado ✅');

    // Sincronizar con Firebase en Tiempo Real
    serveKitchenItemInFirebase(orderId, itemId).catch(() => {});

    try {
      const token = localStorage.getItem('pos_token');
      await fetch(getApiUrl(`/orders/${orderId}/items/${itemId}/serve`), {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setTimeout(() => { isUpdatingRef.current = false; }, 800);
    } catch (error) {
      setTimeout(() => { isUpdatingRef.current = false; }, 800);
    }
  };

  const unmarkItemAsServed = async (orderId: string, itemId: string) => {
    isUpdatingRef.current = true;
    servedItemIdsRef.current.delete(itemId);
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
      setTimeout(() => { isUpdatingRef.current = false; }, 800);
    } catch (error) {
      setTimeout(() => { isUpdatingRef.current = false; }, 800);
    }
  };

  const markOrderAsServed = async (orderId: string, itemIds: string[]) => {
    isUpdatingRef.current = true;
    servedOrderIdsRef.current.add(orderId);
    if (Array.isArray(itemIds)) {
      itemIds.forEach(id => servedItemIdsRef.current.add(id));
    }

    // Update local kitchen cache - completely remove the finished order
    try {
      let localOrders = getScopedStorage<KitchenOrder[]>('pos_local_kitchen_orders', []);
      if (Array.isArray(localOrders) && localOrders.length > 0) {
        localOrders = localOrders.filter(o => o.id !== orderId);
        setScopedStorage('pos_local_kitchen_orders', localOrders);
      }
    } catch {}

    // Optimistic Update: remove order from view
    setOrders(current => current.filter(o => o.id !== orderId));
    setFinishedCount(prev => prev + (itemIds.length || 1));
    toast.success('Comanda despachada por completo ✅');

    // Sincronizar con Firebase en Tiempo Real
    updateKitchenOrderStatusInFirebase(orderId, 'SERVED').catch(() => {});

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
      setTimeout(() => { isUpdatingRef.current = false; }, 800);
    } catch (error) {
      setTimeout(() => { isUpdatingRef.current = false; }, 800);
    }
  };

  const acknowledgeCanceledOrder = (orderId: string) => {
    const newAcked = [...ackedOrders, orderId];
    setAckedOrders(newAcked);
    localStorage.setItem('kds_acked_orders', JSON.stringify(newAcked));
  };

  const fetchStations = async () => {
    const currentRestId = getRestaurantId();
    // 1. Carga inmediata de estaciones desde caché local persistente
    let loaded: any[] = [];
    try {
      const cached = getScopedStorage<any[]>('pos_registered_stations', []);
      if (Array.isArray(cached) && cached.length > 0) {
        loaded = cached;
      }
    } catch {}

    if (loaded.length > 0) {
      setStations(loaded);
    }

    // 2. Sincronización silenciosa con backend
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl('/kitchen-stations'), {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId || ''
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const filtered = currentRestId
            ? data.filter((s: any) => !s.restaurantId || s.restaurantId === currentRestId)
            : data;
          setStations(filtered);
          setScopedStorage('pos_registered_stations', filtered);
        }
      }
    } catch (e) {}
  };


  useEffect(() => {
    fetchStations();

    const savedAcked = localStorage.getItem('kds_acked_orders');
    if (savedAcked) {
      try { setAckedOrders(JSON.parse(savedAcked)); } catch (e) {}
    }
    fetchKitchenOrders();
    const interval = setInterval(() => {
      fetchKitchenOrders();
      fetchStations();
    }, 5000); // Polling cada 5s

    const handleStorageChange = () => {
      fetchKitchenOrders();
      fetchStations();
    };
    window.addEventListener('storage', handleStorageChange);

    const handleOrderServedEvent = (e: any) => {
      const servedOrderId = e.detail?.id;
      if (servedOrderId) {
        setOrders(prev => prev.filter(o => o.id !== servedOrderId));
      } else {
        fetchKitchenOrders();
      }
    };
    window.addEventListener('pos:order_served', handleOrderServedEvent as EventListener);

    // Real-time Firebase Firestore synchronization listener
    const currentRestId = getRestaurantId() || 'main';
    const unsubscribeFirebase = subscribeToKitchenOrders(currentRestId, (firebaseOrders) => {
      if (isUpdatingRef.current) return;
      
      // Si no hay órdenes abiertas en Firebase, limpiar pantalla y caché local
      if (!firebaseOrders || firebaseOrders.length === 0) {
        setOrders(prev => prev.filter(o => o.id.startsWith('local-') && o.status === 'OPEN'));
        try {
          let localOrders = getScopedStorage<KitchenOrder[]>('pos_local_kitchen_orders', []);
          if (Array.isArray(localOrders) && localOrders.length > 0) {
            const cleaned = localOrders.filter(lo => lo.id.startsWith('local-'));
            setScopedStorage('pos_local_kitchen_orders', cleaned);
          }
        } catch {}
        return;
      }

      // Limpiar de la caché local aquellas órdenes que ya no están abiertas en Firebase
      const openFirebaseIds = new Set(firebaseOrders.map(fo => fo.id));
      try {
        let localOrders = getScopedStorage<KitchenOrder[]>('pos_local_kitchen_orders', []);
        if (Array.isArray(localOrders) && localOrders.length > 0) {
          const cleaned = localOrders.filter(lo => openFirebaseIds.has(lo.id) || lo.id.startsWith('local-'));
          setScopedStorage('pos_local_kitchen_orders', cleaned);
        }
      } catch {}

      setOrders(prev => {
        const prevMap = new Map(prev.map(o => [o.id, o]));
        const updatedList: KitchenOrder[] = [];

        firebaseOrders
          .filter(fo => !servedOrderIdsRef.current.has(fo.id))
          .forEach(fo => {
            const prevOrder = prevMap.get(fo.id);
            const itemsList: KitchenItem[] = (fo.items || []).map((it: any) => {
              const prevItem = prevOrder?.items.find(pi => pi.id === it.id);
              const isServedLocal = servedItemIdsRef.current.has(it.id);
              const status = (it.status === 'CANCELLED' || it.status === 'CANCELED') 
                ? 'CANCELLED' 
                : ((it.status === 'SERVED' || isServedLocal) ? 'SERVED' : 'ACTIVE');

              return {
                id: it.id,
                quantity: it.quantity,
                notes: it.notes || prevItem?.notes || '',
                parentItemId: prevItem?.parentItemId || null,
                status,
                product: {
                  name: it.productName || prevItem?.product?.name || 'Producto',
                  category: prevItem?.product?.category || { name: 'Cocina' },
                  stations: prevItem?.product?.stations || []
                }
              };
            });

            // Solo incluir tickets que tengan al menos 1 plato activo (o cancelado para visualización)
            const hasActiveItems = itemsList.some(i => i.status === 'ACTIVE');
            if (hasActiveItems || fo.status === 'CANCELLED') {
              updatedList.push({
                id: fo.id,
                createdAt: fo.createdAt || prevOrder?.createdAt || new Date().toISOString(),
                status: fo.status || 'OPEN',
                waiterName: fo.waiterName || (fo as any).customerName?.replace(/^Mesero:\s*/i, '') || prevOrder?.waiterName || 'Mesero',
                previousTableName: prevOrder?.previousTableName || null,
                table: fo.tableName ? { name: fo.tableName, number: parseInt(fo.tableName.replace(/\D/g, '')) || 1 } : (prevOrder?.table || null),
                items: itemsList
              });
            }
          });

        return updatedList;
      });
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('pos:order_served', handleOrderServedEvent as EventListener);
      if (typeof unsubscribeFirebase === 'function') unsubscribeFirebase();
    };
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
              {orders.filter(o => !ackedOrders.includes(o.id) && o.status !== 'CANCELLED' && o.status !== 'SERVED' && o.items.some(i => i.status === 'ACTIVE')).length}
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
            onClick={() => setSelectedStation(selectedStation === st.id ? null : st.id)}
            className={`px-6 py-2.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-sm whitespace-nowrap flex items-center gap-2 ${
               selectedStation === st.id ? 'scale-105 shadow-lg ring-2 ring-white/20' : 'hover:scale-105 opacity-80 hover:opacity-100'
            }`}
             style={{ 
              backgroundColor: selectedStation === st.id ? st.colorHex : '#1e293b', 
              color: selectedStation === st.id ? '#0f172a' : st.colorHex,
              border: `2px solid ${st.colorHex}`
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedStation === st.id ? '#0f172a' : st.colorHex }}></span>
            {st.name}
          </button>
        ))}
      </div>

      {/* ÁREA DE TICKETS */}
      {orders.filter(o => !ackedOrders.includes(o.id) && o.status !== 'SERVED' && (o.status === 'CANCELLED' || o.items.some(i => i.status === 'ACTIVE'))).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[70vh] text-slate-500 gap-4">
          <UtensilsCrossed className="w-24 h-24 text-slate-700 opacity-50" />
          <h2 className="text-3xl font-black text-slate-600">Cocina Despejada</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-6 gap-4 items-start">
          {orders.filter(o => {
            if (ackedOrders.includes(o.id)) return false;
            if (o.status === 'SERVED') return false;
            // Si todos los platos fueron servidos y la orden no está cancelada, no mostrar
            const hasActive = o.items.some(i => i.status === 'ACTIVE');
            if (!hasActive && o.status !== 'CANCELLED') return false;

            // Si no hay filtro por estación, mostrar
            if (!selectedStation) return true;
            return o.items.some(i => {
              const itemStations = i.product?.stations || [];
              const target = stations.find(st => st.id === selectedStation);
              return itemStations.some((s: any) => 
                String(s.id) === String(selectedStation) || 
                (target && s.name?.toLowerCase().trim() === target.name?.toLowerCase().trim())
              );
            });
          }).map((order) => {
            // NUEVO: Verificamos si la orden completa fue cancelada por el mozo
            const isOrderCanceled = order.status === 'CANCELLED';
            const tableName = order.table?.name || (order.table?.number ? `MESA ${order.table?.number}` : null) || (order as any).customerName || order.previousTableName || 'MOSTRADOR';

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
                  <div className="flex justify-between items-start mb-2">
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

                  {/* Badge de Mozo / Mesero */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200">
                      <span className="text-slate-400">👤 Mozo:</span>
                      <span className="text-slate-900 font-black uppercase">{order.waiterName || (order as any).customerName?.replace(/^Mesero:\s*/i, '') || 'Mesero'}</span>
                    </div>
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
                         const itemStations = item.product?.stations || [];
                         const target = stations.find(st => st.id === selectedStation);
                         return itemStations.some((s: any) => 
                           String(s.id) === String(selectedStation) || 
                           (target && s.name?.toLowerCase().trim() === target.name?.toLowerCase().trim())
                         );
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
                         const station = item.product?.stations?.find((s: any) => 
                           String(s.id) === String(selectedStation) || 
                           (stations.find(st => st.id === selectedStation)?.name?.toLowerCase().trim() === s.name?.toLowerCase().trim())
                         ) || item.product?.stations?.[0];
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
                                     {station && (
                                       <span 
                                         className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm shrink-0 whitespace-nowrap inline-flex items-center gap-1"
                                         style={{ 
                                           backgroundColor: `${station.colorHex}25`, 
                                           color: station.colorHex, 
                                           border: `1px solid ${station.colorHex}80` 
                                         }}
                                       >
                                         <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: station.colorHex }}></span>
                                         {station.name}
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