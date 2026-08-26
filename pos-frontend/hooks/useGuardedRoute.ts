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
 * Returns the first allowed path for a user given their allowedViews and role.
 */
export function getFirstAllowedPath(allowedViews: string[]): string {
  if (!allowedViews || allowedViews.length === 0 || allowedViews.includes('*')) return '/';
  const order = ['pos', 'cocina', 'caja', 'inventario', 'categorias', 'areas', 'kardex', 'analytics', 'configuracion', 'usuarios'];
  for (const key of order) {
    if (allowedViews.includes(key)) return VIEW_PATH_MAP[key];
  }
  return '/';
}

/**
 * Hook that protects a page by its view key and user role.
 *
 * @param viewKey - The key string for this view (e.g. 'pos', 'cocina', 'usuarios').
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
      const role: string = user.role ?? '';
      let allowedViews: string[] = user.allowedViews && user.allowedViews.length > 0 
        ? user.allowedViews 
        : (role === 'ADMIN' || role === 'SUPER_ADMIN' ? ['*'] : ['pos', 'cocina']);

      // ADMIN and SUPER_ADMIN have full access
      const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN' || allowedViews.includes('*');
      if (isAdmin) return;

      // Restricción estricta de rutas administrativas para Cajeros y Meseros
      const adminOnlyKeys = ['usuarios', 'configuracion', 'analytics', 'kardex'];
      if (viewKey && adminOnlyKeys.includes(viewKey) && !isAdmin) {
        const dest = getFirstAllowedPath(allowedViews);
        router.replace(dest);
        return;
      }

      // If a specific view key is required, check permission
      if (viewKey && !allowedViews.includes(viewKey)) {
        const firstPath = getFirstAllowedPath(allowedViews);
        router.replace(firstPath);
      }
    } catch {
      router.push('/login');
    }
  }, [router, viewKey]);
}
