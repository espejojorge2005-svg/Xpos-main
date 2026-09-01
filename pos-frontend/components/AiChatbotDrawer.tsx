'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Bot, User, TrendingUp, AlertTriangle, Package, Calendar, RefreshCw, ChevronRight, MessageSquare } from 'lucide-react';
import { getApiUrl } from '@/utils/api';
import { getRestaurantId } from '@/utils/storage';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const QUICK_ACTIONS = [
  { label: '📊 Ventas de hoy', query: '¿Cuánto hemos vendido hoy y cuál es el resumen de caja?' },
  { label: '🏆 Platos más vendidos', query: '¿Cuáles son los platos más vendidos y los de menor rotación?' },
  { label: '⚠️ Alertas de stock', query: '¿Qué productos tienen bajo stock o están agotados?' },
  { label: '🔮 Proyección de ventas', query: '¿Cuál es la proyección de ventas y demanda para los próximos días?' },
  { label: '🪑 Mesas y salón', query: '¿Cómo está la ocupación de mesas y salones en este momento?' },
];

export default function AiChatbotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! 👋 Soy **ChefAI**, tu asesor inteligente de restaurante.\n\nPuedo analizar tus **ventas en tiempo real**, alertarte de **stock crítico** o **proyectar la demanda del fin de semana**.\n\n¿Qué te gustaría consultar hoy?',
      timestamp: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Verificar rol o permisos del usuario
  useEffect(() => {
    const checkPermission = () => {
      try {
        const userStr = localStorage.getItem('pos_user');
        const token = localStorage.getItem('pos_token');
        if (!token || !userStr) {
          setCanAccess(false);
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
      }
    };

    checkPermission();
    window.addEventListener('storage', checkPermission);

    // Escuchar evento personalizado para abrir el asistente desde el menú lateral
    const handleOpenAi = () => setIsOpen(true);
    window.addEventListener('pos:open_ai_assistant', handleOpenAi);

    return () => {
      window.removeEventListener('storage', checkPermission);
      window.removeEventListener('pos:open_ai_assistant', handleOpenAi);
    };
  }, []);

  // Auto-scroll al final de los mensajes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
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
        const assistantMsg: Message = {
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
    } catch (error) {
      toast.error('Error de conexión con el Asistente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!canAccess) return null;

  return (
    <>
      {/* Botón Flotante (FAB) en la esquina inferior derecha */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-2xl shadow-xl hover:shadow-2xl shadow-violet-500/25 transition-all duration-300 transform active:scale-95 group print:hidden ${
          isOpen ? 'scale-0 pointer-events-none' : 'scale-100'
        }`}
        title="ChefAI - Asistente y Analítica"
      >
        <div className="relative">
          <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
        </div>
        <span className="font-black text-sm tracking-wide">ChefAI</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 transition-opacity animate-in fade-in duration-200 print:hidden"
        />
      )}

      {/* Drawer Panel Lateral */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900 text-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out border-l border-slate-800 print:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Cabecera */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-md">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-white tracking-wide">ChefAI</h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Activo
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Asistente y Analítica Predictiva</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Acciones Rápidas (Chips) */}
        <div className="p-3 bg-slate-800/40 border-b border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none snap-x">
          {QUICK_ACTIONS.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(action.query)}
              disabled={isLoading}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-violet-600/30 border border-slate-700 hover:border-violet-500/50 text-slate-300 hover:text-white transition-all whitespace-nowrap active:scale-95 shrink-0"
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Lista de Mensajes */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-violet-300" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-line prose prose-invert prose-sm max-w-none">
                  {msg.content}
                </div>
                <span
                  className={`block text-[10px] mt-1.5 font-bold ${
                    msg.role === 'user' ? 'text-violet-200 text-right' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-violet-300 animate-spin" />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-none p-3.5 flex items-center gap-2">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-slate-400 font-medium ml-1.5">ChefAI analizando datos...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de Mensaje */}
        <div className="p-3 bg-slate-800/90 border-t border-slate-700">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Pregúntale a ChefAI..."
              disabled={isLoading}
              className="flex-1 bg-slate-900 border border-slate-700 focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-hidden transition-colors"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="p-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 text-white rounded-xl shadow-md transition-all active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[10px] text-center text-slate-500 mt-2 font-medium">
            ChefAI analiza las estadísticas y pedidos de tu base de datos en tiempo real.
          </p>
        </div>
      </div>
    </>
  );
}
