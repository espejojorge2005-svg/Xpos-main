'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToOrders, FirebaseOrder } from '@/utils/firebaseSync';
import { getRestaurantId, getScopedStorage, setScopedStorage } from '@/utils/storage';
import { toast } from 'sonner';

export default function OrderNotificationListener() {
  const router = useRouter();
  const mountedAtRef = useRef<number>(Date.now());
  const knownOrderStatusRef = useRef<Map<string, string>>(new Map());
  const notifiedOrdersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedAtRef.current = Date.now();

    // Restaurar órdenes notificadas en esta sesión para evitar duplicidad al navegar
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

      // Obtener el rol del usuario en la sesión actual
      let userRole = '';
      try {
        const userStr = localStorage.getItem('pos_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          userRole = u.role || '';
        }
      } catch {}

      orders.forEach((order) => {
        const prevStatus = knownOrderStatusRef.current.get(order.id);
        knownOrderStatusRef.current.set(order.id, order.status);

        if (order.status !== 'SERVED') return;

        // Limpiar siempre de la memoria local del navegador
        try {
          let localKitchen = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
          if (Array.isArray(localKitchen) && localKitchen.length > 0) {
            const updated = localKitchen.filter((o) => o.id !== order.id);
            setScopedStorage('pos_local_kitchen_orders', updated);
          }
        } catch {}

        // Emitir evento local para actualizar inmediatamente cualquier vista abierta
        window.dispatchEvent(
          new CustomEvent('pos:order_served', {
            detail: { id: order.id, tableName: order.tableName, tableId: order.tableId },
          })
        );

        // Si la orden ya fue notificada en esta sesión, ignorar
        if (notifiedOrdersRef.current.has(order.id)) return;

        // Validar si es un despacho reciente (ocurrido durante la sesión o en los últimos 45 segundos)
        const dispatchTime = order.dispatchedAt ? new Date(order.dispatchedAt).getTime() : 0;
        const updateTime = order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
        const eventTime = dispatchTime || updateTime;
        const isRecent = eventTime >= mountedAtRef.current - 45000 || prevStatus === 'OPEN';

        if (isRecent && userRole !== 'COOK') {
          notifiedOrdersRef.current.add(order.id);
          try {
            sessionStorage.setItem(
              'notified_served_orders',
              JSON.stringify(Array.from(notifiedOrdersRef.current))
            );
          } catch {}

          const tableLabel = order.tableName || (order.tableId ? `Mesa ${order.tableId}` : 'Pedido');

          // Mostrar mensaje en la esquina superior derecha (top-right) sin sonido
          toast.success(`🍽️ ¡Pedido Listo para Servir!`, {
            description: `${tableLabel} — Cocina terminó de preparar los platos y están listos para llevar a la mesa.`,
            position: 'top-right',
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
