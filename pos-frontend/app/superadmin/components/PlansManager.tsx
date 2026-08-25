'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Crown, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { getApiUrl } from '../../../utils/api';

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  price: number | string;
  maxUsers: number;
  features: string[];
  isActive: boolean;
}

export function PlansManager() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('0');
  const [maxUsers, setMaxUsers] = useState('3');
  const [featuresInput, setFeaturesInput] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl('/saas/plans'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setPlans(await res.json());
      }
    } catch {
      toast.error('Error cargando planes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setPrice('0');
    setMaxUsers('3');
    setFeaturesInput('');
    setIsActive(true);
    setIsOpen(true);
  };

  const openEdit = (p: SubscriptionPlan) => {
    setEditingId(p.id);
    setName(p.name);
    setCode(p.code);
    setPrice(p.price.toString());
    setMaxUsers(p.maxUsers.toString());
    setFeaturesInput(p.features.join(', '));
    setIsActive(p.isActive);
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('pos_token');
      const payload = {
        name,
        code: code.toUpperCase().trim(),
        price: parseFloat(price),
        maxUsers: parseInt(maxUsers, 10),
        features: featuresInput.split(',').map(f => f.trim()).filter(f => f),
        isActive
      };

      const url = editingId ? getApiUrl(`/saas/plans/${editingId}`) : getApiUrl('/saas/plans');
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al guardar');

      toast.success(editingId ? 'Plan actualizado' : 'Plan creado');
      setIsOpen(false);
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (id: string, current: boolean) => {
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl(`/saas/plans/${id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !current })
      });
      if (res.ok) {
        toast.success(!current ? 'Plan Activado' : 'Plan Suspendido');
        fetchPlans();
      }
    } catch {
      toast.error('Error cambiando el estado');
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
         <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Planes de Suscripción</h2>
            <p className="text-slate-500 font-medium text-sm">Gestiona los modelos de negocio y límites</p>
         </div>
         <button 
           onClick={openNew}
           className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-slate-200 transition-all flex items-center gap-2"
         >
            <Plus className="w-4 h-4" /> Crear Plan
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
            <p className="text-slate-500 font-bold p-8 text-center col-span-full">Cargando...</p>
        ) : plans.map(p => (
           <div key={p.id} className="bg-white border flex flex-col relative overflow-hidden border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group">
             <div className={`absolute top-0 left-0 w-full h-1 ${p.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
             
             <div className="flex items-start justify-between mb-4 mt-2">
                <div className={`p-3 rounded-2xl ${p.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                   <Crown className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors" title="Editar config">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => toggleStatus(p.id, p.isActive)}
                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full transition-colors border ${
                      p.isActive ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-rose-50 hover:text-rose-600'
                      : 'border-slate-200 text-slate-500 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-600'
                    }`}
                  >
                    {p.isActive ? 'Activo' : 'No Activo'}
                  </button>
                </div>
             </div>

             <h3 className="text-xl font-black text-slate-800 tracking-tight">{p.name}</h3>
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Código: {p.code}</p>

             <div className="mb-4">
                <span className="text-3xl font-black text-slate-900">S/ {p.price}</span> 
                <span className="text-slate-500 text-sm font-semibold"> /mes</span>
             </div>

             <div className="p-3 bg-slate-50 rounded-xl mb-4 text-center">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Límite Múltiples Usuarios</p>
                <p className="text-base font-black text-slate-700">{p.maxUsers === 9999 ? 'ILIMITADOS' : `MAX ${p.maxUsers} USRS`}</p>
             </div>

             <div className="mt-auto space-y-2 pt-2 border-t border-slate-100">
                {p.features.slice(0, 3).map((f, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-slate-600 font-medium">
                     <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                     <span>{f}</span>
                  </div>
                ))}
                {p.features.length > 3 && (
                   <p className="text-xs font-bold text-slate-400 ml-6">+{p.features.length - 3} beneficios más...</p>
                )}
             </div>
           </div>
        ))}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
               <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingId ? 'Editar Plan' : 'Crear Plan'}</h2>
               <button onClick={() => setIsOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                  <X className="w-5 h-5" />
               </button>
             </div>
             
             <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Nombre Comercial</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Código (Ej. BASIC)</label>
                    <input type="text" required value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold uppercase" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Precio (S/)</label>
                    <input type="number" step="0.01" required value={price} onChange={e => setPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Límite Usuarios</label>
                    <input type="number" required value={maxUsers} onChange={e => setMaxUsers(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-medium" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1">Beneficios a Mostrar (Separados por Coma)</label>
                  <textarea rows={3} value={featuresInput} onChange={e => setFeaturesInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-medium resize-none"
                    placeholder="Facturación, Inventario, Reportes..." />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setIsOpen(false)} className="px-6 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
                  <button type="submit" disabled={isSubmitting} className="px-8 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
                    {isSubmitting ? 'Guardando...' : <><Check className="w-4 h-4" /> Guardar Plan</>}
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
