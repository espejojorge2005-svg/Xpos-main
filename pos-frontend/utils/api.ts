import { getRestaurantId } from './storage';

export const getApiUrl = (path: string): string => {
  let base = process.env.NEXT_PUBLIC_API_URL || '';
  
  if (typeof window !== 'undefined' && window.location.hostname) {
    const hostname = window.location.hostname;
    // Si estamos en Vercel o en cualquier dominio de producción público
    if (hostname.includes('vercel.app') || (hostname !== 'localhost' && hostname !== '127.0.0.1' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname))) {
      base = 'https://xpos-backend-x2vz.onrender.com/api/v1';
    } else if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      // Si accedemos por IP de red local (ej. 192.168.x.x desde móvil)
      base = `http://${hostname}:3001/api/v1`;
    }
  }

  if (!base) {
    base = process.env.NODE_ENV === 'production' 
      ? 'https://xpos-backend-x2vz.onrender.com/api/v1' 
      : 'http://localhost:3001/api/v1';
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

