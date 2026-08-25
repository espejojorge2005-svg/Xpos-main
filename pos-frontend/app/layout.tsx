import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Xpos - ',
  description: 'Sistema de gestión POS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      {/* El contenedor principal ahora divide la pantalla: Menú a la izquierda (o arriba en móvil), contenido al centro */}
      <body className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased">
        
        <Toaster position="top-right" richColors closeButton theme="light" />
        
        {/* Aquí está tu Menú Lateral restaurado */}
        <Sidebar />

        {/* El lado derecho donde cargan tus mesas y configuraciones */}
        <main className="flex-1 h-screen overflow-y-auto">
          {children}
        </main>
        
      </body>
    </html>
  );
}