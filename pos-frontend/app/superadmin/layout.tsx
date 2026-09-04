'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, UtensilsCrossed, Shield, ShieldCheck, LayoutDashboard } from 'lucide-react';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userName, setUserName] = useState('Super Administrador');
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    const userStr = localStorage.getItem('pos_user');

    // Si no hay token o es el token mock antiguo o no hay usuario en sesión
    if (!token || token === 'superadmin-token-master' || !userStr) {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      setIsAuthorized(false);
      router.replace('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'SUPER_ADMIN') {
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_user');
        setIsAuthorized(false);
        router.replace('/login');
        return;
      }
      setUserName(user.name || 'Super Administrador');
      setIsAuthorized(true);
    } catch {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      setIsAuthorized(false);
      router.replace('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_restaurant_id');
    localStorage.removeItem('pos_restaurant_config');
    router.replace('/login');
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-emerald-400 font-bold">
          <Shield className="w-6 h-6 animate-pulse" /> Verificando autorización de seguridad...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col w-full bg-slate-50 font-sans text-slate-900">
      {/* Navbar Superior */}
      <header className="min-h-16 bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 sm:px-6 shrink-0 shadow-md z-20 gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30">
            <UtensilsCrossed className="w-5 h-5 text-emerald-400" />
          </div>
          <h1 className="text-lg sm:text-xl font-black tracking-tight">Xpos <span className="font-light text-emerald-400">SaaS Control</span></h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-between sm:justify-end w-full sm:w-auto">
          <Link
            href="/"
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 sm:gap-2"
          >
            <LayoutDashboard className="w-4 h-4 text-emerald-400" />
            Ver POS
          </Link>

          <div className="hidden sm:block h-8 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex flex-col items-start sm:items-end">
              <span className="text-xs sm:text-sm font-bold">{userName}</span>
              <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-emerald-400">Super Admin</span>
            </div>
          </div>

          <div className="h-6 sm:h-8 w-px bg-slate-700" />

          <button onClick={handleLogout} className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1.5 text-xs sm:text-sm font-bold">
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 w-full overflow-y-auto p-4 sm:p-6 md:p-8 relative">
        <div className="max-w-7xl mx-auto w-full h-full">
           {children}
        </div>
      </main>
    </div>
  );
}
