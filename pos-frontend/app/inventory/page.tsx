'use client';
import { getApiUrl } from '@/utils/api';


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search, Plus, AlertCircle, CheckCircle2, ArrowUpDown, Filter, Edit, Trash2, X, Loader2, PackagePlus, Minus, TrendingDown, TrendingUp, History, ShoppingBag, Wrench, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

interface Product {
  id: string;
  name: string;
  category: string;
  categoryId?: string;
  stationIds?: string[]; // Múltiples áreas
  stations?: KitchenStation[]; // Para lectura de backend
  price: number;
  stock: number;
  minStock: number;
  modifierGroups?: ModifierGroup[];
}

interface ModifierOption {
  targetProductId: string;
  priceOverride?: number;
  targetProduct?: { name: string }; // Solo para lectura
}

interface ModifierGroup {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

interface Category {
  id: string;
  name: string;
}

interface KitchenStation {
  id: string;
  name: string;
}

export default function InventoryPage() {
  const router = useRouter();
  useGuardedRoute('inventario');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para el Modal funcional
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'modifiers'>('info');
  const [formData, setFormData] = useState<Product>({
    id: '', name: '', category: '', categoryId: '', stationIds: [], price: 0, stock: 0, minStock: 0, modifierGroups: []
  });

  // Estados para el ajuste rápido de stock
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Estados para historial de stock
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyMovements, setHistoryMovements] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 1. LEER: Obtener productos del backend real
  const fetchProducts = async () => {
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl('/products'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      toast.error('Error al conectar con la base de datos (Productos)');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl('/inventory/categories'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchStations = async () => {
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl('/kitchen-stations'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setStations(await response.json());
      }
    } catch (error) {
      console.error('Error fetching stations:', error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchStations();
  }, [router]);

  // 2. CREAR / EDITAR: Guardar en la base de datos
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const token = localStorage.getItem('pos_token');
    
    const isEditing = formData.id !== '';
    const url = isEditing 
      ? getApiUrl(`/products/${formData.id}`) : getApiUrl(`/products`);
    
    const method = isEditing ? 'PATCH' : 'POST';

    // Extraemos solo los datos relevantes para crear o editar
    const bodyData = {
      name: formData.name,
      categoryId: formData.categoryId,
      stationIds: formData.stationIds || [],
      price: formData.price,
      stock: formData.stock,
      minStock: formData.minStock,
      modifierGroups: formData.modifierGroups?.map(mg => ({
        name: mg.name,
        minSelect: Number(mg.minSelect),
        maxSelect: Number(mg.maxSelect),
        options: mg.options.map((opt: any) => ({
          targetProductId: opt.targetProductId,
          priceOverride: opt.priceOverride ? Number(opt.priceOverride) : 0
        }))
      })),
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(bodyData),
      });

      if (response.ok) {
        toast.success(isEditing ? 'Producto actualizado' : 'Producto creado con éxito');
        fetchProducts(); // Recargamos la tabla
        closeModal();
      } else {
        toast.error('Hubo un problema al guardar el producto');
      }
    } catch (error) {
      toast.error('Error de red al intentar guardar');
    } finally {
      setIsSaving(false);
    }
  };

  // 3. ELIMINAR: Borrar de la base de datos
  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este producto del inventario?')) return;
    
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl(`/products/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Producto eliminado');
        setProducts(products.filter(p => p.id !== id));
      } else {
        toast.error('No se pudo eliminar el producto');
      }
    } catch (error) {
      toast.error('Error al conectar con el servidor');
    }
  };

  // Controladores del Modal
  const openModal = (product?: Product) => {
    setActiveTab('info');
    if (product) {
      setFormData({ 
        ...product, 
        stationIds: product.stations?.map(s => s.id) || [],
        modifierGroups: product.modifierGroups || [] 
      }); // Editar
    } else {
      setFormData({ id: '', name: '', category: '', categoryId: '', stationIds: [], price: 0, stock: 0, minStock: 0, modifierGroups: [] }); // Nuevo
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // Ajuste rápido de stock
  const openStockAdjust = (product: Product) => {
    setAdjustingProduct(product);
    setStockDelta(0);
    setAdjustReason('');
  };

  const handleStockAdjust = async () => {
    if (!adjustingProduct || stockDelta === 0) return;
    setIsAdjusting(true);
    const token = localStorage.getItem('pos_token');
    try {
      const response = await fetch(getApiUrl(`/products/${adjustingProduct.id}/stock`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ delta: stockDelta, reason: adjustReason })
        }
      );
      if (response.ok) {
        const updated = await response.json();
        setProducts(prev => prev.map(p => p.id === updated.id ? { ...p, stock: updated.stock } : p));
        toast.success(`Stock de "${adjustingProduct.name}" actualizado: ${stockDelta > 0 ? '+' : ''}${stockDelta} unidades`);
        setAdjustingProduct(null);
      } else {
        toast.error('Error al ajustar el stock');
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setIsAdjusting(false);
    }
  };

  // Ver historial de movimientos de stock
  const openHistory = async (product: Product) => {
    setHistoryProduct(product);
    setLoadingHistory(true);
    setHistoryMovements([]);
    const token = localStorage.getItem('pos_token');
    try {
      const res = await fetch(getApiUrl(`/products/${product.id}/stock-history`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setHistoryMovements(await res.json());
    } catch { /* silently fail */ }
    setLoadingHistory(false);
  };

  // Cálculos y Filtros
  const lowStockCount = products.filter(p => p.stock <= p.minStock).length;
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans relative">
      
      {/* Cabecera */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Package className="text-emerald-600 w-8 h-8" /> 
            Inventario
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-sm tracking-widest">
            Gestión de Productos y Stock
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => router.push('/inventory/kardex')}
            className="flex items-center gap-2 px-5 py-3 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-2xl font-bold transition-all active:scale-95"
          >
            <LayoutGrid className="w-5 h-5" />
            Kardex
          </button>
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-200"
          >
            <Plus className="w-5 h-5" />
            Nuevo Producto
          </button>
        </div>
      </header>

      {/* Tabla e Interfaz (Mismo diseño que te gustó) */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden w-full max-w-full">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-slate-50/50">
          <div className="relative w-full sm:w-96 shrink-0">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-slate-900"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-400 font-bold">
                <th className="p-5">Producto</th>
                <th className="p-5">Categoría</th>
                <th className="p-5">Precio (S/)</th>
                <th className="p-5">Stock</th>
                <th className="p-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredProducts.map((product) => {
                const isLowStock = product.stock <= product.minStock;
                return (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-5 font-bold text-slate-800">
                      {product.name}
                      {isLowStock && <span className="ml-3 px-2 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 uppercase tracking-wider">Bajo</span>}
                    </td>
                    <td className="p-5 font-medium">
                      <span className="px-3 py-1 bg-slate-100 rounded-lg text-xs uppercase tracking-wider">{product.category}</span>
                    </td>
                    <td className="p-5 font-black text-slate-700">{Number(product.price).toFixed(2)}</td>
                    <td className="p-5">
                      <span className={`font-bold ${isLowStock ? 'text-rose-600' : 'text-slate-700'}`}>{product.stock} un.</span>
                    </td>
                    <td className="p-5 text-center">
                      <div className="flex justify-center gap-2">
                        {/* Botón Historial */}
                        <button
                          onClick={() => openHistory(product)}
                          className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors"
                          title="Ver historial de stock"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {/* Botón Ajustar Stock */}
                        <button
                          onClick={() => openStockAdjust(product)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="Ajustar stock manualmente"
                        >
                          <PackagePlus className="w-4 h-4" />
                        </button>
                        {/* Botón Editar */}
                        <button onClick={() => openModal(product)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        {/* Botón Eliminar */}
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400">No hay productos disponibles.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA CREAR / EDITAR PRODUCTO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">
                {formData.id ? 'Editar Producto / Combo' : 'Nuevo Producto / Combo'}
              </h2>
              <button type="button" onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex border-b border-slate-200">
               <button 
                type="button" 
                onClick={() => setActiveTab('info')} 
                className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'info' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 Datos Principales
               </button>
               <button 
                type="button" 
                onClick={() => setActiveTab('modifiers')} 
                className={`flex-1 py-3 font-bold text-sm transition-colors ${activeTab === 'modifiers' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 Opciones y Combos
               </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <form id="productForm" onSubmit={handleSave} className="p-6 space-y-4">
                
                {activeTab === 'info' && (
                  <>
                    <div>
                      <label className="text-sm font-bold text-slate-700 mb-1 block">Nombre del Producto</label>
                      <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ej. Lomo Saltado" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-bold text-slate-700 mb-1 block">Categoría</label>
                        <select required value={formData.categoryId || ''} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none">
                          <option value="" disabled>Selecciona una categoría</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-bold text-slate-700 mb-2 block">Áreas de Prepración (KDS)</label>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                          {stations.length === 0 && <span className="text-sm text-slate-400">No hay áreas configuradas</span>}
                          {stations.map((st) => {
                            const isSelected = formData.stationIds?.includes(st.id);
                            return (
                              <label key={st.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${isSelected ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                                <input 
                                  type="checkbox" 
                                  value={st.id} 
                                  checked={isSelected || false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setFormData(prev => {
                                      const current = prev.stationIds || [];
                                      return {
                                        ...prev,
                                        stationIds: checked ? [...current, st.id] : current.filter(id => id !== st.id)
                                      };
                                    });
                                  }}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" 
                                />
                                <span className={`text-sm font-bold ${isSelected ? 'text-emerald-700' : 'text-slate-600'}`}>{st.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">El ticket se enviará a cada área seleccionada.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-bold text-slate-700 mb-1 block">Precio (S/)</label>
                        <input required type="number" step="0.10" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-sm font-bold text-slate-700 mb-1 block">Stock Actual</label>
                        <input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: parseInt(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-bold text-slate-700 mb-1 block">Stock Mínimo</label>
                        <input required type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: parseInt(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div></div>
                    </div>
                  </>
                )}

                {activeTab === 'modifiers' && (
                  <div className="space-y-6">
                    <p className="text-sm text-slate-500 leading-relaxed">Añade grupos de opciones para crear Combos. Por ejemplo: <strong>"Bebida a elección"</strong>, donde el cliente escoge un jugo del Bar, o <strong>"Guarnición"</strong>.</p>
                    
                    {formData.modifierGroups?.map((group, gIndex) => (
                      <div key={gIndex} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 relative">
                         <button type="button" onClick={() => {
                           const newGroups = [...(formData.modifierGroups || [])];
                           newGroups.splice(gIndex, 1);
                           setFormData({...formData, modifierGroups: newGroups});
                         }} className="absolute top-4 right-4 text-rose-400 hover:bg-rose-100 p-1.5 rounded-lg transition-colors">
                           <Trash2 className="w-4 h-4" />
                         </button>

                         <div className="mb-4 pr-8">
                           <label className="text-xs font-bold text-slate-500 uppercase">Nombre del Grupo</label>
                           <input required type="text" value={group.name} placeholder='Ej: "Opciones de Bebida"' onChange={(e) => {
                             const newGroups = [...(formData.modifierGroups || [])];
                             newGroups[gIndex].name = e.target.value;
                             setFormData({...formData, modifierGroups: newGroups});
                           }} className="w-full bg-white border-b border-slate-300 font-bold focus:border-emerald-500 outline-none py-1" />
                         </div>
                         
                         <div className="flex gap-4 mb-4">
                           <div className="flex-1">
                             <label className="text-xs font-bold text-slate-500 uppercase">Mín. Selección</label>
                             <input required type="number" min="0" value={group.minSelect} onChange={(e) => {
                               const newGroups = [...(formData.modifierGroups || [])];
                               newGroups[gIndex].minSelect = parseInt(e.target.value);
                               setFormData({...formData, modifierGroups: newGroups});
                             }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-emerald-500" />
                           </div>
                           <div className="flex-1">
                             <label className="text-xs font-bold text-slate-500 uppercase">Máx. Selección</label>
                             <input required type="number" min="1" value={group.maxSelect} onChange={(e) => {
                               const newGroups = [...(formData.modifierGroups || [])];
                               newGroups[gIndex].maxSelect = parseInt(e.target.value);
                               setFormData({...formData, modifierGroups: newGroups});
                             }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-emerald-500" />
                           </div>
                         </div>

                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500 uppercase">Opciones (Productos vinculados)</label>
                           {group.options.map((opt, oIndex) => (
                              <div key={oIndex} className="flex gap-2 items-center">
                                <select required value={opt.targetProductId} onChange={(e) => {
                                  const newGroups = [...(formData.modifierGroups || [])];
                                  newGroups[gIndex].options[oIndex].targetProductId = e.target.value;
                                  setFormData({...formData, modifierGroups: newGroups});
                                }} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-emerald-500">
                                  <option value="">Selecciona Producto...</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                                <input type="number" min="0" step="0.10" placeholder="0.00 (Gratis)" value={opt.priceOverride !== undefined && opt.priceOverride !== null ? opt.priceOverride : ''} onChange={(e) => {
                                  const newGroups = [...(formData.modifierGroups || [])];
                                  newGroups[gIndex].options[oIndex].priceOverride = e.target.value ? parseFloat(e.target.value) : undefined;
                                  setFormData({...formData, modifierGroups: newGroups});
                                }} className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-emerald-500" />
                                <button type="button" onClick={() => {
                                   const newGroups = [...(formData.modifierGroups || [])];
                                   newGroups[gIndex].options.splice(oIndex, 1);
                                   setFormData({...formData, modifierGroups: newGroups});
                                }} className="text-rose-400 hover:bg-rose-100 p-1.5 rounded-lg transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                           ))}
                           <button type="button" onClick={() => {
                             const newGroups = [...(formData.modifierGroups || [])];
                             newGroups[gIndex].options.push({ targetProductId: '', priceOverride: 0 });
                             setFormData({...formData, modifierGroups: newGroups});
                           }} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 py-1">
                             <Plus className="w-3 h-3" /> Añadir Opción
                           </button>
                         </div>
                      </div>
                    ))}

                    <button type="button" onClick={() => {
                      setFormData({
                        ...formData, 
                        modifierGroups: [...(formData.modifierGroups || []), { name: '', minSelect: 0, maxSelect: 1, options: [] }]
                      });
                    }} className="w-full border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> {formData.modifierGroups && formData.modifierGroups.length > 0 ? 'Añadir Otro Grupo' : 'Añadir Primer Grupo (Combo)'}
                    </button>
                  </div>
                )}
              </form>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button form="productForm" type="submit" disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 transition-all flex justify-center items-center gap-2">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Producto'}
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL DE STOCK */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-violet-500" /> Historial de Stock
                </h2>
                <p className="text-slate-500 text-sm font-medium mt-0.5">{historyProduct.name} — últimos 7 días</p>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                </div>
              ) : historyMovements.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                  <History className="w-10 h-10 text-slate-200" />
                  <p className="font-medium text-sm">No hay movimientos en los últimos 7 días</p>
                  <p className="text-xs">Los movimientos aparecerán aquí a partir de ahora</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historyMovements.map((mov: any) => {
                    const isSale = mov.type === 'SALE';
                    const isPositive = mov.delta > 0;
                    return (
                      <div key={mov.id} className="flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
                          isSale ? 'bg-orange-50 text-orange-500' : isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                        }`}>
                          {isSale ? <ShoppingBag className="w-5 h-5" /> : isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{mov.reason || (isSale ? 'Venta' : 'Ajuste manual')}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(mov.createdAt).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-black text-base ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isPositive ? '+' : ''}{mov.delta}
                          </p>
                          <p className="text-xs text-slate-400">{mov.stockBefore} → {mov.stockAfter}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">{historyMovements.length} movimientos</span>
                <span className="font-bold text-slate-700">Stock actual: <span className="text-slate-900">{historyProduct.stock} un.</span></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJUSTE RÁPIDO DE STOCK */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-slate-800 leading-none">Ajustar Stock</h2>
                <p className="text-slate-500 text-sm font-medium mt-0.5 line-clamp-1">{adjustingProduct.name}</p>
              </div>
              <button onClick={() => setAdjustingProduct(null)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Stock preview */}
              <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="text-center flex-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Antes</p>
                  <p className="text-3xl font-black text-slate-400">{adjustingProduct.stock}</p>
                </div>
                <div className="text-slate-300 text-2xl font-black">→</div>
                <div className="text-center flex-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Después</p>
                  <p className={`text-3xl font-black ${stockDelta > 0 ? 'text-emerald-600' : stockDelta < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {adjustingProduct.stock + stockDelta}
                  </p>
                </div>
              </div>

              {/* Botones de tipo fácil */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStockDelta(d => d - 1)}
                  className="flex items-center justify-center gap-2 py-3 bg-rose-50 border-2 border-rose-200 text-rose-700 rounded-xl font-bold text-sm hover:bg-rose-100 transition-colors"
                >
                  <TrendingDown className="w-4 h-4" /> Merma / Baja
                </button>
                <button
                  onClick={() => setStockDelta(d => d + 1)}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-colors"
                >
                  <TrendingUp className="w-4 h-4" /> Producción / Alta
                </button>
              </div>

              {/* Ajuste numérico */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Cantidad exacta a ajustar</label>
                <div className="flex items-stretch gap-2">
                  <button
                    onClick={() => setStockDelta(d => d - 1)}
                    className="w-12 shrink-0 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center hover:bg-rose-100 transition-colors font-black text-lg"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <input
                    type="number"
                    value={stockDelta}
                    onChange={(e) => setStockDelta(parseInt(e.target.value) || 0)}
                    className="w-full text-center text-xl font-black text-slate-800 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={() => setStockDelta(d => d + 1)}
                    className="w-12 shrink-0 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-100 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {stockDelta !== 0 && (
                  <p className={`mt-1.5 text-xs font-bold text-center ${stockDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {stockDelta > 0 ? `+${stockDelta} unidades serán añadidas` : `${Math.abs(stockDelta)} unidades serán descontadas`}
                  </p>
                )}
              </div>

              {/* Razón */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Razón (Opcional)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej: Producción del día, Merma, Inventario inicial..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>

              <button
                onClick={handleStockAdjust}
                disabled={isAdjusting || stockDelta === 0}
                className={`w-full py-4 rounded-xl font-black text-white transition-all flex justify-center items-center gap-2 
                  ${isAdjusting || stockDelta === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : stockDelta > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 active:scale-[0.98]'
                      : 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-100 active:scale-[0.98]'
                  }`}
              >
                {isAdjusting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>{stockDelta > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  Confirmar Ajuste</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}