'use client';
import { getApiUrl } from '@/utils/api';
import { getRestaurantId, getScopedStorage, setScopedStorage } from '@/utils/storage';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, Search, Edit, Trash2, X, Loader2, AlertTriangle, Package, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useGuardedRoute } from '@/hooks/useGuardedRoute';

interface Category {
  id: string;
  name: string;
  restaurantId?: string | null;
  products?: any[];
}

export default function CategoriesPage() {
  const router = useRouter();
  useGuardedRoute('categorias');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Category>({
    id: '', name: ''
  });

  // Modal de Confirmación de Eliminación
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Escuchar tecla Escape para cerrar modales
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDeleteModalOpen && !isDeleting) closeDeleteModal();
        else if (isModalOpen && !isSaving) closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isDeleteModalOpen, isSaving, isDeleting]);

  const fetchCategories = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
    const currentRestId = getRestaurantId();
    let loadedCats: Category[] | null = null;
    try {
      const response = await fetch(getApiUrl('/inventory/categories'), {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId || ''
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          // Filtrar categorías que pertenezcan a este restaurante o sean globales/legacy
          const filtered = currentRestId
            ? data.filter((c: any) => !c.restaurantId || c.restaurantId === currentRestId)
            : data;
          loadedCats = filtered;
          setScopedStorage('pos_registered_categories', filtered);
        }
      }
    } catch (e) {
      console.warn('Network error fetching categories:', e);
    }

    if (loadedCats === null) {
      const cached = getScopedStorage<Category[] | null>('pos_registered_categories', null);
      if (cached !== null) {
        loadedCats = cached;
      }
    }

    setCategories(loadedCats || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formData.name.trim();
    if (!trimmedName) return toast.error('El nombre de la categoría es obligatorio');
    
    // Validación contra nombres duplicados (insensible a mayúsculas/minúsculas)
    const isDuplicate = categories.some(
      c => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== formData.id
    );
    if (isDuplicate) {
      return toast.error(`Ya existe una categoría llamada "${trimmedName}"`);
    }

    setIsSaving(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
    const currentRestId = getRestaurantId();
    
    const isEditing = Boolean(formData.id);
    const url = isEditing
      ? getApiUrl(`/inventory/category/${formData.id}`)
      : getApiUrl('/inventory/category');
    
    const method = isEditing ? 'PATCH' : 'POST';
    const bodyData = { 
      name: trimmedName,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId || ''
        },
        body: JSON.stringify(bodyData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Error (${response.status}) al guardar la categoría`);
      }

      const savedCategory = await response.json();
      // Usar el ID real devuelto por la base de datos
      const realId = savedCategory?.id || (isEditing ? formData.id : `cat-${Date.now()}`);

      const newCategory: Category = { 
        id: realId, 
        name: trimmedName,
        restaurantId: currentRestId || undefined,
        products: isEditing 
          ? (categories.find(c => c.id === formData.id)?.products || []) 
          : (savedCategory?.products || [])
      };

      const updatedCats = isEditing
        ? categories.map(c => c.id === formData.id ? { ...c, ...newCategory } : c)
        : [...categories, newCategory];
      
      setCategories(updatedCats);
      setScopedStorage('pos_registered_categories', updatedCats);
      window.dispatchEvent(new Event('storage'));

      toast.success(isEditing ? 'Categoría actualizada con éxito ✅' : 'Categoría creada con éxito ✅');
      closeModal();
    } catch (err: any) {
      console.warn('Backend save notice:', err);
      // Resiliencia offline: si el backend está apagado o no responde
      if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError')) {
        const fallbackId = isEditing ? formData.id : `cat-${Date.now()}`;
        const offlineCategory: Category = { 
          id: fallbackId, 
          name: trimmedName,
          restaurantId: currentRestId || undefined,
          products: isEditing 
            ? (categories.find(c => c.id === formData.id)?.products || []) 
            : []
        };
        const updatedCats = isEditing
          ? categories.map(c => c.id === formData.id ? { ...c, ...offlineCategory } : c)
          : [...categories, offlineCategory];
        
        setCategories(updatedCats);
        setScopedStorage('pos_registered_categories', updatedCats);
        window.dispatchEvent(new Event('storage'));
        closeModal();
        toast.warning('⚠️ Guardado localmente: El backend (puerto 3001) está apagado. Recuerda iniciar "npm run dev:backend"');
        return;
      }
      toast.error(err.message || 'No se pudo guardar la categoría en el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = (category: Category) => {
    setCategoryToDelete(category);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
    setCategoryToDelete(null);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    
    const currentRestId = getRestaurantId();
    const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;

    try {
      const response = await fetch(getApiUrl(`/inventory/category/${categoryToDelete.id}`), {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-restaurant-id': currentRestId || ''
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || 
          errorData.error || 
          'No se pudo eliminar la categoría. Asegúrate de reasignar o eliminar los productos asociados primero.'
        );
      }

      const updatedCats = categories.filter(c => c.id !== categoryToDelete.id);
      setCategories(updatedCats);
      setScopedStorage('pos_registered_categories', updatedCats);
      window.dispatchEvent(new Event('storage'));

      toast.success('Categoría eliminada exitosamente ✅');
      closeDeleteModal();
    } catch (err: any) {
      console.warn('Backend delete notice:', err);
      if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError')) {
        const updatedCats = categories.filter(c => c.id !== categoryToDelete.id);
        setCategories(updatedCats);
        setScopedStorage('pos_registered_categories', updatedCats);
        window.dispatchEvent(new Event('storage'));
        closeDeleteModal();
        toast.warning('⚠️ Eliminado localmente: El backend (puerto 3001) está apagado.');
        return;
      }
      toast.error(err.message || 'Error al eliminar la categoría del servidor');
    } finally {
      setIsDeleting(false);
    }
  };

  const openModal = (category?: Category) => {
    if (category) {
      setFormData(category);
    } else {
      setFormData({ id: '', name: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 font-sans relative">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Layers className="text-indigo-600 w-8 h-8" /> 
            Categorías
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase text-xs sm:text-sm tracking-widest">
            Gestión y Clasificación de Productos para Menú y POS
          </p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          Nueva Categoría
        </button>
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden w-full max-w-full">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-slate-50/50">
          <div className="relative w-full sm:w-96 shrink-0">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-10 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total: <span className="text-slate-700 font-black">{categories.length}</span> {categories.length === 1 ? 'categoría' : 'categorías'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-widest text-slate-400 font-bold">
                <th className="p-5">Nombre de Categoría</th>
                <th className="p-5 text-center">Productos Vinculados</th>
                <th className="p-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredCategories.map((category) => {
                const prodCount = category.products?.length ?? 0;
                return (
                  <tr key={category.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-5 font-bold text-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs">
                          {category.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{category.name}</span>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        prodCount > 0 
                          ? 'bg-slate-100 text-slate-700' 
                          : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200'
                      }`}>
                        <Package className="w-3.5 h-3.5" />
                        {prodCount} {prodCount === 1 ? 'producto' : 'productos'}
                      </span>
                    </td>
                    <td className="p-5 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => openModal(category)} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                          title="Editar categoría"
                          aria-label="Editar categoría"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openDeleteModal(category)} 
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="Eliminar categoría"
                          aria-label="Eliminar categoría"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCategories.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-12 text-center">
                    {searchTerm.trim() ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="p-3 bg-amber-50 rounded-2xl text-amber-500 mb-1">
                          <Search className="w-8 h-8 stroke-[1.5]" />
                        </div>
                        <p className="font-black text-slate-700 text-base">
                          No se encontraron resultados para &ldquo;{searchTerm}&rdquo;
                        </p>
                        <p className="text-xs font-medium text-slate-400 max-w-sm">
                          Verifica la ortografía o intenta buscar con otros términos.
                        </p>
                        <button
                          onClick={() => setSearchTerm('')}
                          className="mt-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                        >
                          Limpiar búsqueda
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="p-3 bg-slate-100 rounded-2xl text-slate-400 mb-1">
                          <Layers className="w-8 h-8 stroke-[1.5]" />
                        </div>
                        <p className="font-black text-slate-700 text-base">No hay categorías registradas en este negocio</p>
                        <p className="text-xs font-medium text-slate-400 max-w-sm">
                          Este negocio inicia con el catálogo limpio. Pulsa en <span className="font-bold text-indigo-600">&ldquo;Nueva Categoría&rdquo;</span> para agregar tu primera sección.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Creación / Edición */}
      {isModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget && !isSaving) closeModal(); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                {formData.id ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
              <button 
                onClick={closeModal} 
                disabled={isSaving}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-full transition-colors disabled:opacity-50"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1.5 block">
                  Nombre de la Categoría <span className="text-rose-500">*</span>
                </label>
                <input 
                  autoFocus
                  required 
                  type="text" 
                  maxLength={50}
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all text-slate-900 text-sm font-medium" 
                  placeholder="Ej. Bebidas, Desayunos, Postres..." 
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se usará para agrupar tus platos y productos en la vista del Punto de Venta (POS).
                </p>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  disabled={isSaving}
                  className="w-1/2 py-3.5 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-all disabled:opacity-50 text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving} 
                  className="w-1/2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 transition-all flex justify-center items-center gap-2 active:scale-95 text-sm"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>{formData.id ? 'Guardar Cambios' : 'Crear Categoría'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {isDeleteModalOpen && categoryToDelete && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) closeDeleteModal(); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200 p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">¿Eliminar categoría?</h3>
                <p className="text-xs text-slate-500 font-medium">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
              <p className="text-sm font-bold text-slate-800">
                Categoría: <span className="text-indigo-600">{categoryToDelete.name}</span>
              </p>
              {categoryToDelete.products && categoryToDelete.products.length > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Advertencia:</strong> Esta categoría tiene <strong>{categoryToDelete.products.length} producto(s)</strong> asociados. Si la eliminas, el servidor podría rechazar la petición por restricción de integridad referencial.
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Esta categoría no tiene productos asociados y puede eliminarse con seguridad.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button 
                type="button" 
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="w-1/2 py-3.5 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-all disabled:opacity-50 text-sm"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting} 
                className="w-1/2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-rose-200 transition-all flex justify-center items-center gap-2 active:scale-95 text-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 stroke-[2]" />
                    <span>Sí, Eliminar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
