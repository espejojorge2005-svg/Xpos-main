'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToOrders, FirebaseOrder } from '@/utils/firebaseSync';
import { getRestaurantId, getScopedStorage, setScopedStorage } from '@/utils/storage';
import { toast } from 'sonner';

/**
 * Sintetizador de audio web para alerta sonora de restaurante (campana/chime armónico)
 */
function playKitchenReadyChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Primer tono (campana aguda 880Hz - A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Segundo tono armónico más agudo (1318.5Hz - E6) con ligero delay para efecto campanilla
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.15);
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.85);
  } catch (err) {
    console.warn('Audio chime playback notice:', err);
  }
}

export default function OrderNotificationListener() {
  const router = useRouter();
  const mountedAtRef = useRef<number>(Date.now());
  const notifiedOrdersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedAtRef.current = Date.now();

    // Recuperar órdenes ya notificadas en esta sesión para evitar duplicados al recargar
    try {
      const stored = sessionStorage.getItem('notified_served_orders');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          notifiedOrdersRef.current = new Set(arr);
        }
      }
    } catch {}

    const restaurantId = getRestaurantId() || 'main';

    const unsubscribe = subscribeToOrders(restaurantId, (orders: FirebaseOrder[]) => {
      if (!Array.isArray(orders)) return;

      // Obtener el rol del usuario actual
      let userRole = '';
      try {
        const userStr = localStorage.getItem('pos_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          userRole = u.role || '';
        }
      } catch {}

      orders.forEach((order) => {
        if (order.status !== 'SERVED') return;

        // Comprobar si ya fue notificada
        if (notifiedOrdersRef.current.has(order.id)) return;

        // Limpiar la orden de la caché local del navegador (para que desaparezca del KDS del mesero)
        try {
          let localKitchen = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
          if (Array.isArray(localKitchen) && localKitchen.length > 0) {
            const updated = localKitchen.filter((o) => o.id !== order.id);
            setScopedStorage('pos_local_kitchen_orders', updated);
          }
        } catch {}

        // Emitir evento para que las pantallas activas se actualicen de inmediato
        window.dispatchEvent(
          new CustomEvent('pos:order_served', {
            detail: { id: order.id, tableName: order.tableName, tableId: order.tableId },
          })
        );

        // Validar si es un despacho reciente (ocurrido poco antes de montar o durante la sesión)
        const dispatchTime = order.dispatchedAt ? new Date(order.dispatchedAt).getTime() : 0;
        const updateTime = order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
        const eventTime = dispatchTime || updateTime;

        // Si el despacho ocurrió hace más de 3 minutos antes de entrar a la app, no emitir alerta sonora antigua
        const isRecent = eventTime >= mountedAtRef.current - 180000;

        // Registrar como notificada
        notifiedOrdersRef.current.add(order.id);
        try {
          sessionStorage.setItem(
            'notified_served_orders',
            JSON.stringify(Array.from(notifiedOrdersRef.current))
          );
        } catch {}

        // Solo alertar al mesero, cajero o administrador (el cocinero ya sabe que él mismo la despachó)
        if (isRecent && userRole !== 'COOK') {
          playKitchenReadyChime();

          const tableLabel = order.tableName || (order.tableId ? `Mesa ${order.tableId}` : 'Pedido');

          toast.success(`🍽️ ¡Pedido Listo para Servir!`, {
            description: `${tableLabel} — Cocina terminó de preparar los platos y están listos para llevar a la mesa.`,
            duration: 9000,
            action: {
              label: 'Ver Mesa',
              onClick: () => {
                if (order.tableId && order.tableId !== 'takeout') {
                  router.push(`/pos/${order.tableId}`);
                } else {
                  router.push('/');
                }
              },
            },
          });
        }
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [router]);

  return null;
}
