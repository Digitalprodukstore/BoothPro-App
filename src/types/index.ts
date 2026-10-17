export type PackageId = 'mini' | 'strip' | 'dual_strip';

export interface PackageConfig {
  id: PackageId;
  name: string;
  photoCount: number;
  price: number;
  description: string;
  defaultCopies: number;
  badge?: string;
  recommendedLayout: '2_vertical' | '4_strip' | '4_grid' | '6_dual_strip';
}

export type PaymentMethod = 'qris' | 'voucher' | 'cash_bypass';

export type PaymentStatus = 'pending' | 'scanning' | 'verifying' | 'success' | 'failed';

export type FrameCategory = 'all' | 'classic' | 'aesthetic' | 'neon' | 'retro' | 'custom';

export interface FrameSlot {
  id: number;
  x: number; // percentage (0-100) or pixel
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export interface FrameTemplate {
  id: string;
  name: string;
  category: FrameCategory;
  layoutType: '2_vertical' | '4_strip' | '4_grid' | '6_dual_strip';
  aspectRatio: string; // e.g. "2:3", "1:3", "3:4"
  width: number; // reference canvas width in px
  height: number; // reference canvas height in px
  slots: FrameSlot[];
  backgroundColor: string;
  accentColor: string;
  titleText?: string;
  subtitleText?: string;
  borderWidth?: number;
  overlayImage?: string; // transparent PNG or SVG
  isActive?: boolean; // false hides this frame from the customer gallery
}

export type PhotoFilter = 'none' | 'vintage' | 'bw' | 'tokyo' | 'grain' | 'glow' | 'vibrant';

export interface SlotTransform {
  slotId: number;
  photoIndex: number;
  zoom: number; // 1.0 - 2.5
  panX: number; // -100 to 100
  panY: number; // -100 to 100
  filter: PhotoFilter;
}

export interface SessionData {
  sessionId: string;
  createdAt: string;
  package: PackageConfig;
  extraPrints: number;
  totalPrice: number;
  paymentMethod: PaymentMethod;
  capturedPhotos: string[]; // Base64 data URLs
  selectedFrameId: string;
  slotTransforms: SlotTransform[];
  finalPhotoDataUrl: string; // Base64 png
  gifBlobUrl: string;
  videoBlobUrl: string;
  videoMimeType: string;
  customerPhone: string;
  customerEmail: string;
  deliveryStatus: {
    whatsapp: 'idle' | 'sending' | 'sent' | 'failed';
    email: 'idle' | 'sending' | 'sent' | 'failed';
  };
  deliveryLogs?: string[];
  manifestValid: boolean;
}

export interface OperatorConfig {
  brandName: string;
  tagline: string;
  logoUrl?: string;
  coverImageUrl?: string;
  accentColor: string;
  welcomeHeadline: string;
  welcomeSubheadline: string;
  adminPin: string;
  cashBypassPin: string;
  packages: PackageConfig[];
  frames?: FrameTemplate[];
  extraPrintPrice: number;
  maxRetakes: number;
  countdownSeconds: number;
  // Payment
  qrisMerchantName: string;
  qrisNmid: string;
  qrisStaticQrUrl?: string;
  voucherCodes: { code: string; discountPercent: number; label: string }[];
  // Cloud & Delivery
  supabaseUrl: string;
  supabaseAnonKey: string;
  fonnteToken: string;
  fonnteSenderNumber?: string;
  brevoApiKey: string;
  brevoSenderEmail: string;
  // Hardware / Printer
  printerPaperSize: '4x6' | '2x6';
  printerAutoPrint: boolean;
  kioskTimeoutSeconds: number;
}

export interface RecorderAuditInfo {
  state: 'inactive' | 'recording' | 'paused' | 'finalizing' | 'stopped' | 'failed';
  mimeType: string;
  chunksCount: number;
  videoTracksCount: number;
  audioTracksCount: number;
  startTime: number | null;
  durationSeconds: number;
  hasLiveTracks: boolean;
  startAttempts: number;
  finalBlobSize: number;
  error: string | null;
  watchdogActive: boolean;
}
