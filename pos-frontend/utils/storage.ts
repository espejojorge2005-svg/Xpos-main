/**
 * Multi-Tenant Local Storage Utility
 * Ensures 100% data isolation for each restaurant/local.
 */

export const getRestaurantId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pos_restaurant_id');
};

export const getScopedKey = (key: string): string => {
  const restId = getRestaurantId();
  return restId ? `${key}_${restId}` : key;
};

export const getScopedStorage = <T = any>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const scopedKey = getScopedKey(key);
    const item = localStorage.getItem(scopedKey);
    return item ? JSON.parse(item) : defaultValue;
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

export const clearCurrentRestaurantData = (): void => {
  if (typeof window === 'undefined') return;
  const keysToClear = [
    'pos_token',
    'pos_user',
    'pos_restaurant_id',
    'pos_restaurant_config',
    'pos_orders',
    'pos_closed_items',
    'pos_shift_history',
    'pos_cash_shift',
  ];

  const restId = getRestaurantId();
  keysToClear.forEach(key => {
    localStorage.removeItem(key);
    try { sessionStorage.removeItem(key); } catch {}
    if (restId) {
      localStorage.removeItem(`${key}_${restId}`);
      try { sessionStorage.removeItem(`${key}_${restId}`); } catch {}
    }
  });

  // Clear session cookies if present
  try {
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  } catch {}
};
