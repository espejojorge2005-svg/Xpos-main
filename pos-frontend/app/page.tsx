'use client';
import { getApiUrl } from '@/utils/api';
import { getScopedStorage, getRestaurantId, setScopedStorage, removeScopedStorage } from '@/utils/storage';
import { subscribeToCashShift, subscribeToZones, subscribeToOrders, isTableMatchingOrder } from '@/utils/firebaseSync';
import { formatWaitTime } from '@/utils/date';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
// NUEVO: Importé LockKeyhole y Wallet para la pantalla de bloqueo
import { Utensils, Users, Square, Save, Move, Clock, LockKeyhole, Wallet, Grid2X2, Map as MapIcon } from 'lucide-react';
import Draggable, { DraggableEvent, DraggableData } from 'react-draggable';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

interface TableOrder {
  createdAt: string;
}

interface Table { 
  id: string; 
  name: string; 
  number: number; 
  capacity: number; 
  status: string; 
  posX: number;
  posY: number;
  zoneId: string;
  billRequested?: boolean;
  orders?: TableOrder[];
}

interface Zone { 
  id: string; 
  name: string; 
  tables: Table[]; 
}

// Subcomponente obligatorio para React-Draggable en StrictMode
const DraggableTable = ({ 
  table, 
  isEditMode, 
  handleStop, 
  handleTableClick 
}: { 
  table: Table; 
  isEditMode: boolean; 
  handleStop: (e: DraggableEvent, data: DraggableData, id: string) => void;
  handleTableClick: (table: Table, isDragging: boolean) => void;
}) => {
  const nodeRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [now, setNow] = useState(new Date());

  const isFree = table.status === 'FREE';
  const activeOrder = table.orders && table.orders.length > 0 ? table.orders[0] : null;

  useEffect(() => {
    if (!isFree && activeOrder) {
      const interval = setInterval(() => {
        setNow(new Date());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isFree, activeOrder]);

  return (
    <Draggable
      disabled={!isEditMode}
      defaultPosition={{ x: table.posX || 0, y: table.posY || 0 }}
      bounds="parent" // Limits movement to parent container
      onStart={() => setIsDragging(false)}
      onDrag={() => setIsDragging(true)}
      onStop={(e, data) => {
        handleStop(e, data, table.id);
        // Small delay so click event doesn't trigger immediately after dragging
        setTimeout(() => setIsDragging(false), 50); 
      }}
      nodeRef={nodeRef}
    >
      <div 
        ref={nodeRef}
        onClick={() => {
          if (!isDragging) {
            handleTableClick(table, isDragging);
          }
        }}
        className={`absolute w-28 h-28 p-3 rounded-2xl border-2 flex flex-col items-center justify-center shadow-sm group select-none
          ${isEditMode ? 'cursor-grab active:cursor-grabbing hover:ring-4 hover:ring-blue-100 z-10' : 'cursor-pointer active:scale-95'}
          ${isFree 
            ? 'bg-white border-emerald-100 hover:border-emerald-300 shadow-emerald-100/50' 
            : 'bg-rose-50 border-rose-200 hover:border-rose-300 shadow-rose-100/50'}`}
      >
        <Square className={`w-6 h-6 mb-1.5 opacity-40 pointer-events-none ${isFree ? 'text-emerald-600' : 'text-rose-600'}`} />
        
        <span className={`text-sm font-black mb-1 truncate w-full text-center pointer-events-none ${isFree ? 'text-slate-700' : 'text-rose-700'}`}>
          {table.name || table.number || '-'}
        </span>
        
        <div className="flex gap-1.5 items-center justify-center w-full mt-auto">
          <div className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded pointer-events-none
            ${isFree ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-200/50 text-rose-800'}`}>
            <Users className="w-2.5 h-2.5" />
            {table.capacity}
          </div>
        </div>

        {/* Status indicator pulse */}
        <span className={`absolute top-2 right-2 w-2 h-2 rounded-full shadow-sm pointer-events-none
          ${isFree ? 'bg-emerald-400' : table.billRequested ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}>
        </span>

        {/* Wait Timer / Bill Requested */}
        {!isFree && activeOrder && (
          <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 text-white text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shadow-md flex items-center gap-1 pointer-events-none z-10 transition-all ${table.billRequested ? 'bg-amber-500 animate-pulse border border-white' : 'bg-rose-600'}`}>
            {table.billRequested ? (
              <span>🔔 Cuenta Pedida</span>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                {formatWaitTime(new Date(activeOrder.createdAt), now)}
              </>
            )}
          </div>
        )}

        {isEditMode && (
          <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md">
            <Move className="w-3 h-3" />
          </div>
        )}
      </div>
    </Draggable>
  );
};

// Subcomponente de grilla estática para vista móvil/rápida
const GridTable = ({ 
  table, 
  handleTableClick 
}: { 
  table: Table; 
  handleTableClick: (table: Table, isDragging: boolean) => void;
}) => {
  const [now, setNow] = useState(new Date());
  const isFree = table.status === 'FREE';
  const activeOrder = table.orders && table.orders.length > 0 ? table.orders[0] : null;

  useEffect(() => {
    if (!isFree && activeOrder) {
      const interval = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(interval);
    }
  }, [isFree, activeOrder]);

  return (
    <button
      onClick={() => handleTableClick(table, false)}
      className={`relative p-3 sm:p-4 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center justify-center text-center transition-all active:scale-95 min-h-[115px] sm:min-h-[130px] w-full
        ${isFree 
          ? 'bg-white border-emerald-100 hover:border-emerald-300 shadow-sm hover:shadow-emerald-100' 
          : table.billRequested
            ? 'bg-amber-50 border-amber-300 hover:border-amber-400 shadow-sm hover:shadow-amber-100'
            : 'bg-rose-50 border-rose-200 hover:border-rose-300 shadow-sm hover:shadow-rose-100'}`}
    >
      <Square className={`w-6 h-6 sm:w-8 sm:h-8 mb-1 sm:mb-2 opacity-50 ${isFree ? 'text-emerald-600' : table.billRequested ? 'text-amber-600' : 'text-rose-600'}`} />
      <span className={`text-sm sm:text-base font-black mb-1 truncate w-full ${isFree ? 'text-slate-700' : table.billRequested ? 'text-amber-900' : 'text-rose-800'}`}>
        {table.name || table.number || '-'}
      </span>
      <div className={`mt-auto flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg
        ${isFree ? 'bg-emerald-50 text-emerald-600' : table.billRequested ? 'bg-amber-100 text-amber-800' : 'bg-rose-200/50 text-rose-800'}`}>
        <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        {table.capacity}
      </div>

      <span className={`absolute top-2.5 right-2.5 sm:top-4 sm:right-4 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shadow-sm
        ${isFree ? 'bg-emerald-400' : table.billRequested ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}>
      </span>

      {!isFree && activeOrder && (
        <div className={`absolute -bottom-2.5 sm:-bottom-3 left-1/2 -translate-x-1/2 text-white text-[10px] sm:text-[11px] font-black px-2 sm:px-3 py-0.5 sm:py-1 rounded-full whitespace-nowrap shadow-md flex items-center gap-1 z-10 border-2 border-white ${table.billRequested ? 'bg-amber-500 animate-pulse' : 'bg-rose-600'}`}>
          {table.billRequested ? (
            <span>🔔 Cuenta Pedida</span>
          ) : (
            <>
              <Clock className="w-3 h-3" />
              {formatWaitTime(new Date(activeOrder.createdAt), now)}
            </>
          )}
        </div>
      )}
    </button>
  );
};

const getInitialZones = (): Zone[] => {
  try {
    const savedZones = getScopedStorage<any[]>('pos_registered_zones', []);
    if (Array.isArray(savedZones) && savedZones.length > 0) {
      return savedZones.map(z => ({
        ...z,
        tables: (z.tables || []).map((t: any, idx: number) => ({
          ...t,
          id: t.id || `t-${idx + 1}`,
          name: t.name || `Mesa ${t.number}`,
          number: t.number,
          capacity: t.capacity || 4,
          status: t.status || 'FREE',
          posX: t.posX ?? (40 + (idx % 3) * 160),
          posY: t.posY ?? (40 + Math.floor(idx / 3) * 160),
          zoneId: z.id
        }))
      }));
    }
  } catch {}
  return [];
};

export default function Home() {
  const router = useRouter();
  useGuardedRoute('pos');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    return !!localStorage.getItem('pos_token');
  });
  const [zones, setZones] = useState<Zone[]>(() => (typeof window !== 'undefined' ? getInitialZones() : []));
  const [loading, setLoading] = useState(() => (typeof window !== 'undefined' ? getInitialZones().length === 0 : false));
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'grid'>('grid');

  
  // Estado para verificar si la caja está abierta (inicializado desde caché inmediata)
  const [isShiftOpen, setIsShiftOpen] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const s = getScopedStorage<any>('mock_cash_shift', null);
    if (s) return true;
    const token = localStorage.getItem('pos_token');
    return token ? true : null;
  });
  const [restaurantName, setRestaurantName] = useState<string>('');

  const fetchZonas = async () => {
    const token = localStorage.getItem('pos_token');
    const currentRestId = getRestaurantId() || 'main';
    let loadedZones: Zone[] = [];

    try {
      const response = await fetch(getApiUrl('/floor/zones'), {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          loadedZones = data;
          setScopedStorage('pos_registered_zones', data);
        }
      }
    } catch (error) {
      console.warn("Plano de sala: cargando zonas locales:", error);
    }

    if (loadedZones.length === 0) {
      const savedZones = getScopedStorage<any[]>('pos_registered_zones', []);
      if (Array.isArray(savedZones) && savedZones.length > 0) {
        loadedZones = savedZones.map(z => ({
          ...z,
          tables: (z.tables || []).map((t: any, idx: number) => ({
            ...t,
            id: t.id || `t-${idx + 1}`,
            name: t.name || `Mesa ${t.number}`,
            number: t.number,
            capacity: t.capacity || 4,
            status: t.status || 'FREE',
            posX: t.posX ?? (40 + (idx % 3) * 160),
            posY: t.posY ?? (40 + Math.floor(idx / 3) * 160),
            zoneId: z.id
          }))
        }));
      } else {
        loadedZones = [
          {
            id: 'zone-1',
            name: 'SALA PRINCIPAL',
            tables: [
              { id: 't-1', name: 'Mesa 1', number: 1, capacity: 4, status: 'FREE', posX: 40, posY: 40, zoneId: 'zone-1' },
              { id: 't-2', name: 'Mesa 2', number: 2, capacity: 2, status: 'FREE', posX: 200, posY: 40, zoneId: 'zone-1' },
              { id: 't-3', name: 'Mesa 3', number: 3, capacity: 6, status: 'FREE', posX: 360, posY: 40, zoneId: 'zone-1' },
              { id: 't-4', name: 'Mesa 4', number: 4, capacity: 4, status: 'FREE', posX: 40, posY: 200, zoneId: 'zone-1' },
            ]
          },
          {
            id: 'zone-2',
            name: 'TERRAZA',
            tables: [
              { id: 't-t1', name: 'Mesa T1', number: 'T1' as any, capacity: 4, status: 'FREE', posX: 40, posY: 40, zoneId: 'zone-2' },
              { id: 't-t2', name: 'Mesa T2', number: 'T2' as any, capacity: 2, status: 'FREE', posX: 200, posY: 40, zoneId: 'zone-2' },
            ]
          }
        ];
      }
    }

    // Merge with active table orders (Tracked until waiter/cashier frees the table)
    try {
      const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      const now = Date.now();

      loadedZones = loadedZones.map(zone => ({
        ...zone,
        tables: zone.tables.map(table => {
          const orderInfo = activeTableOrders[table.id] || 
            Object.values(activeTableOrders).find((o: any) => 
              o && (o.status === 'OCCUPIED' || o.status === 'OPEN' || o.status === 'SERVED') && isTableMatchingOrder(table, o)
            );

          // Verificar si la orden local es reciente (menos de 12 horas)
          const orderAge = orderInfo?.createdAt ? (now - new Date(orderInfo.createdAt).getTime()) : 0;
          const isOrderRecent = orderAge < twelveHoursMs;

          const isOrderActive = isOrderRecent && orderInfo && (orderInfo.status === 'OCCUPIED' || (Array.isArray(orderInfo.items) && orderInfo.items.length > 0));
          const hasServerOrder = (table.orders && table.orders.length > 0) || table.status === 'OCCUPIED' || table.status === 'WAITING_FOOD';

          if (isOrderActive || hasServerOrder) {
            const serverOrder = table.orders && table.orders.length > 0 ? table.orders[0] : null;
            const activeData = isOrderActive ? orderInfo : serverOrder;
            return {
              ...table,
              status: 'OCCUPIED' as const,
              billRequested: !!(orderInfo?.billRequested || table.billRequested),
              orders: [{
                id: activeData?.orderId || activeData?.id || `ord-${table.id}`,
                createdAt: activeData?.createdAt || new Date().toISOString(),
                totalAmount: activeData?.total || activeData?.totalAmount || 0,
              }]
            };
          }
          return {
            ...table,
            status: 'FREE' as const,
            orders: []
          };
        })
      }));
    } catch {}

    setZones(loadedZones);
    setLoading(false);
  };

  useEffect(() => {
    const handleStorageChange = () => {
      fetchZonas();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setIsAuthenticated(true);
    
    // Carga de nombre de restaurante dinámico
    const cachedConfig = localStorage.getItem('pos_restaurant_config');
    if (cachedConfig) {
      try {
        const cfg = JSON.parse(cachedConfig);
        if (cfg.name) setRestaurantName(cfg.name);
      } catch {}
    }
    const userStr = localStorage.getItem('pos_user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.restaurantName) setRestaurantName(u.restaurantName);
      } catch {}
    }

    // 1. Verificar primero si hay un turno abierto en la nube / backend
    const checkServerShift = async () => {
      try {
        const token = localStorage.getItem('pos_token');
        if (!token) return;
        const res = await fetch(getApiUrl('/payments/shift/current'), {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-restaurant-id': getRestaurantId() || ''
          }
        });
        if (res.ok) {
          const shift = await res.json();
          if (shift && shift.status === 'OPEN') {
            setIsShiftOpen(true);
            setScopedStorage('mock_cash_shift', {
              openingCash: Number(shift.openingAmount || 0),
              expenses: shift.expenses || [],
              shiftId: shift.id
            });
            return;
          }
        }
      } catch {}
      
      // Fallback a localStorage local
      const shiftData = getScopedStorage<any>('mock_cash_shift', null);
      setIsShiftOpen(!!shiftData);
    };

    checkServerShift();

    // Detección automática de vista según dispositivo
    if (window.innerWidth >= 768) {
      setViewMode('map');
    }

    fetchZonas();
  }, [router]);

  // Auto-refresh tables every 8 seconds & Firebase real-time listeners (mesas y turno de caja)
  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token || isEditMode) return;
    
    const currentRestId = getRestaurantId() || 'main';
    const interval = setInterval(fetchZonas, 8000);

    // 1. Escucha en tiempo real de órdenes abiertas en Firebase (Sincronización Multidispositivo de Mesas Ocupadas)
    const unsubscribeOrders = subscribeToOrders(currentRestId, (allOrders) => {
      if (Array.isArray(allOrders)) {
        const openOrders = allOrders.filter(o => o.status === 'OPEN' || o.status === 'SERVED');
        const activeMap: Record<string, any> = {};
        
        openOrders.forEach(o => {
          const tId = o.tableId || (o.tableName ? o.tableName.toLowerCase().replace(/\s+/g, '') : null);
          const entry = {
            orderId: o.id,
            tableId: o.tableId,
            tableName: o.tableName || tId,
            createdAt: o.createdAt || new Date().toISOString(),
            total: o.totalAmount || 0,
            status: 'OCCUPIED',
            billRequested: !!o.billRequested,
            items: o.items || []
          };
          if (tId) activeMap[tId] = entry;
          if (o.tableId) activeMap[o.tableId] = entry;
        });

        // Combinar con órdenes activas locales existentes
        const currentActive = getScopedStorage<Record<string, any>>('pos_active_table_orders', {}) || {};
        
        // Si una orden en Firebase cambió de mesa, eliminar la mesa previa del caché local
        openOrders.forEach(o => {
          const tId = o.tableId;
          Object.entries(currentActive).forEach(([k, existingOrder]: [string, any]) => {
            if (existingOrder?.orderId === o.id && k !== tId && k !== o.tableName?.toLowerCase().replace(/\s+/g, '')) {
              delete currentActive[k];
            }
          });
        });

        const mergedActive = { ...currentActive, ...activeMap };
        setScopedStorage('pos_active_table_orders', mergedActive);

        setZones(prevZones => prevZones.map(zone => ({
          ...zone,
          tables: zone.tables.map(table => {
            const matchedOrder = openOrders.find(o => isTableMatchingOrder(table, o));

            const localOrder = mergedActive[table.id] ||
              Object.values(mergedActive).find((o: any) =>
                o && (o.status === 'OCCUPIED' || o.status === 'OPEN' || o.status === 'SERVED') && isTableMatchingOrder(table, o)
              );

            // Una mesa SOLO está ocupada si tiene una orden abierta activa real
            const hasActiveOrder = Boolean(matchedOrder || (localOrder && (localOrder.status === 'OCCUPIED' || localOrder.status === 'OPEN')));

            if (hasActiveOrder) {
              const activeSource = matchedOrder || localOrder;
              return {
                ...table,
                status: 'OCCUPIED' as const,
                billRequested: !!(matchedOrder?.billRequested || localOrder?.billRequested),
                orders: [{
                  id: activeSource?.id || activeSource?.orderId || `ord-${table.id}`,
                  createdAt: activeSource?.createdAt || new Date().toISOString(),
                  totalAmount: activeSource?.totalAmount || activeSource?.total || 0
                }]
              };
            }

            return {
              ...table,
              status: 'FREE' as const,
              billRequested: false,
              orders: []
            };
          })
        })));
      }
    });

    // 2. Escucha en tiempo real de plano de sala (Zonas y Mesas creadas)
    const unsubscribeZones = subscribeToZones(currentRestId, (cloudZones) => {
      if (Array.isArray(cloudZones) && cloudZones.length > 0) {
        setScopedStorage('pos_registered_zones', cloudZones);
        fetchZonas();
      }
    });

    // 3. Escucha en tiempo real de turno de caja desde Firebase
    const unsubscribeShift = subscribeToCashShift(currentRestId, (cloudShift) => {
      if (cloudShift) {
        setIsShiftOpen(cloudShift.isOpen);
        if (cloudShift.isOpen) {
          const current = getScopedStorage<any>('mock_cash_shift', {}) || {};
          setScopedStorage('mock_cash_shift', {
            ...current,
            openingCash: cloudShift.openingAmount || current.openingCash || 0,
            shiftId: cloudShift.shiftId || current.shiftId
          });
        } else {
          removeScopedStorage('mock_cash_shift');
        }
      }
    });

    return () => {
      clearInterval(interval);
      if (typeof unsubscribeOrders === 'function') unsubscribeOrders();
      if (typeof unsubscribeZones === 'function') unsubscribeZones();
      if (typeof unsubscribeShift === 'function') unsubscribeShift();
    };
  }, [router, isEditMode]);

  const handleStop = async (e: DraggableEvent, data: DraggableData, tableId: string) => {
    const newX = data.x;
    const newY = data.y;

    setZones(prevZones => prevZones.map(zone => ({
      ...zone,
      tables: zone.tables.map(table => 
        table.id === tableId 
          ? { ...table, posX: newX, posY: newY }
          : table
      )
    })));

    const token = localStorage.getItem('pos_token');
    try {
      await fetch(getApiUrl(`/floor/table/${tableId}`), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ posX: newX, posY: newY }),
      });
    } catch (error) {
      toast.error('Error guardando posición en BD.');
    }
  };

  const handleTableClick = (tableOrId: any, isDragging: boolean) => {
    if (!isEditMode && !isDragging) {
      if (typeof tableOrId === 'object' && tableOrId !== null) {
        const tId = tableOrId.id;
        const tName = tableOrId.name || `Mesa ${tableOrId.number}`;
        const tNum = tableOrId.number || '';
        router.push(`/pos/${tId}?name=${encodeURIComponent(tName)}&number=${encodeURIComponent(tNum)}`);
      } else {
        router.push(`/pos/${tableOrId}`);
      }
    }
  };

  // Mostrar pantalla de carga solo si no está autenticado o si las zonas aún no se han cargado
  if (isAuthenticated === false) return null;
  if (!isAuthenticated || (loading && zones.length === 0)) return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
    </div>
  );

  // NUEVO: PANTALLA DE BLOQUEO SI LA CAJA ESTÁ CERRADA
  if (!isShiftOpen) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-6 font-sans">
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100 animate-in zoom-in-95 duration-300">
          <div className="bg-rose-50 w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-rose-100">
            <LockKeyhole className="w-8 h-8 md:w-10 md:h-10 text-rose-500" />
          </div>
          
          <h1 className="text-xl md:text-2xl font-black text-slate-800 mb-2">Caja Cerrada</h1>
          <p className="text-slate-500 text-sm md:text-base font-medium mb-6 md:mb-8 leading-relaxed">
            Para poder tomar pedidos, visualizar las mesas del salón o registrar ventas, primero debes iniciar tu turno.
          </p>

          <button 
            // Te enviará a la página de caja que recién construimos
            onClick={() => router.push('/report')} 
            className="w-full py-3.5 md:py-4 font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl flex justify-center items-center gap-2 transition-all shadow-lg shadow-emerald-200 active:scale-95 text-sm md:text-base"
          >
            <Wallet className="w-5 h-5" />
            Ir a Abrir Caja
          </button>
        </div>
      </div>
    );
  }

  // ========================================================
  // RENDERIZADO ORIGINAL DE LA SALA (Si la caja está abierta)
  // ========================================================
  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-8 font-sans pb-24 md:pb-8">
      <header className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6 md:mb-8 bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Utensils className="text-emerald-600 w-6 h-6 sm:w-7 sm:h-7" /> 
            Plano de Sala
          </h1>
          <p className="text-slate-500 font-medium mt-0.5 text-xs sm:text-sm">
            {restaurantName ? `Xpos Cloud - ${restaurantName}` : 'Xpos Cloud'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {!isEditMode && (
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-auto">
              <button 
                onClick={() => setViewMode('grid')}
                className={`flex-1 sm:flex-none px-3.5 sm:px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-xs sm:text-sm ${viewMode === 'grid' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Grid2X2 className="w-4 h-4 sm:w-5 sm:h-5" /> Cuadrícula
              </button>
              <button 
                onClick={() => setViewMode('map')}
                className={`flex-1 sm:flex-none px-3.5 sm:px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-xs sm:text-sm ${viewMode === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <MapIcon className="w-4 h-4 sm:w-5 sm:h-5" /> Plano
              </button>
            </div>
          )}
          <button 
            onClick={() => { 
              setIsEditMode(!isEditMode); 
              if (!isEditMode) setViewMode('map'); // Forzar vista plano al editar
            }}
            className={`w-full sm:w-auto flex justify-center items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold transition-all active:scale-95 border-2 text-xs sm:text-sm md:text-base
              ${isEditMode 
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}
          >
            {isEditMode ? <Save className="w-4 h-4 sm:w-5 sm:h-5" /> : <Move className="w-4 h-4 sm:w-5 sm:h-5" />}
            {isEditMode ? 'Guardar Cambios' : 'Modificar'}
          </button>
        </div>
      </header>

      {isEditMode && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800 text-sm font-medium flex items-start md:items-center gap-3 shadow-sm">
          <div className="bg-blue-100 p-2 rounded-xl shrink-0 mt-1 md:mt-0">
            <Move className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <span className="font-bold block text-blue-900 mb-0.5">Modo Edición Activo</span>
            Arrastra espacialmente (Drag & Drop) las mesas para organizarlas como en tu restaurante físico. Su posición se guarda en tiempo real. 
          </div>
        </div>
      )}

      <div className="space-y-6">
        {zones.map(zone => (
          <section key={zone.id} className="bg-white p-3 md:p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4 md:mb-5">
              <div className="flex items-center gap-3 border-l-4 border-emerald-500 pl-3">
                <h2 className="text-base md:text-lg font-bold text-slate-800 uppercase tracking-widest">
                  {zone.name}
                </h2>
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">
                  {zone.tables.length}
                </span>
              </div>
            </div>
            
            {viewMode === 'map' || isEditMode ? (
              <div className="w-full overflow-auto rounded-2xl border-2 border-dashed border-slate-200 custom-scrollbar relative animate-in fade-in duration-300">
                <div className="relative min-w-[800px] md:min-w-full min-h-[600px] bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-slate-50/50">
                  
                  {zone.tables.length === 0 && (
                    <div className="absolute inset-0 flex flex-col gap-3 items-center justify-center text-slate-400 font-medium text-sm md:text-base text-center p-4">
                      <Square className="w-10 h-10 md:w-12 md:h-12 text-slate-200" />
                      No hay mesas en esta zona. Ve a Configuración para agregarlas.
                    </div>
                  )}

                  {zone.tables.map(table => (
                    <DraggableTable 
                      key={table.id}
                      table={table}
                      isEditMode={isEditMode}
                      handleStop={handleStop}
                      handleTableClick={handleTableClick}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 animate-in fade-in duration-300">
                {zone.tables.length === 0 && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 font-medium text-sm bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Square className="w-8 h-8 mb-2 opacity-30" />
                    No hay mesas en esta zona.
                  </div>
                )}
                {[...zone.tables].sort((a, b) => {
                  const nameA = a.name || String(a.number || '');
                  const nameB = b.name || String(b.number || '');
                  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
                }).map(table => (
                  <GridTable 
                    key={table.id}
                    table={table}
                    handleTableClick={handleTableClick}
                  />
                ))}
              </div>
            )}

          </section>
        ))}
      </div>
    </div>
  );
}