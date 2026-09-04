'use client';
import { getApiUrl, apiFetch } from '@/utils/api';
import { getRestaurantId, deduplicateStaffList } from '@/utils/storage';
import { syncStaffMemberToFirebase, deleteStaffMemberFromFirebase, subscribeToStaff } from '@/utils/firebaseSync';


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, X, Loader2, Edit, UserX, UserCheck, Key, Shield, ChefHat, Calculator, AlertTriangle, Crown, Calendar, Trash2 } from 'lucide-react';

import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

// All views available in the system
const ALL_VIEWS = [
  { key: 'pos',           label: 'Plano de Sala',   icon: '🪑' },
  { key: 'asistente_ia',  label: 'Asistente IA ✨', icon: '✨' },
  { key: 'cocina',        label: 'Monitor Cocina',   icon: '👨‍🍳' },
  { key: 'caja',          label: 'Cierre de Caja',   icon: '💰' },
  { key: 'inventario',    label: 'Inventario',        icon: '📦' },
  { key: 'categorias',    label: 'Categorías',        icon: '🏷️' },
  { key: 'areas',         label: 'Áreas de Prep.',    icon: '🔥' },
  { key: 'kardex',        label: 'Kardex',            icon: '📊' },
  { key: 'configuracion', label: 'Configuración',     icon: '⚙️' },
  { key: 'analytics',     label: 'Reporte',           icon: '📈' },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN:   'Administrador',
  CASHIER: 'Cajero',
  WAITER:  'Mesero',
  COOK:    'Cocinero',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   'bg-violet-100 text-violet-700',
  CASHIER: 'bg-blue-100 text-blue-700',
  WAITER:  'bg-emerald-100 text-emerald-700',
  COOK:    'bg-amber-100 text-amber-700 border border-amber-200',
};

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CASHIER' | 'WAITER' | 'COOK';
  isActive: boolean;
  allowedViews: string[];
  createdAt?: string;
  pin?: string;
}

const emptyForm = {
  id: '',
  name: '',
  email: '',
  password: '',
  pin: '',
  role: 'CASHIER' as User['role'],
  allowedViews: ['pos', 'cocina', 'caja'] as string[],
};

export default function UsersPage() {
  const router = useRouter();
  useGuardedRoute('usuarios');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchUsers = async () => {
    setLoading(true);
    let serverUsers: User[] = [];
    try {
      const res = await apiFetch('/users');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          serverUsers = data;
        }
      }
    } catch { /* ignore network error */ }

    // Sincronizar silenciosamente la configuración y plan del restaurante desde el servidor
    if (typeof window !== 'undefined') {
      try {
        const token = localStorage.getItem('pos_token');
        const currentRestId = getRestaurantId();
        const configRes = await fetch(getApiUrl('/restaurant-config'), { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'x-restaurant-id': currentRestId || ''
          } 
        });
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData) {
            localStorage.setItem('pos_restaurant_config', JSON.stringify(configData));
            setSubInfo(getSubscriptionInfo());
          }
        }
      } catch {}
    }

    // Merge with registered staff from localStorage for standalone/offline support
    if (typeof window !== 'undefined') {
      try {
        const currentRestId = getRestaurantId();
        const cachedStaffStr = localStorage.getItem('pos_registered_staff');
        const cachedStaff: any[] = cachedStaffStr ? JSON.parse(cachedStaffStr) : [];

        const scopedKey = currentRestId ? `pos_registered_staff_${currentRestId}` : null;
        const scopedStr = scopedKey ? localStorage.getItem(scopedKey) : null;
        const scopedStaff: any[] = scopedStr ? JSON.parse(scopedStr) : [];

        const combinedLocal = [...scopedStaff, ...cachedStaff];

        const localUsers: User[] = combinedLocal
          .filter((s: any) => currentRestId ? s.restaurantId === currentRestId : true)
          .map((s: any) => ({
            id: s.id || `staff-${Date.now()}`,
            name: s.name,
            email: s.email || `${s.name.toLowerCase().replace(/\s+/g, '')}@restaurante.com`,
            role: s.role || 'CASHIER',
            pin: s.pin,
            isActive: s.isActive ?? true,
            allowedViews: s.allowedViews || ['pos', 'cocina', 'caja'],
          }));

        const finalUsers = deduplicateStaffList([...serverUsers, ...localUsers]) as User[];
        if (finalUsers.length > 0) {
          setUsers(finalUsers);
        } else {
          const currentUserStr = localStorage.getItem('pos_user');
          const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
          if (currentUser && currentUser.role === 'ADMIN') {
            setUsers([{
              id: currentUser.id || 'admin-1',
              name: currentUser.name || 'Administrador',
              email: currentUser.email || 'admin@restaurante.com',
              role: 'ADMIN',
              isActive: true,
              allowedViews: ['*'],
            }]);
          } else {
            setUsers([]);
          }
        }
      } catch {
        setUsers(serverUsers);
      } finally {
        setLoading(false);
      }
    } else {
      setUsers(serverUsers);
      setLoading(false);
    }
  };

  // Obtener información estricta de la suscripción y límite de usuarios del plan de forma segura para SSR
  const getSubscriptionInfo = () => {
    if (typeof window === 'undefined') {
      return {
        tenant: null,
        planName: 'Plan Básico',
        maxUsers: 3,
        isSuspended: false,
        isExpired: false,
        subscriptionEndDate: null
      };
    }

    try {
      const currentRestId = localStorage.getItem('pos_restaurant_id') || 
        (localStorage.getItem('pos_user') ? JSON.parse(localStorage.getItem('pos_user') || '{}').restaurantId : null);
      
      let tenant: any = null;
      let plan: any = null;

      // 1. Buscar en pos_restaurant_config
      const configStr = localStorage.getItem('pos_restaurant_config');
      if (configStr) {
        try {
          const cfg = JSON.parse(configStr);
          if (cfg.plan) plan = cfg.plan;
          tenant = cfg;
        } catch {}
      }

      // 2. Buscar en pos_user
      const userStr = localStorage.getItem('pos_user');
      if (userStr && (!plan || !plan.maxUsers)) {
        try {
          const u = JSON.parse(userStr);
          if (u.plan) plan = u.plan;
          if (u.restaurantPlan) plan = u.restaurantPlan;
        } catch {}
      }

      // 3. Buscar en pos_saas_tenants_cache
      const cachedTenantsStr = localStorage.getItem('pos_saas_tenants_cache');
      if (cachedTenantsStr && (!tenant || !plan || !plan.maxUsers)) {
        try {
          const tenants: any[] = JSON.parse(cachedTenantsStr);
          const found = (currentRestId ? tenants.find(t => t.id === currentRestId) : null) || tenants[0];
          if (found) {
            if (!tenant) tenant = found;
            if (!plan && found.plan) plan = found.plan;
            if (!plan && found.planId) {
              const cachedPlansStr = localStorage.getItem('pos_saas_plans_cache');
              if (cachedPlansStr) {
                const plans: any[] = JSON.parse(cachedPlansStr);
                plan = plans.find(p => p.id === found.planId || p.code === found.planId);
              }
            }
          }
        } catch {}
      }

      // 4. Buscar en pos_registered_restaurants
      const regRestStr = localStorage.getItem('pos_registered_restaurants');
      if (regRestStr && (!tenant || !plan || !plan.maxUsers)) {
        try {
          const rList: any[] = JSON.parse(regRestStr);
          const found = (currentRestId ? rList.find(r => r.id === currentRestId) : null) || rList[0];
          if (found) {
            if (!tenant) tenant = found;
            if (!plan && found.plan) plan = found.plan;
          }
        } catch {}
      }

      // Deducción inteligente del límite según nombre o código del plan
      let planName = plan?.name || tenant?.planName || 'Plan Básico';
      let maxUsers = Number(plan?.maxUsers);

      if (!maxUsers || isNaN(maxUsers)) {
        const pLower = (planName || '').toLowerCase();
        const pCode = (plan?.code || '').toUpperCase();
        if (pCode === 'PREMIUM' || pLower.includes('premium') || pLower.includes('ilimitado')) {
          maxUsers = 99;
          planName = 'Plan Premium';
        } else if (pCode === 'PRO' || pLower.includes('profesional') || pLower.includes('pro')) {
          maxUsers = 10;
          planName = 'Plan Profesional';
        } else {
          maxUsers = 3;
          planName = 'Plan Básico';
        }
      }

      const isSuspended = tenant?.isActive === false;
      const isExpired = tenant?.subscriptionEndDate ? new Date(tenant.subscriptionEndDate) < new Date() : false;
      const subscriptionEndDate = tenant?.subscriptionEndDate || null;

      return {
        tenant,
        planName,
        maxUsers,
        isSuspended,
        isExpired,
        subscriptionEndDate
      };
    } catch {
      return {
        tenant: null,
        planName: 'Plan Básico',
        maxUsers: 3,
        isSuspended: false,
        isExpired: false,
        subscriptionEndDate: null
      };
    }
  };

  const [subInfo, setSubInfo] = useState({
    tenant: null as any,
    planName: 'Plan Básico',
    maxUsers: 3,
    isSuspended: false,
    isExpired: false,
    subscriptionEndDate: null as string | null
  });

  useEffect(() => { 
    fetchUsers(); 
    setSubInfo(getSubscriptionInfo());

    const handleStorageChange = () => {
      fetchUsers();
      setSubInfo(getSubscriptionInfo());
    };
    window.addEventListener('storage', handleStorageChange);

    // Sincronización en tiempo real con Firebase Firestore
    const currentRestId = getRestaurantId();
    let unsubStaff: (() => void) | undefined;
    if (currentRestId) {
      unsubStaff = subscribeToStaff(currentRestId, (cloudStaff) => {
        if (Array.isArray(cloudStaff) && cloudStaff.length > 0) {
          setUsers(prev => {
            return deduplicateStaffList([...prev, ...cloudStaff]) as User[];
          });
        }
      });
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (typeof unsubStaff === 'function') unsubStaff();
    };
  }, []);

  const activeUsersCount = users.filter(u => u.isActive !== false).length;
  const isLimitReached = activeUsersCount >= subInfo.maxUsers;
  const isSubscriptionBlocked = subInfo.isSuspended || subInfo.isExpired;

  const openCreate = () => {
    if (subInfo.isSuspended) {
      toast.error('Acceso bloqueado: El restaurante se encuentra suspendido por el SuperAdmin.');
      return;
    }
    if (subInfo.isExpired) {
      toast.error(`Acceso bloqueado: La suscripción expiró el ${new Date(subInfo.subscriptionEndDate!).toLocaleDateString()}. Renueve el plan desde SuperAdmin.`);
      return;
    }
    if (isLimitReached) {
      toast.warning(`Límite alcanzado: El ${subInfo.planName} solo permite un máximo de ${subInfo.maxUsers} usuarios (${activeUsersCount} activos actualmente). Mejore su plan en SuperAdmin para registrar más personal.`);
      return;
    }
    setForm({ ...emptyForm });
    setShowModal(true);
  };
  const openEdit = (u: User) => {
    setForm({ id: u.id, name: u.name, email: u.email, password: '', pin: u.pin || '', role: u.role, allowedViews: u.allowedViews });
    setShowModal(true);
  };

  const toggleView = (key: string) => {
    setForm(f => ({
      ...f,
      allowedViews: f.allowedViews.includes(key)
        ? f.allowedViews.filter(v => v !== key)
        : [...f.allowedViews, key],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const isEditing = form.id !== '';
    const endpoint = isEditing ? `/users/${form.id}` : '/users';
    const method = isEditing ? 'PATCH' : 'POST';

    const cleanEmail = form.email.trim().toLowerCase();

    // Verificación estricta de límites de suscripción y usuarios al crear
    if (!isEditing) {
      if (subInfo.isSuspended) {
        toast.error('Acción bloqueada: El restaurante se encuentra suspendido. Contacte a SuperAdmin.');
        setIsSaving(false);
        return;
      }
      if (subInfo.isExpired) {
        toast.error('Acción bloqueada: La suscripción de este restaurante ha expirado. Renueve su plan en SuperAdmin.');
        setIsSaving(false);
        return;
      }
      if (activeUsersCount >= subInfo.maxUsers) {
        toast.error(`Acción bloqueada: Límite estricto excedido. El ${subInfo.planName} solo permite un máximo de ${subInfo.maxUsers} usuarios. Ya existen ${activeUsersCount} activos.`);
        setIsSaving(false);
        return;
      }
    }

    const body: any = { 
      name: form.name.trim(), 
      email: cleanEmail, 
      role: form.role, 
      allowedViews: form.allowedViews 
    };

    if (form.password && form.password.trim().length > 0) {
      body.password = form.password.trim();
    } else if (!isEditing) {
      body.password = '123456';
    }

    if (form.pin && form.pin.trim().length > 0) {
      body.pin = form.pin.trim().replace(/\D/g, '');
    }

    const tempId = form.id || `staff-${Date.now()}`;
    const userRestaurantId = getRestaurantId() || (typeof window !== 'undefined' && localStorage.getItem('pos_user') ? JSON.parse(localStorage.getItem('pos_user') || '{}').restaurantId : null);

    const staffMember: User = {
      id: tempId,
      name: form.name.trim(),
      email: cleanEmail,
      role: form.role,
      pin: body.pin || '1234',
      allowedViews: form.allowedViews,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    // 1. ACTUALIZACIÓN INSTANTÁNEA EN PANTALLA (0.05 segundos - Cero demora)
    setUsers(prev => {
      const idx = prev.findIndex(u => (form.id && u.id === form.id) || u.email.toLowerCase() === cleanEmail);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...staffMember };
        return copy;
      }
      return [...prev, staffMember];
    });

    // 2. Persistencia local inmediata para login con PIN y funcionamiento offline
    try {
      const newStaffEntry = { ...staffMember, password: body.password || '123456', restaurantId: userRestaurantId };
      const existingStaffStr = localStorage.getItem('pos_registered_staff');
      const existingStaff: any[] = existingStaffStr ? JSON.parse(existingStaffStr) : [];
      localStorage.setItem('pos_registered_staff', JSON.stringify(deduplicateStaffList([...existingStaff, newStaffEntry])));

      if (userRestaurantId) {
        const scopedKey = `pos_registered_staff_${userRestaurantId}`;
        const scopedStr = localStorage.getItem(scopedKey);
        const scopedList: any[] = scopedStr ? JSON.parse(scopedStr) : [];
        localStorage.setItem(scopedKey, JSON.stringify(deduplicateStaffList([...scopedList, newStaffEntry])));
      }
      window.dispatchEvent(new Event('storage'));
    } catch {}

    // 3. Sincronización instantánea a Firebase Firestore para multidispositivo
    if (userRestaurantId) {
      syncStaffMemberToFirebase(userRestaurantId, {
        ...staffMember,
        restaurantId: userRestaurantId
      }).catch(() => {});
    }

    // 4. Cerrar modal y notificar al usuario INMEDIATAMENTE
    toast.success(isEditing ? 'Usuario actualizado exitosamente' : '¡Usuario creado exitosamente!');
    setShowModal(false);
    setIsSaving(false);

    // 5. Enviar en segundo plano al servidor PostgreSQL sin bloquear la pantalla
    apiFetch(endpoint, {
      method,
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (res.ok) {
        const serverUser = await res.json().catch(() => null);
        if (serverUser && serverUser.id && serverUser.id !== tempId) {
          // Reemplazar ID temporal con ID definitivo de PostgreSQL
          setUsers(prev => deduplicateStaffList(prev.map(u => (u.id === tempId || u.email?.toLowerCase() === cleanEmail) ? { ...u, id: serverUser.id } : u)) as User[]);
          try {
            const replaceIdAndDedup = (list: any[]) => {
              const updated = list.map((s: any) => 
                (s.id === tempId || s.email?.toLowerCase() === cleanEmail) ? { ...s, id: serverUser.id } : s
              );
              return deduplicateStaffList(updated);
            };

            const existingStaffStr = localStorage.getItem('pos_registered_staff');
            if (existingStaffStr) {
              const existingStaff = JSON.parse(existingStaffStr);
              localStorage.setItem('pos_registered_staff', JSON.stringify(replaceIdAndDedup(existingStaff)));
            }

            if (userRestaurantId) {
              const scopedKey = `pos_registered_staff_${userRestaurantId}`;
              const scopedStr = localStorage.getItem(scopedKey);
              if (scopedStr) {
                const scoped = JSON.parse(scopedStr);
                localStorage.setItem(scopedKey, JSON.stringify(replaceIdAndDedup(scoped)));
              }
            }
          } catch {}
        }
      } else if (res.status !== 401) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = Array.isArray(errData.message) ? errData.message.join(', ') : errData.message || 'Error en servidor';
        if (errMsg.includes('correo') || errMsg.includes('email') || res.status === 409) {
          toast.error(`Aviso: ${errMsg}`);
          // Revertir optimistic si el correo ya estaba duplicado en la base de datos
          setUsers(prev => prev.filter(u => u.id !== tempId));
        }
      }
    }).catch((err) => {
      console.warn('Backend remoto demoró en responder, usuario activo localmente y en Firebase:', err);
    });
  };

  const handleToggleActive = async (u: User) => {
    const action = u.isActive ? 'desactivar' : 'activar';
    if (!confirm(`¿Estás seguro de ${action} al usuario ${u.name}?`)) return;
    try {
      await apiFetch(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      }).catch(() => {});

      // Actualizar también en caché local
      try {
        const cachedStr = localStorage.getItem('pos_registered_staff');
        if (cachedStr) {
          const cached: any[] = JSON.parse(cachedStr);
          const idx = cached.findIndex(s => s.id === u.id || s.email === u.email);
          if (idx !== -1) {
            cached[idx].isActive = !u.isActive;
            localStorage.setItem('pos_registered_staff', JSON.stringify(cached));
          }
        }
      } catch {}

      toast.success(`Usuario ${u.isActive ? 'desactivado' : 'activado'}`); 
      fetchUsers(); 
    } catch { 
      toast.error('Error de red'); 
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (u.role === 'ADMIN' && users.filter(x => x.role === 'ADMIN').length <= 1) {
      return toast.error('No puedes eliminar al único Administrador del local.');
    }
    if (!confirm(`¿Estás seguro de eliminar permanentemente al usuario ${u.name}?`)) return;

    try {
      await apiFetch(`/users/${u.id}`, { method: 'DELETE' }).catch(() => {});

      // Remover de la caché local de personal (scoped y general)
      try {
        const filterOutUser = (list: any[]) => {
          return list.filter(s => 
            s.id !== u.id && 
            s.email?.toLowerCase() !== u.email?.toLowerCase() &&
            s.name?.toLowerCase() !== u.name?.toLowerCase()
          );
        };

        const cachedStr = localStorage.getItem('pos_registered_staff');
        if (cachedStr) {
          const cached: any[] = JSON.parse(cachedStr);
          localStorage.setItem('pos_registered_staff', JSON.stringify(filterOutUser(cached)));
        }
        const currentRestId = getRestaurantId();
        if (currentRestId) {
          deleteStaffMemberFromFirebase(u.id).catch(() => {});
          const scopedKey = `pos_registered_staff_${currentRestId}`;
          const scopedStr = localStorage.getItem(scopedKey);
          if (scopedStr) {
            const scoped: any[] = JSON.parse(scopedStr);
            localStorage.setItem(scopedKey, JSON.stringify(filterOutUser(scoped)));
          }
        }
        window.dispatchEvent(new Event('storage'));
      } catch {}

      toast.success(`Usuario ${u.name} eliminado exitosamente ✅`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch {
      toast.error('Error al eliminar usuario');
    }
  };


  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2 sm:gap-3">
            <Users className="text-violet-600 w-7 h-7 sm:w-8 sm:h-8" />
            Usuarios
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-xs sm:text-sm tracking-widest">
            Gestión de acceso al sistema
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* Badge informativo de Plan y Límite */}
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none">Plan Activo</p>
              <p className="text-xs font-black text-slate-800 leading-tight">
                {subInfo.planName} <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-black ${isLimitReached ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {activeUsersCount}/{subInfo.maxUsers} usrs
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={openCreate}
            className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-lg active:scale-95 whitespace-nowrap ${
              isLimitReached || isSubscriptionBlocked
                ? 'bg-slate-200 text-slate-500 hover:bg-slate-300 shadow-none'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200'
            }`}
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            Nuevo Usuario
          </button>
        </div>
      </header>

      {/* Banner de Advertencia: Suscripción Vencida o Suspendida */}
      {isSubscriptionBlocked && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black text-rose-900">
                {subInfo.isSuspended ? 'Restaurante Suspendido' : 'Suscripción Expirada'}
              </p>
              <p className="text-xs text-rose-700 font-medium">
                {subInfo.isSuspended 
                  ? 'El acceso de este negocio ha sido suspendido por SuperAdmin.' 
                  : `El periodo de suscripción venció el ${subInfo.subscriptionEndDate ? new Date(subInfo.subscriptionEndDate).toLocaleDateString() : 'fecha límite'}. Contacte a SuperAdmin para renovar.`}
              </p>
            </div>
          </div>
          <span className="text-xs font-black px-3 py-1.5 bg-rose-200 text-rose-800 rounded-xl uppercase tracking-wider">
            Bloqueado
          </span>
        </div>
      )}

      {/* Banner de Advertencia: Límite de Usuarios Alcanzado */}
      {isLimitReached && !isSubscriptionBlocked && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black text-amber-900">
                Límite de usuarios alcanzado ({activeUsersCount} de {subInfo.maxUsers} permitidos)
              </p>
              <p className="text-xs text-amber-700 font-medium">
                El <strong>{subInfo.planName}</strong> solo permite hasta {subInfo.maxUsers} usuarios concurrentes. Para crear más cuentas de personal, actualice su plan en el panel SuperAdmin.
              </p>
            </div>
          </div>
          <span className="text-xs font-black px-3 py-1.5 bg-amber-200 text-amber-900 rounded-xl uppercase tracking-wider">
            Plan Lleno
          </span>
        </div>
      )}

      {/* Users grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {users.map(u => (
          <div
            key={u.id}
            className={`bg-white rounded-3xl border shadow-sm p-6 flex flex-col gap-4 transition-all ${u.isActive ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}
          >
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg ${u.isActive ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}`}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-black text-slate-800 leading-tight">{u.name}</p>
                  <p className="text-xs text-slate-400 font-medium">{u.email}</p>
                  {u.pin && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 mt-1 bg-slate-100 px-2 py-0.5 rounded-md">
                      <Key className="w-3 h-3 text-violet-500" /> PIN: {u.pin}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${ROLE_COLORS[u.role]}`}>
                {ROLE_LABELS[u.role]}
              </span>
            </div>

            {/* Views */}
            {u.role === 'ADMIN' ? (
              <div className="flex items-center gap-2 text-xs font-bold text-violet-600 bg-violet-50 px-3 py-2 rounded-xl">
                <Shield className="w-4 h-4" /> Acceso total (Administrador)
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {u.allowedViews.length === 0
                  ? <span className="text-xs text-slate-400 italic">Sin vistas asignadas</span>
                  : u.allowedViews.map(v => {
                      const view = ALL_VIEWS.find(a => a.key === v);
                      return view ? (
                        <span key={v} className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                          {view.icon} {view.label}
                        </span>
                      ) : null;
                    })}
              </div>
            )}

            {/* Status + actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className={`text-xs font-bold flex items-center gap-1 ${u.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                {u.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(u)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleToggleActive(u)}
                  className={`p-2 rounded-xl transition-colors ${u.isActive ? 'text-amber-400 hover:text-amber-600 hover:bg-amber-50' : 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                  title={u.isActive ? 'Desactivar' : 'Activar'}
                >
                  {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleDeleteUser(u)}
                  className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  title="Eliminar permanentemente"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center bg-white rounded-3xl shadow-sm border border-slate-100 p-16">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay usuarios</h3>
          <p className="text-slate-500 mb-6">Crea el primer usuario del sistema</p>
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-2xl font-bold">
            <Plus className="w-5 h-5" /> Crear Usuario
          </button>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-violet-600 text-white">
              <h2 className="text-xl font-black flex items-center gap-2">
                <Users className="w-6 h-6 text-violet-200" />
                {form.id ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Nombre *</label>
                  <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Juan Pérez"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-slate-800" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Rol *</label>
                  <select 
                    value={form.role} 
                    onChange={e => {
                      const newRole = e.target.value as User['role'];
                      let defaultViews: string[] = ['pos', 'cocina'];
                      if (newRole === 'ADMIN') defaultViews = ['*'];
                      else if (newRole === 'CASHIER') defaultViews = ['pos', 'cocina', 'caja'];
                      else if (newRole === 'WAITER') defaultViews = ['pos', 'cocina'];
                      else if (newRole === 'COOK') defaultViews = ['cocina'];
                      
                      setForm(f => ({ ...f, role: newRole, allowedViews: defaultViews }));
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-slate-800 font-bold"
                  >
                    <option value="ADMIN">Administrador (Acceso Total)</option>
                    <option value="CASHIER">Cajero (POS, Cocina, Caja)</option>
                    <option value="WAITER">Mesero (POS, Cocina)</option>
                    <option value="COOK">Cocinero</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">Email *</label>
                <input required={!form.id} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="juan@restaurante.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-slate-800" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Key className="w-3 h-3" />
                    {form.id ? 'Cambiar Contraseña' : 'Contraseña *'}
                  </label>
                  <input required={!form.id} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-slate-800" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Calculator className="w-3 h-3" />
                    PIN (4 dígitos)
                  </label>
                  <input type="text" maxLength={4} pattern="[0-9]*" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                    placeholder="Ej. 1234"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-slate-800 font-bold tracking-widest text-center" />
                </div>
              </div>

              {/* Views — only shown when not ADMIN */}
              {form.role !== 'ADMIN' && (
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 block">
                    Vistas Permitidas
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_VIEWS.map(view => (
                      <label key={view.key} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        form.allowedViews.includes(view.key)
                          ? 'bg-violet-50 border-violet-400 text-violet-800'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.allowedViews.includes(view.key)}
                          onChange={() => toggleView(view.key)}
                          className="w-4 h-4 accent-violet-600"
                        />
                        <span className="text-sm font-bold">{view.icon} {view.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.role === 'ADMIN' && (
                <div className="flex items-center gap-3 p-4 bg-violet-50 border-2 border-violet-200 rounded-2xl text-violet-700">
                  <Shield className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-bold">Los Administradores tienen acceso completo a todas las vistas del sistema.</p>
                </div>
              )}

              <button type="submit" disabled={isSaving}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : (form.id ? 'Guardar Cambios' : 'Crear Usuario')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
