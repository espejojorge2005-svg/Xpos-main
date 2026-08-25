'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Map from "view key" (stored in allowedViews) to the actual Next.js path.
 * Must match ALL_MENU_ITEMS in Sidebar.tsx and ALL_VIEWS in users/page.tsx.
 */
const VIEW_PATH_MAP: Record<string, string> = {
  pos:           '/',
  cocina:        '/cocina',
  caja:          '/report',
  inventario:    '/inventory',
  categorias:    '/inventory/categories',
  areas:         '/inventory/stations',
  kardex:        '/inventory/kardex',
  analytics:     '/analytics',
  configuracion: '/settings',
  usuarios:      '/users',
};

/**
 * Returns the first allowed path for a user given their allowedViews.
 * ADMIN / '*' always returns '/' (full access).
 */
export function getFirstAllowedPath(allowedViews: string[]): string {
  if (!allowedViews || allowedViews.includes('*')) return '/';
  const order = ['pos', 'cocina', 'caja', 'inventario', 'categorias', 'areas', 'kardex', 'analytics', 'configuracion', 'usuarios'];
  for (const key of order) {
    if (allowedViews.includes(key)) return VIEW_PATH_MAP[key];
  }
  return '/login'; // No views assigned at all
}

/**
 * Hook that protects a page by its view key.
 * Call at the top of every protected page component.
 *
 * @param viewKey - The key string for this view (e.g. 'pos', 'cocina', 'inventario').
 *                  Pass null to only check auth (no view restriction).
 */
export function useGuardedRoute(viewKey: string | null) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token) { router.push('/login'); return; }

    const userStr = localStorage.getItem('pos_user');
    if (!userStr) { router.push('/login'); return; }

    try {
      const user = JSON.parse(userStr);
      const allowedViews: string[] = user.allowedViews ?? ['*'];
      const role: string = user.role ?? '';

      // ADMIN and SUPER_ADMIN always have full access
      const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN' || allowedViews.includes('*');
      if (isAdmin) return;

      // If a specific view key is required, check it
      if (viewKey && !allowedViews.includes(viewKey)) {
        // Redirect to the first allowed view instead of login
        const firstPath = getFirstAllowedPath(allowedViews);
        router.replace(firstPath);
      }
    } catch {
      router.push('/login');
    }
  }, [router, viewKey]);
}
