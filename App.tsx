
import React, { useState, useEffect, useRef } from 'react';
import { BillData, PackingStatus } from './types';
import { extractBillDetails } from './services/geminiService';
import { subscribeToBills, saveBillToSupabase, deleteBillFromSupabase, COLOR_PALETTE, compressImage, isCloudConfigured, setupSupabase, disconnectCloud } from './services/storageService';
import BillCard from './components/BillCard';
import CameraCapture from './components/CameraCapture';
import DailyPlanner from './components/DailyPlanner';
import * as XLSX from 'xlsx';
import { Camera, FileSpreadsheet, Plus, Calendar, Loader2, CheckCircle, AlertTriangle, Clock, Archive, ListChecks, X, Trash2, CheckSquare, FolderInput, Palette, Check, CloudLightning, RotateCcw, ChevronLeft, ChevronRight, Image as ImageIcon, AlertOctagon, Save, Settings, Database, ShieldCheck, Copy, WifiOff, ClipboardList, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Robust ID generation
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

const getTodayDateString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
};

const formatDateForDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const App: React.FC = () => {
  const [allBills, setAllBills] = useState<BillData[]>([]);
  const [currentDate, setCurrentDate] = useState<string>(getTodayDateString());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // App Config State
  const [isConfigured, setIsConfigured] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [configError, setConfigError] = useState('');

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Group Modal State
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupColorInput, setGroupColorInput] = useState('');

  // Duplicate Warning State
  const [duplicateAlert, setDuplicateAlert] = useState<{
      existing: BillData;
      newData: { customerName: string; address: string; invoiceNo: string; billDate: string };
      base64: string | undefined;
  } | null>(null);
  
  // Camera State
  const [showCamera, setShowCamera] = useState(false);

  // Daily Planner State
  const [showPlanner, setShowPlanner] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Initial Setup Check
  useEffect(() => {
      const configured = isCloudConfigured();
      setIsConfigured(configured);
      if (!configured) {
          setShowSetupModal(true);
      }
  }, []);

  // Real-time Cloud Sync
  useEffect(() => {
    if (!isConfigured) return;
    
    const unsubscribe = subscribeToBills((bills) => {
      setAllBills(bills);
      setIsSyncing(false);
    });
    return () => unsubscribe();
  }, [isConfigured]);

  // --- CONFIG HANDLERS ---
  const handleSaveConfig = () => {
      try {
          setupSupabase(supabaseUrl, supabaseKey);
          setIsConfigured(true);
          setShowSetupModal(false);
          setConfigError('');
      } catch (e: any) {
          setConfigError(e.message);
      }
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
      alert("SQL Copied!");
  };

  // --- DATE NAVIGATION ---
  const navigateDate = (days: number) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + days);
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  // --- FILTERING LOGIC ---
  const todayNewBills = allBills
    .filter(b => b.entryDate === currentDate)
    .sort((a, b) => b.createdAt - a.createdAt);

  const backlogBills = allBills
    .filter(b => b.status === PackingStatus.PENDING && b.entryDate < currentDate)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate)); 

  // --- ACTIONS ---

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) setSelectedIds(new Set());
    setExpandedId(null);
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const openGroupModal = () => {
      if (selectedIds.size === 0) return;
      const selectedBills = allBills.filter(b => selectedIds.has(b.id));
      const commonName = selectedBills.find(b => b.description)?.description || "";
      const commonColor = selectedBills.find(b => b.colorTheme)?.colorTheme || "";
      setGroupNameInput(commonName);
      setGroupColorInput(commonColor);
      setShowGroupModal(true);
  };

  const applyGroupSettings = async () => {
      setShowGroupModal(false);
      
      const now = Date.now();
      const updates = allBills.map(b => {
          if (selectedIds.has(b.id)) {
              return { ...b, description: groupNameInput, colorTheme: groupColorInput || undefined, updatedAt: now };
          }
          return b;
      });
      
      setAllBills(updates);

      if (isConfigured) {
        setIsSyncing(true);
        const promises = updates
            .filter(b => selectedIds.has(b.id))
            .map(b => saveBillToSupabase(b));
        await Promise.all(promises);
        setIsSyncing(false);
      }
      
      setIsSelectionMode(false);
      setSelectedIds(new Set());
  };

  const handlePackSelected = async () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Mark ${selectedIds.size} bills as PACKED?`)) {
        const now = Date.now();
        const updates = allBills.map(b => {
            if (selectedIds.has(b.id)) {
                return { ...b, status: PackingStatus.PACKED, packedAt: now, updatedAt: now };
            }
            return b;
        });
        setAllBills(updates);

        if (isConfigured) {
            setIsSyncing(true);
            const promises = updates
                .filter(b => selectedIds.has(b.id))
                .map(b => saveBillToSupabase(b));
        await Promise.all(promises);
        setIsSyncing(false);
        }

        setIsSelectionMode(false);
        setSelectedIds(new Set());
    }
  };

  const handleDeleteSelected = async () => {
      if (selectedIds.size === 0) return;
      if (window.confirm(`Permanently delete ${selectedIds.size} bills?`)) {
          
          if (isConfigured) {
            setIsSyncing(true);
            const deletes = Array.from(selectedIds).map((id: string) => deleteBillFromSupabase(id));
            await Promise.all(deletes);
            setIsSyncing(false);
          }

          setAllBills(prev => prev.filter(b => !selectedIds.has(b.id)));
          setIsSelectionMode(false);
          setSelectedIds(new Set());
      }
  }

  // Helper to create and save bill after all checks
  const createBill = async (extracted: { customerName: string; address: string; invoiceNo: string; billDate: string }, base64Image?: string, manualData?: any) => {
    const newBill: BillData = {
      id: generateId(),
      imageUrl: '', 
      customerName: extracted.customerName || '',
      address: extracted.address || '',
      invoiceNo: extracted.invoiceNo || '',
      billDate: extracted.billDate || '',
      status: PackingStatus.PENDING,
      isDelivery: false,
      hasCRN: false,
      isEditedBill: false,
      isAdditionalBill: false,
      boxCount: manualData?.boxCount || 0,
      description: manualData?.description || '', 
      entryDate: currentDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // If offline, use base64 for display immediately
    if (!isConfigured && base64Image) {
        newBill.imageUrl = base64Image;
    }

    // Optimistic update
    setAllBills(prev => [newBill, ...prev]);
    
    // If working offline, stop here
    if (!isConfigured) {
        setExpandedId(newBill.id);
        return; 
    }

    setIsSyncing(true);
    if (base64Image) {
        setProcessStatus('Uploading image to cloud...');
    } else {
        setProcessStatus('Syncing data...');
    }

    try {
        await saveBillToSupabase(newBill, base64Image);
        setExpandedId(newBill.id);
    } catch (e: any) {
        setAllBills(prev => prev.filter(b => b.id !== newBill.id)); // Revert optimistic update
        console.error("Failed to save to cloud: " + e.message);
    } finally {
        setIsSyncing(false);
    }
  };

  const handleAddBill = async (file: File | null) => {
    setLoadingId('new');
    setProcessStatus('Compressing image...');
    
    let extracted = { customerName: '', address: '', invoiceNo: '', billDate: '' };
    let base64Image: string | undefined = undefined;

    try {
      if (file) {
          const reader = new FileReader();
          const rawBase64 = (await new Promise((resolve, reject) => {
              reader.onload = () => {
                  if (typeof reader.result === 'string') {
                      resolve(reader.result);
                  } else {
                      reject(new Error("Failed to read file"));
                  }
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
          })) as string;
          
          base64Image = await compressImage(rawBase64);
          
          setProcessStatus('Analyzing with AI...');
          extracted = await extractBillDetails(base64Image);

          // --- DUPLICATE CHECK LOGIC ---
          setProcessStatus('Checking for duplicates...');
          if (extracted.invoiceNo) {
              const normalizedNew = extracted.invoiceNo.trim().toLowerCase();
              if (normalizedNew.length > 0) {
                  const duplicate = allBills.find(b => b.invoiceNo && b.invoiceNo.trim().toLowerCase() === normalizedNew);
                  
                  if (duplicate) {
                      setLoadingId(null);
                      setProcessStatus('');
                      // TRIGGER POPUP
                      setDuplicateAlert({
                          existing: duplicate,
                          newData: extracted,
                          base64: base64Image
                      });
                      return; 
                  }
              }
          }
      }

      setProcessStatus('Saving bill...');
      await createBill(extracted, base64Image);
    } catch (error) {
      console.error(error);
      console.log("An error occurred processing the image.");
    } finally {
      if (!duplicateAlert) {
         setLoadingId(null);
         setProcessStatus('');
      }
    }
  };

  const handleManualQuickAdd = async (data: { customerName: string; invoiceNo: string; boxCount: number; description: string }) => {
      setLoadingId('new');
      setProcessStatus('Quick add...');
      await createBill({
          customerName: data.customerName,
          invoiceNo: data.invoiceNo,
          address: '',
          billDate: currentDate
      }, undefined, { boxCount: data.boxCount, description: data.description });
      setLoadingId(null);
      setProcessStatus('');
  };

  const handleConfirmDuplicate = async () => {
    if (duplicateAlert) {
        const { newData, base64 } = duplicateAlert;
        setDuplicateAlert(null); 
        setLoadingId('new_dup');
        setProcessStatus('Creating duplicate entry...');
        await createBill(newData, base64);
        setLoadingId(null);
        setProcessStatus('');
    }
  };

  const handleUpdateBill = (updated: BillData) => {
    setAllBills(prev => prev.map(b => b.id === updated.id ? updated : b));
    if (isConfigured) {
        saveBillToSupabase(updated).catch(() => {});
    }
  };

  const handleDeleteBill = (id: string) => {
    if (window.confirm("Are you sure you want to delete this bill?")) {
      if (isConfigured) {
          deleteBillFromSupabase(id);
      }
      setAllBills(prev => prev.filter(b => b.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  };

  const handleExportExcel = () => {
    const data = allBills.map(b => ({
      'Entry Date': b.entryDate,
      'Bill Date': b.billDate,
      'Customer Name': b.customerName,
      'Address': b.address,
      'Group Name': b.description,
      'Color Theme': b.colorTheme || 'Auto',
      'Invoice No': b.invoiceNo,
      'Status': b.status,
      'Packed At': b.packedAt ? new Date(b.packedAt).toLocaleString() : '',
      'Boxes': b.boxCount,
      'Delivery': b.isDelivery ? 'Yes' : 'No',
      'CRN': b.hasCRN ? 'Yes' : 'No',
      'Additional': b.isAdditionalBill ? 'Yes' : 'No',
      'Edited': b.isEditedBill ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grace_Packing_Data");
    XLSX.writeFile(wb, `Grace_Packing_${currentDate}.xlsx`);
  };

  const handleCameraCapture = (file: File) => {
      handleAddBill(file);
  };

  // SQL string for setup
  const sqlSetupString = `create table if not exists bills (
  id text primary key,
  "customerName" text,
  address text,
  "invoiceNo" text,
  "billDate" text,
  status text,
  "isDelivery" boolean,
  "hasCRN" boolean,
  "isEditedBill" boolean,
  "isAdditionalBill" boolean,
  "boxCount" integer,
  description text,
  "colorTheme" text,
  "entryDate" text,
  "createdAt" bigint,
  "updatedAt" bigint,
  "packedAt" bigint,
  "imageUrl" text
);
alter table bills enable row level security;
create policy "Public Access" on bills for all using (true) with check (true);
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true)
on conflict (id) do nothing;
create policy "Public Access" on storage.objects for all using ( bucket_id = 'receipts' ) with check ( bucket_id = 'receipts' );`;

  return (
    <div className="min-h-screen pb-32 relative bg-[#f8f9fa]">
      
      {/* --- CAMERA FULLSCREEN --- */}
      <AnimatePresence>
        {showCamera && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[200] bg-black">
                <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- HEADER --- */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="flex justify-between items-center max-w-3xl mx-auto">
          <div>
            <h1 className="text-xl font-black text-black tracking-tight">Grace Best</h1>
            <div className="flex items-center gap-1 text-xs font-bold text-gray-400 h-4">
               {isSyncing ? (
                 <span className="flex items-center gap-1 text-indigo-500"><Loader2 size={10} className="animate-spin"/> Syncing...</span>
               ) : isConfigured ? (
                 <span className="flex items-center gap-1 text-green-600"><CloudLightning size={10} /> Supabase</span>
               ) : (
                 <button onClick={() => setShowSetupModal(true)} className="flex items-center gap-1 text-red-500 hover:bg-red-50 rounded px-1 -ml-1 transition-colors"><WifiOff size={10} /> Offline (Demo)</button>
               )}
            </div>
          </div>
          <div className="flex items-center gap-2">
             
             {/* Improved Date Navigator */}
             <div className="flex items-center bg-gray-100 rounded-xl p-1 mr-1">
                <button onClick={() => navigateDate(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-black transition-all active:scale-90"><ChevronLeft size={18}/></button>
                <div className="relative flex items-center px-1 group overflow-hidden cursor-pointer">
                    <input type="date" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"/>
                    <div className="flex items-center gap-1.5 px-2 py-1 pointer-events-none">
                      <Calendar size={16} className="text-gray-700"/>
                      <span className="text-sm font-bold text-black whitespace-nowrap">{formatDateForDisplay(currentDate)}</span>
                    </div>
                 </div>
                <button onClick={() => navigateDate(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-black transition-all active:scale-90"><ChevronRight size={18}/></button>
             </div>

             {currentDate !== getTodayDateString() && (
               <button onClick={() => setCurrentDate(getTodayDateString())} className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl font-bold hover:bg-indigo-200 transition-colors">
                  <RotateCcw size={18} />
               </button>
             )}
             
             <button onClick={() => setShowPlanner(true)} className={`p-2.5 rounded-xl transition-all ${showPlanner ? 'bg-black text-white shadow-lg' : 'bg-gray-100 text-black hover:bg-gray-200'}`}>
                <ClipboardList size={20} />
             </button>

             <button onClick={toggleSelectionMode} className={`p-2.5 rounded-xl transition-all ${isSelectionMode ? 'bg-black text-white shadow-lg scale-105' : 'bg-gray-100 text-black hover:bg-gray-200'}`}>
                <ListChecks size={20} />
             </button>
             <button onClick={handleExportExcel} className="hidden sm:block p-2.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors">
                <FileSpreadsheet size={20} />
             </button>
             <button onClick={() => setShowSetupModal(true)} className="p-2.5 bg-gray-100 hover:bg-gray-200 text-black rounded-xl transition-colors">
                <Settings size={20} />
             </button>
          </div>
        </div>
      </div>

      {/* Hidden Inputs */}
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleAddBill(e.target.files[0])} className="hidden" />
      <input type="file" accept="image/*" ref={galleryInputRef} onChange={(e) => e.target.files?.[0] && handleAddBill(e.target.files[0])} className="hidden" />

      {/* --- DAILY PLANNER MODAL --- */}
      <AnimatePresence>
        {showPlanner && (
            <DailyPlanner 
                date={currentDate} 
                onClose={() => setShowPlanner(false)} 
                bills={todayNewBills}
                allBills={allBills}
                onDateChange={setCurrentDate}
                onQuickAdd={handleManualQuickAdd}
            />
        )}
      </AnimatePresence>

      {/* --- CLOUD SETUP MODAL --- */}
      <AnimatePresence>
          {showSetupModal && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[300] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-4">
                  <motion.div initial={{scale:0.95}} animate={{scale:1}} className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                      <div className="p-6 pb-4 border-b border-gray-100 flex justify-between items-start">
                          <div>
                            <h2 className="text-2xl font-black text-black flex items-center gap-2"><Database className="text-green-600" /> Connect Supabase</h2>
                            <p className="text-gray-500 text-sm mt-1">Free open-source database & storage.</p>
                          </div>
                          <button onClick={() => setShowSetupModal(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
                      </div>
                      <div className="p-6 overflow-y-auto">
                          {!isConfigured && (
                             <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-100 text-green-900 text-sm">
                                <h3 className="font-bold flex items-center gap-2 mb-2"><ShieldCheck size={16}/> Secure Cloud Storage</h3>
                                <p className="leading-relaxed opacity-90">Your data will be stored securely in your own Supabase project.</p>
                             </div>
                          )}
                          <div className="space-y-4">
                              <div className="grid grid-cols-1 gap-4">
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Project URL</label>
                                      <input type="text" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} placeholder="https://xyz.supabase.co" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 outline-none text-sm font-bold text-black"/>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Anon / Public Key</label>
                                      <input type="password" value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} placeholder="eyJh..." className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 outline-none text-sm font-bold text-black"/>
                                  </div>
                              </div>
                              <div className="p-4 bg-gray-100 rounded-xl space-y-3">
                                  <label className="block text-xs font-bold text-gray-600 uppercase">Quick Setup (SQL Editor)</label>
                                  <div className="relative group">
                                      <textarea readOnly className="w-full h-32 p-3 text-[10px] font-mono bg-black text-green-400 rounded-lg resize-none outline-none" value={sqlSetupString}/>
                                      <button onClick={() => copyToClipboard(sqlSetupString)} className="absolute top-2 right-2 p-1.5 bg-gray-800 text-white rounded hover:bg-gray-700"><Copy size={12}/></button>
                                  </div>
                              </div>
                              {configError && <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl flex items-center gap-2"><AlertTriangle size={16}/> {configError}</div>}
                          </div>
                      </div>
                      <div className="p-6 pt-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                          {isConfigured ? <button onClick={disconnectCloud} className="text-red-500 text-sm font-bold hover:underline">Disconnect</button> : <button onClick={() => setShowSetupModal(false)} className="text-gray-400 text-sm font-bold hover:text-gray-600">Skip / Work Offline</button>}
                          <button onClick={handleSaveConfig} disabled={!supabaseUrl || !supabaseKey} className="px-6 py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100">{isConfigured ? 'Update Configuration' : 'Connect'}</button>
                      </div>
                  </motion.div>
              </motion.div>
          )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        
        <AnimatePresence mode="popLayout">
        
        {/* BACKLOG SECTION */}
        {backlogBills.length > 0 && (
            <motion.div layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-2">
                <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100">
                    <AlertTriangle size={18} /> <h2>Pending Backlog ({backlogBills.length})</h2>
                </div>
                <div className="space-y-2">
                    {backlogBills.map(bill => (
                        <BillCard 
                            key={bill.id} bill={bill} onChange={handleUpdateBill} onDelete={handleDeleteBill}
                            isExpanded={expandedId === bill.id} toggleExpand={() => setExpandedId(expandedId === bill.id ? null : bill.id)}
                            isSelectionMode={isSelectionMode} isSelected={selectedIds.has(bill.id)} onToggleSelect={() => handleToggleSelect(bill.id)}
                        />
                    ))}
                </div>
            </motion.div>
        )}

        {/* TODAY SECTION */}
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-black text-black flex items-center gap-2">
                   <Clock size={18} className="text-black"/> 
                   {currentDate === getTodayDateString() ? "Today's Bills" : `Bills for ${formatDateForDisplay(currentDate)}`}
                </h2>
                <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1 rounded-full shadow-sm">
                    {todayNewBills.length} Entries
                </span>
            </div>
            
            {/* --- LOADING INDICATOR --- */}
            {(loadingId === 'new' || loadingId === 'new_dup') && (
                <motion.div initial={{opacity:0, scale: 0.95}} animate={{opacity:1, scale: 1}} className="p-4 flex items-center gap-4 bg-white rounded-2xl shadow-lg border border-indigo-100 ring-1 ring-indigo-50">
                    <div className="relative flex items-center justify-center w-10 h-10 bg-indigo-50 rounded-full"><Loader2 size={20} className="text-indigo-600 animate-spin" /></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-black text-black leading-tight">{loadingId === 'new_dup' ? 'Saving Duplicate' : 'Processing Bill'}</h3>
                        <div className="flex items-center gap-2 mt-1">
                             <div className="h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                                 <motion.div className="h-full bg-indigo-500" initial={{width: '10%'}} animate={{ width: processStatus.includes('Upload') ? '80%' : processStatus.includes('Anal') ? '50%' : '30%' }} transition={{ duration: 0.5 }}/>
                             </div>
                             <p className="text-xs font-bold text-indigo-500 truncate">{processStatus || 'Please wait...'}</p>
                        </div>
                    </div>
                </motion.div>
            )}

            {todayNewBills.length === 0 && !loadingId && (
                <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 shadow-sm">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300"><Archive size={36} /></div>
                    <p className="text-black font-bold text-lg">No bills found</p>
                    <p className="text-gray-400 text-sm mt-1">{isConfigured ? (currentDate === getTodayDateString() ? "Tap the + button to start" : "Select a different date") : "Connect Cloud to start, or add offline"}</p>
                </div>
            )}

            {todayNewBills.map(bill => (
                <BillCard 
                    key={bill.id} bill={bill} onChange={handleUpdateBill} onDelete={handleDeleteBill}
                    isExpanded={expandedId === bill.id} toggleExpand={() => setExpandedId(expandedId === bill.id ? null : bill.id)}
                    isSelectionMode={isSelectionMode} isSelected={selectedIds.has(bill.id)} onToggleSelect={() => handleToggleSelect(bill.id)}
                />
            ))}
        </div>
        </AnimatePresence>
      </div>

      {/* --- DUPLICATE WARNING MODAL --- */}
      <AnimatePresence>
      {duplicateAlert && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-gray-900/80 backdrop-blur-sm"
        >
           <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/20"
           >
              <div className="bg-orange-500 p-6 flex flex-col items-center text-center text-white">
                   <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 backdrop-blur-sm">
                      <AlertOctagon size={36} strokeWidth={2.5} />
                   </div>
                   <h2 className="text-2xl font-black mb-1">Duplicate Invoice</h2>
                   <p className="text-orange-100 text-sm font-medium">
                       Invoice <strong className="text-white px-1.5 py-0.5 bg-black/20 rounded">#{duplicateAlert.newData.invoiceNo}</strong> has already been scanned.
                   </p>
              </div>

              {/* Comparison View */}
              <div className="p-6">
                  <div className="flex items-stretch gap-2 mb-6">
                    {/* Existing Bill */}
                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 relative flex flex-col items-center text-center opacity-60">
                        <span className="absolute -top-3 bg-gray-200 text-gray-600 text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Previous</span>
                        <div className="h-16 w-full bg-gray-200 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                            {duplicateAlert.existing.imageUrl ? (
                                <img src={duplicateAlert.existing.imageUrl} className="w-full h-full object-cover" alt="Existing" />
                            ) : <ImageIcon size={20} className="text-gray-400"/>}
                        </div>
                        <div className="text-xs font-bold text-gray-900 truncate w-full">{duplicateAlert.existing.customerName}</div>
                        <div className="text-[10px] text-gray-500">{duplicateAlert.existing.billDate || 'No Date'}</div>
                    </div>

                    {/* New Bill */}
                    <div className="flex-1 bg-orange-50 border-2 border-orange-500 rounded-xl p-3 relative flex flex-col items-center text-center shadow-md">
                        <span className="absolute -top-3 bg-orange-500 text-white text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm">New Scan</span>
                        <div className="h-16 w-full bg-gray-200 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                            {duplicateAlert.base64 ? (
                                <img src={duplicateAlert.base64} className="w-full h-full object-cover" alt="New" />
                            ) : <ImageIcon size={20} className="text-gray-400"/>}
                        </div>
                        <div className="text-xs font-bold text-gray-900 truncate w-full">{duplicateAlert.newData.customerName || 'Scanning...'}</div>
                        <div className="text-[10px] text-gray-500">{duplicateAlert.newData.billDate || 'No Date'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setDuplicateAlert(null)}
                        className="py-3.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 transition-colors flex items-center justify-center gap-2"
                      >
                        <Ban size={18}/>
                        Ignore
                      </button>
                      <button 
                        onClick={handleConfirmDuplicate}
                        className="py-3.5 rounded-xl font-bold text-white bg-black hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-black/20"
                      >
                        <Save size={18} />
                        Save Copy
                      </button>
                  </div>
              </div>
           </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* --- GROUP ACTION MODAL --- */}
      <AnimatePresence>
      {showGroupModal && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[300] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{scale:0.9, y: 20}} animate={{scale:1, y: 0}} exit={{scale:0.9, y: 20}} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl ring-1 ring-white/10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-xl font-black mb-1">Group Actions</h2>
                        <p className="text-sm text-gray-500">Editing {selectedIds.size} selected items</p>
                    </div>
                    <button onClick={() => setShowGroupModal(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500"><X size={18}/></button>
                </div>
                
                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Group Name / Shop</label>
                        <input 
                            value={groupNameInput}
                            onChange={(e) => setGroupNameInput(e.target.value)}
                            placeholder="e.g. Area 51 Shops"
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-black/5 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Color Theme</label>
                        <div className="flex flex-wrap gap-2">
                            {COLOR_PALETTE.map(c => (
                                <button
                                    key={c.name}
                                    onClick={() => setGroupColorInput(c.name)}
                                    className={`w-8 h-8 rounded-full border-2 transition-all ${c.bg} ${groupColorInput === c.name ? 'border-black scale-110 shadow-md ring-2 ring-black/10' : 'border-transparent hover:scale-105'}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button onClick={() => setShowGroupModal(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                    <button onClick={applyGroupSettings} className="flex-1 py-3 rounded-xl font-bold text-white bg-black shadow-lg shadow-black/20 hover:scale-[1.02] transition-transform">Apply Changes</button>
                </div>
            </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* --- SELECTION BAR --- */}
      <AnimatePresence>
      {isSelectionMode && !showGroupModal && !duplicateAlert && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-6 inset-x-4 max-w-3xl mx-auto bg-white text-gray-900 rounded-2xl p-2 shadow-2xl ring-1 ring-black/5 flex items-center justify-between z-40">
             <div className="flex items-center gap-3 px-4">
                <div className="bg-black text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm">{selectedIds.size}</div>
                <span className="text-sm font-bold text-gray-500">Selected</span>
             </div>
             <div className="flex items-center gap-1">
                <button onClick={openGroupModal} disabled={selectedIds.size === 0} className="flex flex-col items-center justify-center p-2 px-4 rounded-xl active:bg-gray-100 disabled:opacity-30 transition-colors"><Palette size={22} className="text-indigo-600 mb-0.5"/><span className="text-[10px] font-bold">Group</span></button>
                <button onClick={handlePackSelected} disabled={selectedIds.size === 0} className="flex flex-col items-center justify-center p-2 px-4 rounded-xl active:bg-gray-100 disabled:opacity-30 transition-colors"><CheckSquare size={22} className="text-green-600 mb-0.5"/><span className="text-[10px] font-bold">Pack</span></button>
                <button onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="flex flex-col items-center justify-center p-2 px-4 rounded-xl active:bg-gray-100 disabled:opacity-30 transition-colors"><Trash2 size={22} className="text-red-500 mb-0.5"/><span className="text-[10px] font-bold">Delete</span></button>
                <div className="w-px h-8 bg-gray-200 mx-2"></div>
                <button onClick={toggleSelectionMode} className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"><X size={20} /></button>
             </div>
          </motion.div>
      )}
      </AnimatePresence>

      {/* --- STANDARD FAB --- */}
      <AnimatePresence>
      {!isSelectionMode && !duplicateAlert && !showPlanner && !showGroupModal && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="fixed bottom-8 right-6 flex flex-col gap-4 z-40">
            <button onClick={() => handleAddBill(null)} className="w-14 h-14 bg-white text-gray-900 rounded-2xl shadow-lg border border-gray-200 flex items-center justify-center hover:scale-105 active:scale-90 transition-all"><Plus size={28} strokeWidth={3} /></button>
            <button onClick={() => galleryInputRef.current?.click()} className="w-14 h-14 bg-white text-indigo-600 rounded-2xl shadow-lg border border-indigo-100 flex items-center justify-center hover:scale-105 active:scale-90 transition-all"><ImageIcon size={28} strokeWidth={2.5} /></button>
            <button onClick={() => setShowCamera(true)} className="w-16 h-16 bg-black text-white rounded-2xl shadow-2xl shadow-black/30 flex items-center justify-center hover:scale-105 active:scale-90 transition-all"><Camera size={32} strokeWidth={2} /></button>
          </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default App;
