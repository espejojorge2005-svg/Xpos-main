'use client';

import { clearCurrentRestaurantData } from '@/utils/storage';
import { getApiUrl } from '@/utils/api';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Calculator, Package, Settings, UtensilsCrossed, LogOut, ChefHat, Users, Table2, BarChart3, Shield, Flame, ClipboardList, Menu, X, Layers, History, Sparkles, Headphones } from 'lucide-react';

interface RestaurantConfig {
  name: string;
  slogan?: string;
  logoUrl?: string;
}

const ALL_MENU_ITEMS = [
  { key: 'pos',           name: 'Plano de Sala',   icon: LayoutDashboard, path: '/' },
  { key: 'asistente_ia',  name: 'Asistente IA ✨', icon: Sparkles,        path: '#ai' },
  { key: 'cocina',        name: 'Monitor Cocina',  icon: ChefHat,         path: '/cocina' },
  { key: 'caja',          name: 'Cierre de Caja',  icon: Calculator,      path: '/report' },
  { key: 'inventario',    name: 'Inventario',       icon: Package,         path: '/inventory' },
  { key: 'categorias',    name: 'Categorías',       icon: Layers,          path: '/inventory/categories' },
  { key: 'areas',         name: 'Áreas de Prep.',    icon: Flame,           path: '/inventory/stations' },
  { key: 'kardex',        name: 'Kardex Stock',     icon: History,         path: '/inventory/kardex' },
  { key: 'analytics',     name: 'Reporte',          icon: BarChart3,       path: '/analytics' },
  { key: 'configuracion', name: 'Configuración',    icon: Settings,        path: '/settings' },
  { key: 'usuarios',      name: 'Usuarios',         icon: Users,           path: '/users' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [config, setConfig] = useState<RestaurantConfig>({ name: 'Xpos' });
  const [allowedViews, setAllowedViews] = useState<string[]>([]);
  const [role, setRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Load restaurant config
  useEffect(() => {
    setIsMounted(true);
    const cached = localStorage.getItem('pos_restaurant_config');
    if (cached) { try { setConfig(JSON.parse(cached)); } catch { /* ignore */ } }

    const userStr = localStorage.getItem('pos_user');
    let userRole = '';
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setAllowedViews(user.allowedViews ?? []);
        userRole = user.role ?? '';
        setRole(userRole);
        setUserName(user.name ?? '');
        if (user.restaurantName && (config.name === 'Xpos' || !config.name)) {
          setConfig(prev => ({ ...prev, name: user.restaurantName }));
        }
      } catch { /* ignore */ }
    } else {
      setAllowedViews([]);
      setRole('');
      setUserName('');
    }

    // Only fetch restaurant config from backend if not cached or logged in as restaurant ADMIN
    if (userRole === 'ADMIN' && !cached) {
      const fetchConfig = async () => {
        try {
          const token = localStorage.getItem('pos_token');
          const res = await fetch(getApiUrl('/restaurant-config'), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data: RestaurantConfig = await res.json();
            if (data.name) {
              setConfig(data);
              localStorage.setItem('pos_restaurant_config', JSON.stringify(data));
            }
          }
        } catch { /* ignore */ }
      };
      fetchConfig();
    }

    // Listen for storage events (settings page updates config)
    const onStorage = () => {
      const updated = localStorage.getItem('pos_restaurant_config');
      if (updated) { try { setConfig(JSON.parse(updated)); } catch { /* ignore */ } }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!isMounted) return null;
  const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
  if (!token) return null;
  if (pathname === '/login' || pathname === '/register' || pathname.startsWith('/superadmin')) return null;

  // Filter menu: ADMIN ('*') sees everything, others see only their allowed views (CASHIER has caja by default)
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN' || allowedViews.includes('*');
  const menuItems = ALL_MENU_ITEMS.filter(item => 
    isAdmin || 
    allowedViews.includes(item.key) || 
    (role === 'CASHIER' && item.key === 'caja')
  );

  const ROLE_UI: Record<string, any> = {
    SUPER_ADMIN: { label: 'Super Admin', bg: 'bg-violet-50 border-violet-100', text: 'text-violet-600', icon: Shield },
    ADMIN:       { label: 'Administrador', bg: 'bg-violet-50 border-violet-100', text: 'text-violet-600', icon: Shield },
    CASHIER:     { label: 'Cajero/a',     bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600', icon: Calculator },
    WAITER:      { label: 'Mesero/a',     bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-600', icon: ClipboardList },
    COOK:        { label: 'Cocinero',     bg: 'bg-amber-50 border-amber-100', text: 'text-amber-600', icon: ChefHat }
  };

  const handleLogout = () => {
    clearCurrentRestaurantData();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 z-30 shrink-0 shadow-xs relative print:hidden h-14">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center overflow-hidden shrink-0 border border-emerald-100">
            {config.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
            ) : (
              <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <h2 className="text-base font-black text-slate-900 tracking-tight truncate">{config.name || 'Xpos'}</h2>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Backdrop overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-xs md:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar (drawer on mobile, static side column on desktop) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 md:static md:z-auto
        w-72 max-w-[85vw] md:w-64 bg-white border-r border-slate-200 flex flex-col h-full shadow-2xl md:shadow-none
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        print:hidden
      `}>
        {/* Logo / Restaurant name (Header in drawer) */}
        <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-emerald-50 flex items-center justify-center overflow-hidden shrink-0 border border-emerald-100">
              {config.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <UtensilsCrossed className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight truncate">{config.name || 'Xpos'}</h2>
              {config.slogan && (
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{config.slogan}</p>
              )}
            </div>
          </div>
          {/* Mobile close button inside drawer */}
          <button 
            onClick={() => setIsOpen(false)}
            className="md:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isAi = item.key === 'asistente_ia';
            const isActive = !isAi && (pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path)));
            const Icon = item.icon;

            if (isAi) {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    window.dispatchEvent(new Event('pos:open_ai_assistant'));
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all active:scale-95 text-violet-700 bg-violet-50/70 hover:bg-violet-100/80 border border-violet-100 shadow-xs"
                >
                  <Icon className="w-5 h-5 text-violet-600 animate-pulse" />
                  <span>{item.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all active:scale-95 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100/50'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

      {/* SuperAdmin Access Link */}
      {isMounted && role === 'SUPER_ADMIN' && (
        <div className="px-4 pb-2">
          <Link
            href="/superadmin"
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold bg-slate-900 text-emerald-400 hover:bg-slate-800 transition-all text-xs shadow-sm border border-slate-700"
          >
            <Shield className="w-4 h-4 text-emerald-400" />
            Panel SuperAdmin SaaS
          </Link>
        </div>
      )}

      {/* User / Role badge */}
      {isMounted && role && ROLE_UI[role] && (
        <div className="px-4 pb-2">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${ROLE_UI[role].bg}`}>
            <div className={`p-1.5 bg-white rounded-lg shadow-sm ${ROLE_UI[role].text}`}>
              {(() => {
                const RoleIcon = ROLE_UI[role].icon;
                return <RoleIcon className="w-4 h-4" />;
              })()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`text-[10px] font-black uppercase tracking-widest ${ROLE_UI[role].text} truncate leading-tight`}>
                {ROLE_UI[role].label}
              </span>
              <span className="text-[11px] font-bold text-slate-700 truncate leading-tight mt-0.5">
                {userName}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Soporte WhatsApp (Exclusivo Administradores) & Logout */}
      <div className="p-4 border-t border-slate-100 space-y-2">
        {isMounted && (role === 'ADMIN' || role === 'SUPER_ADMIN') && (
          <a
            href="https://wa.me/51982383176?text=Hola,%20soy%20administrador%20en%20Xpos%20y%20necesito%20soporte"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl font-bold text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200/60 transition-all active:scale-95 text-xs group shadow-xs cursor-pointer"
            title="Contactar soporte por WhatsApp"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 flex items-center justify-center text-emerald-600 transition-colors shrink-0">
              <Headphones className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-black tracking-widest text-emerald-600 leading-none">¿Ayuda técnica?</span>
              <span className="text-xs font-black tracking-wide leading-tight mt-0.5">Ayuda Soporte</span>
            </div>
          </a>
        )}

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-transparent transition-all active:scale-95"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </button>
      </div>

      <div className="pb-6 pt-2 text-center">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          Xpos Cloud v1.0
        </p>
      </div>
    </aside>
    </>
  );
}