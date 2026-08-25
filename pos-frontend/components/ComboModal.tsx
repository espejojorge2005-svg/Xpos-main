import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

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

  useEffect(() => {
    // Inicializar state
    const init: Record<string, string[]> = {};
    product.modifierGroups?.forEach(g => {
      init[g.id || g.name] = [];
    });
    setSelections(init);
  }, [product]);

  const handleToggle = (groupId: string, maxSelect: number, targetProductId: string) => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      // Si ya está seleccionado, lo quitamos
      if (current.includes(targetProductId)) {
        return { ...prev, [groupId]: current.filter(id => id !== targetProductId) };
      }
      // Si no está, lo agregamos (respetando maxSelect)
      if (current.length < maxSelect) {
        return { ...prev, [groupId]: [...current, targetProductId] };
      }
      // Si el máximo es 1, reemplazamos (comportamiento radio button)
      if (maxSelect === 1) {
        return { ...prev, [groupId]: [targetProductId] };
      }
      return prev; // Ignoramos si excedió maxSelect > 1
    });
  };

  const isFormValid = () => {
    if (!product.modifierGroups) return true;
    return product.modifierGroups.every(g => {
      const selectedCount = (selections[g.id || g.name] || []).length;
      return selectedCount >= g.minSelect;
    });
  };

  const handleConfirm = () => {
    const subItems: CartItem[] = [];
    
    product.modifierGroups?.forEach(g => {
      const selectedIds = selections[g.id || g.name] || [];
      selectedIds.forEach(id => {
        const optionDef = g.options.find(o => o.targetProductId === id);
        const refProduct = allProducts.find(p => p.id === id);
        if (refProduct) {
          subItems.push({
            productId: refProduct.id,
            name: refProduct.name,
            quantity: 1, // Por defecto siempre agregamos 1 sub-item por selección
            unitPrice: optionDef?.priceOverride !== undefined && optionDef?.priceOverride !== null ? optionDef.priceOverride : refProduct.price,
          });
        }
      });
    });

    onAddToCart({
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
      notes: notes.trim() ? notes : undefined,
      subItems
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl overflow-hidden shadow-2xl w-[90%] max-w-lg flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-600 text-white">
          <div>
            <h3 className="text-xl font-black">{product.name}</h3>
            <p className="text-emerald-100 text-sm font-medium">Personaliza tu combo</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {product.modifierGroups?.map((group, index) => {
            const groupId = group.id || group.name;
            const currentSelected = selections[groupId] || [];
            
            return (
              <div key={index} className="space-y-3">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-800 uppercase text-sm tracking-wide">{group.name}</h4>
                  <span className="text-xs font-bold text-slate-400">
                    {group.minSelect === group.maxSelect 
                      ? `Elige ${group.minSelect}` 
                      : `Elige de ${group.minSelect} a ${group.maxSelect}`}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.options.map((opt, optIdx) => {
                    const refProduct = allProducts.find(p => p.id === opt.targetProductId);
                    if (!refProduct) return null; // Resiliencia si el producto fue borrado

                    const isSelected = currentSelected.includes(refProduct.id);
                    const finalPrice = opt.priceOverride !== undefined && opt.priceOverride !== null ? opt.priceOverride : refProduct.price;

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleToggle(groupId, group.maxSelect, refProduct.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left
                          ${isSelected 
                            ? 'border-emerald-500 bg-emerald-50 shadow-sm' 
                            : 'border-slate-100 bg-white hover:border-emerald-200'}`}
                      >
                        <div className="flex items-center gap-3 text-slate-800 font-bold text-sm">
                          <div className={`w-5 h-5 rounded flex items-center justify-center
                            ${group.maxSelect === 1 ? 'rounded-full' : 'rounded-md'}
                            ${isSelected ? 'bg-emerald-500 text-white' : 'border-2 border-slate-200'}`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                          {refProduct.name}
                        </div>
                        {finalPrice > 0 ? (
                          <span className="text-emerald-600 font-black text-xs">+ S/ {finalPrice.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400 font-bold text-xs uppercase">Incluido</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          
          <div className="border-t border-slate-100 pt-4">
             <label className="text-sm font-bold text-slate-700 mb-1 block">Notas adicionales</label>
             <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. Sin hielo, poco azúcar..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50">
           <button 
             onClick={handleConfirm}
             disabled={!isFormValid()}
             className={`w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]
               ${!isFormValid() ? 'bg-slate-300 opacity-70 cursor-not-allowed shadow-none' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200 hover:shadow-emerald-300'}`}
           >
             AÑADIR A LA ORDEN
           </button>
        </div>
      </div>
    </div>
  );
}
