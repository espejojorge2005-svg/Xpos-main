'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, Lock, Mail, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Ajusta esta URL si tu endpoint de registro en NestJS es diferente
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('¡Usuario creado con éxito! Ahora puedes iniciar sesión.');
        router.push('/login'); // Te manda al login para que pruebes las credenciales
      } else {
        toast.error(data.message || 'Error al registrar el usuario');
      }
    } catch (error) {
      toast.error('Error al conectar con el servidor backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
        
        <div className="flex flex-col items-center mb-8">
          <div className="bg-emerald-100 p-4 rounded-2xl mb-4">
            <UtensilsCrossed className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nuevo Usuario</h1>
          <p className="text-slate-500 font-medium">Únete a Xpos Huanchaco</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          {/* Campo Nombre */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Nombre Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
                placeholder="Ej. Xander Admin"
              />
            </div>
          </div>

          {/* Campo Email */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
                placeholder="nuevo@restaurante.com"
              />
            </div>
          </div>

          {/* Campo Contraseña */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Botón Registrar */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Crear Cuenta'
            )}
          </button>
        </form>
        
        {/* Botón para volver al Login */}
        <div className="mt-6 text-center">
            <button 
                onClick={() => router.push('/login')}
                className="text-sm text-emerald-600 font-bold hover:underline"
            >
                ¿Ya tienes cuenta? Inicia sesión aquí
            </button>
        </div>
      </div>
    </div>
  );
}