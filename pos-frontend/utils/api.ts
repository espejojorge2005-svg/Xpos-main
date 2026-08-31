import { getRestaurantId } from './storage';

export const getApiUrl = (path: string): string => {
  let base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Si accedemos desde un dispositivo móvil o tablet en la misma red Wi-Fi, dirigir al backend en la misma IP host
    base = base.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
  }
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/${normalizedPath}`;
};

/**
 * Interceptor HTTP unificado para peticiones al backend.
 * Adjunta automáticamente la cabecera "Authorization: Bearer <token>" y "x-restaurant-id".
 */
export const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
  const restaurantId = getRestaurantId();
  const url = getApiUrl(endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (restaurantId && !headers['x-restaurant-id']) {
    headers['x-restaurant-id'] = restaurantId;
  }

  return fetch(url, {
    ...options,
    headers,
  });
};

