'use client';
import { getApiUrl } from '@/utils/api';


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
  orders?: TableOrder[];
}

interface Zone { 
  id: string; 
  name: string; 
  tables: Table[]; 
}

const formatWaitTime = (orderDate: Date, now: Date) => {
  const diffMs = now.getTime() - orderDate.getTime();
  if (diffMs < 0) return '0s'; // Por si hay desajuste de hora
  
  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  const seconds = diffSecs % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
};

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
  handleTableClick: (id: string, isDragging: boolean) => void;
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
            handleTableClick(table.id, isDragging);
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
          ${isFree ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`}>
        </span>

        {/* Wait Timer */}
        {!isFree && activeOrder && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shadow-md flex items-center gap-1 pointer-events-none z-10 transition-all">
            <Clock className="w-3 h-3" />
            {formatWaitTime(new Date(activeOrder.createdAt), now)}
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
  handleTableClick: (id: string, isDragging: boolean) => void;
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
      onClick={() => handleTableClick(table.id, false)}
      className={`relative p-4 rounded-3xl border-2 flex flex-col items-center justify-center text-center transition-all active:scale-95 min-h-[130px] w-full
        ${isFree 
          ? 'bg-white border-emerald-100 hover:border-emerald-300 shadow-sm hover:shadow-emerald-100' 
          : 'bg-rose-50 border-rose-200 hover:border-rose-300 shadow-sm hover:shadow-rose-100'}`}
    >
      <Square className={`w-8 h-8 mb-2 opacity-50 ${isFree ? 'text-emerald-600' : 'text-rose-600'}`} />
      <span className={`text-base font-black mb-1.5 truncate w-full ${isFree ? 'text-slate-700' : 'text-rose-800'}`}>
        {table.name || table.number || '-'}
      </span>
      <div className={`mt-auto flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg
        ${isFree ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-200/50 text-rose-800'}`}>
        <Users className="w-3.5 h-3.5" />
        {table.capacity}
      </div>

      <span className={`absolute top-4 right-4 w-3 h-3 rounded-full shadow-sm
        ${isFree ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`}>
      </span>

      {!isFree && activeOrder && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[11px] font-black px-3 py-1 rounded-full whitespace-nowrap shadow-md flex items-center gap-1.5 z-10 border-2 border-white">
          <Clock className="w-3.5 h-3.5" />
          {formatWaitTime(new Date(activeOrder.createdAt), now)}
        </div>
      )}
    </button>
  );
};

export default function Home() {
  const router = useRouter();
  useGuardedRoute('pos');
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'grid'>('grid');

  
  // NUEVO: Estado para verificar si la caja está abierta
  const [isShiftOpen, setIsShiftOpen] = useState<boolean | null>(null);

  const fetchZonas = async () => {
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl('/floor/zones'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setZones(data);
      } else if (response.status === 401) {
        localStorage.removeItem('pos_token');
        router.push('/login');
      }
    } catch (error) {
      console.error("Error reconectando al backend:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token) {
      router.push('/login');
      return;
    }
    
    // NUEVO: Verificamos si existe el turno guardado en LocalStorage
    const shiftData = localStorage.getItem('mock_cash_shift');
    setIsShiftOpen(!!shiftData);

    // Detección automática de vista según dispositivo
    if (window.innerWidth >= 768) {
      setViewMode('map');
    }

    fetchZonas();
  }, [router]);

  // Auto-refresh tables every 10 seconds to catch new orders from other devices
  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token || isEditMode) return;
    
    const interval = setInterval(fetchZonas, 10000);
    return () => clearInterval(interval);
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

  const handleTableClick = (tableId: string, isDragging: boolean) => {
    if (!isEditMode && !isDragging) {
      router.push(`/pos/${tableId}`);
    }
  };

  // NUEVO: Mostrar el estado de carga solo si ambos (datos de caja y zonas) están cargando
  if (loading || isShiftOpen === null) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
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
      <header className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6 md:mb-8 bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Utensils className="text-emerald-600 w-6 h-6 md:w-7 md:h-7" /> 
            Plano de Sala
          </h1>
          <p className="text-slate-500 font-medium mt-0.5 text-xs md:text-sm">Xpos Cloud - Huanchaco Vista al Mar</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
          {!isEditMode && (
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto">
              <button 
                onClick={() => setViewMode('grid')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-sm ${viewMode === 'grid' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Grid2X2 className="w-5 h-5" /> Cuadrícula
              </button>
              <button 
                onClick={() => setViewMode('map')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-sm ${viewMode === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <MapIcon className="w-5 h-5" /> Plano
              </button>
            </div>
          )}
          <button 
            onClick={() => { 
              setIsEditMode(!isEditMode); 
              if (!isEditMode) setViewMode('map'); // Forzar vista plano al editar
            }}
            className={`w-full md:w-auto flex justify-center items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all active:scale-95 border-2 text-sm md:text-base
              ${isEditMode 
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}
          >
            {isEditMode ? <Save className="w-5 h-5" /> : <Move className="w-5 h-5" />}
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