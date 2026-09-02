import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import Sidebar from '@/components/Sidebar';
import OrderNotificationListener from '@/components/OrderNotificationListener';
import AiChatbotDrawer from '@/components/AiChatbotDrawer';

export const metadata: Metadata = {
  title: 'Xpos - Sistema POS Cloud',
  description: 'Sistema de gestión POS para restaurantes',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased selection:bg-emerald-500 selection:text-white">
        
        <Toaster position="top-right" richColors closeButton theme="light" />
        <OrderNotificationListener />
        
        {/* Menú Lateral (Barra superior en móvil, barra lateral en escritorio) */}
        <Sidebar />

        {/* Asistente Inteligente ChefAI */}
        <AiChatbotDrawer />

        {/* Contenido dinámico */}
        <main className="flex-1 h-full min-h-0 overflow-y-auto w-full">
          {children}
        </main>
        
      </body>
    </html>
  );
}