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
  return null;
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

