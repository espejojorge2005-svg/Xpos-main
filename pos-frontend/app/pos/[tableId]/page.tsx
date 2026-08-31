'use client';
import { getApiUrl } from '@/utils/api';
import { getRestaurantId, getScopedStorage, setScopedStorage } from '@/utils/storage';

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { syncOrderToFirebase, syncTableToFirebase, syncStockMovementToFirebase, syncProductToFirebase, syncActiveTableOrdersToFirebase, syncShiftPaymentToFirebase, subscribeToProducts, subscribeToCategories } from '@/utils/firebaseSync';
import { ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, UtensilsCrossed, ReceiptText, ChefHat, CheckCircle2, AlertTriangle, X, Printer, CreditCard, Banknote, Smartphone, Edit2, Heart, ArrowRightLeft, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import ComboModal from '@/components/ComboModal';

interface Category {
  id: string;
  name: string;
  printerRoute: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  categoryId: string;
  isActive: boolean;
  modifierGroups?: any[]; // To support combo triggering
  stationIds?: string[];
  stations?: { id: string; name: string; printerName?: string; colorHex?: string }[];
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  subItems?: CartItem[];
}

interface ExistingItem extends CartItem {
  id: string;
  parentItemId?: string | null;
  isPaid?: boolean;
  status?: 'ACTIVE' | 'SERVED' | 'CANCELED' | 'CANCELLED';
}

// NUEVO: Interfaz para los pagos registrados
interface Payment {
  id: string;
  amount: number;
  method: string;
  tipAmount: number;
}

export default function PosTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const resolvedParams = use(params);
  const tableId = resolvedParams.tableId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCashierMode = searchParams.get('mode') === 'caja' || searchParams.get('checkout') === 'true';

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showCheckout, setShowCheckout] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [tableName, setTableName] = useState<string>('');

  // Estados para Editar Notas de ítems enviados
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>('');
  // Estados para Separar Cuentas
  const [showSplitBillModal, setShowSplitBillModal] = useState(false);
  const [selectedSplitItems, setSelectedSplitItems] = useState<string[]>([]);
  // Checkout mode determines if we are paying the full remaining or a selected split
  const [checkoutMode, setCheckoutMode] = useState<'NORMAL' | 'SPLIT'>('NORMAL');

  // Estados para Modificadores/Combos
  const [showComboModal, setShowComboModal] = useState(false);
  const [selectedComboProduct, setSelectedComboProduct] = useState<Product | null>(null);

  // Cambiar Mesa states
  const [showChangeTableModal, setShowChangeTableModal] = useState(false);
  const [freeTables, setFreeTables] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedNewTableId, setSelectedNewTableId] = useState<string | null>(null);

  // NUEVO: Estados avanzados para los pagos
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'REMOVE_ITEM' | 'CANCEL_ORDER';
    itemId?: string;
    itemName?: string;
  } | null>(null);

  // Restaurant config for the receipt
  const [restaurantConfig, setRestaurantConfig] = useState<{
    name: string; slogan?: string; address?: string; phone?: string; ruc?: string; logoUrl?: string;
  }>({ name: '' });
  const [userRole, setUserRole] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const userStr = localStorage.getItem('pos_user');
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.role || '';
      }
    } catch {}
    return '';
  });

  useEffect(() => {
    const cached = localStorage.getItem('pos_restaurant_config');
    if (cached) { try { setRestaurantConfig(JSON.parse(cached)); } catch { /**/ } }
    const userStr = localStorage.getItem('pos_user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.role) setUserRole(u.role);
      } catch {}
    }
    fetch(getApiUrl('/restaurant-config'))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRestaurantConfig(d); localStorage.setItem('pos_restaurant_config', JSON.stringify(d)); } })
      .catch(() => { /**/ });
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('pos_token');
      if (!token) {
        router.push('/login');
        return;
      }

      let loadedCats: Category[] = [];
      let loadedProds: Product[] = [];

      const currentRestId = getRestaurantId();
      try {
        const headers: Record<string, string> = { 
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId || ''
        };
        
        const [categoriesRes, productsRes, activeOrderRes] = await Promise.all([
          fetch(getApiUrl('/inventory/categories'), { headers }).catch(() => null),
          fetch(getApiUrl('/products'), { headers }).catch(() => null),
          fetch(getApiUrl(`/orders/table/${tableId}/active`), { headers }).catch(() => null)
        ]);

        if (categoriesRes && categoriesRes.ok) {
          try {
            const catsData = await categoriesRes.json();
            if (Array.isArray(catsData) && catsData.length > 0) {
              loadedCats = currentRestId
                ? catsData.filter((c: any) => c.restaurantId === currentRestId)
                : catsData;
            }
          } catch {}
        }

        if (productsRes && productsRes.ok) {
          try {
            const prodsData = await productsRes.json();
            if (Array.isArray(prodsData) && prodsData.length > 0) loadedProds = prodsData.filter((p: any) => p.isActive !== false);
          } catch {}
        }

        if (activeOrderRes && activeOrderRes.ok) {
          try {
            const activeOrderData = await activeOrderRes.json();
            setActiveOrderId(activeOrderData.id);
            setTableName(activeOrderData.table?.name || activeOrderData.table?.number || `Mesa ${tableId.slice(0,4)}`);
            
            if (activeOrderData.payments) {
              const loadedPayments = activeOrderData.payments.map((p: any) => ({
                id: p.id,
                amount: Number(p.amount),
                method: p.paymentMethod,
                tipAmount: Number(p.tipAmount || 0)
              }));
              setPayments(loadedPayments);
            }
            
            if (activeOrderData.items) {
              setExistingItems(activeOrderData.items.map((item: any) => ({
                id: item.id,
                productId: item.productId,
                name: item.product?.name || 'Producto Desconocido',
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                notes: item.notes,
                parentItemId: item.parentItemId,
                isPaid: item.isPaid
              })));
            }
          } catch {}
        }
      } catch (error) {
        console.warn('Network error loading remote table data, using local cache:', error);
      }

      // Local fallback for active table order (dishes already ordered)
      try {
        const activeTableOrders = getScopedStorage<any>('pos_active_table_orders', {});
        const tableOrder = activeTableOrders[tableId];
        if (tableOrder) {
          if (!activeOrderId && tableOrder.orderId) setActiveOrderId(tableOrder.orderId);
          if (tableOrder.tableName) setTableName(tableOrder.tableName);
          if (tableOrder.payments && Array.isArray(tableOrder.payments) && tableOrder.payments.length > 0) {
            setPayments(tableOrder.payments);
          }
          if (tableOrder.items && Array.isArray(tableOrder.items) && tableOrder.items.length > 0) {
            setExistingItems(tableOrder.items);
          }
        }
      } catch {}

      // Local fallback for Categories
      if (loadedCats.length === 0) {
        try {
          const cachedCats = getScopedStorage<Category[]>('pos_registered_categories', []);
          if (Array.isArray(cachedCats) && cachedCats.length > 0) loadedCats = cachedCats;
        } catch {}
      }

      // Local fallback for Products
      if (loadedProds.length === 0) {
        try {
          const cachedProds = getScopedStorage<Product[]>('pos_registered_products', []);
          if (Array.isArray(cachedProds) && cachedProds.length > 0) loadedProds = cachedProds;
        } catch {}
      }

      setCategories(loadedCats);
      setProducts(loadedProds);
      if (loadedCats.length > 0) {
        setSelectedCategoryId(loadedCats[0].id);
      }

      if (!tableName) {
        try {
          const registeredZones = getScopedStorage<any[]>('pos_registered_zones', []);
          let foundName = '';
          for (const z of registeredZones) {
            const t = (z.tables || []).find((tbl: any) => tbl.id === tableId);
            if (t) {
              foundName = t.name || (t.number ? `Mesa ${t.number}` : '');
              break;
            }
          }
          setTableName(foundName || `Mesa ${tableId.replace(/[^0-9]/g, '') || tableId.slice(0, 4)}`);
        } catch {
          setTableName(`Mesa ${tableId.replace(/[^0-9]/g, '') || tableId.slice(0, 4)}`);
        }
      }

      setLoading(false);
    };

    fetchData();

    const currentRestId = getRestaurantId();
    let unsubProds: (() => void) | undefined;
    let unsubCats: (() => void) | undefined;

    if (currentRestId) {
      unsubProds = subscribeToProducts(currentRestId, (cloudProds) => {
        if (Array.isArray(cloudProds) && cloudProds.length > 0) {
          const activeProds = cloudProds.filter((p: any) => p.isActive !== false);
          setProducts(activeProds);
          setScopedStorage('pos_registered_products', cloudProds);
        }
      });

      unsubCats = subscribeToCategories(currentRestId, (cloudCats) => {
        if (Array.isArray(cloudCats) && cloudCats.length > 0) {
          setCategories(cloudCats);
          setScopedStorage('pos_registered_categories', cloudCats);
        }
      });
    }

    return () => {
      if (typeof unsubProds === 'function') unsubProds();
      if (typeof unsubCats === 'function') unsubCats();
    };
  }, [router, tableId, isCashierMode]);

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategoryId ? p.categoryId === selectedCategoryId : true;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getProductUsage = (productId: string) => {
    const inCart = cart
      .filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
    const inExisting = existingItems
      .filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
    return inCart + inExisting;
  };

  const getAvailableStock = (product: Product) => {
    if (typeof product.stock !== 'number') return 999999;
    const currentUsage = getProductUsage(product.id);
    return Math.max(0, product.stock - currentUsage);
  };

  const addToCart = (product: Product, customItem?: CartItem) => {
    // Control estricto de inventario / stock disponible
    if (typeof product.stock === 'number') {
      const available = getAvailableStock(product);
      const requestedQty = customItem ? customItem.quantity : 1;
      if (available < requestedQty) {
        toast.warning(`Stock insuficiente para "${product.name}". Disponibles: ${available} de ${product.stock}`);
        return;
      }
    }

    // Si pasamos un customItem (como el resultado del ComboModal), lo insertamos directo como un row nuevo
    if (customItem) {
      setCart(prev => [...prev, customItem]);
      return;
    }

    // Si es un producto con combos y no pasamos customItem, abrimos modal
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setSelectedComboProduct(product);
      setShowComboModal(true);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && !item.subItems?.length);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id && !item.subItems?.length
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    if (delta > 0) {
      const prod = products.find(p => p.id === productId);
      if (prod && typeof prod.stock === 'number') {
        const available = getAvailableStock(prod);
        if (available <= 0) {
          toast.warning(`Stock máximo alcanzado para "${prod.name}" (${prod.stock} disponibles en inventario)`);
          return;
        }
      }
    }

    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeItem = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const handleNotesChange = (productId: string, notes: string) => {
    setCart(prev => prev.map(item => 
      item.productId === productId ? { ...item, notes } : item
    ));
  };

  // Cálculos dinámicos
  const existingSubtotal = existingItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const remainingAmount = Math.max(0, existingSubtotal - paidAmount);
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const totalAmount = existingSubtotal + cartSubtotal;

  const submitOrder = async () => {
    if (cart.length === 0) {
      toast.warning('No hay productos nuevos para enviar a cocina');
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem('pos_token') || '';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    const effectiveTableName = tableName || `Mesa ${tableId.replace(/[^0-9]/g, '') || tableId.slice(0, 4)}`;
    const effectiveOrderId = activeOrderId || `ord-${Date.now()}`;

    // 1. SINCRONIZACIÓN LOCAL GARANTIZADA PARA COCINA (KDS)
    const newKitchenItems = cart.map((cartItem, idx) => {
      const prod = products.find(p => p.id === cartItem.productId);
      const cat = categories.find(c => c.id === prod?.categoryId);
      return {
        id: `item-${Date.now()}-${idx}`,
        quantity: cartItem.quantity,
        notes: cartItem.notes || '',
        status: 'ACTIVE' as const,
        product: {
          name: cartItem.name,
          category: { name: cat?.name || 'General' },
          stations: (() => {
            if (prod?.stations && prod.stations.length > 0) return prod.stations;
            // Lookup in pos_registered_stations by stationIds
            let allStations: any[] = getScopedStorage<any[]>('pos_registered_stations', []);
            if (!allStations || allStations.length === 0) {
              try {
                const raw = localStorage.getItem('pos_registered_stations');
                if (raw) allStations = JSON.parse(raw);
              } catch {}
            }
            if (Array.isArray(allStations) && allStations.length > 0) {
              if (prod?.stationIds && prod.stationIds.length > 0) {
                const matched = allStations.filter((s: any) => prod.stationIds?.includes(s.id));
                if (matched.length > 0) return matched;
              }
              return [allStations[0]];
            }
            return [{ id: 'st-1', name: 'Cocina', colorHex: '#10b981' }];
          })()
        }
      };
    });

    try {
      let kitchenOrders: any[] = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
      const existingOrderIdx = kitchenOrders.findIndex(
        o => o.id === effectiveOrderId || (o.table && (o.table.name === effectiveTableName || o.table.id === tableId))
      );

      if (existingOrderIdx !== -1) {
        kitchenOrders[existingOrderIdx].items = [
          ...(kitchenOrders[existingOrderIdx].items || []),
          ...newKitchenItems
        ];
        kitchenOrders[existingOrderIdx].status = 'OPEN';
      } else {
        kitchenOrders.unshift({
          id: effectiveOrderId,
          createdAt: new Date().toISOString(),
          status: 'OPEN',
          table: { 
            id: tableId,
            name: effectiveTableName, 
            number: parseInt(tableId.replace(/[^0-9]/g, '') || '1', 10) 
          },
          items: newKitchenItems
        });
      }
      setScopedStorage('pos_local_kitchen_orders', kitchenOrders);
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.warn('Error guardando en pos_local_kitchen_orders:', e);
    }

    // 1.1 DESCONTAR INVENTARIO / STOCK LOCALMENTE Y REGISTRAR EN KARDEX
    try {
      const restId = getRestaurantId();
      let storedProducts = getScopedStorage<Product[]>('pos_registered_products', []);
      let stockMovements = getScopedStorage<any[]>('pos_stock_movements', []);
      if (Array.isArray(storedProducts) && storedProducts.length > 0) {
        storedProducts = storedProducts.map(p => {
          const cartItems = cart.filter(c => c.productId === p.id);
          const totalDeduction = cartItems.reduce((sum, it) => sum + it.quantity, 0);
          if (totalDeduction > 0 && typeof p.stock === 'number') {
            const oldStock = p.stock;
            const newStock = Math.max(0, oldStock - totalDeduction);
            const movement = {
              id: `mov-${Date.now()}-${p.id}`,
              productId: p.id,
              productName: p.name,
              delta: -totalDeduction,
              reason: `Venta Mesa ${tableName || tableId}`,
              stockBefore: oldStock,
              stockAfter: newStock,
              type: 'SALE',
              createdAt: new Date().toISOString(),
            };
            stockMovements.unshift(movement);
            if (restId) {
              syncStockMovementToFirebase(restId, movement).catch(() => {});
              syncProductToFirebase({
                ...p,
                stock: newStock,
                restaurantId: restId
              }).catch(() => {});
            }
            return {
              ...p,
              stock: newStock
            };
          }
          return p;
        });
        setScopedStorage('pos_stock_movements', stockMovements);
        setScopedStorage('pos_registered_products', storedProducts);
        setProducts(storedProducts);
      }
    } catch (e) {
      console.warn('Error descontando inventario:', e);
    }

    // 2. SINCRONIZACIÓN LOCAL GARANTIZADA PARA MESAS ACTIVAS (PLANO DE SALA)
    const combinedExistingItems: ExistingItem[] = [
      ...existingItems,
      ...cart.map((c, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        productId: c.productId,
        name: c.name,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        notes: c.notes,
        subItems: c.subItems,
        isPaid: false
      }))
    ];
    
    const newTotal = combinedExistingItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

    try {
      const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
      activeTableOrders[tableId] = {
        orderId: effectiveOrderId,
        tableName: effectiveTableName,
        createdAt: activeTableOrders[tableId]?.createdAt || new Date().toISOString(),
        total: newTotal,
        status: 'OCCUPIED',
        items: combinedExistingItems,
        payments: payments || []
      };
      setScopedStorage('pos_active_table_orders', activeTableOrders);
    } catch (e) {
      console.warn('Error guardando en pos_active_table_orders:', e);
    }

    // 3. INTENTO DE ENVÍO AL BACKEND REMOTO (Si está disponible)
    let backendOrder: any = null;
    try {
      let response;
      if (activeOrderId) {
        response = await fetch(getApiUrl(`/orders/${activeOrderId}/items`), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            items: cart.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              notes: item.notes || '',
              subItems: item.subItems ? item.subItems.map(sub => ({
                productId: sub.productId,
                quantity: sub.quantity,
                unitPrice: Number(sub.unitPrice),
                notes: sub.notes || ''
              })) : undefined
            }))
          })
        });
      } else {
        response = await fetch(getApiUrl('/orders'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            tableId,
            items: cart.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              notes: item.notes || '',
              subItems: item.subItems ? item.subItems.map(sub => ({
                productId: sub.productId,
                quantity: sub.quantity,
                unitPrice: Number(sub.unitPrice),
                notes: sub.notes || ''
              })) : undefined
            }))
          })
        });
      }

      if (response && response.ok) {
        backendOrder = await response.json().catch(() => null);
        if (backendOrder?.id && backendOrder.id !== effectiveOrderId) {
          try {
            const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
            if (activeTableOrders[tableId]) {
              activeTableOrders[tableId].orderId = backendOrder.id;
              setScopedStorage('pos_active_table_orders', activeTableOrders);
            }
          } catch {}
        }
      }
    } catch (netErr) {
      console.warn('Backend remoto offline al registrar pedido, funcionando en modo local:', netErr);
    }

    // Sincronizar SIEMPRE con Firebase para notificar a cocina y mesas en Tiempo Real (Garantizado Offline/Online)
    const restaurantId = getRestaurantId();
    if (restaurantId) {
      syncOrderToFirebase({
        id: backendOrder?.id || effectiveOrderId,
        tableId: tableId === 'takeout' ? undefined : tableId,
        tableName: effectiveTableName,
        status: 'OPEN',
        totalAmount: newTotal,
        items: combinedExistingItems.map(item => ({
          id: item.id || `item-${Date.now()}-${Math.random()}`,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          notes: item.notes || '',
          status: item.status || 'ACTIVE'
        })),
        createdAt: backendOrder?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        restaurantId
      }).catch(() => {});
      
      if (tableId !== 'takeout') {
        syncTableToFirebase(tableId, 'OCCUPIED', restaurantId).catch(() => {});
        try {
          const currentActive = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
          syncActiveTableOrdersToFirebase(restaurantId, currentActive).catch(() => {});
        } catch {}
      }
    }

    // 4. IMPRESIÓN EN COMANDERAS DE COCINA
    try {
      const printJobs = new Map<string, any[]>();
      cart.forEach(cartItem => {
        const product = products.find(p => p.id === cartItem.productId);
        if (product && product.stations && product.stations.length > 0) {
          product.stations.forEach(station => {
            if (station.printerName) {
              let itemsForPrinter = printJobs.get(station.printerName);
              if (!itemsForPrinter) {
                itemsForPrinter = [];
                printJobs.set(station.printerName, itemsForPrinter);
              }
              itemsForPrinter.push({
                quantity: cartItem.quantity,
                name: cartItem.name,
                notes: cartItem.notes || ''
              });
            }
          });
        }
      });

      for (const [printerName, items] of printJobs.entries()) {
        try {
          await fetch('http://localhost:4001/print/kitchen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              printerName,
              tableName: effectiveTableName,
              time: new Date().toLocaleTimeString('es-PE'),
              items,
            })
          }).catch(() => null);
        } catch {}
      }
    } catch {}

    // 5. NOTIFICACIÓN Y NAVEGACIÓN
    window.dispatchEvent(new Event('storage'));
    toast.success(activeOrderId ? 'Productos agregados al pedido ✅' : 'Pedido enviado a cocina y estaciones ✅');
    setSubmitting(false);
    router.push('/');
  };

  const handleRemoveExistingItemRequest = (item: ExistingItem) => {
    setConfirmAction({
      type: 'REMOVE_ITEM',
      itemId: item.id,
      itemName: item.name
    });
  };

  const executeRemoveItem = async () => {
    if (!activeOrderId || !confirmAction?.itemId) return;
    
    setSubmitting(true);
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl(`/orders/${activeOrderId}/items/${confirmAction.itemId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success("Producto eliminado");
        
        // Restaurar stock del producto eliminado
        const removedItem = existingItems.find(item => item.id === confirmAction.itemId);
        if (removedItem) {
          try {
            let storedProducts = getScopedStorage<Product[]>('pos_registered_products', []);
            storedProducts = storedProducts.map(p => {
              if (p.id === removedItem.productId && typeof p.stock === 'number') {
                return { ...p, stock: p.stock + removedItem.quantity };
              }
              return p;
            });
            setScopedStorage('pos_registered_products', storedProducts);
            setProducts(storedProducts);
          } catch {}
        }

        setExistingItems(prev => prev.filter(item => item.id !== confirmAction.itemId));
        setConfirmAction(null);
        
        if (existingItems.length === 1) {
          toast.info("El pedido se canceló porque no quedan productos");
          router.push('/');
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Error al eliminar producto");
      }
    } catch (error) {
      toast.error("Error de red al eliminar producto");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrderRequest = () => {
    setConfirmAction({ type: 'CANCEL_ORDER' });
  };

  const clearLocalTableOccupancy = () => {
    try {
      const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
      delete activeTableOrders[tableId];
      setScopedStorage('pos_active_table_orders', activeTableOrders);

      let localKitchen = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
      localKitchen = localKitchen.filter((o: any) => o.id !== activeOrderId && o.table?.name !== (tableName || `Mesa ${tableId}`));
      setScopedStorage('pos_local_kitchen_orders', localKitchen);
      window.dispatchEvent(new Event('storage'));
    } catch {}
  };

  const handleFreeTable = async () => {
    if (!isCashierMode) {
      toast.warning('Las mesas con consumos solo se pueden liberar y desocupar desde el módulo de Caja tras registrar el cobro.');
      return;
    }
    if (!confirm('¿Deseas liberar y desocupar esta mesa?')) return;
    clearLocalTableOccupancy();
    const restId = getRestaurantId();
    if (restId && tableId !== 'takeout') {
      syncTableToFirebase(tableId, 'FREE', restId).catch(() => {});
    }
    if (activeOrderId) {
      const token = localStorage.getItem('pos_token');
      fetch(getApiUrl(`/orders/${activeOrderId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    toast.success('Mesa liberada y desocupada exitosamente ✅');
    router.push('/');
  };

  const executeCancelOrder = async () => {
    // Restaurar stock de los productos no cobrados
    try {
      let storedProducts = getScopedStorage<Product[]>('pos_registered_products', []);
      storedProducts = storedProducts.map(p => {
        const found = existingItems.find(it => it.productId === p.id && !it.isPaid);
        if (found && typeof p.stock === 'number') {
          return { ...p, stock: p.stock + found.quantity };
        }
        return p;
      });
      setScopedStorage('pos_registered_products', storedProducts);
      setProducts(storedProducts);
    } catch {}

    clearLocalTableOccupancy();
    if (!activeOrderId) {
      toast.success("Pedido cancelado exitosamente");
      setConfirmAction(null);
      router.push('/');
      return;
    }
    
    setSubmitting(true);
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl(`/orders/${activeOrderId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success("Pedido cancelado exitosamente");
        setConfirmAction(null);
        router.push('/');
      } else {
        toast.success("Pedido cancelado exitosamente");
        setConfirmAction(null);
        router.push('/');
      }
    } catch (error) {
      toast.success("Pedido cancelado exitosamente");
      setConfirmAction(null);
      router.push('/');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = () => {
    if (confirmAction?.type === 'REMOVE_ITEM') {
      executeRemoveItem();
    } else if (confirmAction?.type === 'CANCEL_ORDER') {
      executeCancelOrder();
    }
  };

  const fetchFreeTables = async () => {
    setLoadingTables(true);
    let available: any[] = [];

    // 1. Intento con backend remoto si está disponible
    try {
      const token = localStorage.getItem('pos_token');
      const res = await fetch(getApiUrl('/floor/zones'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const zonesData = await res.json();
        available = zonesData.flatMap((z: any) => z.tables).filter((t: any) => t.status === 'FREE');
      }
    } catch (e) {
      console.warn('Backend offline para consultar zonas, usando almacenamiento local');
    }

    // 2. Fallback local: Cargar de pos_registered_zones y pos_active_table_orders
    if (available.length === 0) {
      try {
        const registeredZones = getScopedStorage<any[]>('pos_registered_zones', []);
        const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
        
        let allTables: any[] = [];
        if (Array.isArray(registeredZones) && registeredZones.length > 0) {
          allTables = registeredZones.flatMap(z => (z.tables || []).map((t: any) => ({
            ...t,
            zoneName: z.name
          })));
        } else {
          // Defaults estándar de salón y terraza
          allTables = [
            { id: 't-1', name: 'Mesa 1', number: 1, capacity: 4, zoneName: 'SALON' },
            { id: 't-2', name: 'Mesa 2', number: 2, capacity: 2, zoneName: 'SALON' },
            { id: 't-3', name: 'Mesa 3', number: 3, capacity: 6, zoneName: 'SALON' },
            { id: 't-4', name: 'Mesa 4', number: 4, capacity: 4, zoneName: 'SALON' },
            { id: 't-5', name: 'Mesa T1', number: 5, capacity: 4, zoneName: 'TERRAZA' },
            { id: 't-6', name: 'Mesa T2', number: 6, capacity: 2, zoneName: 'TERRAZA' },
          ];
        }

        // Filtrar solo las mesas que NO sean la mesa actual y que NO tengan pedido activo
        available = allTables.filter((t: any) => {
          if (t.id === tableId) return false;
          const order = activeTableOrders[t.id];
          const isOccupied = order && (order.status === 'OCCUPIED' || (Array.isArray(order.items) && order.items.length > 0));
          return !isOccupied && t.status !== 'OCCUPIED';
        });
      } catch (err) {
        console.warn('Error resolviendo mesas libres locales:', err);
      }
    }

    // Ordenar alfabéticamente
    available.sort((a: any, b: any) => {
      const nameA = a.name || String(a.number || '');
      const nameB = b.name || String(b.number || '');
      return nameA.localeCompare(nameB, undefined, { numeric: true });
    });

    setFreeTables(available);
    setLoadingTables(false);
  };

  const executeChangeTable = async () => {
    if (!selectedNewTableId) return;
    setSubmitting(true);

    const targetTable = freeTables.find(t => t.id === selectedNewTableId);
    const newTableName = targetTable?.name || (targetTable?.number ? `Mesa ${targetTable.number}` : `Mesa ${selectedNewTableId.slice(0, 4)}`);

    // 1. ACTUALIZAR LOCALMENTE DE FORMA GARANTIZADA
    try {
      const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
      const currentOrder = activeTableOrders[tableId];

      if (currentOrder) {
        activeTableOrders[selectedNewTableId] = {
          ...currentOrder,
          tableName: newTableName
        };
        delete activeTableOrders[tableId];
        setScopedStorage('pos_active_table_orders', activeTableOrders);
      }

      // Actualizar comanda de cocina local
      let localKitchen = getScopedStorage<any[]>('pos_local_kitchen_orders', []);
      localKitchen = localKitchen.map((o: any) => {
        if (o.id === activeOrderId || (o.table && o.table.name === (tableName || `Mesa ${tableId}`))) {
          return {
            ...o,
            table: {
              ...o.table,
              id: selectedNewTableId,
              name: newTableName,
              number: parseInt(selectedNewTableId.replace(/[^0-9]/g, '') || '1', 10)
            }
          };
        }
        return o;
      });
      setScopedStorage('pos_local_kitchen_orders', localKitchen);
      window.dispatchEvent(new Event('storage'));
    } catch (localErr) {
      console.warn('Error moviendo mesa localmente:', localErr);
    }

    // 2. SINCRONIZAR CON BACKEND SI ESTÁ DISPONIBLE
    if (activeOrderId) {
      try {
        const token = localStorage.getItem('pos_token');
        await fetch(getApiUrl(`/orders/${activeOrderId}/table`), {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ newTableId: selectedNewTableId })
        }).catch(() => null);
      } catch {}
    }

    toast.success(`Mesa cambiada exitosamente a ${newTableName} ✅`);
    setShowChangeTableModal(false);
    setSubmitting(false);
    router.push('/');
  };

  // ==========================================
  // LÓGICA AVANZADA DE PAGOS (Editar/Eliminar)
  // ==========================================
  const roundCurrency = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  const resetPaymentForm = (newAmount?: number) => {
    setEditingPaymentId(null);
    const calculatedRemaining = remainingAmount > 0 
      ? remainingAmount 
      : Math.max(0, existingSubtotal - paidAmount);
    const finalAmount = newAmount !== undefined && newAmount > 0 ? newAmount : calculatedRemaining;
    setPaymentAmount(roundCurrency(finalAmount));
    setTipAmount(0);
    setPaymentMethod('CASH');
  };

  const handleEditPaymentClick = (p: Payment) => {
    setEditingPaymentId(p.id);
    setPaymentAmount(p.amount);
    setTipAmount(p.tipAmount);
    setPaymentMethod(p.method as any);
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('¿Estás seguro de eliminar este pago de la cuenta?')) return;
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(getApiUrl(`/payments/${paymentId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setPayments(prev => prev.filter(p => p.id !== paymentId));
        toast.success("Pago eliminado correctamente");
        if (editingPaymentId === paymentId) resetPaymentForm(); // Resetear si estaba editándolo
      } else {
        toast.error("Error al eliminar el pago");
      }
    } catch (error) {
      toast.error("Error de red al eliminar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCheckout = async () => {
    const effectiveRemaining = remainingAmount > 0 ? remainingAmount : Math.max(0, existingSubtotal - paidAmount);
    const finalPaymentAmount = paymentAmount > 0 ? paymentAmount : effectiveRemaining;

    if (finalPaymentAmount <= 0) return toast.error("El monto debe ser mayor a cero");
    if (finalPaymentAmount !== paymentAmount) {
      setPaymentAmount(finalPaymentAmount);
    }
    
    setSubmitting(true);
    const token = localStorage.getItem('pos_token');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      let response;
      const effectiveOrderId = activeOrderId || `ord-${tableId}`;
      const bodyPayload: any = {
        orderId: effectiveOrderId,
        amount: finalPaymentAmount,
        tipAmount,
        paymentMethod
      };
      
      if (checkoutMode === 'SPLIT' && selectedSplitItems.length > 0) {
        bodyPayload.itemIds = selectedSplitItems;
      }

      if (editingPaymentId) {
        // Actualizar pago existente
        response = await fetch(getApiUrl(`/payments/${editingPaymentId}`), {
          method: 'PATCH',
          headers,
          body: JSON.stringify(bodyPayload)
        });
      } else {
        // Crear nuevo pago
        try {
          response = await fetch(getApiUrl('/payments'), {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyPayload)
          });
        } catch {}
      }

      let updatedPayments = [...payments, { id: `pay-${Date.now()}`, amount: paymentAmount, tipAmount, method: paymentMethod }];
      if (editingPaymentId) {
        updatedPayments = payments.map(p => p.id === editingPaymentId ? { ...p, amount: paymentAmount, tipAmount, method: paymentMethod } : p);
      }

      setPayments(updatedPayments);

      // Record in local cash shift for Cashier / Daily Report and sync to Firebase
      const restId = getRestaurantId();
      const newPaymentRecord = {
        id: `pay-${Date.now()}`,
        orderId: activeOrderId || `ord-${tableId}`,
        table: tableName || `Mesa ${tableId.replace(/[^0-9]/g, '') || tableId.slice(0, 4)}`,
        amount: paymentAmount,
        method: paymentMethod,
        tipAmount: tipAmount || 0,
        date: new Date().toISOString(),
        items: existingItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.unitPrice }))
      };

      try {
        const shiftData = getScopedStorage<any>('mock_cash_shift', null);
        if (shiftData) {
          if (!shiftData.payments) shiftData.payments = [];
          shiftData.payments.push(newPaymentRecord);
          setScopedStorage('mock_cash_shift', shiftData);
        }
      } catch {}

      if (restId) {
        syncShiftPaymentToFirebase(restId, newPaymentRecord).catch(() => {});
      }

      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
      
      if (newTotalPaid >= (existingSubtotal || paymentAmount)) {
        clearLocalTableOccupancy();
        if (restId && tableId !== 'takeout') {
          syncTableToFirebase(tableId, 'FREE', restId).catch(() => {});
          try {
            const currentActive = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
            delete currentActive[tableId];
            syncActiveTableOrdersToFirebase(restId, currentActive).catch(() => {});
          } catch {}
        }
        toast.success("Cuenta cobrada en su totalidad y mesa liberada ✅");
        setShowCheckout(false);
        if (isCashierMode) {
          router.push('/report');
        } else {
          router.push('/');
        }
      } else {
        // Update remaining balance in active table orders
        try {
          const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
          if (activeTableOrders[tableId]) {
            activeTableOrders[tableId].payments = updatedPayments;
            setScopedStorage('pos_active_table_orders', activeTableOrders);
            if (restId) {
              syncActiveTableOrdersToFirebase(restId, activeTableOrders).catch(() => {});
            }
          }
        } catch {}
        toast.success("Pago parcial registrado ✅");
        resetPaymentForm(existingSubtotal - newTotalPaid);
      }
    } catch (error) {
      toast.error("Error al registrar el cobro");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveExistingNote = async (itemId: string, newNote: string) => {
    if (!activeOrderId) return;
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(getApiUrl(`/orders/${activeOrderId}/items/${itemId}/notes`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ notes: newNote })
      });
      if (response.ok) {
        setExistingItems(prev => prev.map(i => i.id === itemId ? { ...i, notes: newNote } : i));
        setEditingNoteItemId(null);
        toast.success("Nota actualizada en cocina");
      } else {
        toast.error("Error al actualizar la nota");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <>
      {/* PRINTABLE PRE-CUENTA */}
      <div className="hidden print:block w-[80mm] text-black bg-white p-4 font-mono text-[11px] leading-tight">
        {/* ===== HEADER ===== */}
        <div className="text-center mb-3">
          {/* Logo */}
          {restaurantConfig.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurantConfig.logoUrl} alt="logo" className="h-16 mx-auto mb-2 object-contain" />
          )}
          <h2 className="font-bold text-base uppercase tracking-wide">{restaurantConfig.name || 'MI RESTAURANTE'}</h2>
          {restaurantConfig.slogan && <p className="text-[10px] italic mt-0.5">{restaurantConfig.slogan}</p>}
          {restaurantConfig.address && <p className="text-[10px] mt-0.5">{restaurantConfig.address}</p>}
          <div className="flex justify-center gap-4 mt-0.5">
            {restaurantConfig.phone && <p className="text-[10px]">Tel: {restaurantConfig.phone}</p>}
            {restaurantConfig.ruc && <p className="text-[10px]">RUC: {restaurantConfig.ruc}</p>}
          </div>
        </div>

        <div className="border-b border-dashed border-black my-2" />

        {/* ===== TICKET INFO ===== */}
        <div className="text-center mb-2">
          <p className="font-bold text-sm uppercase">PRE-CUENTA — MESA {tableName || tableId.slice(0,4)}</p>
          {showSplitBillModal && <p className="text-[10px] font-bold uppercase tracking-wide mt-0.5">(Cuenta Dividida)</p>}
          <p className="text-[10px] text-gray-600 mt-0.5">{new Date().toLocaleString('es-PE')}</p>
        </div>

        <div className="border-b border-dashed border-black my-2" />

        {/* ===== ITEMS ===== */}
        <table className="w-full mb-1 text-[11px]">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="text-left font-bold pb-1 w-4">Cant</th>
              <th className="text-left font-bold pb-1 pl-1">Descripción</th>
              <th className="text-right font-bold pb-1 w-12">P.U.</th>
              <th className="text-right font-bold pb-1 w-14">Total</th>
            </tr>
          </thead>
          <tbody>
            {existingItems
              .filter(i => !i.parentItemId)
              .filter(i => showSplitBillModal ? selectedSplitItems.includes(i.id) : true)
              .map(item => (
                <tr key={item.id}>
                  <td className="align-top py-0.5">{item.quantity}</td>
                  <td className="align-top py-0.5 pl-1 pr-1">
                    <span>{item.name}</span>
                    {/* Sub-items (combo options) */}
                    {existingItems
                      .filter(s => s.parentItemId === item.id)
                      .map(sub => (
                        <div key={sub.id} className="text-[10px] text-gray-500 pl-1">↳ {sub.name}</div>
                      ))}
                  </td>
                  <td className="align-top text-right py-0.5">{item.unitPrice.toFixed(2)}</td>
                  <td className="align-top text-right py-0.5">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                </tr>
            ))}
          </tbody>
        </table>

        <div className="border-b border-dashed border-black my-2" />

        {/* ===== TOTAL ===== */}
        <div className="flex justify-between font-bold text-sm mt-1">
          <span>{showSplitBillModal ? 'SUBTOTAL:' : 'TOTAL:'}</span>
          <span>S/ {showSplitBillModal
            ? selectedSplitItems.reduce((sum, id) => {
                const it = existingItems.find(i => i.id === id);
                return sum + (it ? it.quantity * it.unitPrice : 0);
              }, 0).toFixed(2)
            : existingSubtotal.toFixed(2)}
          </span>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="text-center mt-6 pt-3 border-t border-dashed border-black">
          <p className="font-bold text-xs">¡Gracias por su visita!</p>
          {restaurantConfig.name && <p className="text-[10px] mt-0.5 text-gray-500">{restaurantConfig.name}</p>}
        </div>
      </div>

    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans print:hidden">
      
      {/* LEFT PANE - MENU SECTION */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
            >
              <ArrowLeft className="w-6 h-6 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <ChefHat className="text-emerald-500 w-6 h-6" />
                Nueva Orden
              </h1>
              <p className="text-sm text-slate-500 font-medium">Selecciona los productos para agregar al pedido</p>
            </div>
          </div>

          <div className="relative w-64 hidden md:block">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm font-medium text-slate-700"
            />
          </div>
        </header>

        {/* Categories Scroller */}
        <div className="bg-white px-6 py-3 border-b border-slate-100 shrink-0">
          <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar hide-scrollbar-arrows">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm
                ${selectedCategoryId === null 
                  ? 'bg-slate-800 text-white hover:bg-slate-700' 
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-100'}`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm
                  ${selectedCategoryId === cat.id 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200' 
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth pb-24 lg:pb-6">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <UtensilsCrossed className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium text-lg text-slate-500">No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredProducts.map(product => {
                const available = getAvailableStock(product);
                const isOutOfStock = typeof product.stock === 'number' && available <= 0;
                const isLowStock = typeof product.stock === 'number' && available > 0 && available <= 3;

                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (isOutOfStock) {
                        toast.error(`"${product.name}" está agotado`);
                        return;
                      }
                      addToCart(product);
                    }}
                    disabled={isOutOfStock}
                    className={`border rounded-2xl p-4 flex flex-col items-center text-center transition-all group relative overflow-hidden ${
                      isOutOfStock 
                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' 
                        : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-lg hover:-translate-y-1 active:scale-95'
                    }`}
                  >
                    {/* Badge de Stock */}
                    {typeof product.stock === 'number' && (
                      <div className="absolute top-2 right-2 z-10">
                        {isOutOfStock ? (
                          <span className="px-2 py-0.5 bg-rose-500 text-white font-black text-[10px] rounded-full shadow-sm">
                            Agotado
                          </span>
                        ) : isLowStock ? (
                          <span className="px-2 py-0.5 bg-amber-500 text-white font-black text-[10px] rounded-full shadow-sm">
                            Quedan {available}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-full border border-slate-200">
                            Stock: {available}
                          </span>
                        )}
                      </div>
                    )}

                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 transition-colors ${
                      isOutOfStock ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 group-hover:bg-emerald-50'
                    }`}>
                      <UtensilsCrossed className={`w-8 h-8 ${isOutOfStock ? 'text-slate-300' : 'text-slate-300 group-hover:text-emerald-500'}`} />
                    </div>
                    <h3 className={`font-bold text-sm mb-1 line-clamp-2 min-h-[40px] ${isOutOfStock ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {product.name}
                    </h3>
                    <div className="mt-auto pt-2 flex items-center justify-between w-full">
                      <span className={`font-black ${isOutOfStock ? 'text-slate-400' : 'text-emerald-600'}`}>
                        S/ {product.price.toFixed(2)}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${available > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} 
                            title={available > 0 ? `En stock (${available})` : 'Agotado'}></div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile Floating Cart Summary */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 z-30 transform transition-all">
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all text-white font-black py-4 px-5 rounded-2xl flex items-center justify-between shadow-xl shadow-emerald-200/50"
          >
            <div className="flex items-center gap-3 text-[15px]">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {cart.length + existingItems.length}
                </span>
              </div>
              <span className="hidden sm:inline">Ver Pedido</span>
            </div>
            <span className="text-lg tracking-tight">S/ {totalAmount.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {/* Mobile Cart Backdrop */}
      {isCartOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity" 
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* RIGHT PANE - TICKET (CART) */}
      <div className={`
        fixed inset-y-0 right-0 z-50 w-[90%] sm:w-[400px] bg-white border-l border-slate-200 flex flex-col shadow-2xl 
        transform transition-transform duration-300 ease-in-out
        ${isCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        lg:static lg:z-20 lg:shrink-0 lg:w-[380px] lg:shadow-none lg:border-l lg:border-slate-200
      `}>
        
        {/* Cart Header */}
        <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base md:text-lg font-black text-slate-800 flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-emerald-600" />
              Ticket de Venta
            </h2>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-700 text-[11px] md:text-xs font-bold px-2.5 py-1 rounded-md max-w-[100px] truncate">
                Mesa {tableName || tableId.slice(0,4)}
              </span>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="lg:hidden p-1.5 bg-slate-200 hover:bg-slate-300 active:scale-90 rounded-full text-slate-600 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500 font-medium">
            <span>{existingItems.length + cart.length} ítems</span>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {existingItems.length === 0 && cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
              <ShoppingCart className="w-12 h-12 text-slate-200" />
              <p className="font-medium">El carrito está vacío</p>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Existing Items Section */}
              {existingItems.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Ya enviados a cocina
                  </h3>
                  {existingItems.map(item => (
                    <div key={item.id} className="bg-slate-100/50 border border-slate-200 rounded-xl p-3 opacity-75 relative">
                      {item.isPaid && (
                        <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Pagado
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-slate-700 text-sm pr-2 line-clamp-2 flex-1">
                          {item.quantity}x {item.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-700 text-sm">
                            S/ {(item.quantity * item.unitPrice).toFixed(2)}
                          </span>
                          {!item.isPaid && (
                            <button 
                              onClick={() => {
                                setEditingNoteItemId(item.id);
                                setEditingNoteText(item.notes || '');
                              }}
                              className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar nota enviada"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleRemoveExistingItemRequest(item)}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar producto enviado"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {editingNoteItemId === item.id ? (
                        <div className="flex gap-2 mt-2">
                          <input 
                            type="text" 
                            autoFocus
                            placeholder="Notas (ej. sin lactosa)" 
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveExistingNote(item.id, editingNoteText);
                              if (e.key === 'Escape') setEditingNoteItemId(null);
                            }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                          />
                          <button 
                            onClick={() => handleSaveExistingNote(item.id, editingNoteText)}
                            className="p-1 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg text-xs font-bold px-2 transition-colors"
                          >
                            Guardar
                          </button>
                          <button 
                            onClick={() => setEditingNoteItemId(null)}
                            className="p-1 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-lg text-xs font-bold px-2 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        item.notes && (
                          <div className="text-xs text-slate-500 italic mt-1 bg-white px-2 py-1 rounded border border-slate-200">
                            "{item.notes}"
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}

              {existingItems.length > 0 && cart.length > 0 && (
                <div className="border-t border-slate-200 my-4"></div>
              )}

              {/* New Cart Items Section */}
              {cart.length > 0 && (
                <div className="space-y-3">
                  {existingItems.length > 0 && (
                     <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                       Nuevos Productos
                     </h3>
                  )}
                  {cart.map(item => (
                    <div key={item.productId} className="bg-emerald-50/50 border border-emerald-200/50 rounded-xl p-3 animate-in fade-in slide-in-from-right-4 duration-300">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800 text-sm pr-2 line-clamp-2 flex-1">
                          {item.name}
                        </span>
                        <span className="font-black text-slate-900 text-sm">
                          S/ {(item.quantity * item.unitPrice).toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          S/ {item.unitPrice.toFixed(2)} c/u
                        </span>
                        
                        <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                          <button 
                            onClick={() => updateQuantity(item.productId, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 active:bg-slate-200 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-6 text-center font-bold text-slate-800 text-sm">
                            {item.quantity}
                          </span>
                          <button 
                            onClick={() => updateQuantity(item.productId, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 active:bg-slate-200 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Notas (ej. sin cebolla)" 
                          value={item.notes || ''}
                          onChange={(e) => handleNotesChange(item.productId, e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 placeholder:text-slate-400"
                        />
                        <button 
                          onClick={() => removeItem(item.productId)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Eliminar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Renderizado de Modificadores (Si es un Combo) */}
                      {item.subItems && item.subItems.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-emerald-200/50 pl-2">
                          <p className="text-[10px] font-black uppercase text-emerald-600 mb-1 tracking-wider">Incluye:</p>
                          <ul className="space-y-1">
                            {item.subItems.map((sub, sIdx) => (
                              <li key={sIdx} className="text-xs font-medium text-slate-600 flex justify-between">
                                  <span>- {sub.name}</span>
                                  {sub.unitPrice > 0 && <span className="text-emerald-600 font-bold">+S/ {sub.unitPrice.toFixed(2)}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

        {/* Cart Footer / Totals */}
        <div className="bg-white border-t border-slate-200 p-5 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-10">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-500 font-bold text-base">Total Pedido:</span>
            <div className="flex flex-col items-end w-full">
              <span className="text-2xl font-black text-emerald-600 mb-2">
                S/ {totalAmount.toFixed(2)}
              </span>
              {(activeOrderId || existingItems.length > 0) && (
                <div className="flex items-center gap-2 w-full mt-1">
                  <button 
                    onClick={() => {
                        fetchFreeTables();
                        setShowChangeTableModal(true);
                    }}
                    className="flex-1 py-2 px-2 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 font-bold text-xs rounded-lg transition-all flex justify-center items-center gap-1.5 outline-none shadow-sm"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    Cambiar Mesa
                  </button>
                  {isCashierMode && (
                    <>
                      <button 
                        onClick={handleFreeTable}
                        className="flex-1 py-2 px-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold text-xs rounded-lg transition-all flex justify-center items-center gap-1.5 outline-none shadow-sm"
                        title="Desocupar mesa y marcar como libre"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Liberar Mesa
                      </button>
                      <button 
                        onClick={handleCancelOrderRequest}
                        className="flex-1 py-2 px-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 font-bold text-xs rounded-lg transition-all flex justify-center items-center gap-1.5 outline-none shadow-sm"
                      >
                        <Trash2 className="w-3 h-3" />
                        Anular
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {cart.length === 0 && (activeOrderId || existingItems.length > 0) ? (
            !isCashierMode ? (
              <div className="flex flex-col gap-2 w-full">
                <button 
                  onClick={() => {
                    window.print();
                    try {
                      const activeTableOrders = getScopedStorage<Record<string, any>>('pos_active_table_orders', {});
                      if (activeTableOrders[tableId]) {
                        activeTableOrders[tableId].billRequested = true;
                        setScopedStorage('pos_active_table_orders', activeTableOrders);
                        window.dispatchEvent(new Event('storage'));
                      }
                    } catch {}
                    toast.success('Pre-cuenta impresa y enviada a Caja para cobro oficial ✅');
                    router.push('/');
                  }}
                  disabled={existingItems.length === 0}
                  className="w-full py-4 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
                >
                  <Printer className="w-5 h-5" />
                  IMPRIMIR PRE-CUENTA / PEDIR A CAJA
                </button>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center text-amber-800 text-xs font-semibold flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  Los meseros no cobran. La cuenta se cobra exclusivamente en Caja.
                </div>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => {
                    setCheckoutMode('NORMAL');
                    const targetRemaining = remainingAmount > 0 
                      ? remainingAmount 
                      : Math.max(0, existingSubtotal - paidAmount);
                    resetPaymentForm(targetRemaining);
                    setShowCheckout(true);
                  }}
                  disabled={submitting || existingItems.length === 0}
                  className={`flex-[2] py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]
                    ${submitting || existingItems.length === 0
                      ? 'bg-slate-300 opacity-70 cursor-not-allowed shadow-none' 
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-200 hover:shadow-blue-300'}`}
                >
                  <ReceiptText className="w-5 h-5" />
                  COBRAR CUENTA (CAJA)
                </button>
                <button 
                  onClick={() => {
                    setSelectedSplitItems([]);
                    setShowSplitBillModal(true);
                  }}
                  disabled={submitting || existingItems.length === 0 || existingItems.every(i => i.isPaid)}
                  className={`flex-1 py-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.98] border-2
                    ${submitting || existingItems.length === 0 || existingItems.every(i => i.isPaid)
                      ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 shadow-sm'}`}
                >
                  <Scissors className="w-4 h-4" />
                  <span className="text-[10px] uppercase leading-none">Dividir</span>
                </button>
              </div>
            )
          ) : (
            <button 
              onClick={submitOrder}
              disabled={cart.length === 0 || submitting}
              className={`w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]
                ${cart.length === 0 || submitting
                  ? 'bg-slate-300 opacity-70 cursor-not-allowed shadow-none' 
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200 hover:shadow-emerald-300'}`}
            >
              {submitting ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <UtensilsCrossed className="w-5 h-5" />
                  {activeOrderId ? 'AGREGAR AL PEDIDO' : 'ENVIAR A COCINA'}
                </>
              )}
            </button>
          )}
        </div>

      </div>

      {/* MODAL DE COBRO AVANZADO (Solo desde Caja) */}
      {showCheckout && isCashierMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-[90%] max-w-lg flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]">
            
            <div className="bg-blue-600 text-white p-5 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-black flex items-center gap-2">
                  <ReceiptText className="w-6 h-6 text-blue-200" />
                  Cobrar Cuenta
                </h3>
                <p className="text-blue-100 text-sm font-medium mt-0.5">Mesa {tableName || tableId.slice(0,4)}</p>
              </div>
              <button 
                onClick={() => {
                  setShowCheckout(false);
                  setEditingPaymentId(null);
                }}
                className="text-white hover:bg-white/20 p-2 rounded-full transition-colors outline-none"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 font-sans bg-slate-50/50">
              
              {/* RESUMEN DE SALDOS */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-1">Total Cuenta</span>
                  <span className="text-2xl font-black text-slate-800">S/ {existingSubtotal.toFixed(2)}</span>
                </div>
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-200 flex flex-col justify-center items-center text-center">
                  <span className="text-rose-500 font-bold text-xs uppercase tracking-wider mb-1">Saldo Pendiente</span>
                  <span className="text-2xl font-black text-rose-700">S/ {remainingAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* LISTA DE PAGOS REGISTRADOS */}
              {payments.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Pagos Registrados</h4>
                  <div className="space-y-2">
                    {payments.map(p => (
                      <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${editingPaymentId === p.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${p.method === 'CASH' ? 'bg-emerald-100 text-emerald-600' : p.method === 'CARD' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                            {p.method === 'CASH' && <Banknote className="w-5 h-5" />}
                            {p.method === 'CARD' && <CreditCard className="w-5 h-5" />}
                            {p.method === 'TRANSFER' && <Smartphone className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-base">S/ {p.amount.toFixed(2)}</p>
                            {p.tipAmount > 0 && (
                              <p className="text-[10px] font-bold text-violet-500 flex items-center gap-1 mt-0.5">
                                <Heart className="w-3 h-3 fill-violet-200" /> Propina: S/ {p.tipAmount.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleEditPaymentClick(p)} className={`p-2 rounded-lg transition-colors ${editingPaymentId === p.id ? 'bg-blue-200 text-blue-700' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`} title="Editar Pago">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletePayment(p.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar Pago">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FORMULARIO DE PAGO (NUEVO O EDICIÓN) */}
              {(remainingAmount > 0 || editingPaymentId) && (
                <div className={`p-5 rounded-2xl border-2 transition-colors ${editingPaymentId ? 'bg-white border-blue-400 shadow-md shadow-blue-100' : 'bg-white border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className={`text-sm font-bold flex items-center gap-2 ${editingPaymentId ? 'text-blue-700' : 'text-slate-700'}`}>
                      {editingPaymentId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4 text-emerald-500" />}
                      {editingPaymentId ? 'Editando Pago Seleccionado' : 'Registrar Nuevo Pago'}
                    </h4>
                    {editingPaymentId && (
                      <button onClick={() => resetPaymentForm()} className="text-xs font-bold text-slate-400 hover:text-slate-600 underline">
                        Cancelar edición
                      </button>
                    )}
                  </div>

                  <div className="mb-5">
                    <label className="block text-slate-500 font-bold mb-2 text-xs uppercase tracking-wider">Monto a Cobrar</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">S/</span>
                      <input 
                        type="number" min="0" step="0.01"
                        value={paymentAmount || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setPaymentAmount(isNaN(val) ? 0 : roundCurrency(val));
                        }}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-black text-slate-800 text-lg"
                      />
                    </div>
                  </div>

                  <div className="mb-5">
                    <label className="block text-slate-500 font-bold mb-2 text-xs uppercase tracking-wider flex items-center gap-1">
                      Propina (Opcional) <Heart className="w-3 h-3 text-violet-400" />
                    </label>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <button 
                        type="button" 
                        onClick={() => setTipAmount(0)} 
                        className={`py-2 rounded-xl font-bold text-sm transition-all border ${tipAmount === 0 ? 'bg-violet-100 border-violet-400 text-violet-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      >
                        0%
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setTipAmount(roundCurrency(paymentAmount * 0.1))} 
                        className={`py-2 rounded-xl font-bold text-sm transition-all border ${tipAmount > 0 && Math.abs(tipAmount - roundCurrency(paymentAmount * 0.1)) < 0.01 ? 'bg-violet-100 border-violet-400 text-violet-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      >
                        10%
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setTipAmount(roundCurrency(paymentAmount * 0.15))} 
                        className={`py-2 rounded-xl font-bold text-sm transition-all border ${tipAmount > 0 && Math.abs(tipAmount - roundCurrency(paymentAmount * 0.15)) < 0.01 ? 'bg-violet-100 border-violet-400 text-violet-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      >
                        15%
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setTipAmount(roundCurrency(paymentAmount * 0.2))} 
                        className={`py-2 rounded-xl font-bold text-sm transition-all border ${tipAmount > 0 && Math.abs(tipAmount - roundCurrency(paymentAmount * 0.2)) < 0.01 ? 'bg-violet-100 border-violet-400 text-violet-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      >
                        20%
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-400 font-bold">S/</span>
                      <input 
                        type="number" min="0" step="0.01"
                        value={tipAmount === 0 ? '' : tipAmount}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setTipAmount(isNaN(val) ? 0 : roundCurrency(val));
                        }}
                        placeholder="Monto personalizado"
                        className="w-full pl-10 pr-4 py-2.5 bg-violet-50/50 border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 font-bold text-violet-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-2 text-xs uppercase tracking-wider">Método de Pago</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setPaymentMethod('CASH')} className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all ${paymentMethod === 'CASH' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        <Banknote className="w-6 h-6 mb-1" />
                        <span className="font-bold text-[11px] uppercase">Efectivo</span>
                      </button>
                      <button onClick={() => setPaymentMethod('CARD')} className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all ${paymentMethod === 'CARD' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        <CreditCard className="w-6 h-6 mb-1" />
                        <span className="font-bold text-[11px] uppercase">Tarjeta</span>
                      </button>
                      <button onClick={() => setPaymentMethod('TRANSFER')} className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all ${paymentMethod === 'TRANSFER' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        <Smartphone className="w-6 h-6 mb-1" />
                        <span className="font-bold text-[11px] uppercase">Yape/Plin</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* BOTONERA INFERIOR */}
            <div className="p-5 border-t border-slate-100 bg-white shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
              {(remainingAmount > 0 || editingPaymentId) ? (
                <>
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-slate-500 font-bold text-sm">Este pago procesará:</span>
                    <span className="text-2xl font-black text-blue-600">
                      S/ {(paymentAmount + tipAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => window.print()}
                      title="Imprimir Pre-cuenta"
                      className="px-5 py-4 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-colors outline-none flex items-center justify-center shrink-0"
                    >
                      <Printer className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={handleConfirmCheckout}
                      disabled={submitting}
                      className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 text-white font-black text-lg rounded-xl transition-all active:scale-[0.98] outline-none flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <CheckCircle2 className="w-6 h-6" />
                          {editingPaymentId ? 'ACTUALIZAR PAGO' : 'REGISTRAR PAGO'}
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                // Si ya no hay saldo pendiente y no se está editando nada
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="flex items-center gap-2 text-emerald-600 font-black text-lg bg-emerald-50 px-4 py-2 rounded-xl w-full justify-center border border-emerald-200">
                    <CheckCircle2 className="w-6 h-6" /> Cuenta Saldada
                  </div>
                  <button 
                    onClick={() => {
                      setShowCheckout(false);
                      router.push('/');
                    }}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-black text-base rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-slate-200 outline-none"
                  >
                    Volver al Salón
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL OVERLAY */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-[90%] max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="bg-rose-100 p-2 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-slate-800">
                  {confirmAction.type === 'REMOVE_ITEM' ? 'Confirmar Eliminación' : 'Cancelar Pedido Completo'}
                </h3>
              </div>
              <button 
                onClick={() => setConfirmAction(null)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-full transition-colors outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-600 text-sm font-medium mb-6 px-1">
              {confirmAction.type === 'REMOVE_ITEM' 
                ? `¿Estás seguro que deseas eliminar "${confirmAction.itemName}" del pedido? Esto restará su valor de la cuenta actual.`
                : '¿Estás seguro que deseas anular todos los productos de este pedido? La cuenta se volverá cero y la mesa quedará libre. Esta acción no se puede deshacer.'}
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors outline-none"
                disabled={submitting}
              >
                No, volver
              </button>
              <button 
                onClick={handleConfirmAction}
                disabled={submitting}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-200 text-white font-bold rounded-xl transition-all active:scale-95 outline-none flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Sí, eliminar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CAMBIAR MESA */}
      {showChangeTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-[90%] max-w-md flex flex-col animate-in zoom-in-95 duration-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800">Cambiar de Mesa</h3>
              <button 
                onClick={() => {
                  setShowChangeTableModal(false);
                  setSelectedNewTableId(null);
                }} 
                className="text-slate-400 hover:text-slate-600 outline-none"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {loadingTables ? (
               <div className="flex py-10 justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div></div>
            ) : freeTables.length === 0 ? (
               <p className="text-slate-500 text-center py-6 font-medium">No hay mesas libres disponibles.</p>
            ) : (
               <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                 {freeTables.map(t => (
                   <button
                     key={t.id}
                     onClick={() => setSelectedNewTableId(t.id)}
                     className={`py-3 px-2 rounded-xl text-sm font-bold border-2 transition-all ${selectedNewTableId === t.id ? 'bg-emerald-50 border-emerald-500 text-emerald-700 cursor-default' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-emerald-300'}`}
                   >
                     {t.name || t.number}
                   </button>
                 ))}
               </div>
            )}

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => {
                  setShowChangeTableModal(false);
                  setSelectedNewTableId(null);
                }}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
               >
                 Cancelar
               </button>
               <button 
                 onClick={executeChangeTable}
                 disabled={!selectedNewTableId || submitting}
                 className={`flex-1 py-3 rounded-xl font-bold text-white transition-colors ${!selectedNewTableId || submitting ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200'}`}
               >
                 Confirmar
               </button>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* MODAL DE SEPARAR CUENTA */}
      {showSplitBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-[90%] max-w-lg flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]">
            
            <div className="bg-slate-800 text-white p-5 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2 leading-none mb-1">
                  <Scissors className="w-5 h-5 text-slate-300" />
                  Dividir Cuenta
                </h3>
                <p className="text-slate-300 text-xs font-medium">Selecciona los productos a cobrar por separado</p>
              </div>
              <button 
                onClick={() => setShowSplitBillModal(false)}
                className="text-slate-300 hover:bg-slate-700 p-2 rounded-full transition-colors outline-none"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 font-sans bg-slate-50/50 min-h-[300px]">
               {existingItems.filter(item => !item.isPaid).length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-400">
                   <p className="font-medium">No hay productos pendientes por cobrar.</p>
                 </div>
               ) : (
                 <div className="space-y-2">
                   {existingItems.filter(item => !item.isPaid).map(item => {
                     const isSelected = selectedSplitItems.includes(item.id);
                     return (
                       <div 
                         key={item.id} 
                         onClick={() => {
                           if (isSelected) {
                             setSelectedSplitItems(prev => prev.filter(id => id !== item.id));
                           } else {
                             setSelectedSplitItems(prev => [...prev, item.id]);
                           }
                         }}
                         className={`p-4 rounded-xl border-2 flex items-center gap-4 cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-200'}`}
                       >
                         <div className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                           {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                         </div>
                         <div className="flex-1">
                           <p className={`font-bold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{item.quantity}x {item.name}</p>
                           {item.notes && <p className="text-xs text-slate-500 italic mt-0.5">"{item.notes}"</p>}
                         </div>
                         <span className={`font-black ${isSelected ? 'text-blue-700' : 'text-slate-600'}`}>
                           S/ {(item.quantity * item.unitPrice).toFixed(2)}
                         </span>
                       </div>
                     );
                   })}
                 </div>
               )}
            </div>
            
            <div className="p-5 border-t border-slate-100 bg-white shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
               <div className="flex justify-between items-center mb-4 px-1">
                 <span className="font-bold text-slate-500 text-sm">Total Seleccionado:</span>
                 <span className="text-2xl font-black text-blue-600">
                   S/ {selectedSplitItems.reduce((sum, id) => {
                     const it = existingItems.find(i => i.id === id);
                     return sum + (it ? (it.quantity * it.unitPrice) : 0);
                   }, 0).toFixed(2)}
                 </span>
               </div>
               
               <div className="flex gap-3">
                 <button 
                   onClick={() => {
                     if (selectedSplitItems.length > 0) window.print();
                   }}
                   disabled={selectedSplitItems.length === 0}
                   className={`px-5 py-3 rounded-xl flex items-center justify-center transition-all ${selectedSplitItems.length === 0 ? 'border border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed' : 'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 shadow-sm'}`}
                   title="Imprimir tickets parciais"
                 >
                   <Printer className="w-6 h-6" />
                 </button>
                 <button
                    onClick={() => {
                      if (!isCashierMode) {
                        toast.warning('Los meseros no tienen autorización para cobrar. El cobro lo realiza el Cajero en Caja.');
                        return;
                      }
                      setCheckoutMode('SPLIT');
                      const splitSum = selectedSplitItems.reduce((sum, id) => {
                        const it = existingItems.find(i => i.id === id);
                        return sum + (it ? (it.quantity * it.unitPrice) : 0);
                      }, 0);
                      setPaymentAmount(splitSum);
                      setTipAmount(0);
                      setPaymentMethod('CASH');
                      setShowSplitBillModal(false);
                      setShowCheckout(true);
                    }}
                    disabled={selectedSplitItems.length === 0 || !isCashierMode}
                    className={`flex-1 py-4 rounded-xl font-black text-lg text-white transition-all flex justify-center items-center gap-2 ${selectedSplitItems.length === 0 || !isCashierMode ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-[0.98]'}`}
                  >
                    {!isCashierMode ? 'Solo Caja puede cobrar' : 'Cobrar Selección'}
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE COMBOS Y MODIFICADORES */}
      {showComboModal && selectedComboProduct && (
        <ComboModal 
          product={selectedComboProduct}
          allProducts={products}
          onClose={() => setShowComboModal(false)}
          onAddToCart={(cartItem) => {
            addToCart(selectedComboProduct, cartItem);
            setShowComboModal(false);
          }}
        />
      )}
    </>
  );
}