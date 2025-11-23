import { BillData } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- CONFIGURATION MANAGEMENT ---
const CONFIG_KEY = 'grace_packing_supabase_config';
const BUCKET_NAME = 'receipts';
const TABLE_NAME = 'bills';

// State holders
let supabase: SupabaseClient | null = null;

// Helper to check status
export const isCloudConfigured = () => {
    return !!supabase;
};

// Get config from local storage
export const getStoredConfig = () => {
    try {
        const stored = localStorage.getItem(CONFIG_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch { return null; }
};

// Initialize helper
const init = () => {
    try {
        const config = getStoredConfig();
        if (config && config.supabaseUrl && config.supabaseKey) {
            supabase = createClient(config.supabaseUrl, config.supabaseKey);
            console.log("Supabase initialized from stored config");
        }
    } catch (e) {
        console.error("Failed to auto-initialize Supabase:", e);
        localStorage.removeItem(CONFIG_KEY);
    }
};

// Run init immediately on load
init();

// --- SETUP FUNCTIONS ---

export const setupSupabase = (url: string, key: string) => {
    try {
        const cleanUrl = url.trim();
        const cleanKey = key.trim();

        if (!cleanUrl || !cleanKey) {
            throw new Error("Supabase URL and Key are required.");
        }

        const config = { supabaseUrl: cleanUrl, supabaseKey: cleanKey };
        
        // Test connection by creating client
        createClient(cleanUrl, cleanKey);
        
        // Save and Reload
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        window.location.reload(); // Reload to force clean initialization
        return true;
    } catch (e: any) {
        console.error("Setup Error:", e);
        throw new Error(e.message || "Could not configure Supabase.");
    }
};

export const disconnectCloud = () => {
    if (window.confirm("Are you sure? This will disconnect the app from the current database. No data will be deleted from the cloud, but you will need to re-enter keys to access it.")) {
        localStorage.removeItem(CONFIG_KEY);
        window.location.reload();
    }
};

// --- IMAGE UTILS ---

export const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
        resolve(base64Str); // Return original if compression fails
    }
  });
};

const base64ToBlob = (base64: string, mimeType = 'image/jpeg'): Blob => {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
};

// --- DATA OPERATIONS ---

export const subscribeToBills = (onUpdate: (bills: BillData[]) => void) => {
  if (!supabase) {
      onUpdate([]); 
      return () => {};
  }

  const fetchBills = async () => {
      try {
          const { data, error } = await supabase!
              .from(TABLE_NAME)
              .select('*')
              .order('createdAt', { ascending: false });
          
          if (error) {
              console.error("Supabase Fetch Error:", error.message || String(error));
              if (error.code === '42P01') { // Undefined table
                  console.warn("Table 'bills' does not exist. Please run the setup SQL.");
              }
              return;
          }
          if (data) onUpdate(data as BillData[]);
      } catch (e: any) {
          console.error("Unexpected error during fetch:", e.message || e);
      }
  };

  // Initial fetch
  fetchBills();

  // Subscribe to changes
  const channel = supabase
      .channel('public:bills')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, (payload) => {
          fetchBills();
      })
      .subscribe();

  return () => {
      supabase?.removeChannel(channel);
  };
};

export const saveBillToSupabase = async (bill: BillData, imageBase64?: string) => {
  if (!supabase) {
      throw new Error("Database not connected. Please configure Supabase.");
  }

  let finalBill = { ...bill };
  let newUploadedPath: string | null = null;
  
  try {
    // 1. Upload Image to Supabase Storage (if provided)
    if (imageBase64 && imageBase64.startsWith('data:')) {
        
        // CLEANUP: If there is an existing image, delete it first to save space
        if (bill.imageUrl && bill.imageUrl.includes(`/${BUCKET_NAME}/`)) {
             try {
                 const parts = bill.imageUrl.split(`/${BUCKET_NAME}/`);
                 if (parts.length === 2) {
                     const oldPath = decodeURIComponent(parts[1]);
                     await supabase.storage.from(BUCKET_NAME).remove([oldPath]);
                 }
             } catch (cleanupError) {
                 console.warn("Failed to cleanup old image:", cleanupError);
             }
        }

        try {
            const blob = base64ToBlob(imageBase64);
            const fileName = `${bill.id}_${Date.now()}.jpg`;
            
            // Upload to Bucket
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, blob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;
            
            if (uploadData?.path) {
                newUploadedPath = uploadData.path;
            }

            // Get Public URL
            const { data: urlData } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(fileName);
            
            finalBill.imageUrl = urlData.publicUrl;

        } catch (storageError: any) {
            console.error("Supabase Storage Upload Error:", storageError.message || storageError);
            throw new Error(`Image Upload Failed: ${storageError.message || 'Unknown error'}`);
        }
    } 
    
    // 2. Upsert Data to Table
    // Crucial: We only save the URL, not the base64, keeping the DB small.
    const { error: dbError } = await supabase
        .from(TABLE_NAME)
        .upsert(finalBill);

    if (dbError) {
        // ROLLBACK: If DB save fails, delete the just-uploaded image so it doesn't become orphaned
        if (newUploadedPath) {
             await supabase.storage.from(BUCKET_NAME).remove([newUploadedPath]);
        }
        console.error("Supabase DB Upsert Error:", dbError.message || String(dbError));
        throw new Error(`Database Save Failed: ${dbError.message || 'Check console for details'}`);
    }

  } catch (e) {
    console.error("Error saving bill to Supabase:", e);
    throw e;
  }
};

export const deleteBillFromSupabase = async (id: string) => {
  if (!supabase) return;
  try {
    // 1. Fetch bill details first to get the image URL
    const { data: bill, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('imageUrl')
        .eq('id', id)
        .single();
    
    // 2. Delete the image from Storage Bucket (if it exists)
    if (bill && bill.imageUrl && bill.imageUrl.includes(`/${BUCKET_NAME}/`)) {
         const parts = bill.imageUrl.split(`/${BUCKET_NAME}/`);
         if (parts.length === 2) {
             const filePath = decodeURIComponent(parts[1]); // Ensure spaces/chars are handled
             console.log("Deleting associated image:", filePath);
             const { error: storageError } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([filePath]);
             
             if (storageError) {
                 console.warn("Warning: Could not delete associated image file:", storageError.message);
             }
         }
    }

    // 3. Delete the record from the Database
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) {
        console.error("Error deleting bill metadata:", error.message || error);
    }
  } catch (e) {
    console.error("Error deleting bill from Supabase:", e);
  }
};

// --- COLOR PALETTE (UI Helpers) ---
export const COLOR_PALETTE = [
  { name: 'slate', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900', ring: 'ring-slate-500' },
  { name: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', ring: 'ring-red-500' },
  { name: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', ring: 'ring-orange-500' },
  { name: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', ring: 'ring-amber-500' },
  { name: 'green', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', ring: 'ring-emerald-500' },
  { name: 'teal', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-900', ring: 'ring-teal-500' },
  { name: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', ring: 'ring-blue-500' },
  { name: 'indigo', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', ring: 'ring-indigo-500' },
  { name: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', ring: 'ring-purple-500' },
  { name: 'pink', bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-900', ring: 'ring-pink-500' },
];

export const getThemeStyles = (colorName?: string, description?: string) => {
    if (colorName) {
        const found = COLOR_PALETTE.find(c => c.name === colorName);
        if (found) return found;
    }
    if (description && description.trim().length > 0) {
        let hash = 0;
        for (let i = 0; i < description.length; i++) {
          hash = description.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % COLOR_PALETTE.length;
        return COLOR_PALETTE[index];
    }
    return COLOR_PALETTE[0]; 
};