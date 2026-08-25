'use client';

import Link from 'next/link';
import { UtensilsCrossed, ArrowLeft, ShieldCheck, PhoneCall } from 'lucide-react';

export default function RegisterPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700 p-8 text-center">
        
        <div className="flex flex-col items-center mb-6">
          <div className="bg-emerald-500/20 p-4 rounded-2xl mb-4 border border-emerald-500/30">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Acceso a Xpos SaaS</h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">
            El registro público está desactivado. Las cuentas de restaurante son creadas por el equipo de administración al adquirir una suscripción.
          </p>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 mb-6 text-left space-y-2 text-xs text-slate-300">
          <p className="font-bold text-emerald-400 flex items-center gap-1.5 text-sm">
            <UtensilsCrossed className="w-4 h-4" /> ¿Deseas contratar el servicio?
          </p>
          <p>
            Ponte en contacto con nuestro equipo comercial para activar tu restaurante en minutos con tu plan preferido.
          </p>
        </div>

        <Link 
          href="/login"
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al Inicio de Sesión
        </Link>
      </div>
    </div>
  );
}