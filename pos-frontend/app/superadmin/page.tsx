'use client';
import { getApiUrl } from '@/utils/api';

import { useState, useEffect } from 'react';
import { Plus, Search, Store, Users, Receipt, Building, Mail, Lock, User, Check, X, Building2, Phone, Crown, CalendarPlus, Edit, LayoutDashboard, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { PlansManager, SubscriptionPlan } from './components/PlansManager';
import { SuperAdminProfile } from './components/SuperAdminProfile';

interface Restaurant {
  id: string;
  name: string;
  slogan: string;
  isActive: boolean;
  createdAt: string;
  planId: string | null;
  plan?: { name: string; code: string };
  subscriptionEndDate: string;
  ownerName: string | null;
  ownerPhone: string | null;
  _count: {
    users: number;
    orders: number;
  };
}

export default function SuperAdminPage() {
  const [activeMainTab, setActiveMainTab] = useState<'TENANTS'|'PLANS'|'PROFILE'>('TENANTS');
  
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Creation Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantSlogan, setTenantSlogan] = useState('');
  const [planId, setPlanId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Editing Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<'TENANT'|'ADMIN'>('TENANT');
  
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantSlogan, setEditTenantSlogan] = useState('');
  const [editPlanId, setEditPlanId] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editOwnerPhone, setEditOwnerPhone] = useState('');
  const [editSubEndDate, setEditSubEndDate] = useState('');
  
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editAdminPassword, setEditAdminPassword] = useState('');

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('pos_token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [resTenants, resPlans] = await Promise.all([
        fetch(getApiUrl('/saas/restaurants'), { headers }),
        fetch(getApiUrl('/saas/plans'), { headers })
      ]);
      
      if (resTenants.ok) {
        setRestaurants(await resTenants.json());
      }
      if (resPlans.ok) {
        const plansData = await resPlans.json();
        const activePlans = plansData.filter((p: any) => p.isActive);
        setAvailablePlans(activePlans);
        if (activePlans.length > 0) setPlanId(activePlans[0].id);
      }
    } catch {
      toast.error('Error cargando inicial');
    } finally {
      setLoading(false);
    }
  };

  const fetchRestaurantsOnly = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl('/saas/restaurants'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRestaurants(await res.json());
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (activeMainTab === 'TENANTS') {
      fetchInitialData();
    }
  }, [activeMainTab]);

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl(`/saas/restaurants/${id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      if (res.ok) {
        toast.success(`Restaurante ${!currentStatus ? 'Activado' : 'Suspendido'}`);
        fetchRestaurantsOnly();
      }
    } catch {
      toast.error('Error cambiando el estado');
    }
  };

  const renewSubscription = async (id: string, days: number) => {
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl(`/saas/restaurants/${id}/renew`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ days })
      });
      if (res.ok) {
        toast.success(`Suscripción renovada por ${days} días`);
        fetchRestaurantsOnly();
      } else {
        toast.error('Error al renovar suscripción');
      }
    } catch {
      toast.error('Error en la conexión');
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) return toast.error('Debes seleccionar un plan válido');
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('pos_token');
      const res1 = await fetch(getApiUrl('/saas/restaurants'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
           name: tenantName, slogan: tenantSlogan, planId, ownerName, ownerPhone
        })
      });
      
      if (!res1.ok) throw new Error('Error al crear el restaurante');
      const newRestaurant = await res1.json();
      
      const res2 = await fetch(getApiUrl(`/saas/restaurants/${newRestaurant.id}/admins`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: adminName, email: adminEmail, password: adminPassword })
      });
      
      if (!res2.ok) throw new Error('Restaurante creado, pero falló la creación del admin');

      toast.success('¡Nuevo Inquilino creado exitosamente!');
      setIsOpen(false);
      
      setTenantName(''); setTenantSlogan(''); setOwnerName(''); setOwnerPhone('');
      if (availablePlans.length > 0) setPlanId(availablePlans[0].id);
      setAdminName(''); setAdminEmail(''); setAdminPassword('');
      fetchRestaurantsOnly();
    } catch (err: any) {
      toast.error(err.message || 'Error en la operación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = async (r: Restaurant) => {
    setEditingId(r.id);
    setEditTenantName(r.name);
    setEditTenantSlogan(r.slogan || '');
    setEditPlanId(r.planId || '');
    setEditOwnerName(r.ownerName || '');
    setEditOwnerPhone(r.ownerPhone || '');
    
    // Format date for datetime-local input
    if (r.subscriptionEndDate) {
      const d = new Date(r.subscriptionEndDate);
      const formatted = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEditSubEndDate(formatted);
    }

    setEditAdminEmail(''); setEditAdminPassword('');
    setEditTab('TENANT');
    setIsEditOpen(true);

    // Fetch Admin details
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl(`/saas/restaurants/${r.id}/admin`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const adminData = await res.json();
        setEditAdminEmail(adminData.email);
      }
    } catch (err) {
      console.error('Error fetching admin', err);
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl(`/saas/restaurants/${editingId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
           name: editTenantName, 
           slogan: editTenantSlogan, 
           planId: editPlanId, 
           ownerName: editOwnerName, 
           ownerPhone: editOwnerPhone,
           subscriptionEndDate: editSubEndDate
        })
      });
      if (!res.ok) {
        let errStr = 'Error al actualizar inquilino';
        try {
          const errData = await res.json();
          errStr = Array.isArray(errData.message) ? errData.message.join(', ') : errData.message || errStr;
        } catch {}
        throw new Error(errStr);
      }
      toast.success('Datos actualizados correctamente');
      setIsEditOpen(false);
      fetchRestaurantsOnly();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('pos_token');
      const payload: any = { email: editAdminEmail };
      if (editAdminPassword.trim().length > 0) {
         payload.password = editAdminPassword;
      }

      const res = await fetch(getApiUrl(`/saas/restaurants/${editingId}/admin`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al actualizar credenciales');
      
      toast.success('Credenciales maestras actualizadas');
      setEditAdminPassword('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpired = (endDate: string) => new Date(endDate) < new Date();
  const daysRemaining = (endDate: string) => {
     const diff = new Date(endDate).getTime() - new Date().getTime();
     return Math.ceil(diff / (1000 * 3600 * 24));
  };

  return (
    <div className="w-full h-full flex flex-col gap-6">
      
      {/* NAVEGACIÓN SUPER ADMIN */}
      <div className="flex px-1 gap-2 border-b border-slate-200">
         <button 
           onClick={() => setActiveMainTab('TENANTS')} 
           className={`px-4 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === 'TENANTS' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
         >
           <Building2 className="w-4 h-4" /> Inquilinos
         </button>
         <button 
           onClick={() => setActiveMainTab('PLANS')} 
           className={`px-4 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === 'PLANS' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
         >
           <Crown className="w-4 h-4" /> Planes de Suscripción
         </button>
         <button 
           onClick={() => setActiveMainTab('PROFILE')} 
           className={`px-4 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === 'PROFILE' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
         >
           <Settings className="w-4 h-4" /> Mi Perfil
         </button>
      </div>

      {activeMainTab === 'PROFILE' && <SuperAdminProfile />}
      
      {activeMainTab === 'PLANS' && <PlansManager />}

      {activeMainTab === 'TENANTS' && (
      <>
      <div className="flex items-center justify-between">
         <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Directorio de Inquilinos</h1>
            <p className="text-slate-500 font-medium">Gestión global de restaurantes y suscripciones</p>
         </div>
         <button 
           onClick={() => setIsOpen(true)}
           className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-slate-200 transition-all flex items-center gap-2"
         >
            <Plus className="w-5 h-5" /> Nuevo Restaurante
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
           <p className="text-slate-500 font-bold p-8 text-center col-span-full">Cargando datos...</p>
        ) : restaurants.map(r => {
           const expired = isExpired(r.subscriptionEndDate);
           const daysL = daysRemaining(r.subscriptionEndDate);
           const planName = r.plan?.name || r.plan?.code || 'SIN PLAN';
           
           return (
           <div key={r.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group flex flex-col relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1 ${expired ? 'bg-rose-500' : daysL < 5 ? 'bg-amber-400' : 'bg-emerald-500'}`} />

              <div className="flex items-start justify-between mb-4 mt-2">
                 <div className={`p-3 rounded-2xl ${r.isActive && !expired ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    <Building2 className="w-6 h-6" />
                 </div>
                 <div className="flex items-center gap-2">
                   <button onClick={() => openEditModal(r)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors" title="Editar config">
                     <Edit className="w-4 h-4" />
                   </button>
                   <div className="flex flex-col items-end gap-1">
                     <button 
                       onClick={() => toggleStatus(r.id, r.isActive)}
                       className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full transition-colors border ${
                         r.isActive ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-rose-50 hover:text-rose-600'
                         : 'border-rose-200 text-rose-700 bg-rose-50 hover:bg-emerald-50 hover:text-emerald-600'
                       }`}
                     >
                       {r.isActive ? 'Activo' : 'Suspendido'}
                     </button>
                     <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">PLAN {planName}</span>
                   </div>
                 </div>
              </div>
              
              <h2 className="text-xl font-black text-slate-800 tracking-tight truncate">{r.name}</h2>
              <p className="text-sm font-medium text-slate-500 mb-4 truncate">{r.ownerName ? `Dueño: ${r.ownerName}` : (r.slogan || 'Sin slogan')}</p>
              
              <div className={`p-3 rounded-xl mb-4 border ${expired ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                 <p className="text-[11px] font-black uppercase tracking-widest opacity-60 mb-1">Estado de Suscripción</p>
                 <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{new Date(r.subscriptionEndDate).toLocaleDateString()}</span>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${expired ? 'bg-rose-200 text-rose-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {expired ? 'EXPIRADA' : `${daysL} días más`}
                    </span>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-4">
                 <button onClick={() => renewSubscription(r.id, 30)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors">
                   <CalendarPlus className="w-3.5 h-3.5" /> +1 Mes
                 </button>
                 <button onClick={() => renewSubscription(r.id, 365)} className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-colors">
                   <Crown className="w-3.5 h-3.5" /> +1 Año
                 </button>
              </div>
              
              <div className="mt-auto grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                 <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">{r._count.users} usrs</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">{r._count.orders} ords</span>
                 </div>
              </div>
           </div>
        )})}
      </div>
      </>
      )}

      {/* MODAL: Alta de Inquilino */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 sticky top-0 z-20">
               <h2 className="text-2xl font-black text-slate-900 tracking-tight">Nuevo Inquilino SaaS</h2>
               <button onClick={() => setIsOpen(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 shadow-sm transition-all">
                  <X className="w-5 h-5" />
               </button>
             </div>
             <form onSubmit={handleCreateTenant} className="p-8 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-x divide-slate-100">
                  <div className="space-y-6 pr-4">
                     <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Datos Comerciales</h3>
                     <div className="space-y-4">
                       <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-700 ml-1">Nombre Comercial *</label>
                         <div className="relative">
                           <Store className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                           <input type="text" required value={tenantName} onChange={e => setTenantName(e.target.value)}
                             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                         </div>
                       </div>
                       <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-700 ml-1">Plan SaaS *</label>
                         <div className="relative">
                           <Crown className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                           <select required value={planId} onChange={e => setPlanId(e.target.value)}
                             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium outline-none appearance-none" >
                             {availablePlans.map(p => (
                               <option key={p.id} value={p.id}>{p.name} (Max {p.maxUsers} Users) - S/ {p.price}</option>
                             ))}
                           </select>
                         </div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-700 ml-1">Dueño / Titular</label>
                           <div className="relative">
                             <User className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                             <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)}
                               className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                           </div>
                         </div>
                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-700 ml-1">Teléfono Facturación</label>
                           <div className="relative">
                             <Phone className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                             <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)}
                               className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                           </div>
                         </div>
                       </div>
                     </div>
                  </div>
                  <div className="space-y-6 pl-4">
                     <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Cuenta Súper Admin Cliente</h3>
                     <div className="space-y-4">
                       <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-700 ml-1">Nombre del Administrador *</label>
                         <div className="relative">
                           <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                           <input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)}
                             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                         </div>
                       </div>
                       <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-700 ml-1">Correo Electrónico *</label>
                         <div className="relative">
                           <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                           <input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                         </div>
                       </div>
                       <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-700 ml-1">Contraseña de Acceso *</label>
                         <div className="relative">
                           <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                           <input type="password" required value={adminPassword} onChange={e => setAdminPassword(e.target.value)} minLength={6}
                             className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                         </div>
                         <p className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg mt-2">
                           La suscripción se generará automáticamente con 30 días iniciales a partir de hoy.
                         </p>
                       </div>
                     </div>
                  </div>
               </div>
               <div className="pt-6 flex items-center justify-end gap-3 border-t border-slate-100">
                 <button type="button" onClick={() => setIsOpen(false)}
                   className="px-6 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
                 <button type="submit" disabled={isSubmitting}
                   className="px-8 py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-lg shadow-slate-200 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95">
                   {isSubmitting ? 'Procesando...' : <><Check className="w-4 h-4" /> Crear Inquilino</>}
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* MODAL: Edición de Inquilino */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsEditOpen(false)} />
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
             
             <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
               <div>
                 <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestor Avanzado</h2>
                 <p className="text-sm font-medium text-slate-500">{editTenantName}</p>
               </div>
               <button onClick={() => setIsEditOpen(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 shadow-sm transition-all">
                  <X className="w-5 h-5" />
               </button>
             </div>

             <div className="flex px-8 border-b border-slate-100 bg-slate-50/30 gap-6">
                <button onClick={() => setEditTab('TENANT')} className={`py-4 text-sm font-black border-b-2 transition-colors ${editTab === 'TENANT' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Datos del Inquilino</button>
                <button onClick={() => setEditTab('ADMIN')} className={`py-4 text-sm font-black border-b-2 transition-colors ${editTab === 'ADMIN' ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Seguridad y Claves</button>
             </div>

             <div className="p-8">
               {editTab === 'TENANT' && (
                 <form onSubmit={handleUpdateTenant} className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-700 ml-1">Nombre Comercial</label>
                       <input type="text" required value={editTenantName} onChange={e => setEditTenantName(e.target.value)}
                         className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-700 ml-1">Plan SaaS</label>
                       <select required value={editPlanId} onChange={e => setEditPlanId(e.target.value)}
                         className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium outline-none">
                         {availablePlans.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                         ))}
                       </select>
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-700 ml-1">Dueño Nombre</label>
                       <input type="text" value={editOwnerName} onChange={e => setEditOwnerName(e.target.value)}
                         className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-700 ml-1">Dueño Teléfono</label>
                       <input type="tel" value={editOwnerPhone} onChange={e => setEditOwnerPhone(e.target.value)}
                         className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                     </div>
                   </div>
                   <div className="space-y-2 p-4 bg-amber-50 rounded-xl border border-amber-200">
                     <label className="text-xs font-black text-amber-900 uppercase tracking-widest flex items-center gap-2">
                       <CalendarPlus className="w-4 h-4" /> Sobrescribir Fecha de Expiración
                     </label>
                     <p className="text-xs text-amber-700/80 mb-2 font-medium">Modifica la fecha y hora exacta del corte de servicio si añadiste tiempo por error.</p>
                     <input type="datetime-local" value={editSubEndDate} onChange={e => setEditSubEndDate(e.target.value)}
                       className="w-full px-4 py-3 bg-white border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-sm font-bold text-amber-900 outline-none" />
                   </div>
                   
                   <div className="pt-4 flex items-center justify-end">
                     <button type="submit" disabled={isSubmitting} className="px-8 py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
                       {isSubmitting ? 'Guardando...' : 'Guardar Datos'}
                     </button>
                   </div>
                 </form>
               )}

               {editTab === 'ADMIN' && (
                 <form onSubmit={handleUpdateAdmin} className="space-y-6">
                   <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl mb-6">
                     <h3 className="text-sm font-black text-rose-800 mb-1 flex items-center gap-2"><Lock className="w-4 h-4" /> Zona Crítica</h3>
                     <p className="text-xs font-medium text-rose-600/80">Esta utilería edita obligatoriamente los accesos del administrador maestro del inquilino (Dueño).</p>
                   </div>
                   <div className="space-y-4">
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-700 ml-1">Correo Electrónico del Dueño</label>
                       <input type="email" required value={editAdminEmail} onChange={e => setEditAdminEmail(e.target.value)}
                         className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 text-sm font-medium outline-none transition-all" />
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-700 ml-1">Forzar Nueva Contraseña</label>
                       <input type="password" value={editAdminPassword} onChange={e => setEditAdminPassword(e.target.value)}
                         className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 text-sm font-medium outline-none transition-all" 
                         placeholder="Dejar en blanco para no cambiar..." />
                     </div>
                   </div>
                   <div className="pt-4 flex items-center justify-end">
                     <button type="submit" disabled={isSubmitting} className="px-8 py-3.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50">
                       {isSubmitting ? 'Actualizando...' : 'Actualizar Accesos'}
                     </button>
                   </div>
                 </form>
               )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
