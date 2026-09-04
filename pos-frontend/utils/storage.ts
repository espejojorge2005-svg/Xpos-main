/**
 * Multi-Tenant Local Storage Utility
 * Ensures 100% data isolation for each restaurant/local.
 */

export const getRestaurantId = (): string | null => {
  if (typeof window === 'undefined') return null;
  // 1. Si hay un usuario logueado y no es SUPER_ADMIN, su restaurantId asignado es la autoridad absoluta
  try {
    const userStr = localStorage.getItem('pos_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.role !== 'SUPER_ADMIN' && u.restaurantId) {
        return u.restaurantId;
      }
    }
  } catch {}

  // 2. Para SUPER_ADMIN o contexto seleccionado explícitamente
  const directId = localStorage.getItem('pos_restaurant_id');
  if (directId) return directId;

  // 3. Fallback pos_user
  try {
    const userStr = localStorage.getItem('pos_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.restaurantId) return u.restaurantId;
    }
  } catch {}

  // 4. Default tenant fallback para instalaciones locales y sincronización resiliente multidispositivo
  return 'main';
};


export const getScopedKey = (key: string): string => {
  const restId = getRestaurantId();
  return restId ? `${key}_${restId}` : `${key}_default`;
};

export const getScopedStorage = <T = any>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const scopedKey = getScopedKey(key);
    const item = localStorage.getItem(scopedKey);
    return item !== null ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading ${key} from scoped storage:`, error);
    return defaultValue;
  }
};

export const setScopedStorage = (key: string, value: any): void => {
  if (typeof window === 'undefined') return;
  try {
    const scopedKey = getScopedKey(key);
    localStorage.setItem(scopedKey, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing ${key} to scoped storage:`, error);
  }
};

export const removeScopedStorage = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const scopedKey = getScopedKey(key);
    localStorage.removeItem(scopedKey);
  } catch (error) {
    console.error(`Error removing ${key} from scoped storage:`, error);
  }
};

export const logoutSession = (): void => {
  if (typeof window === 'undefined') return;
  // Cerramos la sesión del usuario pero mantenemos la terminal vinculada al restaurante
  localStorage.removeItem('pos_token');
  localStorage.removeItem('pos_user');
  sessionStorage.removeItem('pos_token');
  sessionStorage.removeItem('pos_user');
};

export const clearCurrentRestaurantData = (): void => {
  logoutSession();
};

export interface BaseStaffMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
  pin?: string;
  allowedViews?: string[];
  restaurantId?: string | null;
  isActive?: boolean;
  password?: string;
  [key: string]: any;
}

const isRealUuid = (id?: string): boolean =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Deduplica de manera estricta y absoluta listas de personal o usuarios.
 * Garantiza que jamás se repita un empleado comparando por ID, email o nombre.
 * Si detecta duplicados, fusiona inteligentemente sus atributos priorizando IDs reales de base de datos y PINs.
 */
export function deduplicateStaffList<T extends BaseStaffMember = BaseStaffMember>(list: any[]): T[] {
  if (!Array.isArray(list)) return [];
  const result: T[] = [];

  for (const raw of list) {
    if (!raw) continue;
    if (raw.isActive === false) continue;

    const cleanEmail = raw.email ? String(raw.email).trim().toLowerCase() : '';
    const cleanName = raw.name ? String(raw.name).trim().toLowerCase() : '';
    const cleanId = raw.id ? String(raw.id).trim() : '';

    if (!cleanEmail && !cleanName && !cleanId) continue;

    const existingIndex = result.findIndex(ex => {
      const exEmail = ex.email ? String(ex.email).trim().toLowerCase() : '';
      const exName = ex.name ? String(ex.name).trim().toLowerCase() : '';
      const exId = ex.id ? String(ex.id).trim() : '';

      // 1. Coincidencia directa por ID
      if (cleanId && exId && cleanId === exId) return true;

      // 2. Coincidencia por correo (El correo es identificador único de usuario)
      if (cleanEmail && exEmail && cleanEmail === exEmail) return true;

      // 3. Coincidencia por nombre (En el personal de un restaurante no hay dos usuarios con el mismo nombre)
      if (cleanName && exName && cleanName === exName) return true;

      return false;
    });

    const normalizedItem: T = {
      ...raw,
      id: raw.id || `staff-${Date.now()}`,
      name: raw.name ? String(raw.name).trim() : 'Personal',
      role: raw.role || 'CASHIER',
      pin: raw.pin ? String(raw.pin).trim() : undefined,
      allowedViews: Array.isArray(raw.allowedViews) && raw.allowedViews.length > 0 ? raw.allowedViews : ['pos', 'cocina', 'caja'],
    };

    if (existingIndex === -1) {
      result.push(normalizedItem);
    } else {
      const existing = result[existingIndex];

      // Fusionar inteligentemente atributos:
      // Si el entrante tiene un UUID real de PostgreSQL y el existente tiene uno temporal, adoptar el UUID real
      if (isRealUuid(cleanId) && !isRealUuid(existing.id)) {
        existing.id = raw.id;
      }

      // Si el entrante tiene PIN válido y el existente no (o el entrante tiene PIN más nuevo)
      if (raw.pin && (!existing.pin || String(raw.pin).trim().length >= 4)) {
        existing.pin = String(raw.pin).trim();
      }

      // Priorizar roles específicos sobre el genérico CASHIER
      if (raw.role && (existing.role === 'CASHIER' || !existing.role)) {
        existing.role = raw.role;
      }

      // Preservar correo
      if (raw.email && !existing.email) {
        existing.email = raw.email;
      }

      // Preservar permisos de vistas
      if (Array.isArray(raw.allowedViews) && raw.allowedViews.length > 0 && (!existing.allowedViews || existing.allowedViews.length === 0)) {
        existing.allowedViews = raw.allowedViews;
      }

      // Preservar restaurante
      if (raw.restaurantId && !existing.restaurantId) {
        existing.restaurantId = raw.restaurantId;
      }

      // Preservar contraseña si está disponible
      if (raw.password && !existing.password) {
        existing.password = raw.password;
      }
    }
  }

  return result;
}


