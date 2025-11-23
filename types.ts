export enum PackingStatus {
  PENDING = 'PENDING',
  PACKED = 'PACKED',
}

export interface BillData {
  id: string;
  imageUrl?: string; // Base64 string of the bill
  customerName: string;
  address: string;
  invoiceNo: string;
  billDate: string; // Date printed on the bill
  
  // Status & Flags
  status: PackingStatus;
  isDelivery: boolean;
  hasCRN: boolean;
  isEditedBill: boolean;
  isAdditionalBill: boolean;
  
  // Packing Details
  boxCount: number;
  description: string; // Used for grouping (Shop Name)
  colorTheme?: string; // New: explicitly selected color theme name (e.g. 'blue')
  
  // Metadata
  entryDate: string; // YYYY-MM-DD format (The date the user worked on it)
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  packedAt?: number; // Timestamp when status changed to PACKED
}

export interface DayGroup {
  date: string;
  bills: BillData[];
}