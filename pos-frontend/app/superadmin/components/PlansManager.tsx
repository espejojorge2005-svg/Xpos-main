'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Crown, Check, X, Users, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getApiUrl } from '../../../utils/api';

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  price: number;
  maxUsers: number;
  features: string[];
  isActive: boolean;
}

export const DEFAULT_PLANS: SubscriptionPlan[] = [
  { 
    id: 'p-basic', 
    name: 'Plan Básico', 
    code: 'BASIC', 
    price: 29, 
    maxUsers: 3, 
    features: ['POS Móvil y Tablet', 'Monitor de Cocina (KDS)', 'Hasta 3 usuarios concurrentes', 'Gestión de Mesas'], 
    isActive: true 
  },
  { 
    id: 'p-pro', 
    name: 'Plan Profesional', 
    code: 'PRO', 
    price: 59, 
    maxUsers: 10, 
    features: ['POS + Monitor de Cocina', 'Control de Inventario y Kardex', 'Cierre de Caja y Arqueo', 'Hasta 10 usuarios concurrentes', 'Reportes de Ventas'], 
    isActive: true 
  },
  { 
    id: 'p-premium', 
    name: 'Plan Premium', 
    code: 'PREMIUM', 
    price: 99, 
    maxUsers: 99, 
    features: ['Acceso total a todos los módulos', 'Usuarios ilimitados (hasta 99)', 'Inventario, Kardex, Analíticas', 'Múltiples áreas de preparación', 'Soporte prioritario 24/7'], 
    isActive: true 
  },
];

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
    // 1. Cargar caché local primero (garantiza cero errores y respuesta inmediata)
    let currentPlans: SubscriptionPlan[] = [];
    try {
      const cachedStr = localStorage.getItem('pos_saas_plans_cache');
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          currentPlans = parsed;
        }
      }
    } catch {}

    if (currentPlans.length === 0) {
      currentPlans = [...DEFAULT_PLANS];
      try {
        localStorage.setItem('pos_saas_plans_cache', JSON.stringify(currentPlans));
      } catch {}
    }

    setPlans(currentPlans);

    // 2. Intentar actualizar desde el servidor silenciosamente si está online
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) return;
      const res = await fetch(getApiUrl('/saas/plans'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const remotePlans = await res.json();
        if (Array.isArray(remotePlans) && remotePlans.length > 0) {
          setPlans(remotePlans);
          localStorage.setItem('pos_saas_plans_cache', JSON.stringify(remotePlans));
        }
      }
    } catch {
      // En modo local el backend puede estar apagado; la información local ya está disponible
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
    setPrice('29');
    setMaxUsers('3');
    setFeaturesInput('POS Móvil, Monitor Cocina, Hasta 3 usuarios');
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

    const parsedPrice = parseFloat(price) || 0;
    const parsedUsers = Math.max(1, parseInt(maxUsers, 10) || 3);
    const parsedFeatures = featuresInput.split(',').map(f => f.trim()).filter(Boolean);

    const planToSave: SubscriptionPlan = {
      id: editingId || `plan-${Date.now()}`,
      name: name.trim(),
      code: code.toUpperCase().trim(),
      price: parsedPrice,
      maxUsers: parsedUsers,
      features: parsedFeatures,
      isActive
    };

    // 1. Guardar localmente de inmediato en pos_saas_plans_cache
    let updatedPlans: SubscriptionPlan[] = [...plans];
    if (editingId) {
      updatedPlans = updatedPlans.map(p => p.id === editingId ? planToSave : p);
    } else {
      updatedPlans.push(planToSave);
    }

    try {
      localStorage.setItem('pos_saas_plans_cache', JSON.stringify(updatedPlans));
      setPlans(updatedPlans);
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.warn('Error guardando planes localmente:', err);
    }

    // 2. Sincronizar con el backend si está disponible
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) return;
      const payload = {
        name: planToSave.name,
        code: planToSave.code,
        price: planToSave.price,
        maxUsers: planToSave.maxUsers,
        features: planToSave.features,
        isActive: planToSave.isActive
      };

      const url = editingId ? getApiUrl(`/saas/plans/${editingId}`) : getApiUrl('/saas/plans');
      const method = editingId ? 'PATCH' : 'POST';

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
    } catch {
      // Backend offline en desarrollo local, ya persistido con éxito en caché local
    }

    toast.success(editingId ? `Plan "${planToSave.name}" actualizado (Máx. ${planToSave.maxUsers} usuarios)` : `¡Plan "${planToSave.name}" creado con éxito!`);
    setIsOpen(false);
    setIsSubmitting(false);
  };

  const toggleStatus = async (id: string, current: boolean) => {
    // 1. Actualizar localmente de inmediato
    const updated = plans.map(p => p.id === id ? { ...p, isActive: !current } : p);
    setPlans(updated);
    try {
      localStorage.setItem('pos_saas_plans_cache', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } catch {}

    toast.success(!current ? 'Plan Activado' : 'Plan Suspendido');

    // 2. Sincronizar con backend si está disponible
    try {
      const token = localStorage.getItem('pos_token');
      if (!token) return;
      await fetch(getApiUrl(`/saas/plans/${id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !current })
      });
    } catch {}
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Planes de Suscripción</h2>
            <p className="text-slate-500 font-medium text-sm">Gestiona los modelos de negocio, tarifas y límites estrictos de usuarios</p>
         </div>
         <button 
           onClick={openNew}
           className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-5 rounded-2xl shadow-lg shadow-slate-200 transition-all flex items-center gap-2 self-start sm:self-auto"
         >
            <Plus className="w-4 h-4" /> Crear Nuevo Plan
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
            <p className="text-slate-500 font-bold p-8 text-center col-span-full">Cargando planes...</p>
        ) : plans.map(p => (
           <div key={p.id} className="bg-white border flex flex-col relative overflow-hidden border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group">
             <div className={`absolute top-0 left-0 w-full h-1.5 ${p.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
             
             <div className="flex items-start justify-between mb-4 mt-2">
                <div className={`p-3 rounded-2xl ${p.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                   <Crown className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(p)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors" title="Editar plan">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => toggleStatus(p.id, p.isActive)}
                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full transition-colors border ${
                      p.isActive ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-rose-50 hover:text-rose-600'
                      : 'border-slate-200 text-slate-500 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-600'
                    }`}
                  >
                    {p.isActive ? 'Activo' : 'Suspendido'}
                  </button>
                </div>
             </div>

             <h3 className="text-xl font-black text-slate-800 tracking-tight">{p.name}</h3>
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Código: {p.code}</p>

             <div className="mb-4">
                <span className="text-3xl font-black text-slate-900">S/ {p.price}</span> 
                <span className="text-slate-500 text-sm font-semibold"> /mes</span>
             </div>

             {/* Badge destacado con límite estricto de usuarios */}
             <div className="p-3.5 bg-slate-50 rounded-2xl mb-4 text-center border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <Users className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold uppercase tracking-wider">Límite Usuarios:</span>
                </div>
                <span className="text-sm font-black px-2.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-700">
                  {p.maxUsers >= 99 ? 'ILIMITADOS' : `MÁX. ${p.maxUsers} USRS`}
                </span>
             </div>

             <div className="mt-auto space-y-2 pt-3 border-t border-slate-100">
                {p.features.map((f, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 font-semibold">
                     <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                     <span>{f}</span>
                  </div>
                ))}
             </div>
           </div>
        ))}
      </div>

      {/* Modal Crear / Editar Plan */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
               <div>
                 <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingId ? 'Editar Plan SaaS' : 'Crear Plan SaaS'}</h2>
                 <p className="text-xs text-slate-500 font-medium">Configura precios y límites máximos de personal</p>
               </div>
               <button onClick={() => setIsOpen(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all shadow-sm">
                  <X className="w-5 h-5" />
               </button>
             </div>
             
             <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Nombre Comercial *</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)}
                      placeholder="Ej. Plan Básico"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Código (Único) *</label>
                    <input type="text" required value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                      placeholder="BASIC"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-black uppercase" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1">Precio Mensual (S/) *</label>
                    <input type="number" step="0.01" min="0" required value={price} onChange={e => setPrice(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-indigo-700 ml-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Límite Máximo Usuarios *
                    </label>
                    <input type="number" min="1" max="999" required value={maxUsers} onChange={e => setMaxUsers(e.target.value)}
                      placeholder="Ej. 3"
                      className="w-full px-4 py-3 bg-indigo-50/50 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-black text-indigo-900" />
                    <span className="text-[11px] text-slate-400 block ml-1">Para el Plan Básico colocar 3</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1">Beneficios (Separados por Coma)</label>
                  <textarea rows={3} value={featuresInput} onChange={e => setFeaturesInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-medium resize-none"
                    placeholder="POS Móvil, Monitor de Cocina, Kardex..." />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
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
