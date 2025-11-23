
import React, { useRef, useEffect } from 'react';
import { BillData, PackingStatus } from '../types';
import { getThemeStyles, COLOR_PALETTE } from '../services/storageService';
import { Trash2, Calendar, MapPin, Check, Truck, AlertCircle, Edit3, Layers, User, ChevronDown, ChevronUp, Hash, Package, ExternalLink, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BillCardProps {
  bill: BillData;
  onChange: (updatedBill: BillData) => void;
  onDelete: (id: string) => void;
  isExpanded: boolean;
  toggleExpand: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}

const InputGroup: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
    <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">
            {icon}
            {label}
        </div>
        {children}
    </div>
);

const BillCard: React.FC<BillCardProps> = ({ 
    bill, 
    onChange, 
    onDelete, 
    isExpanded, 
    toggleExpand,
    isSelectionMode,
    isSelected,
    onToggleSelect
}) => {
  
  const handleChange = (field: keyof BillData, value: any) => {
    onChange({ ...bill, [field]: value, updatedAt: Date.now() });
  };

  const handleStatusChange = (newStatus: PackingStatus) => {
    const updates: Partial<BillData> = { 
        status: newStatus,
        updatedAt: Date.now() 
    };
    if (newStatus === PackingStatus.PACKED) {
        updates.packedAt = Date.now();
    } else {
        updates.packedAt = undefined;
    }
    onChange({ ...bill, ...updates });
  };

  const toggleFlag = (field: keyof BillData) => {
      handleChange(field, !bill[field]);
  };

  const theme = getThemeStyles(bill.colorTheme, bill.description);
  
  const handleCardClick = (e: React.MouseEvent) => {
      // Prevent expansion if clicking specific controls
      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('textarea')) return;
      
      if (isSelectionMode) {
        onToggleSelect();
      } else {
        toggleExpand();
      }
  };

  return (
    <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ 
            opacity: 1, 
            y: 0, 
            scale: isSelected ? 0.98 : 1,
            boxShadow: isExpanded ? '0 10px 40px -10px rgba(0,0,0,0.1)' : '0 1px 2px 0 rgba(0,0,0,0.05)'
        }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`
            border rounded-2xl mb-3 overflow-hidden relative transition-all duration-300
            ${isExpanded 
                ? 'bg-white ring-1 ring-black/5 z-10 my-4 border-gray-200' 
                : `${theme.bg} ${theme.border} hover:border-gray-300`
            }
            ${isSelectionMode ? 'cursor-pointer' : ''}
            ${isSelected ? 'ring-2 ring-indigo-600 border-indigo-600' : ''}
        `}
    >
      
      {/* Selection Overlay */}
      {isSelectionMode && (
         <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}>
                {isSelected && <Check size={14} className="text-white" strokeWidth={4} />}
            </div>
         </div>
      )}

      {/* --- COMPACT VIEW --- */}
      <div onClick={handleCardClick} className={`p-4 relative ${!isExpanded && !isSelectionMode ? 'cursor-pointer active:opacity-70' : ''}`}>
        <div className="flex justify-between items-start gap-3">
          
          <div className="flex items-start gap-3 flex-1 min-w-0 pr-10">
            {/* Status Indicator */}
             <div className="mt-1.5 relative shrink-0">
                <div className={`w-3 h-3 rounded-full shadow-sm transition-colors ${bill.status === PackingStatus.PACKED ? 'bg-green-500' : 'bg-orange-500'}`} />
                {bill.status === PackingStatus.PACKED && (
                    <motion.div initial={{scale:0}} animate={{scale:1}} className="absolute -right-1 -bottom-1 bg-white rounded-full p-0.5">
                        <Check size={8} className="text-green-600" strokeWidth={4}/>
                    </motion.div>
                )}
             </div>

            <div className="min-w-0 flex-1">
              <h3 className={`font-black text-lg truncate leading-tight mb-1 ${bill.status === PackingStatus.PACKED ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {bill.customerName || "Unknown Customer"}
              </h3>
              
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-gray-500">
                <span className="flex items-center gap-1 font-mono text-gray-400">
                    <Hash size={11}/> {bill.invoiceNo || '---'}
                </span>
                {bill.billDate && (
                    <span className="flex items-center gap-1">
                        <Calendar size={11} className="text-gray-400"/> {bill.billDate}
                    </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Compact Box Badge */}
          {!isSelectionMode && (
              <div className={`
                flex flex-col items-center justify-center min-w-[3rem] px-2 py-1.5 rounded-xl border font-bold text-xs transition-colors shrink-0
                ${bill.boxCount > 0 
                    ? 'bg-gray-900 text-white border-gray-900 shadow-md' 
                    : 'bg-white text-gray-300 border-gray-100'
                }
              `}>
                 <span className="text-[9px] opacity-70 uppercase tracking-wider">Box</span>
                 <span className="text-sm leading-none">{bill.boxCount}</span>
              </div>
          )}
        </div>

        {/* Tag Summary (Collapsed) */}
        {!isExpanded && !isSelectionMode && (
            <div className="mt-3 flex flex-wrap gap-1.5 pl-6">
                {bill.description && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-black/5 bg-white/50 text-gray-700 uppercase tracking-wide">
                        {bill.description}
                    </span>
                )}
                {bill.isDelivery && <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" title="Delivery"/>}
                {bill.hasCRN && <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" title="CRN"/>}
                {bill.isEditedBill && <span className="w-2 h-2 rounded-full bg-purple-500 ring-2 ring-white" title="Edited"/>}
                {bill.status === PackingStatus.PACKED && <span className="text-[10px] font-bold text-green-600 flex items-center gap-1 ml-auto"><Check size={10}/> Packed</span>}
            </div>
        )}

        {/* Expand/Collapse Chevron */}
        {!isSelectionMode && (
            <div className="absolute right-4 bottom-3 text-gray-300 hover:text-gray-500 transition-colors">
                {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
            </div>
        )}
      </div>

      {/* --- EXPANDED EDIT VIEW --- */}
      <AnimatePresence>
      {isExpanded && !isSelectionMode && (
        <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
        >
            <div className="px-4 pb-4 space-y-6">
                
                {/* 1. STATUS & LOGISTICS CARD */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-12 gap-3">
                     {/* Status Toggle */}
                     <div className="col-span-8 bg-white p-1 rounded-lg border border-gray-200 flex shadow-sm">
                         <button 
                            onClick={() => handleStatusChange(PackingStatus.PENDING)}
                            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-md py-2 transition-all ${bill.status === PackingStatus.PENDING ? 'bg-orange-50 text-orange-600 shadow-sm ring-1 ring-orange-100' : 'text-gray-400 hover:bg-gray-50'}`}
                         >
                            <AlertCircle size={14} /> Pending
                         </button>
                         <button 
                            onClick={() => handleStatusChange(PackingStatus.PACKED)}
                            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-md py-2 transition-all ${bill.status === PackingStatus.PACKED ? 'bg-green-50 text-green-600 shadow-sm ring-1 ring-green-100' : 'text-gray-400 hover:bg-gray-50'}`}
                         >
                            <Check size={14} strokeWidth={3} /> Packed
                         </button>
                     </div>

                     {/* Box Counter */}
                     <div className="col-span-4 bg-white rounded-lg border border-gray-200 flex items-center justify-between px-1 shadow-sm">
                        <button onClick={() => handleChange('boxCount', Math.max(0, bill.boxCount - 1))} className="p-2 text-gray-400 hover:text-black active:scale-90 transition-transform"><ChevronDown size={14}/></button>
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] text-gray-400 font-bold uppercase">Box</span>
                            <span className="text-sm font-black text-gray-900 leading-none">{bill.boxCount}</span>
                        </div>
                        <button onClick={() => handleChange('boxCount', bill.boxCount + 1)} className="p-2 text-gray-400 hover:text-black active:scale-90 transition-transform"><ChevronUp size={14}/></button>
                     </div>
                </div>

                {/* 2. CUSTOMER & ADDRESS */}
                <div className="space-y-4">
                    <InputGroup label="Customer Details" icon={<User size={12}/>}>
                        <div className="space-y-3">
                            <input 
                                type="text" 
                                value={bill.customerName}
                                onChange={(e) => handleChange('customerName', e.target.value)}
                                className="w-full px-3 py-3 bg-white border border-gray-200 rounded-xl text-base font-bold text-gray-900 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                                placeholder="Customer Name"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-gray-400"><Hash size={14}/></div>
                                    <input 
                                        type="text" 
                                        value={bill.invoiceNo}
                                        onChange={(e) => handleChange('invoiceNo', e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        placeholder="Invoice #"
                                    />
                                </div>
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-gray-400"><Calendar size={14}/></div>
                                    <input 
                                        type="date" 
                                        value={bill.billDate}
                                        onChange={(e) => handleChange('billDate', e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </InputGroup>

                    <InputGroup label="Address" icon={<MapPin size={12}/>}>
                        <textarea 
                            value={bill.address}
                            onChange={(e) => handleChange('address', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none shadow-sm"
                            placeholder="City, Area, or Full Address..."
                        />
                    </InputGroup>
                </div>

                {/* 3. METADATA & FLAGS */}
                <div>
                     <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1 mb-2">
                        <Layers size={12} />
                        Tags & Flags
                     </div>
                     <div className="flex flex-wrap gap-2">
                         {[
                             { key: 'isDelivery', label: 'Delivery', icon: Truck, color: 'blue' },
                             { key: 'hasCRN', label: 'Return (CRN)', icon: AlertCircle, color: 'amber' },
                             { key: 'isAdditionalBill', label: 'Add-on', icon: Package, color: 'pink' },
                             { key: 'isEditedBill', label: 'Edited', icon: Edit3, color: 'purple' },
                         ].map((tag) => (
                             <button
                                key={tag.key}
                                onClick={() => toggleFlag(tag.key as keyof BillData)}
                                className={`
                                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold border transition-all
                                    ${bill[tag.key as keyof BillData] 
                                        ? `bg-${tag.color}-50 text-${tag.color}-700 border-${tag.color}-200 ring-1 ring-${tag.color}-500/20` 
                                        : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                    }
                                `}
                             >
                                 <tag.icon size={12} />
                                 {tag.label}
                             </button>
                         ))}
                     </div>
                </div>

                {/* 4. CUSTOM COLOR PICKER */}
                <div>
                     <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1 mb-2">
                        <Palette size={12} />
                        Appearance
                     </div>
                     <div className="flex flex-wrap gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
                         {COLOR_PALETTE.map((c) => (
                             <button
                                key={c.name}
                                onClick={() => handleChange('colorTheme', c.name)}
                                className={`
                                    w-6 h-6 rounded-full border-2 transition-all duration-200
                                    ${c.bg}
                                    ${bill.colorTheme === c.name 
                                        ? 'border-black scale-110 ring-2 ring-black/10' 
                                        : 'border-transparent hover:scale-110 hover:border-gray-300'
                                    }
                                `}
                                title={c.name}
                             />
                         ))}
                     </div>
                </div>

                {/* 5. FOOTER ACTIONS */}
                <div className="pt-4 mt-2 border-t border-gray-100 flex gap-3">
                    {bill.imageUrl && (
                        <div className="flex-1 flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-200 group cursor-pointer hover:bg-gray-100 transition-colors relative overflow-hidden">
                             <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 shrink-0 border border-gray-300 relative">
                                <img src={bill.imageUrl} alt="Bill" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                             </div>
                             <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Attachment</p>
                                <p className="text-xs font-bold text-indigo-600 truncate flex items-center gap-1">
                                    View Receipt <ExternalLink size={10}/>
                                </p>
                             </div>
                             {/* Click target overlay */}
                             <a href={bill.imageUrl} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" />
                        </div>
                    )}
                    
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(bill.id); }}
                        className="px-4 py-2 rounded-xl border border-red-100 text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-700 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-colors min-w-[80px]"
                    >
                        <Trash2 size={16} /> Delete
                    </button>
                </div>

            </div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BillCard;
