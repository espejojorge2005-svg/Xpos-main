'use client';
import { getApiUrl } from '@/utils/api';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, Lock, Mail, Loader2, KeyRound, User as UserIcon, LogOut, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getFirstAllowedPath } from '@/hooks/useGuardedRoute';

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<'ADMIN' | 'STAFF' | 'PIN'>('STAFF');
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
      setMode('STAFF');
      fetchStaff(savedRestaurantId);
    } else {
      setMode('ADMIN');
    }
  }, []);

  const fetchStaff = async (restId: string) => {
    try {
      const res = await fetch('https://xpos-backend.onrender.com/api/v1/auth/restaurant/' + restId + '/staff');
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

    try {
      const response = await fetch(getApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Guardar token y usuario
        localStorage.setItem('pos_token', data.access_token);
        localStorage.setItem('pos_user', JSON.stringify(data.user)); 
        
        // Vincular restaurante
        if (data.user.restaurantId) {
          localStorage.setItem('pos_restaurant_id', data.user.restaurantId);
        }

        toast.success(`¡Bienvenido, ${data.user.name}!`);
        if (data.user.role === 'SUPER_ADMIN') {
          router.push('/superadmin');
        } else {
          const dest = getFirstAllowedPath(data.user.allowedViews ?? ['*']);
          router.push(dest);
        }
      } else {
        toast.error(data.message || 'Credenciales incorrectas');
      }
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
      const response = await fetch('https://xpos-backend.onrender.com/api/v1/auth/login/pin', {
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
        router.push(dest);
      } else {
        toast.error(data.message || 'PIN Incorrecto');
        setPin(''); // Reset only on error
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
      {/* Dynamic Background Blurs */}
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

        {/* Right Side: Dynamic Form Area */}
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-[2rem] border border-white/20 shadow-2xl p-8 flex flex-col relative overflow-hidden">
          
          {/* ----- ADMINISTRATOR LOGIN MODE ----- */}
          {mode === 'ADMIN' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white">Acceso Administrativo</h2>
                <p className="text-slate-300 text-sm mt-2">Ingresa tus credenciales para configurar la terminal</p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-200">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-800/50 border border-slate-700/50 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-500"
                      placeholder="admin@restaurante.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-200">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-800/50 border border-slate-700/50 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ingresar'}
                </button>
              </form>
              
              {restaurantId && (
                <button 
                  onClick={() => setMode('STAFF')}
                  className="w-full mt-6 text-sm text-emerald-400 hover:text-emerald-300 font-medium text-center transition-colors"
                >
                  Volver al acceso de personal
                </button>
              )}
            </div>
          )}

          {/* ----- STAFF SELECTION MODE ----- */}
          {mode === 'STAFF' && (
            <div className="animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white">Turno Actual</h2>
                <p className="text-slate-300 text-sm mt-1">Selecciona tu usuario para ingresar</p>
              </div>

              {staff.length === 0 ? (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400 min-h-[300px]">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                  <p>Cargando personal...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {staff.filter(u => u.role !== 'SUPER_ADMIN').map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setPin('');
                        setMode('PIN');
                      }}
                      className="flex flex-col items-center justify-center p-4 bg-slate-800/40 hover:bg-slate-700/60 border border-white/5 hover:border-emerald-500/50 rounded-2xl transition-all active:scale-95 group"
                    >
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition-colors">
                        <UserIcon className="w-6 h-6 text-emerald-400" />
                      </div>
                      <span className="font-bold text-white text-sm truncate w-full text-center">{user.name}</span>
                      <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{
                        user.role === 'CASHIER' ? 'Cajero/a' : 
                        user.role === 'WAITER' ? 'Mesero/a' : 
                        'Administrador'
                      }</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-auto pt-6 border-t border-white/10 text-center">
                <button 
                  onClick={() => setMode('ADMIN')}
                  className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center justify-center w-full gap-2"
                >
                  <Lock className="w-4 h-4" /> Acceso Configuración
                </button>
              </div>
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

              <div className="flex flex-col items-center mb-8 pt-4">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/30">
                  <UserIcon className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">{selectedUser.name}</h2>
                <p className="text-slate-400 text-sm">Ingresa tu código PIN</p>
                
                {/* Dots */}
                <div className="flex gap-4 mt-6">
                  {[...Array(4)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                        i < pin.length 
                          ? 'bg-emerald-400 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' 
                          : 'border-slate-500/50 bg-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                {['1','2','3','4','5','6','7','8','9','X','0','del'].map((key) => {
                  if (key === 'X') return <div key={key} />;
                  return (
                    <button
                      key={key}
                      disabled={loading}
                      onClick={() => key === 'del' ? onPinPadDelete() : onPinPadPress(key)}
                      className={`
                        aspect-square flex items-center justify-center text-3xl font-medium rounded-full
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