'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getApiUrl } from '@/utils/api';
import { getRestaurantId } from '@/utils/storage';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '¡Hola! 👋 Soy **ChefAI**, tu asesor inteligente de restaurante.\n\nPuedo analizar tus **ventas en tiempo real**, alertarte de **stock crítico** o **proyectar la demanda del fin de semana**.\n\n¿Qué te gustaría consultar hoy?',
  timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
};

export function useAiChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Verificación estricta de sesión, ruta y rol de Administrador
  useEffect(() => {
    const checkPermission = () => {
      try {
        // En páginas públicas de login o registro, ChefAI NUNCA debe mostrarse
        if (!pathname || pathname === '/login' || pathname === '/register') {
          setCanAccess(false);
          setIsOpen(false);
          return;
        }

        const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
        const userStr = typeof window !== 'undefined' ? localStorage.getItem('pos_user') : null;

        if (!token || !userStr) {
          setCanAccess(false);
          setIsOpen(false);
          return;
        }

        const user = JSON.parse(userStr);
        const role = user.role || '';
        const allowedViews = user.allowedViews || [];

        // Solo visible para ADMIN / SUPER_ADMIN o si tiene permiso expreso
        const hasAccess =
          role === 'ADMIN' ||
          role === 'SUPER_ADMIN' ||
          allowedViews.includes('asistente_ia') ||
          allowedViews.includes('*');

        setCanAccess(hasAccess);
      } catch {
        setCanAccess(false);
        setIsOpen(false);
      }
    };

    checkPermission();
    window.addEventListener('storage', checkPermission);

    const handleOpenAi = () => {
      checkPermission();
      setIsOpen(true);
    };
    window.addEventListener('pos:open_ai_assistant', handleOpenAi);

    return () => {
      window.removeEventListener('storage', checkPermission);
      window.removeEventListener('pos:open_ai_assistant', handleOpenAi);
    };
  }, [pathname]);

  // Auto-scroll al recibir o enviar mensajes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const sendMessage = async (customQuery?: string) => {
    const query = (customQuery || inputMessage).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('pos_token');
      const restId = getRestaurantId();

      const response = await fetch(getApiUrl('/ai/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-restaurant-id': restId || '',
        },
        body: JSON.stringify({
          message: query,
          history: messages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.reply || 'No pude procesar la consulta en este momento.',
          timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        toast.error('No se pudo conectar con ChefAI.');
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-err-${Date.now()}`,
            role: 'assistant',
            content: '⚠️ Ocurrió un inconveniente al consultar los datos. Por favor, intenta de nuevo.',
            timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch {
      toast.error('Error de conexión con el Asistente.');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isOpen,
    setIsOpen,
    canAccess,
    messages,
    inputMessage,
    setInputMessage,
    isLoading,
    messagesEndRef,
    sendMessage,
  };
}
