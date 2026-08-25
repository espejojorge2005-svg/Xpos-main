'use client';
import { getApiUrl } from '@/utils/api';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, X, Loader2, Edit, UserX, UserCheck, Key, Shield, ChefHat, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

// All views available in the system
const ALL_VIEWS = [
  { key: 'pos',           label: 'Plano de Sala',   icon: '🪑' },
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
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   'bg-violet-100 text-violet-700',
  CASHIER: 'bg-blue-100 text-blue-700',
  WAITER:  'bg-emerald-100 text-emerald-700',
};

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CASHIER' | 'WAITER';
  isActive: boolean;
  allowedViews: string[];
  createdAt: string;
  pin?: string;
}

const emptyForm = {
  id: '',
  name: '',
  email: '',
  password: '',
  pin: '',
  role: 'CASHIER' as User['role'],
  allowedViews: ['pos', 'cocina'] as string[],
};

export default function UsersPage() {
  const router = useRouter();
  useGuardedRoute('usuarios');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const token = () => localStorage.getItem('pos_token');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/users'), {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
      } else {
        toast.error(data.error || data.message || 'Error al cargar usuarios');
      }
    } catch { toast.error('Error al cargar usuarios'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openCreate = () => { setForm({ ...emptyForm }); setShowModal(true); };
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
    const url = isEditing
      ? getApiUrl(`/users/${form.id}`)
      : getApiUrl('/users');
    const method = isEditing ? 'PATCH' : 'POST';

    const body: any = { name: form.name, email: form.email, role: form.role, allowedViews: form.allowedViews };
    if (form.password) body.password = form.password;
    if (form.pin) body.pin = form.pin;
    if (!isEditing) body.password = form.password; // required on create

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(isEditing ? 'Usuario actualizado' : 'Usuario creado');
        setShowModal(false);
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Error al guardar');
      }
    } catch { toast.error('Error de red'); }
    finally { setIsSaving(false); }
  };

  const handleToggleActive = async (u: User) => {
    const action = u.isActive ? 'desactivar' : 'activar';
    if (!confirm(`¿Estás seguro de ${action} al usuario ${u.name}?`)) return;
    try {
      const res = await fetch(getApiUrl(`/users/${u.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      if (res.ok) { toast.success(`Usuario ${u.isActive ? 'desactivado' : 'activado'}`); fetchUsers(); }
      else toast.error('Error al actualizar');
    } catch { toast.error('Error de red'); }
  };

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Users className="text-violet-600 w-8 h-8" />
            Usuarios
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-sm tracking-widest">
            Gestión de acceso al sistema
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-violet-200"
        >
          <Plus className="w-5 h-5" />
          Nuevo Usuario
        </button>
      </header>

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
                  className={`p-2 rounded-xl transition-colors ${u.isActive ? 'text-rose-400 hover:text-rose-600 hover:bg-rose-50' : 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                  title={u.isActive ? 'Desactivar' : 'Activar'}
                >
                  {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
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
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-slate-800 font-bold">
                    <option value="CASHIER">Cajero</option>
                    <option value="WAITER">Mesero</option>
                    <option value="ADMIN">Administrador</option>
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
