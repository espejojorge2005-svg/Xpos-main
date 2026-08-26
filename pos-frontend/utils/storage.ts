/**
 * Multi-Tenant Local Storage Utility
 * Ensures 100% data isolation for each restaurant/local.
 */

export const getRestaurantId = (): string | null => {
  if (typeof window === 'undefined') return null;
  const directId = localStorage.getItem('pos_restaurant_id');
  if (directId) return directId;
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
  // Solo removemos las credenciales del usuario que cierra sesión
  localStorage.removeItem('pos_token');
  localStorage.removeItem('pos_user');
  sessionStorage.removeItem('pos_token');
  sessionStorage.removeItem('pos_user');
};

export const clearCurrentRestaurantData = (): void => {
  logoutSession();
};
