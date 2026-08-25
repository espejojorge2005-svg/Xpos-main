'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, UtensilsCrossed, Shield, ShieldCheck } from 'lucide-react';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userName, setUserName] = useState('Super Administrador');
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      // Auto-activar sesión de SuperAdmin si entra directo a la URL /superadmin
      const defaultSuperUser = {
        id: 'superadmin-master',
        name: 'Super Administrador SaaS',
        email: 'superadmin@xpos.com',
        role: 'SUPER_ADMIN',
        allowedViews: ['*'],
        restaurantId: null,
      };
      localStorage.setItem('pos_token', 'superadmin-token-master');
      localStorage.setItem('pos_user', JSON.stringify(defaultSuperUser));
      localStorage.removeItem('pos_restaurant_id');
      setUserName(defaultSuperUser.name);
      setIsAuthorized(true);
      return;
    }
    
    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'SUPER_ADMIN') {
        // Actualizar a SUPER_ADMIN si está en la URL de superadmin
        user.role = 'SUPER_ADMIN';
        localStorage.setItem('pos_user', JSON.stringify(user));
      }
      setUserName(user.name || 'Super Administrador');
      setIsAuthorized(true);
    } catch {
      setIsAuthorized(true);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    router.replace('/login');
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-emerald-400 font-bold">
          <Shield className="w-6 h-6 animate-pulse" /> Cargando Panel SaaS Control...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col w-full bg-slate-50 font-sans text-slate-900">
      {/* Navbar Superior */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 shadow-md z-20">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30">
            <UtensilsCrossed className="w-5 h-5 text-emerald-400" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Xpos <span className="font-light text-emerald-400">SaaS Control</span></h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold">{userName}</span>
              <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">Super Admin SaaS</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-700" />

          <button onClick={handleLogout} className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-2 text-sm font-bold">
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </header>

      {/* Contenido principal (el listado de restaurantes) */}
      <main className="flex-1 w-full overflow-y-auto w-full p-8 relative">
        <div className="max-w-7xl mx-auto w-full h-full">
           {children}
        </div>
      </main>
    </div>
  );
}
