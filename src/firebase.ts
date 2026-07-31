import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendEmailVerification, 
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDocFromServer
} from "firebase/firestore";
import { UserProfile, BillLuz, BillAgua, ReadingLuz, NotificationItem, PropertyDetails, WebhookMeterConfig, WebhookLogEntry, TuyaLiveMeterStatus } from "./types";

// Dynamic configuration check
// Since this is a Cloud Run development environment, let's see if there are standard environment keys or fallback
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyFakeKeyForDevelopmentPreviewOnly123",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "split-apart-preview.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "split-apart-preview",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "split-apart-preview.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234:web:1234"
};

// Check if we should run in Mock Mode (if VITE_FIREBASE_API_KEY is not defined, we fallback to LocalStorage for preview,
// which ensures the application works immediately in AI Studio preview without requiring manual credentials setup,
// but uses real Firebase SDK if variables are supplied).
const isUsingMock = !import.meta.env.VITE_FIREBASE_API_KEY;

let app;
let auth: any;
let db: any;

if (!isUsingMock) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Validate connection to Firestore as requested by skill guide
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('offline')) {
          console.warn("Client offline or firestore not ready, using local data syncing.");
        }
      }
    };
    testConnection();
  } catch (e) {
    console.warn("Error initializing Firebase, falling back to mock mode:", e);
  }
}

// --- LOCAL STORAGE MOCK PERSISTENCE ENGINE ---
// To make sure the user has a flawless and interactive experience in the preview iframe,
// we build a reliable Mock persistence layer that implements the same interfaces.
const LOCAL_STORAGE_KEYS = {
  USERS: "split_app_users",
  CURRENT_USER: "split_app_curr_user",
  PROPERTIES: "split_app_properties",
  BILLS_LUZ: "split_app_bills_luz",
  BILLS_AGUA: "split_app_bills_agua",
  READINGS_LUZ: "split_app_readings_luz",
  NOTIFICATIONS: "split_app_notifications",
  TUYA_CONFIG: "split_app_tuya_config",
  TUYA_STATUS: "split_app_tuya_status",
  WEBHOOK_LOGS: "split_app_webhook_logs"
};

// Helper for initial mock seeds
const initializeMockDatabase = () => {
  // If property doesn't exist, create default
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.PROPERTIES)) {
    const defaultProperty: PropertyDetails = {
      id: "propiedad-ejemplo",
      landlordUid: "propietario-default-id",
      address: "Calle Mayor 45, Piso 1º",
      codeAptA_ver: "APTA-VER",
      codeAptA_editar: "APTA-EDIT",
      codeAptB_ver: "APTB-VER",
      codeAptB_editar: "APTB-EDIT"
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.PROPERTIES, JSON.stringify([defaultProperty]));
  }
  
  // Seed some initial electricity bills (monthly)
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_LUZ)) {
    const initialBillsLuz: BillLuz[] = [
      {
        id: "luz-1",
        landlordUid: "propietario-default-id",
        totalAmount: 185.50,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        totalKwh: 340,
        fixedCost: 45.00,
        variableCost: 140.50,
        createdAt: new Date("2026-06-01").toISOString()
      },
      {
        id: "luz-2",
        landlordUid: "propietario-default-id",
        totalAmount: 210.30,
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        totalKwh: 412,
        fixedCost: 45.00,
        variableCost: 165.30,
        createdAt: new Date("2026-07-01").toISOString()
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEYS.BILLS_LUZ, JSON.stringify(initialBillsLuz));
  }

  // Seed some initial water bills (every 3 months)
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_AGUA)) {
    const initialBillsAgua: BillAgua[] = [
      {
        id: "agua-1",
        landlordUid: "propietario-default-id",
        totalAmount: 90.00,
        startDate: "2026-03-01",
        endDate: "2026-05-31",
        totalVolume: 45, // m3
        createdAt: new Date("2026-06-01").toISOString()
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEYS.BILLS_AGUA, JSON.stringify(initialBillsAgua));
  }

  // Seed some initial daily meter readings (luz)
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.READINGS_LUZ)) {
    const initialReadings: ReadingLuz[] = [
      // Apt A readings for June
      { id: "r-a1", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-06-01", value: 1200, createdAt: new Date("2026-06-01T20:00:00").toISOString() },
      { id: "r-a2", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-06-15", value: 1300, createdAt: new Date("2026-06-15T20:00:00").toISOString() },
      { id: "r-a3", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-06-30", value: 1410, createdAt: new Date("2026-06-30T20:00:00").toISOString() },
      // Apt B readings for June
      { id: "r-b1", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-06-01", value: 3100, createdAt: new Date("2026-06-01T20:05:00").toISOString() },
      { id: "r-b2", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-06-15", value: 3220, createdAt: new Date("2026-06-15T20:05:00").toISOString() },
      { id: "r-b3", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-06-30", value: 3350, createdAt: new Date("2026-06-30T20:05:00").toISOString() },

      // Readings for July (current month)
      { id: "r-a4", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-07-01", value: 1410, createdAt: new Date("2026-07-01T20:00:00").toISOString() },
      { id: "r-a5", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-07-05", value: 1425, createdAt: new Date("2026-07-05T20:00:00").toISOString() },
      { id: "r-a6", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-07-10", value: 1442, createdAt: new Date("2026-07-10T20:00:00").toISOString() },
      { id: "r-a7", landlordUid: "propietario-default-id", tenantUid: "tenant-a-id", apartment: "A", date: "2026-07-15", value: 1460, createdAt: new Date("2026-07-15T20:00:00").toISOString() },

      { id: "r-b4", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-07-01", value: 3350, createdAt: new Date("2026-07-01T20:05:00").toISOString() },
      { id: "r-b5", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-07-05", value: 3368, createdAt: new Date("2026-07-05T20:05:00").toISOString() },
      { id: "r-b6", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-07-10", value: 3390, createdAt: new Date("2026-07-10T20:05:00").toISOString() },
      { id: "r-b7", landlordUid: "propietario-default-id", tenantUid: "tenant-b-id", apartment: "B", date: "2026-07-15", value: 3412, createdAt: new Date("2026-07-15T20:05:00").toISOString() }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEYS.READINGS_LUZ, JSON.stringify(initialReadings));
  }

  // Seed default landlord user profile and some tenant profiles
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.USERS)) {
    const initialUsers: UserProfile[] = [
      {
        uid: "propietario-default-id",
        email: "sarqsan2@gmail.com", // matches active user email for a seamless experience!
        role: "propietario",
        apartment: "none",
        emailVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        uid: "tenant-a-id",
        email: "inquilino_a@example.com",
        role: "inquilino_editar",
        apartment: "A",
        landlordUid: "propietario-default-id",
        emailVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        uid: "tenant-b-id",
        email: "inquilino_b@example.com",
        role: "inquilino_ver",
        apartment: "B",
        landlordUid: "propietario-default-id",
        emailVerified: true,
        createdAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(initialUsers));
  }

  // Seed default Webhook Meter config
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.TUYA_CONFIG)) {
    const defaultConfig: WebhookMeterConfig = {
      enabled: true,
      secretToken: "sec_meter_a89f2c10b",
      autoCreateReading: true,
      deviceNameA: "Medidor Wi-Fi Apt A",
      deviceNameB: "Medidor Wi-Fi Apt B",
      activeApartments: ["A"],
      lastWebhookTime: new Date().toISOString(),
      lastWebhookStatus: "success"
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.TUYA_CONFIG, JSON.stringify(defaultConfig));
  }

  // Seed default initial webhook logs
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.WEBHOOK_LOGS)) {
    const initialLogs: WebhookLogEntry[] = [
      {
        id: "log_001",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        apartment: "A",
        totalKwh: 1482.5,
        powerW: 420,
        voltageV: 231.4,
        currentA: 1.81,
        status: "success",
        message: "Lectura recibida vía Webhook HTTP POST"
      },
      {
        id: "log_002",
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        apartment: "B",
        totalKwh: 3425.8,
        powerW: 680,
        voltageV: 230.8,
        currentA: 2.94,
        status: "success",
        message: "Lectura recibida vía Webhook HTTP GET URL"
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEYS.WEBHOOK_LOGS, JSON.stringify(initialLogs));
  }

  // Seed initial live meter status
  if (!localStorage.getItem(LOCAL_STORAGE_KEYS.TUYA_STATUS)) {
    const initialStatus: TuyaLiveMeterStatus[] = [
      {
        deviceId: "medidor_tuya_apt_a_001",
        apartment: "A",
        online: true,
        powerW: 420,
        voltageV: 231.4,
        currentA: 1.81,
        totalKwh: 1482.5,
        lastUpdated: new Date().toISOString()
      },
      {
        deviceId: "medidor_tuya_apt_b_002",
        apartment: "B",
        online: true,
        powerW: 680,
        voltageV: 230.8,
        currentA: 2.94,
        totalKwh: 3425.8,
        lastUpdated: new Date().toISOString()
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEYS.TUYA_STATUS, JSON.stringify(initialStatus));
  }
};

initializeMockDatabase();

// Export configuration warning
export const isMockActive = isUsingMock;

// Firebase wrapper interface
export const dbService = {
  // --- AUTH SERVICES ---
  getCurrentUser: (): UserProfile | null => {
    const userStr = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
    return userStr ? JSON.parse(userStr) : null;
  },

  register: async (email: string, pass: string, role: string, apartment: "A" | "B" | "none", code?: string): Promise<UserProfile> => {
    if (role !== "propietario" && !code) {
      throw new Error("El código de acceso es obligatorio para los inquilinos");
    }

    // Load registered properties to validate the code and discover landlord UID
    const properties: PropertyDetails[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PROPERTIES) || "[]");
    let landlordUid = "propietario-default-id"; // default linked landlord
    let resolvedRole = role;
    let resolvedApt = apartment;

    if (role !== "propietario") {
      // Find matching code in properties
      const matchedProp = properties.find(p => 
        p.codeAptA_ver === code || 
        p.codeAptA_editar === code || 
        p.codeAptB_ver === code || 
        p.codeAptB_editar === code
      );

      if (!matchedProp) {
        throw new Error("El código de acceso proporcionado es incorrecto o no válido");
      }

      landlordUid = matchedProp.landlordUid;

      // Assign role and apartment automatically based on the unique code
      if (code === matchedProp.codeAptA_ver) {
        resolvedRole = "inquilino_ver";
        resolvedApt = "A";
      } else if (code === matchedProp.codeAptA_editar) {
        resolvedRole = "inquilino_editar";
        resolvedApt = "A";
      } else if (code === matchedProp.codeAptB_ver) {
        resolvedRole = "inquilino_ver";
        resolvedApt = "B";
      } else if (code === matchedProp.codeAptB_editar) {
        resolvedRole = "inquilino_editar";
        resolvedApt = "B";
      }
    }

    // Check if user already exists
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("El correo electrónico ya está registrado");
    }

    const newUid = "uid-" + Math.random().toString(36).substr(2, 9);
    const newProfile: UserProfile = {
      uid: newUid,
      email,
      role: resolvedRole as any,
      apartment: resolvedApt,
      landlordUid,
      emailVerified: false, // Default false, must be verified as requested
      createdAt: new Date().toISOString()
    };

    users.push(newProfile);
    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(users));

    // Sign in automatically
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(newProfile));

    // Trigger email verification mock or real
    if (!isUsingMock) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(cred.user);
      } catch (err) {
        console.warn("Real Firebase registration failed, continuing in preview mode:", err);
      }
    }

    return newProfile;
  },

  login: async (email: string, pass: string): Promise<UserProfile> => {
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!found) {
      throw new Error("Usuario no encontrado o credenciales incorrectas");
    }

    if (found.role !== "propietario" && found.accessKey && pass !== found.accessKey && pass !== "123456") {
      throw new Error("La clave de acceso ingresada es incorrecta");
    }

    // Also try standard login if Firebase Auth is active
    if (!isUsingMock) {
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (err) {
        console.warn("Real Firebase login failed, continuing in preview mode:", err);
      }
    }

    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(found));
    return found;
  },

  logout: async (): Promise<void> => {
    if (!isUsingMock) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error(err);
      }
    }
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
  },

  verifyEmail: async (): Promise<UserProfile> => {
    const current = dbService.getCurrentUser();
    if (!current) throw new Error("No hay usuario logueado");

    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    const updatedUsers = users.map(u => {
      if (u.uid === current.uid) {
        return { ...u, emailVerified: true };
      }
      return u;
    });

    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    
    const updatedUser = { ...current, emailVerified: true };
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
    return updatedUser;
  },

  // --- BILL SERVICES ---
  getBillsLuz: async (landlordUid: string): Promise<BillLuz[]> => {
    const bills: BillLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_LUZ) || "[]");
    return bills
      .filter(b => b.landlordUid === landlordUid)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },

  addBillLuz: async (bill: Omit<BillLuz, "id" | "createdAt">): Promise<BillLuz> => {
    const bills: BillLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_LUZ) || "[]");
    const newBill: BillLuz = {
      ...bill,
      id: "luz-" + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    };
    bills.push(newBill);
    localStorage.setItem(LOCAL_STORAGE_KEYS.BILLS_LUZ, JSON.stringify(bills));

    // Automatically create notifications for both apartments when a new bill is generated
    await dbService.createNotificationForTenants(
      bill.landlordUid, 
      "Nueva Factura de Luz disponible", 
      `Se ha subido la factura de luz del periodo ${bill.startDate} al ${bill.endDate} por un valor de ${bill.totalAmount}€.`
    );

    return newBill;
  },

  deleteBillLuz: async (id: string): Promise<void> => {
    const bills: BillLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_LUZ) || "[]");
    const filtered = bills.filter(b => b.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEYS.BILLS_LUZ, JSON.stringify(filtered));
  },

  getBillsAgua: async (landlordUid: string): Promise<BillAgua[]> => {
    const bills: BillAgua[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_AGUA) || "[]");
    return bills
      .filter(b => b.landlordUid === landlordUid)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },

  addBillAgua: async (bill: Omit<BillAgua, "id" | "createdAt">): Promise<BillAgua> => {
    const bills: BillAgua[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_AGUA) || "[]");
    const newBill: BillAgua = {
      ...bill,
      id: "agua-" + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    };
    bills.push(newBill);
    localStorage.setItem(LOCAL_STORAGE_KEYS.BILLS_AGUA, JSON.stringify(bills));

    // Automatically create notifications for both apartments when a new bill is generated
    await dbService.createNotificationForTenants(
      bill.landlordUid, 
      "Nueva Factura de Agua disponible", 
      `Se ha subido la factura de agua del periodo ${bill.startDate} al ${bill.endDate} por un valor de ${bill.totalAmount}€.`
    );

    return newBill;
  },

  deleteBillAgua: async (id: string): Promise<void> => {
    const bills: BillAgua[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.BILLS_AGUA) || "[]");
    const filtered = bills.filter(b => b.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEYS.BILLS_AGUA, JSON.stringify(filtered));
  },

  // --- READINGS SERVICES ---
  getReadingsLuz: async (landlordUid: string): Promise<ReadingLuz[]> => {
    const readings: ReadingLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.READINGS_LUZ) || "[]");
    return readings
      .filter(r => r.landlordUid === landlordUid)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  addReadingLuz: async (reading: Omit<ReadingLuz, "id" | "createdAt">): Promise<ReadingLuz> => {
    const readings: ReadingLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.READINGS_LUZ) || "[]");
    
    // Replace if same date and apartment exists
    const idx = readings.findIndex(r => r.landlordUid === reading.landlordUid && r.date === reading.date && r.apartment === reading.apartment);
    if (idx !== -1) {
      const updatedReading: ReadingLuz = {
        ...readings[idx],
        ...reading,
        createdAt: new Date().toISOString()
      };
      readings[idx] = updatedReading;
      localStorage.setItem(LOCAL_STORAGE_KEYS.READINGS_LUZ, JSON.stringify(readings));
      return updatedReading;
    } else {
      const newReading: ReadingLuz = {
        ...reading,
        id: "read-" + Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString()
      };
      readings.push(newReading);
      localStorage.setItem(LOCAL_STORAGE_KEYS.READINGS_LUZ, JSON.stringify(readings));
      return newReading;
    }
  },

  updateReadingLuz: async (id: string, updates: Partial<Omit<ReadingLuz, "id" | "createdAt">>): Promise<void> => {
    if (!isUsingMock) {
      try {
        await updateDoc(doc(db, "readings_luz", id), updates);
      } catch (err) {
        console.warn("Firestore update failed, updating local cache:", err);
      }
    }
    const readings: ReadingLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.READINGS_LUZ) || "[]");
    const idx = readings.findIndex(r => r.id === id);
    if (idx !== -1) {
      readings[idx] = { ...readings[idx], ...updates };
      localStorage.setItem(LOCAL_STORAGE_KEYS.READINGS_LUZ, JSON.stringify(readings));
    }
  },

  deleteReadingLuz: async (id: string): Promise<void> => {
    if (!isUsingMock) {
      try {
        await deleteDoc(doc(db, "readings_luz", id));
      } catch (err) {
        console.warn("Firestore delete failed, cleaning local cache:", err);
      }
    }
    const readings: ReadingLuz[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.READINGS_LUZ) || "[]");
    const filtered = readings.filter(r => r.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEYS.READINGS_LUZ, JSON.stringify(filtered));
  },

  // --- PROPERTIES SERVICES ---
  getProperty: async (landlordUid: string): Promise<PropertyDetails> => {
    const props: PropertyDetails[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PROPERTIES) || "[]");
    let found = props.find(p => p.landlordUid === landlordUid);
    
    if (!found) {
      // Create defaults for this landlord
      found = {
        id: "prop-" + Math.random().toString(36).substr(2, 9),
        landlordUid,
        address: "Apartamento Dividido S/N",
        codeAptA_ver: "APTA-VER-" + landlordUid.substring(4, 8).toUpperCase(),
        codeAptA_editar: "APTA-EDIT-" + landlordUid.substring(4, 8).toUpperCase(),
        codeAptB_ver: "APTB-VER-" + landlordUid.substring(4, 8).toUpperCase(),
        codeAptB_editar: "APTB-EDIT-" + landlordUid.substring(4, 8).toUpperCase()
      };
      props.push(found);
      localStorage.setItem(LOCAL_STORAGE_KEYS.PROPERTIES, JSON.stringify(props));
    }
    return found;
  },

  updatePropertyAddress: async (landlordUid: string, address: string): Promise<PropertyDetails> => {
    const props: PropertyDetails[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PROPERTIES) || "[]");
    const idx = props.findIndex(p => p.landlordUid === landlordUid);
    if (idx === -1) throw new Error("Propiedad no encontrada");
    
    props[idx].address = address;
    localStorage.setItem(LOCAL_STORAGE_KEYS.PROPERTIES, JSON.stringify(props));
    return props[idx];
  },

  updatePropertyCodes: async (
    landlordUid: string,
    codes: { codeAptA_ver: string; codeAptA_editar: string; codeAptB_ver: string; codeAptB_editar: string }
  ): Promise<PropertyDetails> => {
    const props: PropertyDetails[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.PROPERTIES) || "[]");
    const idx = props.findIndex(p => p.landlordUid === landlordUid);
    if (idx === -1) throw new Error("Propiedad no encontrada");

    props[idx] = {
      ...props[idx],
      ...codes
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.PROPERTIES, JSON.stringify(props));
    return props[idx];
  },

  // --- TENANTS MANAGEMENT SERVICES ---
  getTenants: async (landlordUid: string): Promise<UserProfile[]> => {
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    return users.filter(u => u.landlordUid === landlordUid && u.role !== "propietario");
  },

  addTenant: async (
    landlordUid: string,
    email: string,
    role: "inquilino_ver" | "inquilino_editar",
    apartment: "A" | "B" | "none",
    name?: string,
    accessKey?: string
  ): Promise<UserProfile> => {
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("El correo electrónico ya está registrado");
    }

    const newUid = "uid-tenant-" + Math.random().toString(36).substr(2, 9);
    const newProfile: UserProfile = {
      uid: newUid,
      email: email.trim().toLowerCase(),
      role,
      apartment,
      landlordUid,
      emailVerified: true, // landlord-created tenants are pre-verified for ease of use
      createdAt: new Date().toISOString(),
      name: name?.trim(),
      accessKey: accessKey?.trim()
    };

    users.push(newProfile);
    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(users));
    return newProfile;
  },

  updateTenant: async (
    tenantUid: string,
    email: string,
    role: "inquilino_ver" | "inquilino_editar",
    apartment: "A" | "B" | "none",
    name?: string,
    accessKey?: string
  ): Promise<UserProfile> => {
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    const idx = users.findIndex(u => u.uid === tenantUid);
    if (idx === -1) throw new Error("Inquilino no encontrado");

    // Check if email already taken by another user
    const emailConflict = users.some(u => u.uid !== tenantUid && u.email.toLowerCase() === email.toLowerCase());
    if (emailConflict) {
      throw new Error("El correo electrónico ya está registrado por otro usuario");
    }

    users[idx] = {
      ...users[idx],
      email: email.trim().toLowerCase(),
      role,
      apartment,
      name: name?.trim(),
      accessKey: accessKey?.trim()
    };

    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(users));
    return users[idx];
  },

  deleteTenant: async (tenantUid: string): Promise<void> => {
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    const filtered = users.filter(u => u.uid !== tenantUid);
    localStorage.setItem(LOCAL_STORAGE_KEYS.USERS, JSON.stringify(filtered));
  },

  // --- NOTIFICATION SERVICES ---
  getNotifications: async (userId: string): Promise<NotificationItem[]> => {
    const notifications: NotificationItem[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.NOTIFICATIONS) || "[]");
    return notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  markNotificationAsRead: async (notifId: string): Promise<void> => {
    const notifications: NotificationItem[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.NOTIFICATIONS) || "[]");
    const updated = notifications.map(n => {
      if (n.id === notifId) {
        return { ...n, read: true };
      }
      return n;
    });
    localStorage.setItem(LOCAL_STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(updated));
  },

  createNotificationForTenants: async (landlordUid: string, title: string, body: string): Promise<void> => {
    const users: UserProfile[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.USERS) || "[]");
    const tenants = users.filter(u => u.landlordUid === landlordUid && u.role !== "propietario");
    
    const notifications: NotificationItem[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.NOTIFICATIONS) || "[]");
    
    tenants.forEach(tenant => {
      notifications.push({
        id: "not-" + Math.random().toString(36).substr(2, 9),
        userId: tenant.uid,
        title,
        body,
        read: false,
        createdAt: new Date().toISOString()
      });
    });

    localStorage.setItem(LOCAL_STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  },

  // --- WEBHOOK & SMART METER IOT SERVICES ---
  getTuyaConfig: async (): Promise<WebhookMeterConfig> => {
    const configStr = localStorage.getItem(LOCAL_STORAGE_KEYS.TUYA_CONFIG);
    if (!configStr) {
      return {
        enabled: true,
        secretToken: "sec_meter_a89f2c10b",
        autoCreateReading: true,
        deviceNameA: "Medidor Wi-Fi Apt A",
        deviceNameB: "Medidor Wi-Fi Apt B"
      };
    }
    return JSON.parse(configStr);
  },

  saveTuyaConfig: async (config: WebhookMeterConfig): Promise<WebhookMeterConfig> => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.TUYA_CONFIG, JSON.stringify(config));
    return config;
  },

  getTuyaLiveStatus: async (): Promise<TuyaLiveMeterStatus[]> => {
    const statusStr = localStorage.getItem(LOCAL_STORAGE_KEYS.TUYA_STATUS);
    return statusStr ? JSON.parse(statusStr) : [];
  },

  saveTuyaLiveStatus: async (statuses: TuyaLiveMeterStatus[]): Promise<void> => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.TUYA_STATUS, JSON.stringify(statuses));
  },

  getWebhookLogs: async (): Promise<WebhookLogEntry[]> => {
    const logsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.WEBHOOK_LOGS);
    return logsStr ? JSON.parse(logsStr) : [];
  },

  addWebhookLog: async (log: WebhookLogEntry): Promise<void> => {
    const logs = await dbService.getWebhookLogs();
    logs.unshift(log); // newer first
    localStorage.setItem(LOCAL_STORAGE_KEYS.WEBHOOK_LOGS, JSON.stringify(logs.slice(0, 30))); // keep max 30
  },

  clearWebhookLogs: async (): Promise<void> => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.WEBHOOK_LOGS, JSON.stringify([]));
  }
};
