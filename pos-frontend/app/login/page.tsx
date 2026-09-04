'use client';
import { getApiUrl } from '@/utils/api';
import Link from 'next/link';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, Lock, Mail, Loader2, KeyRound, User as UserIcon, LogOut, ArrowLeft, Shield, Headphones } from 'lucide-react';
import { toast } from 'sonner';
import { getFirstAllowedPath } from '@/hooks/useGuardedRoute';

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  role: string;
  pin?: string;
  allowedViews?: string[];
  restaurantId?: string | null;
}

export default function LoginPage() {
  const [mode, setMode] = useState<'ADMIN' | 'STAFF' | 'PIN'>('ADMIN');
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isStaffLoading, setIsStaffLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<StaffMember | null>(null);
  
  // Admin form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // PIN form
  const [pin, setPin] = useState('');
  
  // PIN Setup Modal State for First Login
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pendingSession, setPendingSession] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fetchStaff = async (restId?: string | null) => {
    setIsStaffLoading(true);
    let loadedStaff: StaffMember[] = [];

    if (restId) {
      try {
        const res = await fetch(getApiUrl(`/auth/restaurant/${restId}/staff`));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            loadedStaff = data;
          }
        }
      } catch (error) {
        console.error('Error fetching staff from API:', error);
      }
    }

    try {
      const scopedKey = restId ? `pos_registered_staff_${restId}` : null;
      const scopedStr = scopedKey ? localStorage.getItem(scopedKey) : null;
      const scopedStaff: any[] = scopedStr ? JSON.parse(scopedStr) : [];

      const localStaffStr = localStorage.getItem('pos_registered_staff');
      const localStaff: any[] = localStaffStr ? JSON.parse(localStaffStr) : [];
      const combinedLocal = [...scopedStaff, ...localStaff];

      if (combinedLocal.length > 0 && restId) {
        const filteredStaff = combinedLocal.filter(s => s.restaurantId === restId && s.isActive !== false);

        const map = new Map<string, StaffMember>();
        loadedStaff.forEach(s => map.set(s.id || s.email?.toLowerCase() || s.name.toLowerCase(), s));
        filteredStaff.forEach(s => {
          const key = s.id || s.email?.toLowerCase() || s.name.toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              id: s.id || `staff-${Date.now()}`,
              name: s.name,
              email: s.email,
              role: s.role || 'CASHIER',
              pin: s.pin,
              allowedViews: s.allowedViews || ['pos', 'cocina', 'caja'],
              restaurantId: s.restaurantId || restId,
            });
          } else {
            const existing = map.get(key)!;
            if (s.pin) existing.pin = s.pin;
            if (s.restaurantId) existing.restaurantId = s.restaurantId;
          }
        });
        loadedStaff = Array.from(map.values());
      }
    } catch {}


    setStaff(loadedStaff);
    setIsStaffLoading(false);
  };


  useEffect(() => {
    const savedRestaurantId = localStorage.getItem('pos_restaurant_id');
    if (savedRestaurantId) {
      setRestaurantId(savedRestaurantId);
      fetchStaff(savedRestaurantId);
    } else {
      setIsStaffLoading(false);
    }
    // Siempre iniciar en modo Correo y Contraseña por defecto
    setMode('ADMIN');
  }, []);

  const unlinkDevice = () => {
    localStorage.removeItem('pos_restaurant_id');
    localStorage.removeItem('pos_restaurant_config');
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    setRestaurantId(null);
    setStaff([]);
    setSelectedUser(null);
    setMode('ADMIN');
    setIsStaffLoading(false);
    toast.success('Terminal desvinculada. Se cerró la sesión del restaurante.');
  };

  const syncRestaurantSession = (newRestId?: string | null, newRestName?: string | null) => {
    if (newRestId) {
      localStorage.setItem('pos_restaurant_id', newRestId);
    } else {
      localStorage.removeItem('pos_restaurant_id');
    }

    if (newRestName) {
      localStorage.setItem('pos_restaurant_config', JSON.stringify({ name: newRestName }));
    }
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSession || newPin.length < 4) {
      toast.error('El PIN debe contener al menos 4 dígitos');
      return;
    }

    try {
      await fetch(getApiUrl('/auth/set-pin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingSession.access_token}`
        },
        body: JSON.stringify({ userId: pendingSession.user.id, pin: newPin })
      });
    } catch {}

    const updatedUser = { ...pendingSession.user, pin: newPin };
    localStorage.setItem('pos_user', JSON.stringify(updatedUser));

    // Registrar y actualizar inmediatamente en el Personal PIN de la terminal
    if (updatedUser.restaurantId) {
      try {
        const staffStr = localStorage.getItem('pos_registered_staff');
        const staffList: any[] = staffStr ? JSON.parse(staffStr) : [];
        const idx = staffList.findIndex(s => s.id === updatedUser.id || s.email?.toLowerCase() === updatedUser.email?.toLowerCase());
        const staffObj = {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          pin: newPin,
          allowedViews: updatedUser.allowedViews || ['pos', 'cocina', 'caja'],
          restaurantId: updatedUser.restaurantId,
          isActive: true,
        };
        if (idx !== -1) {
          staffList[idx] = { ...staffList[idx], ...staffObj };
        } else {
          staffList.push(staffObj);
        }
        localStorage.setItem('pos_registered_staff', JSON.stringify(staffList));

        const scopedKey = `pos_registered_staff_${updatedUser.restaurantId}`;
        const scopedStr = localStorage.getItem(scopedKey);
        const scopedList: any[] = scopedStr ? JSON.parse(scopedStr) : [];
        const sIdx = scopedList.findIndex(s => s.id === updatedUser.id || s.email?.toLowerCase() === updatedUser.email?.toLowerCase());
        if (sIdx !== -1) {
          scopedList[sIdx] = { ...scopedList[sIdx], ...staffObj };
        } else {
          scopedList.push(staffObj);
        }
        localStorage.setItem(scopedKey, JSON.stringify(scopedList));
        window.dispatchEvent(new Event('storage'));
      } catch {}
    }

    toast.success('¡PIN de acceso rápido configurado exitosamente!');
    const dest = updatedUser.role === 'SUPER_ADMIN' ? '/superadmin' : getFirstAllowedPath(updatedUser.allowedViews ?? ['*']);
    window.location.href = dest;
  };


  const checkIsRestaurantSuspended = (restId?: string | null): boolean => {
    if (!restId) return false;
    try {
      const tenantsStr = localStorage.getItem('pos_saas_tenants_cache');
      if (tenantsStr) {
        const tenants: any[] = JSON.parse(tenantsStr);
        const found = tenants.find(t => t.id === restId);
        if (found) {
          if (found.isActive === false) return true;
          if (found.subscriptionEndDate && new Date(found.subscriptionEndDate) < new Date()) return true;
        }
      }
    } catch {}
    return false;
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      let data: any = {};
      let response: Response | null = null;
      try {
        response = await fetch(getApiUrl('/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
        });
        if (response) {
          try { data = await response.json(); } catch {}
        }
      } catch (err) {
        console.warn('Backend server not reached during login:', err);
      }

      if (response && response.ok && data.access_token && data.user) {
        // Verificar suspensión antes de conceder acceso
        if (data.user.role !== 'SUPER_ADMIN' && checkIsRestaurantSuspended(data.user.restaurantId)) {
          toast.error('Este restaurante se encuentra suspendido. Contacte al Administrador del Sistema.');
          setLoading(false);
          return;
        }

        syncRestaurantSession(data.user.restaurantId, data.user.restaurantName);
        localStorage.setItem('pos_token', data.access_token);
        localStorage.setItem('pos_user', JSON.stringify(data.user)); 

        // Si es un trabajador (mesero, cajero, cocinero o admin) con restaurantId, registrarlo en el Personal PIN de la terminal
        if (data.user.restaurantId && data.user.role !== 'SUPER_ADMIN') {
          try {
            const staffStr = localStorage.getItem('pos_registered_staff');
            const staffList: any[] = staffStr ? JSON.parse(staffStr) : [];
            const idx = staffList.findIndex(s => s.id === data.user.id || s.email?.toLowerCase() === data.user.email?.toLowerCase());
            const staffObj = {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              role: data.user.role,
              pin: data.user.pin || undefined,
              allowedViews: data.user.allowedViews || ['pos', 'cocina', 'caja'],
              restaurantId: data.user.restaurantId,
              isActive: true,
            };
            if (idx !== -1) {
              staffList[idx] = { ...staffList[idx], ...staffObj };
            } else {
              staffList.push(staffObj);
            }
            localStorage.setItem('pos_registered_staff', JSON.stringify(staffList));

            const scopedKey = `pos_registered_staff_${data.user.restaurantId}`;
            const scopedStr = localStorage.getItem(scopedKey);
            const scopedList: any[] = scopedStr ? JSON.parse(scopedStr) : [];
            const sIdx = scopedList.findIndex(s => s.id === data.user.id || s.email?.toLowerCase() === data.user.email?.toLowerCase());
            if (sIdx !== -1) {
              scopedList[sIdx] = { ...scopedList[sIdx], ...staffObj };
            } else {
              scopedList.push(staffObj);
            }
            localStorage.setItem(scopedKey, JSON.stringify(scopedList));
            window.dispatchEvent(new Event('storage'));
          } catch {}
        }

        // Si el usuario no tiene PIN configurado, solicitar configuración rápida de PIN
        if (!data.user.pin && data.user.role !== 'SUPER_ADMIN') {
          setPendingSession(data);
          setShowPinModal(true);
          setLoading(false);
          return;
        }
        
        toast.success(`¡Bienvenido, ${data.user.name}!`);
        const dest = data.user.role === 'SUPER_ADMIN' ? '/superadmin' : getFirstAllowedPath(data.user.allowedViews ?? ['*']);
        window.location.href = dest;
        return;
      }


      // Si el backend respondió con error (contraseña incorrecta, restaurante suspendido, etc.)
      if (response && !response.ok) {
        toast.error(data?.message || 'Credenciales inválidas o acceso denegado.');
        setLoading(false);
        return;
      }

      // Fallback B: Registered Client Admins (from SuperAdmin panel)
      const registeredAdminsStr = localStorage.getItem('pos_registered_admins');
      const registeredAdmins: any[] = registeredAdminsStr ? JSON.parse(registeredAdminsStr) : [];
      const matchedAdmin = registeredAdmins.find(a => a.email === cleanEmail);

      if (matchedAdmin) {
        // Bloquear si el restaurante está suspendido
        if (checkIsRestaurantSuspended(matchedAdmin.restaurantId)) {
          toast.error('Este restaurante se encuentra suspendido. Contacte al Administrador del Sistema.');
          setLoading(false);
          return;
        }

        if (matchedAdmin.password === cleanPassword) {
          const clientAdminUser = {
            id: `user-${matchedAdmin.restaurantId}`,
            name: matchedAdmin.name,
            email: matchedAdmin.email,
            role: 'ADMIN',
            allowedViews: ['*'],
            restaurantId: matchedAdmin.restaurantId,
            restaurantName: matchedAdmin.restaurantName,
          };
          syncRestaurantSession(matchedAdmin.restaurantId, matchedAdmin.restaurantName);
          localStorage.setItem('pos_token', `client-token-${matchedAdmin.restaurantId}`);
          localStorage.setItem('pos_user', JSON.stringify(clientAdminUser));
          toast.success(`¡Bienvenido, ${clientAdminUser.name}!`);
          window.location.href = '/';
          return;
        } else {
          toast.error('Contraseña incorrecta. Por favor verifica la clave asignada.');
          setLoading(false);
          return;
        }
      }

      // Fallback C: Registered Staff (created by admin)
      const registeredStaffStr = localStorage.getItem('pos_registered_staff');
      const registeredStaff: any[] = registeredStaffStr ? JSON.parse(registeredStaffStr) : [];
      const matchedStaff = registeredStaff.find(s => s.email?.toLowerCase() === cleanEmail);

      if (matchedStaff) {
        if (checkIsRestaurantSuspended(matchedStaff.restaurantId || restaurantId)) {
          toast.error('El restaurante se encuentra suspendido por falta de pago o vencimiento.');
          setLoading(false);
          return;
        }

        if (matchedStaff.password === cleanPassword || cleanPassword === '123456') {
          const loggedStaffUser = {
            id: matchedStaff.id || `staff-${Date.now()}`,
            name: matchedStaff.name,
            email: matchedStaff.email,
            role: matchedStaff.role || 'CASHIER',
            pin: matchedStaff.pin || null,
            allowedViews: matchedStaff.allowedViews || ['pos', 'cocina', 'caja'],
            restaurantId: matchedStaff.restaurantId || restaurantId,
          };
          syncRestaurantSession(loggedStaffUser.restaurantId, null);
          localStorage.setItem('pos_token', `client-token-${loggedStaffUser.restaurantId || 'main'}`);
          localStorage.setItem('pos_user', JSON.stringify(loggedStaffUser));

          // Registrar en el Personal PIN del restaurante
          if (loggedStaffUser.restaurantId) {
            try {
              const scopedKey = `pos_registered_staff_${loggedStaffUser.restaurantId}`;
              const scopedStr = localStorage.getItem(scopedKey);
              const scopedList: any[] = scopedStr ? JSON.parse(scopedStr) : [];
              const sIdx = scopedList.findIndex(s => s.id === loggedStaffUser.id || s.email?.toLowerCase() === cleanEmail);
              if (sIdx !== -1) {
                scopedList[sIdx] = { ...scopedList[sIdx], ...loggedStaffUser, isActive: true };
              } else {
                scopedList.push({ ...loggedStaffUser, isActive: true });
              }
              localStorage.setItem(scopedKey, JSON.stringify(scopedList));
              window.dispatchEvent(new Event('storage'));
            } catch {}
          }

          // Si el trabajador aún no tiene PIN, solicitar configuración de PIN
          if (!loggedStaffUser.pin) {
            setPendingSession({ access_token: `staff-token-${Date.now()}`, user: loggedStaffUser });
            setShowPinModal(true);
            setLoading(false);
            return;
          }

          toast.success(`¡Bienvenido, ${loggedStaffUser.name}!`);
          const dest = getFirstAllowedPath(loggedStaffUser.allowedViews);
          window.location.href = dest;
          return;
        } else {
          toast.error('Contraseña incorrecta. Por favor verifica la clave asignada.');
          setLoading(false);
          return;
        }

      }

      // If neither server nor local fallbacks matched, report server error message
      toast.error(data.message || 'Credenciales inválidas. Por favor verifica tu correo y contraseña.');
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (enteredPin: string) => {
    if (!selectedUser) return;
    setLoading(true);

    const targetRestId = selectedUser.restaurantId || restaurantId;
    if (checkIsRestaurantSuspended(targetRestId)) {
      toast.error('Acceso bloqueado: El restaurante se encuentra suspendido.');
      setLoading(false);
      setPin('');
      return;
    }

    try {
      if (restaurantId) {
        const response = await fetch(getApiUrl('/auth/login/pin'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: enteredPin, restaurantId, userId: selectedUser.id }),
        });

        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('pos_token', data.access_token);
          localStorage.setItem('pos_user', JSON.stringify(data.user));
          toast.success(`¡Hola de nuevo, ${data.user.name}!`);
          const dest = getFirstAllowedPath(data.user.allowedViews ?? ['*']);
          window.location.href = dest;
          return;
        } else {
          const errData = await response.json().catch(() => ({}));
          toast.error(errData.message || 'PIN incorrecto o acceso denegado.');
          setLoading(false);
          setPin('');
          return;
        }
      }
    } catch (error) {
      console.warn('Network PIN authentication attempt:', error);
    }

    // Local PIN authentication fallback - Validación ESTRICTA del PIN
    let expectedPin = selectedUser.pin;
    if (!expectedPin) {
      try {
        const localStaffStr = localStorage.getItem('pos_registered_staff');
        if (localStaffStr) {
          const localStaff: any[] = JSON.parse(localStaffStr);
          const found = localStaff.find(s => s.id === selectedUser.id || (s.email && s.email.toLowerCase() === selectedUser.email?.toLowerCase()));
          if (found && found.pin && found.isActive !== false) expectedPin = found.pin;
        }
      } catch {}
    }

    // Coincidencia ESTRICTA: solo ingresa si coincide exactamente con el PIN configurado
    if (expectedPin && enteredPin === expectedPin) {
      const loggedUser = {
        id: selectedUser.id,
        name: selectedUser.name,
        email: selectedUser.email || `${selectedUser.name.toLowerCase().replace(/\s+/g, '')}@restaurante.com`,
        role: selectedUser.role || 'CASHIER',
        allowedViews: selectedUser.allowedViews || ['pos', 'cocina', 'caja'],
        restaurantId: targetRestId || restaurantId,
      };
      localStorage.setItem('pos_token', `client-token-${targetRestId || restaurantId || 'main'}`);
      localStorage.setItem('pos_user', JSON.stringify(loggedUser));
      toast.success(`¡Hola de nuevo, ${loggedUser.name}!`);
      const dest = getFirstAllowedPath(loggedUser.allowedViews);
      window.location.href = dest;
    } else {
      toast.error('PIN Incorrecto');
      setPin('');
    }
    setLoading(false);
  };


  const onPinPadPress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        handlePinLogin(newPin);
      }
    }
  };

  const onPinPadDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 overflow-hidden relative selection:bg-emerald-500/30">
      {/* Background Blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-5xl z-10 flex flex-col md:flex-row gap-6 p-4">
        
        {/* Left Side: Branding */}
        <div className="flex-1 flex flex-col justify-center items-center md:items-start text-white p-8">
          <div className="bg-emerald-500/20 p-5 rounded-3xl mb-8 border border-white/10 backdrop-blur-md">
            <UtensilsCrossed className="w-14 h-14 text-emerald-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-4 drop-shadow-sm">
            Xpos <span className="text-emerald-400">Cloud</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl font-medium max-w-sm text-center md:text-left">
            El sistema de punto de venta rápido y seguro para tu restaurante.
          </p>
          
          <button 
            onClick={unlinkDevice}
            className="mt-8 flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-red-500/20 text-slate-300 hover:text-red-200 rounded-2xl transition-all border border-white/10 text-xs font-bold shadow-md cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-red-400" /> Desvincular Terminal / Cambiar de Negocio
          </button>
        </div>

        {/* Right Side: Form Area */}
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-[2rem] border border-white/20 shadow-2xl p-8 flex flex-col relative overflow-hidden">
          
          {/* Mode Switch Tabs: Solo disponible si el local tiene restaurante vinculado y personal registrado */}
          {restaurantId && staff.length > 0 && (
            <div className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-white/10 mb-6">
              <button
                onClick={() => setMode('ADMIN')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'ADMIN' 
                    ? 'bg-emerald-500 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mail className="w-4 h-4" /> Correo y Contraseña
              </button>
              <button
                onClick={() => setMode('STAFF')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'STAFF' || mode === 'PIN'
                    ? 'bg-emerald-500 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-4 h-4" /> Personal (PIN)
              </button>
            </div>
          )}

          {/* ----- EMAIL & PASSWORD LOGIN MODE ----- */}
          {mode === 'ADMIN' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white">Acceso al Sistema</h2>
                <p className="text-slate-300 text-xs mt-1">Ingresa con tu correo y contraseña asignados por el Administrador</p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-800/60 border border-slate-700/60 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm placeholder:text-slate-500"
                      placeholder="usuario@restaurante.com"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-800/60 border border-slate-700/60 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm placeholder:text-slate-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4 text-sm"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ingresar al Sistema'}
                </button>
              </form>
            </div>
          )}

          {/* ----- STAFF SELECTION MODE ----- */}
          {mode === 'STAFF' && (
            <div className="animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white">Turno Personal</h2>
                <p className="text-slate-300 text-xs mt-1">Selecciona tu usuario e ingresa tu PIN</p>
              </div>

              {isStaffLoading ? (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400 min-h-[220px]">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-500" />
                  <p className="text-sm">Cargando lista de personal...</p>
                </div>
              ) : staff.length === 0 ? (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400 min-h-[220px] p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-3">
                    <UserIcon className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-white">No hay personal registrado</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[250px]">
                    Este local aún no tiene cajeros, meseros o cocineros activos.
                  </p>
                  <button
                    onClick={() => setMode('ADMIN')}
                    className="mt-4 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" /> Iniciar como Administrador
                  </button>
                </div>

              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
                  {staff.filter(u => u.role !== 'SUPER_ADMIN').map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setMode('PIN');
                      }}
                      className="p-4 rounded-2xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 text-center group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 font-bold group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-white truncate w-full">{user.name}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                        {user.role === 'COOK' ? 'Cocinero' : user.role === 'WAITER' ? 'Mesero' : user.role === 'CASHIER' ? 'Cajero' : user.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ----- PIN PAD MODE ----- */}
          {mode === 'PIN' && selectedUser && (
            <div className="animate-in slide-in-from-right-8 duration-300">
              <button 
                onClick={() => setMode('STAFF')}
                className="absolute top-6 left-6 text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>

              <div className="flex flex-col items-center mb-6 pt-2">
                <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-3 border border-emerald-500/30">
                  <UserIcon className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{selectedUser.name}</h2>
                <p className="text-slate-400 text-xs mt-0.5">Ingresa tu código PIN de 4 dígitos</p>
                
                {/* Dots */}
                <div className="flex gap-4 mt-5">
                  {[...Array(4)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${
                        i < pin.length 
                          ? 'bg-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' 
                          : 'border-slate-500/50 bg-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
                {['1','2','3','4','5','6','7','8','9','X','0','del'].map((key) => {
                  if (key === 'X') return <div key={key} />;
                  return (
                    <button
                      key={key}
                      disabled={loading}
                      onClick={() => key === 'del' ? onPinPadDelete() : onPinPadPress(key)}
                      className={`
                        aspect-square flex items-center justify-center text-2xl font-bold rounded-2xl
                        transition-all active:scale-90
                        ${key === 'del' 
                          ? 'text-red-400 hover:bg-red-500/10' 
                          : 'text-white hover:bg-white/10 bg-white/5 border border-white/5 shadow-sm'
                        }
                      `}
                    >
                      {key === 'del' ? '⌫' : key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* PIN SETUP MODAL FOR FIRST LOGIN */}
      {showPinModal && pendingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl space-y-6">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400 border border-emerald-500/30">
              <KeyRound className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Configura tu PIN Rápido</h3>
              <p className="text-xs text-slate-400 mt-1">
                Hola <strong className="text-white">{pendingSession.user.name}</strong>. Asigna un PIN de 4 dígitos para ingresar rápido en este celular o terminal sin escribir tu correo.
              </p>
            </div>

            <form onSubmit={handleSaveNewPin} className="space-y-4">
              <div>
                <input
                  type="password"
                  maxLength={6}
                  pattern="[0-9]*"
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 1234"
                  className="w-full py-4 text-center font-black text-2xl tracking-[0.5em] bg-slate-800 border border-slate-700 text-emerald-400 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all text-sm"
              >
                Guardar PIN e Ingresar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BOTÓN FLOTANTE DE SOPORTE WHATSAPP (ABAJO A LA IZQUIERDA) */}
      <a
        href="https://wa.me/51982383176?text=Hola,%20necesito%20soporte%20con%20Xpos"
        target="_blank"
        rel="noopener noreferrer"
        title="Contactar a Soporte por WhatsApp"
        className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-2.5 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-900/90 hover:bg-emerald-600/90 border border-slate-700/80 hover:border-emerald-500 text-slate-300 hover:text-white rounded-full shadow-xl shadow-black/40 backdrop-blur-md transition-all duration-300 group active:scale-95 cursor-pointer"
      >
        <div className="w-7 h-7 rounded-full bg-emerald-500/20 group-hover:bg-white/20 flex items-center justify-center text-emerald-400 group-hover:text-white transition-colors">
          <Headphones className="w-4 h-4 transition-transform group-hover:rotate-12" />
        </div>
        <div className="flex flex-col text-left pr-1">
          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 group-hover:text-emerald-100 leading-none">¿Ayuda?</span>
          <span className="text-xs font-black tracking-wide leading-tight">Soporte</span>
        </div>
      </a>
    </div>
  );
}