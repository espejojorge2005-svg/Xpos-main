export const getApiUrl = (path: string): string => {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
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

  return fetch(url, {
    ...options,
    headers,
  });
};
