'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { subscribeToOrders, FirebaseOrder } from '@/utils/firebaseSync';
import { getRestaurantId, getScopedStorage, setScopedStorage } from '@/utils/storage';
import { toast } from 'sonner';

export default function OrderNotificationListener() {
  const router = useRouter();
  const pathname = usePathname();
  const mountedAtRef = useRef<number>(Date.now());
  const knownOrderStatusRef = useRef<Map<string, string>>(new Map());
  const notifiedOrdersRef = useRef<Set<string>>(new Set());

  // Campanilla sonora suave (tipo campana de cocina "ding!") con Web Audio API
  const playBellChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1320, now + 0.08);
      gain2.gain.setValueAtTime(0.12, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.7);
    } catch {}
  };

  const triggerServedNotification = (tableLabel: string, tableId?: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
    if (!token || pathname === '/login' || pathname === '/register' || pathname?.startsWith('/superadmin')) {
      return;
    }

    playBellChime();
    toast.success(`🍽️ ¡Pedido Listo para Servir!`, {
      description: `${tableLabel} — Cocina terminó de preparar los platos y están listos para llevar a la mesa.`,
      position: 'top-right',
      duration: 10000,
      action: {
        label: 'Ver Mesa',
        onClick: () => {
          if (tableId && tableId !== 'takeout') {
            router.push(`/pos/${tableId}`);
          } else {
            router.push('/');
          }
        },
      },
    });
  };

  useEffect(() => {
    // 1. Desactivar estrictamente en pantallas de login, registro, superadmin o sin sesión
    if (pathname === '/login' || pathname === '/register' || pathname?.startsWith('/superadmin')) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
    if (!token) {
      return;
    }

    mountedAtRef.current = Date.now();

    // Restaurar órdenes ya notificadas en esta sesión para evitar duplicidad al navegar
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

    // 2. Escuchar evento local en tiempo real inmediato (mismo navegador / red local)
    const handleLocalServed = (e: any) => {
      const currentToken = localStorage.getItem('pos_token');
      if (!currentToken || pathname === '/login' || pathname === '/register') return;

      const detail = e.detail || {};
      const id = detail.id;
      if (!id || notifiedOrdersRef.current.has(id)) return;

      let userRole = '';
      try {
        const userStr = localStorage.getItem('pos_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          userRole = u.role || '';
        }
      } catch {}

      if (userRole === 'COOK') return;

      notifiedOrdersRef.current.add(id);
      try {
        sessionStorage.setItem('notified_served_orders', JSON.stringify(Array.from(notifiedOrdersRef.current)));
      } catch {}

      triggerServedNotification(detail.tableName || (detail.tableId ? `Mesa ${detail.tableId}` : 'Pedido'), detail.tableId);
    };

    window.addEventListener('pos:order_served', handleLocalServed);

    // 3. Escuchar Firebase Firestore en tiempo real (para celulares y tablets de mozos)
    let isInitialSnapshot = true;
    const unsubscribe = subscribeToOrders(restaurantId, (orders: FirebaseOrder[]) => {
      if (!Array.isArray(orders)) return;

      const currentToken = localStorage.getItem('pos_token');
      if (!currentToken || pathname === '/login' || pathname === '/register') return;

      let userRole = '';
      try {
        const userStr = localStorage.getItem('pos_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          userRole = u.role || '';
        }
      } catch {}

      // EN EL SNAPSHOT INICIAL DE FIREBASE:
      // Solo registramos el estado actual del historial para no lanzar alertas de pedidos antiguos
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        orders.forEach((order) => {
          const isKitchenServed = 
            (order as any).kitchenStatus === 'SERVED' || 
            (order as any).isServed === true ||
            order.status === 'SERVED' ||
            (Array.isArray(order.items) && order.items.length > 0 && order.items.every((i: any) => i.status === 'SERVED' || i.status === 'CANCELLED' || i.status === 'CANCELED'));

          knownOrderStatusRef.current.set(order.id, isKitchenServed ? 'SERVED' : (order.status || 'OPEN'));
          if (isKitchenServed) {
            notifiedOrdersRef.current.add(order.id);
          }
        });
        return;
      }

      // EN ACTUALIZACIONES POSTERIORES EN VIVO:
      orders.forEach((order) => {
        const isKitchenServed = 
          (order as any).kitchenStatus === 'SERVED' || 
          (order as any).isServed === true ||
          order.status === 'SERVED' ||
          (Array.isArray(order.items) && order.items.length > 0 && order.items.every((i: any) => i.status === 'SERVED' || i.status === 'CANCELLED' || i.status === 'CANCELED'));

        const prevStatus = knownOrderStatusRef.current.get(order.id);
        knownOrderStatusRef.current.set(order.id, isKitchenServed ? 'SERVED' : (order.status || 'OPEN'));

        if (!isKitchenServed) return;

        // Limpiar de la memoria local KDS
        try {
          let localKitchen = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
          if (Array.isArray(localKitchen) && localKitchen.length > 0) {
            const updated = localKitchen.filter((o) => o.id !== order.id);
            setScopedStorage('pos_local_kitchen_orders', updated);
          }
        } catch {}

        // Si la orden ya fue notificada en esta sesión, no repetir
        if (notifiedOrdersRef.current.has(order.id)) return;

        // Validar si es un cambio en tiempo real a SERVED ocurrido mientras la app está abierta
        const dispatchTime = order.dispatchedAt ? new Date(order.dispatchedAt).getTime() : 0;
        const updateTime = order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
        const eventTime = dispatchTime || updateTime;
        const isJustDispatched = eventTime >= mountedAtRef.current - 15000;
        const transitionedToServed = prevStatus && prevStatus !== 'SERVED';

        if ((transitionedToServed || isJustDispatched) && userRole !== 'COOK') {
          notifiedOrdersRef.current.add(order.id);
          try {
            sessionStorage.setItem(
              'notified_served_orders',
              JSON.stringify(Array.from(notifiedOrdersRef.current))
            );
          } catch {}

          const tableLabel = order.tableName || (order.tableId ? `Mesa ${order.tableId}` : 'Pedido');
          triggerServedNotification(tableLabel, order.tableId);
        }
      });
    });

    return () => {
      window.removeEventListener('pos:order_served', handleLocalServed);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
