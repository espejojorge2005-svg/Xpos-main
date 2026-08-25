'use client';

import { useState } from 'react';
import { Mail, Lock, Check } from 'lucide-react';
import { toast } from 'sonner';

export function SuperAdminProfile() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email && !password) {
      toast.info('No hay cambios para guardar');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('pos_token');
      const payload: any = {};
      if (email) payload.email = email;
      if (password) payload.password = password;

      const res = await fetch('/api/v1/users/profile/superadmin', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Error al actualizar');

      toast.success('Perfil actualizado correctamente. Por seguridad, cierra sesión e ingresa nuevamente.');
      setPassword('');
      setEmail('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
      <div className="mb-8">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mi Perfil (Acceso Maestro)</h2>
        <p className="text-slate-500 font-medium mt-1">Actualiza tus credenciales maestras. Tendrás que volver a iniciar sesión.</p>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 ml-1">Nuevo Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Dejar en blanco para no cambiar..."
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 ml-1">Nueva Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Dejar en blanco para no cambiar..."
                minLength={6}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 text-sm font-medium" 
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button 
            type="submit" 
            disabled={isSubmitting || (!email && !password)}
            className="px-8 py-3.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? 'Procesando...' : <><Check className="w-4 h-4" /> Guardar Cambios</>}
          </button>
        </div>
      </form>
    </div>
  );
}
