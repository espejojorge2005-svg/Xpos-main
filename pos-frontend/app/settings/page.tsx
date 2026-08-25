'use client';
import { getApiUrl } from '@/utils/api';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Plus, Map, Users, Square, X, Loader2, Trash2, Edit, Store, Phone, MapPin, FileText, ImagePlus, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: string;
}

interface Zone {
  id: string;
  name: string;
  tables: Table[];
}

interface RestaurantConfig {
  id: string;
  name: string;
  slogan?: string;
  address?: string;
  phone?: string;
  ruc?: string;
  logoUrl?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  useGuardedRoute('configuracion');
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Restaurant config state
  const [config, setConfig] = useState<RestaurantConfig>({ id: 'default', name: '' });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configOpen, setConfigOpen] = useState(true);

  // Modals state
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Forms state
  const [zoneForm, setZoneForm] = useState({ id: '', name: '' });
  const [tableForm, setTableForm] = useState({ id: '', zoneId: '', number: '', capacity: 4 });

  const fetchConfig = async () => {
    const token = localStorage.getItem('pos_token');
    try {
const res = await fetch(getApiUrl('/restaurant-config'), {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });
      if (res.ok) setConfig(await res.json());
    } catch { /* silently ignore */ }
  };

  const fetchZones = async () => {
    const token = localStorage.getItem('pos_token');
    try {
const response = await fetch(getApiUrl('/floor/zones'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setZones(data);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      toast.error('Error al cargar la configuración de salas');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    const token = localStorage.getItem('pos_token');
    try {
const res = await fetch(getApiUrl('/restaurant-config'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: config.name,
          slogan: config.slogan,
          address: config.address,
          phone: config.phone,
          ruc: config.ruc,
          logoUrl: config.logoUrl,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        // Persist in localStorage so Sidebar reads it immediately
        localStorage.setItem('pos_restaurant_config', JSON.stringify(updated));
        toast.success('Configuración guardada');
        // Dispatch storage event so Sidebar picks it up in the same tab
        window.dispatchEvent(new Event('storage'));
      } else {
        toast.error('Error al guardar la configuración');
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast.error('El logo no debe superar 500 KB'); return; }
    const reader = new FileReader();
    reader.onload = () => setConfig(prev => ({ ...prev, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    fetchConfig();
    fetchZones();
  }, [router]);


  // --- ZONES ---

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const token = localStorage.getItem('pos_token');
    const isEditing = zoneForm.id !== '';
    const url = isEditing 
? getApiUrl(`/floor/zone/${zoneForm.id}`)
      : getApiUrl('/floor/zone');
    const method = isEditing ? 'PATCH' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name: zoneForm.name }),
      });

      if (response.ok) {
        toast.success(isEditing ? 'Zona actualizada' : 'Zona creada');
        setZoneForm({ id: '', name: '' });
        fetchZones();
        setIsZoneModalOpen(false);
      } else {
        toast.error('Hubo un problema al guardar la zona');
      }
    } catch (error) {
      toast.error('Error de red al intentar guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteZone = async (id: string, tableCount: number) => {
    if (tableCount > 0) {
      if (!window.confirm(`Esta zona tiene ${tableCount} mesas. Si la eliminas, también se eliminarán sus mesas. ¿Continuar de todas formas?`)) return;
    } else {
      if (!window.confirm('¿Estás seguro de eliminar esta zona?')) return;
    }

    const token = localStorage.getItem('pos_token');
    try {
const response = await fetch(getApiUrl(`/floor/zone/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Zona eliminada');
        fetchZones();
      } else {
        toast.error('No se pudo eliminar la zona');
      }
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    }
  };

  const openZoneModal = (zone?: Zone) => {
    if (zone) {
      setZoneForm({ id: zone.id, name: zone.name });
    } else {
      setZoneForm({ id: '', name: '' });
    }
    setIsZoneModalOpen(true);
  };

  // --- TABLES ---

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const token = localStorage.getItem('pos_token');
    const isEditing = tableForm.id !== '';
    const url = isEditing 
? getApiUrl(`/floor/table/${tableForm.id}`)
      : getApiUrl('/floor/table');
    const method = isEditing ? 'PATCH' : 'POST';
    
    // Alfanumérico, así que se envía como String
    const payload: any = {
      number: String(tableForm.number).trim(),
      capacity: Number(tableForm.capacity),
    };
    if (!isEditing) {
      payload.zoneId = tableForm.zoneId;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(isEditing ? 'Mesa actualizada' : 'Mesa agregada');
        fetchZones();
        setIsTableModalOpen(false);
      } else {
        toast.error('Hubo un problema al guardar la mesa');
      }
    } catch (error) {
      toast.error('Error de red al intentar guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTable = async (id: string, number: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la Mesa ${number}?`)) return;

    const token = localStorage.getItem('pos_token');
    try {
const response = await fetch(getApiUrl(`/floor/table/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Mesa eliminada');
        fetchZones();
      } else {
        toast.error('No se pudo eliminar la mesa');
      }
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    }
  };

  const openTableModal = (zoneId: string, table?: Table) => {
    if (table) {
      setTableForm({ id: table.id, zoneId, number: String(table.number), capacity: table.capacity });
    } else {
      setTableForm({ id: '', zoneId, number: '', capacity: 4 });
    }
    setIsTableModalOpen(true);
  };

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans relative">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Settings className="text-slate-600 w-8 h-8" /> 
            Configuración
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-sm tracking-widest">
            Gestión del Plano de Sala (Zonas y Mesas)
          </p>
        </div>
        <button 
          onClick={() => openZoneModal()}
          className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-slate-200"
        >
          <Plus className="w-5 h-5" />
          Nueva Zona
        </button>
      </header>

      {/* ===== DATOS DEL RESTAURANTE ===== */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 mb-8 overflow-hidden">
        {/* Card header (collapsible) */}
        <button
          type="button"
          onClick={() => setConfigOpen(o => !o)}
          className="w-full flex items-center justify-between p-6 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Store className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-left">
              <h2 className="text-lg font-black text-slate-800">Datos del Restaurante</h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Nombre, logo y datos del negocio</p>
            </div>
          </div>
          {configOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>

        {configOpen && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Logo column */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-36 h-36 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {config.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-indigo-500">
                      <ImagePlus className="w-8 h-8" />
                      <span className="text-xs font-bold">Subir logo</span>
                    </div>
                  )}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                <p className="text-xs text-slate-400 text-center">PNG, JPG o SVG. Máx. 500 KB</p>
                {config.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setConfig(p => ({ ...p, logoUrl: undefined }))}
                    className="text-xs text-rose-500 hover:text-rose-700 font-bold"
                  >
                    Quitar logo
                  </button>
                )}
              </div>

              {/* Fields column */}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">
                    Nombre del Restaurante *
                  </label>
                  <div className="relative">
                    <Store className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={config.name}
                      onChange={e => setConfig(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ej. La Buena Mesa"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-bold"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Slogan</label>
                  <input
                    type="text"
                    value={config.slogan ?? ''}
                    onChange={e => setConfig(p => ({ ...p, slogan: e.target.value }))}
                    placeholder='Ej. "El sabor de siempre"'
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Teléfono
                  </label>
                  <input
                    type="text"
                    value={config.phone ?? ''}
                    onChange={e => setConfig(p => ({ ...p, phone: e.target.value }))}
                    placeholder="Ej. +51 999 123 456"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                    <FileText className="w-3 h-3" /> RUC
                  </label>
                  <input
                    type="text"
                    value={config.ruc ?? ''}
                    onChange={e => setConfig(p => ({ ...p, ruc: e.target.value }))}
                    placeholder="Ej. 20123456789"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Dirección
                  </label>
                  <input
                    type="text"
                    value={config.address ?? ''}
                    onChange={e => setConfig(p => ({ ...p, address: e.target.value }))}
                    placeholder="Ej. Av. Principal 123, Huanchaco"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig || !config.name.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-100"
              >
                {isSavingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Configuración
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== ZONAS Y MESAS ===== */}
      {zones.length === 0 ? (
        <div className="text-center bg-white rounded-3xl shadow-sm border border-slate-100 p-16">
          <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay zonas configuradas</h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Comienza creando la primera zona de tu restaurante (ej. "Terraza", "Salón Principal") para poder agregarle mesas posteriormente.
          </p>
          <button 
            onClick={() => openZoneModal()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold transition-all"
          >
            <Plus className="w-5 h-5" />
            Crear mi primera Zona
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {zones.map(zone => (
            <div key={zone.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3 border-l-4 border-slate-500 pl-4">
                    {zone.name}
                    <span className="text-xs font-bold px-3 py-1 bg-slate-200 text-slate-600 rounded-lg ml-2">
                      {zone.tables.length} mesas
                    </span>
                  </h2>
                  <div className="flex border border-slate-200 rounded-lg overflow-hidden ml-4">
                    <button onClick={() => openZoneModal(zone)} className="p-2 text-slate-500 hover:bg-slate-200 transition-colors" title="Editar Zona">
                      <Edit className="w-4 h-4" />
                    </button>
                    <div className="w-px bg-slate-200"></div>
                    <button onClick={() => handleDeleteZone(zone.id, zone.tables.length)} className="p-2 text-rose-500 hover:bg-rose-50 transition-colors" title="Eliminar Zona">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => openTableModal(zone.id)}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-slate-200 hover:border-slate-800 hover:bg-slate-800 hover:text-white text-slate-700 rounded-xl font-bold transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Mesa
                </button>
              </div>

              <div className="p-6">
                {zone.tables.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">Esta zona aún no tiene mesas asignadas. Haz clic en "Agregar Mesa" para empezar.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {/* Quitamos el sort matemático asumiendo que es string, o hacemos un sort alfanumérico si se desea luego */}
                    {[...zone.tables].sort((a,b) => String(a.number).localeCompare(String(b.number))).map(table => (
                      <div key={table.id} className="relative p-5 rounded-2xl border-2 border-slate-100 flex flex-col items-center justify-center min-h-[120px] hover:border-slate-300 transition-colors group">
                        
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openTableModal(zone.id, table)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteTable(table.id, String(table.number))} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <Square className="w-8 h-8 text-slate-300 mb-2 mt-2" />
                        <span className="text-lg font-black text-slate-800 mb-1">
                          Mesa {table.number}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-widest">
                          <Users className="w-3 h-3" />
                          {table.capacity} p.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL ZONA */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">
                {zoneForm.id ? 'Editar Zona' : 'Nueva Zona'}
              </h2>
              <button onClick={() => setIsZoneModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveZone} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1 block">Nombre de la Zona</label>
                <input required type="text" value={zoneForm.name} onChange={e => setZoneForm({...zoneForm, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" placeholder="Ej. Jardín, Segundo Piso..." />
              </div>
              <div className="pt-4">
                <button type="submit" disabled={isSaving} className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Zona'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MESA */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">
                {tableForm.id ? 'Editar Mesa' : 'Agregar Mesa'}
              </h2>
              <button onClick={() => setIsTableModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTable} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-1 block">Identificador</label>
                  <input required type="text" value={tableForm.number} onChange={e => setTableForm({...tableForm, number: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none uppercase" placeholder="Ej. A1, T2" />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-1 block">Capacidad (Sillas)</label>
                  <input required type="number" min="1" value={tableForm.capacity} onChange={e => setTableForm({...tableForm, capacity: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">Puedes usar números y letras para nombrar a tus mesas.</p>
              <div className="pt-4">
                <button type="submit" disabled={isSaving} className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Mesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
