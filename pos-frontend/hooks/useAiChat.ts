'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getApiUrl } from '@/utils/api';
import { getRestaurantId, getScopedStorage } from '@/utils/storage';
import { toast } from 'sonner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AiAlert {
  id: string;
  type: 'stock' | 'kitchen' | 'cash' | 'success';
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  actionQuery: string;
  actionRoute: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '¡Hola! 👋 Soy **ChefAI**, tu asesor inteligente de restaurante.\n\nPuedo analizar tus **ventas en tiempo real**, alertarte de **stock crítico**, **monitorear demoras de cocina** o **proyectar la demanda**.\n\n¿Qué te gustaría consultar hoy?',
  timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
};

export function evaluateProactiveAlerts(): AiAlert[] {
  const alerts: AiAlert[] = [];
  if (typeof window === 'undefined') return alerts;

  // 1. ALERTAS DE STOCK CRÍTICO O AGOTADO
  try {
    const products = getScopedStorage<any[]>('pos_registered_products', []);
    if (Array.isArray(products) && products.length > 0) {
      const outOfStock = products.filter(p => p.stock !== undefined && Number(p.stock) <= 0);
      const lowStock = products.filter(p => p.stock !== undefined && Number(p.stock) > 0 && Number(p.stock) <= (Number(p.minStock) || 5));

      if (outOfStock.length > 0) {
        const names = outOfStock.slice(0, 3).map(p => p.name).join(', ');
        alerts.push({
          id: 'stock-out',
          type: 'stock',
          severity: 'critical',
          title: `⚠️ ${outOfStock.length} plato${outOfStock.length > 1 ? 's/insumos' : ''} agotado${outOfStock.length > 1 ? 's' : ''}`,
          description: `Sin stock: ${names}${outOfStock.length > 3 ? ` y ${outOfStock.length - 3} más` : ''}.`,
          actionQuery: '¿Cuáles son los productos agotados y qué recomendaciones tienes para reabastecerlos?',
          actionRoute: '/inventory'
        });
      }

      if (lowStock.length > 0) {
        const names = lowStock.slice(0, 3).map(p => `${p.name} (${p.stock})`).join(', ');
        alerts.push({
          id: 'stock-low',
          type: 'stock',
          severity: 'warning',
          title: `📦 ${lowStock.length} producto${lowStock.length > 1 ? 's' : ''} con stock bajo`,
          description: `Por agotarse: ${names}.`,
          actionQuery: '¿Qué productos tienen bajo stock y qué medidas inmediatas sugieres para el turno?',
          actionRoute: '/inventory'
        });
      }
    }
  } catch {}

  // 2. ALERTAS DE DEMORA EN COCINA (> 25 MINUTOS)
  try {
    const kitchenOrders = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
    if (Array.isArray(kitchenOrders) && kitchenOrders.length > 0) {
      const now = Date.now();
      const delayed = kitchenOrders.filter(o => {
        if (o.status === 'SERVED' || o.status === 'CANCELLED') return false;
        const created = o.createdAt ? new Date(o.createdAt).getTime() : 0;
        return created > 0 && (now - created) > 25 * 60 * 1000;
      });

      if (delayed.length > 0) {
        const first = delayed[0];
        const tableName = first.table?.name || (first.table?.number ? `Mesa ${first.table.number}` : first.tableName || 'Mesa');
        const minutes = Math.floor((now - new Date(first.createdAt).getTime()) / 60000);
        alerts.push({
          id: 'kitchen-delay',
          type: 'kitchen',
          severity: 'critical',
          title: `⏱️ Demora en cocina: ${tableName}`,
          description: `Lleva más de ${minutes} min en preparación. Riesgo de reclamo de cliente.`,
          actionQuery: `¿Cómo podemos acelerar el despacho de ${tableName} y qué opciones de compensación sugieres?`,
          actionRoute: '/cocina'
        });
      }
    }
  } catch {}

  // 3. ALERTAS DE VENTAS Y CAJA
  try {
    const shift = getScopedStorage<any>('mock_cash_shift', null);
    if (shift && shift.isOpen) {
      const payments = shift.payments || [];
      const totalCollected = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      if (totalCollected > 300) {
        alerts.push({
          id: 'shift-sales',
          type: 'success',
          severity: 'info',
          title: `📈 Ritmo de ventas positivo hoy`,
          description: `Se han recaudado S/ ${totalCollected.toFixed(2)} en ${payments.length} cobranzas del turno.`,
          actionQuery: 'Analiza el ritmo de ventas de hoy, los métodos de pago y dame una proyección para el cierre de turno.',
          actionRoute: '/report'
        });
      }
    }
  } catch {}

  return alerts;
}

export function useAiChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [proactiveAlerts, setProactiveAlerts] = useState<AiAlert[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshAlerts = () => {
    setProactiveAlerts(evaluateProactiveAlerts());
  };

  // Evaluar alertas al montar, cada 15 segundos y en eventos de almacenamiento
  useEffect(() => {
    refreshAlerts();
    const interval = setInterval(refreshAlerts, 15000);
    window.addEventListener('storage', refreshAlerts);
    window.addEventListener('pos:order_served', refreshAlerts);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', refreshAlerts);
      window.removeEventListener('pos:order_served', refreshAlerts);
    };
  }, []);

  // Verificación estricta de sesión, ruta y rol de Administrador
  useEffect(() => {
    const checkPermission = () => {
      try {
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
    proactiveAlerts,
    refreshAlerts,
  };
}
