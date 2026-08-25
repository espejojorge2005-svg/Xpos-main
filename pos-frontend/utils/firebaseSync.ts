import { collection, doc, onSnapshot, setDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export interface FirebaseOrder {
  id: string;
  tableId?: string;
  tableName?: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  customerName?: string;
  totalAmount: number;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
    status: 'ACTIVE' | 'SERVED' | 'CANCELED';
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface FirebaseTable {
  id: string;
  number: string;
  zoneId: string;
  capacity: number;
  status: 'FREE' | 'OCCUPIED' | 'WAITING_FOOD';
  posX: number;
  posY: number;
}

/**
 * Escuchar órdenes de cocina en tiempo real desde Firebase Firestore
 */
export const subscribeToKitchenOrders = (onUpdate: (orders: FirebaseOrder[]) => void) => {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('status', '==', 'OPEN'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const ordersData: FirebaseOrder[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FirebaseOrder));
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
export const subscribeToTables = (onUpdate: (tables: FirebaseTable[]) => void) => {
  try {
    const tablesRef = collection(db, 'tables');
    return onSnapshot(tablesRef, (snapshot) => {
      const tablesData: FirebaseTable[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FirebaseTable));
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
export const syncOrderToFirebase = async (order: FirebaseOrder) => {
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
export const syncTableToFirebase = async (tableId: string, status: 'FREE' | 'OCCUPIED' | 'WAITING_FOOD') => {
  try {
    const tableDocRef = doc(db, 'tables', tableId);
    await updateDoc(tableDocRef, {
      status,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Error syncing table to Firebase:", err);
  }
};
