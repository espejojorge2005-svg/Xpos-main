'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToOrders, FirebaseOrder } from '@/utils/firebaseSync';
import { getRestaurantId, getScopedStorage, setScopedStorage } from '@/utils/storage';
import { toast } from 'sonner';

export default function OrderNotificationListener() {
  const router = useRouter();
  const isInitialSnapshotRef = useRef<boolean>(true);
  const knownOrderStatusRef = useRef<Map<string, string>>(new Map());
  const notifiedOrdersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
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

      // 1. En la primera carga, registrar el estado actual sin disparar alertas viejas
      if (isInitialSnapshotRef.current) {
        orders.forEach((order) => {
          knownOrderStatusRef.current.set(order.id, order.status);
          if (order.status === 'SERVED') {
            notifiedOrdersRef.current.add(order.id);
          }
        });
        isInitialSnapshotRef.current = false;
        return;
      }

      // 2. Procesar cambios de estado en tiempo real (instantáneo)
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

        // Si la orden ya estaba registrada como servida y ya fue notificada, ignorar
        if (notifiedOrdersRef.current.has(order.id)) return;

        // Si cambió de OPEN a SERVED o es una nueva orden despachada
        const isNewlyServed = prevStatus === 'OPEN' || !prevStatus || order.status === 'SERVED';

        if (isNewlyServed && userRole !== 'COOK') {
          notifiedOrdersRef.current.add(order.id);
          try {
            sessionStorage.setItem(
              'notified_served_orders',
              JSON.stringify(Array.from(notifiedOrdersRef.current))
            );
          } catch {}

          const tableLabel = order.tableName || (order.tableId ? `Mesa ${order.tableId}` : 'Pedido');

          // Mostrar mensaje arriba a la derecha (top-right) sin sonido
          toast.success(`🍽️ ¡Pedido Listo para Servir!`, {
            description: `${tableLabel} — Cocina terminó de preparar los platos y están listos para llevar a la mesa.`,
            position: 'top-right',
            duration: 8000,
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
