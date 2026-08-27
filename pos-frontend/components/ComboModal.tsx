import React, { useState, useEffect } from 'react';
import { X, Check, ShoppingBag, AlertCircle } from 'lucide-react';

interface ModifierOption {
  targetProductId: string;
  priceOverride?: number;
  targetProduct?: { id: string; name: string; price: number };
}

interface ModifierGroup {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  modifierGroups?: ModifierGroup[];
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  subItems?: CartItem[];
}

interface ComboModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
  allProducts: { id: string; name: string; price: number }[];
}

export default function ComboModal({ product, onClose, onAddToCart, allProducts }: ComboModalProps) {
  // selections[groupId] = array of targetProductIds selected
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState('');

  // Inicializar estado con pre-selección inteligente
  useEffect(() => {
    const init: Record<string, string[]> = {};
    product.modifierGroups?.forEach(g => {
      const gKey = g.id || g.name;
      
      // Filtrar opciones válidas del grupo
      const validOpts = (g.options || []).filter(opt => {
        const id = opt.targetProductId || opt.targetProduct?.id;
        return Boolean(id && String(id).trim() !== '');
      });

      // Si el grupo requiere selección obligatoria (minSelect >= 1), pre-seleccionamos por defecto
      if (Number(g.minSelect) > 0 && validOpts.length > 0) {
        const toSelectCount = Math.min(Number(g.minSelect), Number(g.maxSelect) || 1, validOpts.length);
        const autoSelectedIds: string[] = [];
        for (let i = 0; i < toSelectCount; i++) {
          const opt = validOpts[i];
          const id = opt.targetProductId || opt.targetProduct?.id;
          if (id) autoSelectedIds.push(id);
        }
        init[gKey] = autoSelectedIds;
      } else {
        init[gKey] = [];
      }
    });
    setSelections(init);
  }, [product, allProducts]);

  const handleToggle = (groupId: string, maxSelect: number, targetProductId: string) => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      // Si ya está seleccionado, lo quitamos
      if (current.includes(targetProductId)) {
        return { ...prev, [groupId]: current.filter(id => id !== targetProductId) };
      }
      // Si el máximo es 1, reemplazamos (comportamiento tipo radio)
      if (maxSelect <= 1) {
        return { ...prev, [groupId]: [targetProductId] };
      }
      // Si aún no excede maxSelect, lo agregamos
      if (current.length < maxSelect) {
        return { ...prev, [groupId]: [...current, targetProductId] };
      }
      return prev;
    });
  };

  const isFormValid = () => {
    if (!product.modifierGroups || product.modifierGroups.length === 0) return true;
    return product.modifierGroups.every(g => {
      const gKey = g.id || g.name;
      const validOptions = (g.options || []).filter(opt => {
        const id = opt.targetProductId || opt.targetProduct?.id;
        return Boolean(id && String(id).trim() !== '');
      });
      // Si no hay opciones configuradas en este grupo, no bloquea
      if (validOptions.length === 0) return true;

      const effectiveMin = Math.min(Number(g.minSelect) || 0, validOptions.length);
      const selectedCount = (selections[gKey] || []).length;
      return selectedCount >= effectiveMin;
    });
  };

  const handleConfirm = () => {
    const subItems: CartItem[] = [];
    
    product.modifierGroups?.forEach(g => {
      const gKey = g.id || g.name;
      let selectedIds = selections[gKey] || [];
      const validOpts = (g.options || []).filter(opt => {
        const id = opt.targetProductId || opt.targetProduct?.id;
        return Boolean(id && String(id).trim() !== '');
      });

      // Si falta selección en un grupo requerido, auto-completar con la primera opción para nunca bloquear
      const effectiveMin = Math.min(Number(g.minSelect) || 0, validOpts.length);
      if (selectedIds.length < effectiveMin && validOpts.length > 0) {
        const fallbackOpt = validOpts[0];
        const fallbackId = fallbackOpt.targetProductId || fallbackOpt.targetProduct?.id;
        if (fallbackId && !selectedIds.includes(fallbackId)) {
          selectedIds = [fallbackId];
        }
      }

      selectedIds.forEach(id => {
        const optionDef = g.options?.find(o => 
          String(o.targetProductId) === String(id) || String(o.targetProduct?.id) === String(id)
        );
        const refProduct = allProducts.find(p => String(p.id) === String(id)) 
          || optionDef?.targetProduct 
          || { id, name: (optionDef as any)?.name || 'Opción', price: 0 };

        if (refProduct) {
          subItems.push({
            productId: refProduct.id,
            name: refProduct.name,
            quantity: 1,
            unitPrice: optionDef?.priceOverride !== undefined && optionDef?.priceOverride !== null 
              ? Number(optionDef.priceOverride) 
              : (Number(refProduct.price) || 0),
          });
        }
      });
    });

    onAddToCart({
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: Number(product.price) || 0,
      notes: notes.trim() ? notes.trim() : undefined,
      subItems
    });
  };

  const QUICK_NOTES = ['Sin sal', 'Poco picante', 'Término medio', 'Bien cocido', 'Para llevar'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] border border-slate-100">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-600 text-white">
          <div>
            <h3 className="text-xl font-black">{product.name}</h3>
            <p className="text-emerald-100 text-sm font-medium">Personalizar plato / combo</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {product.modifierGroups && product.modifierGroups.length > 0 && product.modifierGroups.map((group, index) => {
            const groupId = group.id || group.name;
            const currentSelected = selections[groupId] || [];
            const validOptions = (group.options || []).filter(opt => {
              const id = opt.targetProductId || opt.targetProduct?.id;
              return Boolean(id && String(id).trim() !== '');
            });
            const effectiveMin = Math.min(Number(group.minSelect) || 0, validOptions.length);
            const isFulfilled = currentSelected.length >= effectiveMin;

            return (
              <div key={index} className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <div>
                    <h4 className="font-bold text-slate-800 uppercase text-sm tracking-wide">{group.name}</h4>
                    <span className="text-xs text-slate-400 font-medium">
                      {group.minSelect === group.maxSelect 
                        ? `Elige ${group.minSelect}` 
                        : group.minSelect === 0
                        ? `Opcional (máx. ${group.maxSelect})`
                        : `Elige de ${group.minSelect} a ${group.maxSelect}`}
                    </span>
                  </div>
                  {effectiveMin > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isFulfilled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}>
                      {isFulfilled ? '✓ Listo' : `Obligatorio (${currentSelected.length}/${effectiveMin})`}
                    </span>
                  )}
                </div>

                {validOptions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">No hay opciones configuradas en este grupo.</p>
                ) : (
                  <div className="space-y-2">
                    {validOptions.map((opt, optIdx) => {
                      const optId = opt.targetProductId || opt.targetProduct?.id || `opt-${optIdx}`;
                      const refProduct = allProducts.find(p => String(p.id) === String(optId))
                        || opt.targetProduct 
                        || { id: optId, name: (opt as any).name || `Opción ${optIdx + 1}`, price: 0 };

                      const isSelected = currentSelected.includes(refProduct.id);
                      const finalPrice = opt.priceOverride !== undefined && opt.priceOverride !== null 
                        ? Number(opt.priceOverride) 
                        : (Number(refProduct.price) || 0);

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => handleToggle(groupId, group.maxSelect, refProduct.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left
                            ${isSelected 
                              ? 'border-emerald-500 bg-white shadow-sm' 
                              : 'border-slate-200/80 bg-white hover:border-emerald-300'}`}
                        >
                          <div className="flex items-center gap-3 text-slate-800 font-bold text-sm">
                            <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors
                              ${group.maxSelect === 1 ? 'rounded-full' : 'rounded-md'}
                              ${isSelected ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 bg-slate-50'}`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span>{refProduct.name}</span>
                          </div>
                          {finalPrice > 0 ? (
                            <span className="text-emerald-600 font-black text-xs bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                              + S/ {finalPrice.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold text-xs uppercase">Incluido</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Notas adicionales */}
          <div className="border-t border-slate-100 pt-4">
             <label className="text-sm font-bold text-slate-700 mb-1.5 block">
               Notas adicionales para cocina
             </label>

             {/* Atajos rápidos de notas */}
             <div className="flex flex-wrap gap-1.5 mb-2.5">
               {QUICK_NOTES.map(tag => (
                 <button
                   key={tag}
                   type="button"
                   onClick={() => {
                     setNotes(prev => prev.trim() ? `${prev.trim()}, ${tag}` : tag);
                   }}
                   className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition-colors"
                 >
                   + {tag}
                 </button>
               ))}
             </div>

             <input 
               type="text" 
               value={notes} 
               onChange={e => setNotes(e.target.value)} 
               placeholder="Ej. Sin hielo, poco azúcar, término medio..." 
               className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 transition-all text-sm" 
             />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50">
           <button 
             type="button"
             onClick={handleConfirm}
             className="w-full py-4 rounded-2xl font-black text-white flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200"
           >
             <ShoppingBag className="w-5 h-5" />
             AÑADIR A LA ORDEN
           </button>
        </div>
      </div>
    </div>
  );
}
