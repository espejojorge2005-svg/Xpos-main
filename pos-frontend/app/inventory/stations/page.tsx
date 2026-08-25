'use client';
import { getApiUrl } from '@/utils/api';


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, Plus, Search, Edit, Trash2, X, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';

interface KitchenStation {
  id: string;
  name: string;
  colorHex: string;
  printerName?: string;
}

const PRESET_COLORS = [
  { name: 'Rojo Pastel (Parrilla)', hex: '#fecdd3' },
  { name: 'Naranja Pastel (Frituras)', hex: '#fed7aa' },
  { name: 'Ámbar Pastel (Cocina)', hex: '#fde68a' },
  { name: 'Verde Pastel (Ensaladas)', hex: '#d1fae5' },
  { name: 'Cian Pastel (Bar)', hex: '#cffafe' },
  { name: 'Azul Pastel (Especial)', hex: '#bfdbfe' },
  { name: 'Púrpura Pastel (Postres)', hex: '#e9d5ff' },
  { name: 'Gris Claro (General)', hex: '#f1f5f9' },
];

export default function KitchenStationsPage() {
  const router = useRouter();
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<KitchenStation>({
    id: '', name: '', colorHex: '#f1f5f9', printerName: ''
  });

  // Impresoras del agente local
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);

  const fetchStations = async () => {
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl('/kitchen-stations'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setStations(await response.json());
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      toast.error('Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [router]);

  const fetchPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const res = await fetch('http://localhost:4001/printers', { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        setAvailablePrinters(data.printers || []);
        setAgentOnline(true);
      } else {
        setAgentOnline(false);
      }
    } catch {
      setAgentOnline(false);
      setAvailablePrinters([]);
    }
    setLoadingPrinters(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const token = localStorage.getItem('pos_token');
    
    const isEditing = formData.id !== '';
    const url = isEditing
      ? getApiUrl(`/kitchen-stations/${formData.id}`) : getApiUrl(`/kitchen-stations`);
    
    const method = isEditing ? 'PATCH' : 'POST';
    
    // Solo extraemos los campos que el backend espera y permite
    const bodyData = {
      name: formData.name,
      colorHex: formData.colorHex,
      printerName: formData.printerName || null,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(bodyData),
      });

      if (response.ok) {
        toast.success(isEditing ? 'Estación actualizada' : 'Estación creada con éxito');
        fetchStations();
        closeModal();
      } else {
        toast.error('Hubo un problema al guardar la estación');
      }
    } catch (error) {
      toast.error('Error de red al intentar guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta Área de Preparación?')) return;
    
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl(`/kitchen-stations/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Estación eliminada');
        setStations(stations.filter(s => s.id !== id));
      } else {
        toast.error('No se pudo eliminar la estación');
      }
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    }
  };

  const openModal = (station?: KitchenStation) => {
    if (station) {
      setFormData(station);
    } else {
      setFormData({ id: '', name: '', colorHex: '#f1f5f9', printerName: '' });
    }
    setIsModalOpen(true);
    fetchPrinters(); // Obtener impresoras al abrir el modal
  };

  const closeModal = () => setIsModalOpen(false);

  const filteredStations = stations.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans relative">
      <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ChefHat className="text-orange-500 w-8 h-8" /> 
            Áreas de Preparación
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-sm tracking-widest">
            Gestión de Estaciones para KDS (Cocina, Bar, Parrilla...)
          </p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-200"
        >
          <Plus className="w-5 h-5" />
          Nueva Estación
        </button>
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex gap-4 items-center bg-slate-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all text-slate-900"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-400 font-bold">
                <th className="p-5">Área de Preparación</th>
                <th className="p-5">Color Identificador</th>
                <th className="p-5">Impresora Asignada</th>
                <th className="p-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredStations.map((station) => {
                const preset = PRESET_COLORS.find(c => c.hex === station.colorHex);
                return (
                  <tr key={station.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-5 font-bold text-slate-800">
                      {station.name}
                    </td>
                    <td className="p-5 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: station.colorHex }}></div>
                        <span className="text-slate-600">{preset ? preset.name : station.colorHex}</span>
                      </div>
                    </td>
                    <td className="p-5">
                      {station.printerName ? (
                        <div className="flex items-center gap-2">
                          <Printer className="w-4 h-4 text-slate-400" />
                          <span className="font-mono text-sm text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">{station.printerName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="p-5 text-center">
                      <div className="flex justify-center gap-2">
                          <button onClick={() => openModal(station)} className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(station.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredStations.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-slate-400">No hay áreas de preparación creadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">
                {formData.id ? 'Editar Área' : 'Nueva Área de Preparación'}
              </h2>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1 block">Nombre (Ej: Parrilla, Bar)</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none uppercase font-bold text-slate-700" placeholder="Ej. BARRA" />
              </div>
              
              <div>
                <label className="text-sm font-bold text-slate-700 mb-2 block">Color para el Monitor (KDS)</label>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => setFormData({...formData, colorHex: color.hex})}
                      className={`w-full aspect-square rounded-xl transition-all border-4 shadow-sm flex items-center justify-center ${formData.colorHex === color.hex ? 'border-orange-500 scale-105' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    >
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 mb-1 block flex items-center gap-2">
                  <Printer className="w-4 h-4 text-slate-400" /> Impresora Asignada
                </label>

                {agentOnline === false ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                    <p className="font-bold mb-1">⚠️ Agente de impresión no detectado</p>
                    <p className="text-xs">Inicia el <code className="bg-amber-100 px-1 rounded">pos-print-agent</code> para detectar impresoras automáticamente.</p>
                    <input
                      type="text"
                      value={formData.printerName || ''}
                      onChange={e => setFormData({...formData, printerName: e.target.value})}
                      className="w-full mt-2 px-3 py-2 bg-white border border-amber-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono text-slate-700 text-sm"
                      placeholder="Escribe el nombre manualmente..."
                    />
                  </div>
                ) : (
                  <div className="relative">
                    {loadingPrinters ? (
                      <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Buscando impresoras...
                      </div>
                    ) : (
                      <select
                        value={formData.printerName || ''}
                        onChange={e => setFormData({...formData, printerName: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-mono text-slate-700 appearance-none cursor-pointer"
                      >
                        <option value="">— Sin impresora asignada —</option>
                        {availablePrinters.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )}
                    {!loadingPrinters && (
                      <button
                        type="button"
                        onClick={fetchPrinters}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-orange-50"
                        title="Refrescar lista de impresoras"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {agentOnline && availablePrinters.length === 0 && !loadingPrinters && (
                  <p className="text-xs text-slate-400 mt-1.5">No se encontraron impresoras instaladas en este equipo.</p>
                )}
              </div>

              <div className="pt-4">
                <button type="submit" disabled={isSaving} className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-200 transition-all flex justify-center items-center gap-2">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Área'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
