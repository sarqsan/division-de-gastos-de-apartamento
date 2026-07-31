export type UserRole = "propietario" | "inquilino_ver" | "inquilino_editar";
export type ApartmentType = "A" | "B" | "none";

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  apartment: ApartmentType;
  landlordUid?: string;
  emailVerified: boolean;
  createdAt: string;
  name?: string;
  accessKey?: string;
}

export interface PropertyDetails {
  id: string;
  landlordUid: string;
  address: string;
  codeAptA_ver: string;
  codeAptA_editar: string;
  codeAptB_ver: string;
  codeAptB_editar: string;
}

export interface BillLuz {
  id: string;
  landlordUid: string;
  totalAmount: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalKwh: number;
  fixedCost: number; // Coste fijo (potencia, alquiler, etc.)
  variableCost: number; // Coste de la energía
  fileUrl?: string;
  createdAt: string;
}

export interface BillAgua {
  id: string;
  landlordUid: string;
  totalAmount: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalVolume?: number; // m3
  fileUrl?: string;
  createdAt: string;
}

export interface ReadingLuz {
  id: string;
  landlordUid: string;
  tenantUid?: string;
  apartment: "A" | "B";
  date: string; // YYYY-MM-DD
  value: number; // kWh
  imageUrl?: string; // photo proof base64 or mock URL
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface WebhookMeterConfig {
  enabled: boolean;
  secretToken: string;
  autoCreateReading: boolean;
  deviceNameA?: string;
  deviceNameB?: string;
  activeApartments?: ("A" | "B")[];
  lastWebhookTime?: string;
  lastWebhookStatus?: "success" | "error" | "none";
  lastWebhookError?: string;
}

export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  apartment: "A" | "B";
  totalKwh: number;
  powerW?: number;
  voltageV?: number;
  currentA?: number;
  status: "success" | "error" | "invalid_token";
  message: string;
}

export interface TuyaLiveMeterStatus {
  deviceId: string;
  apartment: "A" | "B";
  online: boolean;
  powerW: number;       // Current power in Watts (e.g. 350 W)
  voltageV: number;     // Current voltage in Volts (e.g. 230 V)
  currentA: number;     // Current amperage (e.g. 1.5 A)
  totalKwh: number;     // Cumulative energy consumption in kWh
  lastUpdated: string;
}

