export const getApiUrl = (path: string): string => {
  const base = process.env.NEXT_PUBLIC_API_URL || 'https://xpos-backend.onrender.com/api/v1';
  if (!base) {
    console.warn('NEXT_PUBLIC_API_URL not defined');
    return path; // fallback to relative path for dev
  }
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/${normalizedPath}`;
};

/**
 * Interceptor HTTP unificado para peticiones al backend.
 * Adjunta automáticamente la cabecera "Authorization: Bearer <token>" usando el pos_token de localStorage.
 */
export const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
  const url = getApiUrl(endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Si la petición devuelve 401 y el usuario no está en la página de login, redirigir a /login
  if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const isUnauthEndpoint = endpoint.includes('/auth/login');
    if (!isUnauthEndpoint) {
      console.warn('Sesión expirada o no autorizada. Redirigiendo a /login...');
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      window.location.href = '/login';
    }
  }

  return response;
};
