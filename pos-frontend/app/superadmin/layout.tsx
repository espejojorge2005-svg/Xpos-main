'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, LogOut, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.replace('/login');
      return;
    }
    
    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'SUPER_ADMIN') {
        router.replace('/'); // Redirigir al POS si no es superadmin
      } else {
        setUserName(user.name);
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex flex-col w-full bg-slate-50 font-sans text-slate-900">
      {/* Navbar Superior */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 shadow-md z-20">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl">
            <UtensilsCrossed className="w-5 h-5 text-emerald-400" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Xpos <span className="font-light text-emerald-400">SaaS Control</span></h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold">{userName}</span>
            <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400">Super Admin</span>
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
