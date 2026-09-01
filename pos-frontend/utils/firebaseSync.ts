import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export interface FirebaseOrder {
  id: string;
  tableId?: string;
  tableName?: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'SERVED';
  customerName?: string;
  waiterName?: string;
  totalAmount?: number;
  items?: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
    status: 'ACTIVE' | 'SERVED' | 'CANCELED' | 'CANCELLED';
  }>;
  createdAt?: string;
  updatedAt?: string;
  dispatchedAt?: string;
  billRequested?: boolean;
  restaurantId?: string;
}

export interface FirebaseTable {
  id: string;
  number: string;
  zoneId: string;
  capacity: number;
  status: 'FREE' | 'OCCUPIED' | 'WAITING_FOOD';
  posX: number;
  posY: number;
  restaurantId?: string;
}

export const isMatchingTenant = (itemRestId?: string | null, currentRestId?: string | null): boolean => {
  if (!currentRestId || currentRestId === 'main') return true;
  if (!itemRestId || itemRestId === 'main') return true;
  return itemRestId === currentRestId;
};

/**
 * Escuchar órdenes de cocina en tiempo real desde Firebase Firestore
 */
export const subscribeToKitchenOrders = (restaurantId: string, onUpdate: (orders: FirebaseOrder[]) => void) => {
  try {
    const ordersRef = collection(db, 'orders');
    return onSnapshot(ordersRef, (snapshot) => {
      const ordersData: FirebaseOrder[] = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FirebaseOrder))
        .filter(order => isMatchingTenant(order.restaurantId, restaurantId) && order.status === 'OPEN')
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onUpdate(ordersData);
    }, (error) => {
      console.warn("Firestore real-time subscription (orders) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase listener initialization:", err);
    return () => {};
  }
};

/**
 * Escuchar estado de mesas en tiempo real desde Firebase Firestore
 */
export const subscribeToTables = (restaurantId: string | null | undefined, onUpdate: (tables: FirebaseTable[]) => void) => {
  try {
    const tablesRef = collection(db, 'tables');
    return onSnapshot(tablesRef, (snapshot) => {
      const tablesData: FirebaseTable[] = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FirebaseTable))
        .filter(t => isMatchingTenant(t.restaurantId, restaurantId));
      onUpdate(tablesData);
    }, (error) => {
      console.warn("Firestore real-time subscription (tables) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase listener initialization:", err);
    return () => {};
  }
};

/**
 * Guardar o actualizar una orden en Firebase
 */
export const syncOrderToFirebase = async (order: Partial<FirebaseOrder> & { id: string }) => {
  try {
    const orderDocRef = doc(db, 'orders', order.id);
    await setDoc(orderDocRef, {
      ...order,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing order to Firebase:", err);
  }
};

/**
 * Actualizar el estado de una mesa en Firebase
 */
export const syncTableToFirebase = async (tableId: string, status: 'FREE' | 'OCCUPIED' | 'WAITING_FOOD', restaurantId?: string | null) => {
  try {
    const tableDocRef = doc(db, 'tables', tableId);
    await setDoc(tableDocRef, {
      id: tableId,
      status,
      ...(restaurantId ? { restaurantId } : {}),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing table to Firebase:", err);
  }
};

/**
 * Obtener la orden abierta de una mesa directamente desde Firebase Firestore
 */
export const getActiveTableOrderFromFirebase = async (
  restaurantId: string, 
  tableId: string, 
  tableName?: string,
  tableNumber?: string | number
): Promise<FirebaseOrder | null> => {
  try {
    const ordersRef = collection(db, 'orders');
    const snap = await getDocs(ordersRef);
    
    // Extraer número limpio de mesa evitando procesar UUIDs como números gigantes
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
    const cleanNum = (!isUuid && tableId.startsWith('t-') ? tableId.replace('t-', '') : '') || 
                     (!isUuid && !isNaN(parseInt(tableId)) ? String(parseInt(tableId)) : '') ||
                     (tableNumber ? String(tableNumber) : '') ||
                     (tableName ? tableName.replace(/\D/g, '') : '');

    const found = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as FirebaseOrder))
      .find(o => {
        if (o.status !== 'OPEN') return false;
        if (!isMatchingTenant(o.restaurantId, restaurantId)) return false;
        
        // Coincidencia 1: ID de mesa exacto
        if (o.tableId === tableId) return true;
        
        // Coincidencia 2: Nombre de mesa exacto (ej: "Mesa 1")
        if (tableName && o.tableName && o.tableName.toLowerCase().trim() === tableName.toLowerCase().trim()) return true;
        
        // Coincidencia 3: Por número de mesa (ej: "Mesa 1" vs "t-1" vs "1")
        if (cleanNum) {
          if (o.tableName && o.tableName.toLowerCase().includes(`mesa ${cleanNum}`)) return true;
          if (o.tableId === `t-${cleanNum}` || o.tableId === cleanNum) return true;
        }

        // Coincidencia 4: Comparación relajada de nombre sin espacios
        if (o.tableName && o.tableName.toLowerCase().replace(/\s+/g, '') === tableId.toLowerCase().replace(/\s+/g, '')) return true;

        return false;
      });

    return found || null;
  } catch (err) {
    console.warn("Error fetching active table order from Firebase:", err);
    return null;
  }
};

export interface FirebaseShift {
  restaurantId: string;
  isOpen: boolean;
  openingAmount: number;
  shiftId?: string;
  openedAt?: string;
  closedAt?: string;
  updatedAt?: string;
  expenses?: Array<{ id: string; amount: number; description: string; createdAt?: string }>;
  payments?: Array<{ id: string; orderId?: string; table?: string; amount: number; method?: string; tipAmount?: number; date?: string; items?: any[] }>;
}

export const syncShiftToFirebase = async (restaurantId: string, shift: Partial<FirebaseShift>) => {
  try {
    const shiftDocRef = doc(db, 'shifts', restaurantId);
    await setDoc(shiftDocRef, {
      ...shift,
      restaurantId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing shift to Firebase:", err);
  }
};

export const syncShiftExpenseToFirebase = async (restaurantId: string, expense: { id: string; amount: number; description: string; createdAt?: string }) => {
  try {
    const shiftDocRef = doc(db, 'shifts', restaurantId);
    const snap = await getDoc(shiftDocRef);
    const existingExpenses = snap.exists() && Array.isArray(snap.data()?.expenses) ? snap.data().expenses : [];
    const updatedExpenses = [
      ...existingExpenses.filter((e: any) => e.id !== expense.id),
      { ...expense, createdAt: expense.createdAt || new Date().toISOString() }
    ];
    await setDoc(shiftDocRef, {
      expenses: updatedExpenses,
      restaurantId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing expense to Firebase:", err);
  }
};

export const syncShiftPaymentToFirebase = async (restaurantId: string, payment: any) => {
  try {
    const shiftDocRef = doc(db, 'shifts', restaurantId);
    const snap = await getDoc(shiftDocRef);
    const existingPayments = snap.exists() && Array.isArray(snap.data()?.payments) ? snap.data().payments : [];
    const updatedPayments = [
      ...existingPayments.filter((p: any) => p.id !== payment.id),
      { ...payment, date: payment.date || new Date().toISOString() }
    ];
    await setDoc(shiftDocRef, {
      payments: updatedPayments,
      restaurantId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing payment to Firebase:", err);
  }
};

export const subscribeToCashShift = (restaurantId: string, onUpdate: (shift: FirebaseShift | null) => void) => {
  try {
    const shiftDocRef = doc(db, 'shifts', restaurantId);
    return onSnapshot(shiftDocRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as FirebaseShift);
      } else {
        onUpdate(null);
      }
    }, (error) => {
      console.warn("Firestore real-time subscription (shift) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase shift listener initialization:", err);
    return () => {};
  }
};

/**
 * Categorías en Firebase Firestore (Multi-inquilino)
 */
export const syncCategoryToFirebase = async (category: { id: string; name: string; restaurantId: string }) => {
  try {
    const ref = doc(db, 'categories', category.id);
    await setDoc(ref, {
      id: category.id,
      name: category.name,
      restaurantId: category.restaurantId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing category to Firebase:", err);
  }
};

export const deleteCategoryFromFirebase = async (categoryId: string) => {
  try {
    const ref = doc(db, 'categories', categoryId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("Error deleting category from Firebase:", err);
  }
};

export const getCategoriesFromFirebase = async (restaurantId: string): Promise<any[]> => {
  try {
    const ref = collection(db, 'categories');
    const q = query(ref, where('restaurantId', '==', restaurantId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Error fetching categories from Firebase:", err);
    return [];
  }
};

/**
 * Áreas de Preparación / Kitchen Stations en Firebase Firestore (Multi-inquilino)
 */
export const syncStationToFirebase = async (station: { id: string; name: string; colorHex?: string; printerName?: string | null; restaurantId: string }) => {
  try {
    const ref = doc(db, 'kitchen_stations', station.id);
    await setDoc(ref, {
      ...station,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing station to Firebase:", err);
  }
};

export const deleteStationFromFirebase = async (stationId: string) => {
  try {
    const ref = doc(db, 'kitchen_stations', stationId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("Error deleting station from Firebase:", err);
  }
};

export const getStationsFromFirebase = async (restaurantId: string): Promise<any[]> => {
  try {
    const ref = collection(db, 'kitchen_stations');
    const q = query(ref, where('restaurantId', '==', restaurantId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Error fetching stations from Firebase:", err);
    return [];
  }
};

/**
 * Productos / Inventario en Firebase Firestore (Multi-inquilino)
 */
export const syncProductToFirebase = async (product: any) => {
  try {
    const ref = doc(db, 'products', product.id);
    await setDoc(ref, {
      ...product,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing product to Firebase:", err);
  }
};

export const deleteProductFromFirebase = async (productId: string) => {
  try {
    const ref = doc(db, 'products', productId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("Error deleting product from Firebase:", err);
  }
};

export const getProductsFromFirebase = async (restaurantId: string): Promise<any[]> => {
  try {
    const ref = collection(db, 'products');
    const snap = await getDocs(ref);
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter((p: any) => !restaurantId || !p.restaurantId || p.restaurantId === restaurantId);
  } catch (err) {
    console.warn("Error fetching products from Firebase:", err);
    return [];
  }
};

/**
 * Suscripciones EN TIEMPO REAL (onSnapshot) ultrarrápidas
 */
export const subscribeToCategories = (restaurantId: string, onUpdate: (categories: any[]) => void) => {
  try {
    const ref = collection(db, 'categories');
    return onSnapshot(ref, (snapshot) => {
      const cats = snapshot.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((c: any) => !restaurantId || !c.restaurantId || c.restaurantId === restaurantId);
      onUpdate(cats);
    }, (error) => {
      console.warn("Firestore real-time subscription (categories) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase categories listener initialization:", err);
    return () => {};
  }
};

export const subscribeToKitchenStations = (restaurantId: string, onUpdate: (stations: any[]) => void) => {
  try {
    const ref = collection(db, 'kitchen_stations');
    return onSnapshot(ref, (snapshot) => {
      const stations = snapshot.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((s: any) => !restaurantId || !s.restaurantId || s.restaurantId === restaurantId);
      onUpdate(stations);
    }, (error) => {
      console.warn("Firestore real-time subscription (stations) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase stations listener initialization:", err);
    return () => {};
  }
};

export const subscribeToProducts = (restaurantId: string, onUpdate: (products: any[]) => void) => {
  try {
    const ref = collection(db, 'products');
    return onSnapshot(ref, (snapshot) => {
      const products = snapshot.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((p: any) => !restaurantId || !p.restaurantId || p.restaurantId === restaurantId);
      onUpdate(products);
    }, (error) => {
      console.warn("Firestore real-time subscription (products) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase products listener initialization:", err);
    return () => {};
  }
};

/**
 * ZONAS Y MESAS (Plano de Sala) en Firebase Firestore (Multi-inquilino)
 */
export const syncZonesToFirebase = async (restaurantId: string, zones: any[]) => {
  try {
    if (!restaurantId) return;
    const ref = doc(db, 'zones', restaurantId);
    await setDoc(ref, {
      restaurantId,
      zones,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing zones to Firebase:", err);
  }
};

export const subscribeToZones = (restaurantId: string, onUpdate: (zones: any[]) => void) => {
  try {
    if (!restaurantId) return () => {};
    const ref = doc(db, 'zones', restaurantId);
    return onSnapshot(ref, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data?.zones)) {
          onUpdate(data.zones);
        }
      }
    }, (error) => {
      console.warn("Firestore real-time subscription (zones) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase zones listener initialization:", err);
    return () => {};
  }
};

/**
 * COMANDAS ACTIVAS POR MESA (Plano de Sala - Ocupación y consumos)
 */
export const syncActiveTableOrdersToFirebase = async (restaurantId: string, activeTableOrders: Record<string, any>) => {
  try {
    const targets = Array.from(new Set([restaurantId, 'main'])).filter(Boolean);
    for (const target of targets) {
      const ref = doc(db, 'active_table_orders', target);
      await setDoc(ref, {
        restaurantId,
        orders: activeTableOrders,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {
    console.warn("Error syncing active table orders to Firebase:", err);
  }
};

export const subscribeToActiveTableOrders = (restaurantId: string, onUpdate: (orders: Record<string, any>) => void) => {
  try {
    const target = restaurantId || 'main';
    const ref = doc(db, 'active_table_orders', target);
    return onSnapshot(ref, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data?.orders) {
          onUpdate(data.orders);
        }
      }
    }, (error) => {
      console.warn("Firestore real-time subscription (active_table_orders) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase active_table_orders listener initialization:", err);
    return () => {};
  }
};

/**
 * Consulta directa de órdenes abiertas en Firebase para sincronización inmediata de mesas ocupadas
 */
export const fetchOpenOrdersFromFirebase = async (restaurantId?: string | null): Promise<Record<string, any>> => {
  try {
    const ordersRef = collection(db, 'orders');
    const snap = await getDocs(ordersRef);
    const cloudOpenOrders = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as FirebaseOrder))
      .filter(o => isMatchingTenant(o.restaurantId, restaurantId) && o.status === 'OPEN');

    const activeMap: Record<string, any> = {};
    cloudOpenOrders.forEach(o => {
      const tId = o.tableId || (o.tableName ? o.tableName.toLowerCase().replace(/\s+/g, '') : null);
      const tNum = o.tableName ? o.tableName.replace(/\D/g, '') : '';
      const cleanNum = (!tId?.includes('-') && !isNaN(parseInt(tId || '')) ? String(parseInt(tId!)) : '') || tNum;

      const entry = {
        orderId: o.id,
        tableId: o.tableId,
        tableName: o.tableName || tId,
        createdAt: o.createdAt || new Date().toISOString(),
        total: o.totalAmount || 0,
        status: 'OCCUPIED',
        items: o.items || []
      };

      if (tId) activeMap[tId] = entry;
      if (cleanNum) {
        activeMap[`t-${cleanNum}`] = entry;
        activeMap[cleanNum] = entry;
      }
    });

    return activeMap;
  } catch (err) {
    console.warn("Error fetching open orders from Firebase:", err);
    return {};
  }
};

/**
 * ACCIONES DE COCINA EN TIEMPO REAL (Despacho de platos y comandas)
 */
export const updateKitchenOrderStatusInFirebase = async (orderId: string, status: 'OPEN' | 'SERVED' | 'CANCELLED') => {
  try {
    const realOrderId = (orderId || '').split('-adic-')[0];
    const orderDocRef = doc(db, 'orders', realOrderId);
    const snap = await getDoc(orderDocRef);
    const nowIso = new Date().toISOString();

    if (snap.exists()) {
      const order = snap.data() as FirebaseOrder;
      const updatedItems = (order.items || []).map((it: any) => 
        status === 'SERVED' ? { ...it, status: 'SERVED' as const } : it
      );
      await updateDoc(orderDocRef, {
        status,
        items: updatedItems,
        ...(status === 'SERVED' ? { dispatchedAt: nowIso } : {}),
        updatedAt: nowIso
      });
    } else {
      await setDoc(orderDocRef, {
        id: realOrderId,
        status,
        ...(status === 'SERVED' ? { dispatchedAt: nowIso } : {}),
        updatedAt: nowIso
      }, { merge: true });
    }
  } catch (err) {
    console.warn("Error updating order status in Firebase:", err);
  }
};

export const serveKitchenItemInFirebase = async (orderId: string, itemId: string) => {
  try {
    const realOrderId = (orderId || '').split('-adic-')[0];
    const orderDocRef = doc(db, 'orders', realOrderId);
    const snap = await getDoc(orderDocRef);
    if (snap.exists()) {
      const order = snap.data() as FirebaseOrder;
      let allServed = true;
      const nowIso = new Date().toISOString();
      const updatedItems = (order.items || []).map((it: any) => {
        if (it.id === itemId) {
          return { ...it, status: 'SERVED' as const };
        }
        if (it.status !== 'SERVED' && it.status !== 'CANCELLED' && it.status !== 'CANCELED') {
          allServed = false;
        }
        return it;
      });

      await updateDoc(orderDocRef, {
        items: updatedItems,
        status: allServed ? 'SERVED' : order.status,
        ...(allServed ? { dispatchedAt: nowIso } : {}),
        updatedAt: nowIso
      });
    }
  } catch (err) {
    console.warn("Error serving kitchen item in Firebase:", err);
  }
};

/**
 * Escuchar todas las órdenes en tiempo real para notificaciones y sincronización
 */
export const subscribeToOrders = (restaurantId: string | null | undefined, onUpdate: (orders: FirebaseOrder[]) => void) => {
  try {
    const ordersRef = collection(db, 'orders');
    return onSnapshot(ordersRef, (snapshot) => {
      const ordersData: FirebaseOrder[] = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FirebaseOrder))
        .filter(order => isMatchingTenant(order.restaurantId, restaurantId));
      onUpdate(ordersData);
    }, (error) => {
      console.warn("Firestore real-time subscription (all orders) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase listener initialization:", err);
    return () => {};
  }
};

/**
 * MOVIMIENTOS DE STOCK / KARDEX en Firebase Firestore (Multi-inquilino)
 */
export const syncStockMovementToFirebase = async (restaurantId: string, movement: any) => {
  try {
    if (!restaurantId || !movement?.id) return;
    const ref = doc(db, 'stock_movements', movement.id);
    await setDoc(ref, {
      ...movement,
      restaurantId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing stock movement to Firebase:", err);
  }
};

export const subscribeToStockMovements = (restaurantId: string, onUpdate: (movements: any[]) => void) => {
  try {
    if (!restaurantId) return () => {};
    const ref = collection(db, 'stock_movements');
    return onSnapshot(ref, (snapshot) => {
      const movements = snapshot.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((m: any) => m.restaurantId === restaurantId)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onUpdate(movements);
    }, (error) => {
      console.warn("Firestore real-time subscription (stock_movements) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase stock movements listener initialization:", err);
    return () => {};
  }
};

/**
 * HISTORIAL DE CIERRES DE CAJA / REPORTES en Firebase Firestore (Multi-inquilino)
 */
export const syncPastClosureToFirebase = async (restaurantId: string, closure: any) => {
  try {
    if (!restaurantId || !closure?.id) return;
    const ref = doc(db, 'past_closures', closure.id);
    await setDoc(ref, {
      ...closure,
      restaurantId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Error syncing past closure to Firebase:", err);
  }
};

export const subscribeToPastClosures = (restaurantId: string, onUpdate: (closures: any[]) => void) => {
  try {
    if (!restaurantId) return () => {};
    const ref = collection(db, 'past_closures');
    return onSnapshot(ref, (snapshot) => {
      const closures = snapshot.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((c: any) => c.restaurantId === restaurantId)
        .sort((a, b) => new Date(b.closedAt || b.date || 0).getTime() - new Date(a.closedAt || a.date || 0).getTime());
      onUpdate(closures);
    }, (error) => {
      console.warn("Firestore real-time subscription (past_closures) info:", error.message);
    });
  } catch (err) {
    console.warn("Firebase past closures listener initialization:", err);
    return () => {};
  }
};
