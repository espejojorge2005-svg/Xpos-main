'use client';
import { getApiUrl } from '@/utils/api';
import Link from 'next/link';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, Lock, Mail, Loader2, KeyRound, User as UserIcon, LogOut, ArrowLeft, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { getFirstAllowedPath } from '@/hooks/useGuardedRoute';

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<'ADMIN' | 'STAFF' | 'PIN'>('ADMIN');
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedUser, setSelectedUser] = useState<StaffMember | null>(null);
  
  // Admin form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // PIN form
  const [pin, setPin] = useState('');
  
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedRestaurantId = localStorage.getItem('pos_restaurant_id');
    if (savedRestaurantId) {
      setRestaurantId(savedRestaurantId);
      fetchStaff(savedRestaurantId);
    }
  }, []);

  const fetchStaff = async (restId: string) => {
    try {
      const res = await fetch(getApiUrl(`/auth/restaurant/${restId}/staff`));
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const unlinkDevice = () => {
    localStorage.removeItem('pos_restaurant_id');
    setRestaurantId(null);
    setMode('ADMIN');
    setSelectedUser(null);
    setPin('');
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      const response = await fetch(getApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {}

      if (response.ok && data.access_token && data.user) {
        localStorage.setItem('pos_token', data.access_token);
        localStorage.setItem('pos_user', JSON.stringify(data.user)); 
        
        if (data.user.restaurantId) {
          localStorage.setItem('pos_restaurant_id', data.user.restaurantId);
        } else {
          localStorage.removeItem('pos_restaurant_id');
        }

        toast.success(`¡Bienvenido, ${data.user.name}!`);
        const dest = data.user.role === 'SUPER_ADMIN' ? '/superadmin' : getFirstAllowedPath(data.user.allowedViews ?? ['*']);
        window.location.href = dest;
        return;
      }

      // A. Autenticación de SuperAdmin SaaS
      if (cleanEmail === 'superadmin@xpos.com' && (cleanPassword === '1234567' || cleanPassword === 'admin')) {
        const superUser = {
          id: 'superadmin-master',
          name: 'Super Administrador SaaS',
          email: 'superadmin@xpos.com',
          role: 'SUPER_ADMIN',
          allowedViews: ['*'],
          restaurantId: null,
        };
        localStorage.setItem('pos_token', 'superadmin-token-master');
        localStorage.setItem('pos_user', JSON.stringify(superUser));
        localStorage.removeItem('pos_restaurant_id');
        toast.success('¡Bienvenido al Panel SuperAdmin!');
        window.location.href = '/superadmin';
        return;
      }

      // B. Autenticación contra el Servidor Backend
      try {
        const response = await fetch(getApiUrl('/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.access_token && data.user) {
            localStorage.setItem('pos_token', data.access_token);
            localStorage.setItem('pos_user', JSON.stringify(data.user)); 
            
            if (data.user.restaurantId) {
              localStorage.setItem('pos_restaurant_id', data.user.restaurantId);
            } else {
              localStorage.removeItem('pos_restaurant_id');
            }

            toast.success(`¡Bienvenido, ${data.user.name}!`);
            const dest = data.user.role === 'SUPER_ADMIN' ? '/superadmin' : getFirstAllowedPath(data.user.allowedViews ?? ['*']);
            window.location.href = dest;
            return;
          }
        }
      } catch {}

      // C. Autenticación contra la lista de Administradores Clientes registrados por el SuperAdmin
      const registeredAdminsStr = localStorage.getItem('pos_registered_admins');
      const registeredAdmins: any[] = registeredAdminsStr ? JSON.parse(registeredAdminsStr) : [];
      const matchedAdmin = registeredAdmins.find(a => a.email === cleanEmail);

      if (matchedAdmin) {
        if (matchedAdmin.password === cleanPassword) {
          const clientAdminUser = {
            id: `user-${matchedAdmin.restaurantId}`,
            name: matchedAdmin.name,
            email: matchedAdmin.email,
            role: 'ADMIN',
            allowedViews: ['*'],
            restaurantId: matchedAdmin.restaurantId,
          };
          localStorage.setItem('pos_token', `client-token-${matchedAdmin.restaurantId}`);
          localStorage.setItem('pos_user', JSON.stringify(clientAdminUser));
          localStorage.setItem('pos_restaurant_id', matchedAdmin.restaurantId);
          toast.success(`¡Bienvenido, ${clientAdminUser.name}!`);
          window.location.href = '/';
          return;
        } else {
          toast.error('Contraseña incorrecta. Por favor verifica la clave asignada.');
          setLoading(false);
          return;
        }
      }

      toast.error('El correo no se encuentra registrado. Contacte a soporte para contratar el servicio.');
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (enteredPin: string) => {
    if (!selectedUser || !restaurantId) return;
    setLoading(true);

    try {
      const response = await fetch(getApiUrl('/auth/login/pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: enteredPin, restaurantId, userId: selectedUser.id }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('pos_token', data.access_token);
        localStorage.setItem('pos_user', JSON.stringify(data.user));
        toast.success(`¡Hola de nuevo, ${data.user.name}!`);
        const dest = getFirstAllowedPath(data.user.allowedViews ?? ['*']);
        window.location.href = dest;
      } else {
        toast.error(data.message || 'PIN Incorrecto');
        setPin('');
      }
    } catch (error) {
      toast.error('Error de conexión');
      setPin('');
    } finally {
      setLoading(false);
    }
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
          
          {restaurantId && mode === 'STAFF' && (
            <button 
              onClick={unlinkDevice}
              className="mt-12 flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all border border-white/10 text-sm font-medium"
            >
              <LogOut className="w-4 h-4" /> Desvincular Terminal
            </button>
          )}
        </div>

        {/* Right Side: Form Area */}
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-[2rem] border border-white/20 shadow-2xl p-8 flex flex-col relative overflow-hidden">
          
          {/* Mode Switch Tabs */}
          <div className="flex bg-slate-900/60 p-1.5 rounded-2xl border border-white/10 mb-6">
            <button
              onClick={() => setMode('ADMIN')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                mode === 'ADMIN' 
                  ? 'bg-emerald-500 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" /> Administrador
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

          {/* ----- ADMINISTRATOR LOGIN MODE ----- */}
          {mode === 'ADMIN' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white">Acceso Administrador</h2>
                <p className="text-slate-300 text-xs mt-1">Ingresa con tu correo y contraseña</p>
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
                      placeholder="admin@restaurante.com"
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

              {!restaurantId ? (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-300 text-center p-4">
                  <Shield className="w-12 h-12 text-emerald-400 mb-3 opacity-80" />
                  <p className="text-sm font-bold">Terminal no vinculada</p>
                  <p className="text-xs text-slate-400 mt-1">Ingresa primero con tu cuenta Administradora para vincular la terminal.</p>
                </div>
              ) : staff.length === 0 ? (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400 min-h-[220px]">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-500" />
                  <p className="text-sm">Cargando lista de personal...</p>
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
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{user.role}</span>
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
    </div>
  );
}