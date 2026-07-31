import React, { useState, useEffect, useRef } from "react";
import { dbService } from "../firebase";
import { UserProfile, BillLuz, BillAgua, ReadingLuz, PropertyDetails, NotificationItem } from "../types";
import { calculateLuzSplit, calculateAguaSplit, getDaysBetween } from "../utils/calculator";
import { extractDateFromFile, extractKwFromFile } from "../utils/readingHelpers";
import ReportPDFButton from "./ReportPDFButton";
import WaterReportPDFButton from "./WaterReportPDFButton";
import TuyaMeterPanel from "./TuyaMeterPanel";
import { 
  Zap, Droplet, User, LogOut, Calendar, Plus, Upload, Camera, 
  CheckCircle, Bell, Clock, RefreshCw, Eye, ShieldAlert, Sparkles, FileText,
  Trash2, Edit, Save, AlertCircle, Info, X, Check, AlertTriangle
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface DayItem {
  day: number;
  dateStr: string;
  isFuture: boolean;
}

function getDaysListForMonth(monthStr: string): DayItem[] {
  const [year, month] = monthStr.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  
  const days: DayItem[] = [];
  for (let d = totalDays; d >= 1; d--) {
    const dayStr = d.toString().padStart(2, "0");
    const dateStr = `${monthStr}-${dayStr}`;
    
    // Check if it is a future day in the current month/year
    const isFuture = 
      year > currentYear || 
      (year === currentYear && month > currentMonth) || 
      (year === currentYear && month === currentMonth && d > todayDay);
      
    days.push({
      day: d,
      dateStr,
      isFuture
    });
  }
  return days;
}

interface TenantDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

interface PendingReading {
  id: string;
  file: File;
  preview: string; // Base64
  value: string; // kW value
  date: string; // YYYY-MM-DD
  loading: boolean;
  error: string | null;
  success: boolean;
  isSimulated?: boolean;
}

export default function TenantDashboard({ user, onLogout }: TenantDashboardProps) {
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [billsLuz, setBillsLuz] = useState<BillLuz[]>([]);
  const [billsAgua, setBillsAgua] = useState<BillAgua[]>([]);
  const [readings, setReadings] = useState<ReadingLuz[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("2026-07");
  const [notifBellOpen, setNotifBellOpen] = useState(false);
  const [readingToDelete, setReadingToDelete] = useState<ReadingLuz | null>(null);
  const [readingToEdit, setReadingToEdit] = useState<ReadingLuz | null>(null);
  const [editReadingDate, setEditReadingDate] = useState<string>("");
  const [editReadingValue, setEditReadingValue] = useState<string>("");
  
  // Reading add state
  const [currentDashboardTab, setCurrentDashboardTab] = useState<"summary" | "calendar">("summary");
  const [isAddingReading, setIsAddingReading] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "multiple">("single");
  const [readingValue, setReadingValue] = useState("");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().split("T")[0]);
  const [readingImage, setReadingImage] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [isParsingSingle, setIsParsingSingle] = useState(false);
  const [pendingReadings, setPendingReadings] = useState<PendingReading[]>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const [deletingReadingId, setDeletingReadingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const multipleFileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (!user.landlordUid) return;
      
      const prop = await dbService.getProperty(user.landlordUid);
      setProperty(prop);

      const bl = await dbService.getBillsLuz(user.landlordUid);
      setBillsLuz(bl);

      const ba = await dbService.getBillsAgua(user.landlordUid);
      setBillsAgua(ba);

      const rd = await dbService.getReadingsLuz(user.landlordUid);
      setReadings(rd);

      const nt = await dbService.getNotifications(user.uid);
      setNotifications(nt);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.uid, user.landlordUid]);

  // Convert uploaded image to Base64 and scan with Gemini
  const handleSingleImageScan = async (base64Data: string, file?: File) => {
    setIsParsingSingle(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/parse-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64Data })
      });
      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "No se pudo extraer los datos de la imagen");
      }
      
      const extracted = resJson.data;
      if (extracted) {
        if (extracted.value !== undefined && extracted.value !== null) {
          setReadingValue(extracted.value.toString());
        } else if (file) {
          const initialKw = extractKwFromFile(file);
          if (initialKw) {
            setReadingValue(initialKw);
          }
        }
        if (extracted.date) {
          setReadingDate(extracted.date);
        } else if (file) {
          // Fallback to our intelligent local date extraction if Gemini returned null date
          setReadingDate(extractDateFromFile(file));
        }
        
        if (extracted.isSimulated) {
          if (extracted.isQuotaExceeded) {
            setSuccessMsg("Límite de cuota de la IA de Gemini superado. Se han usado estimaciones locales de fecha/kWh, por favor verifícalos manualmente.");
          } else {
            setSuccessMsg("La IA de Gemini no pudo leer la imagen. Se ha usado una extracción local. Por favor, verifica fecha y kW.");
          }
        } else {
          setSuccessMsg("¡Lectura extraída con éxito mediante IA!");
        }
        setTimeout(() => setSuccessMsg(null), 8000);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("No pudimos leer la imagen con IA, pero puedes introducir los datos manualmente.");
    } finally {
      setIsParsingSingle(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Instantly set the date and kW extracted from file name/metadata!
      const initialDate = extractDateFromFile(file);
      setReadingDate(initialDate);
      
      const initialKw = extractKwFromFile(file);
      if (initialKw) {
        setReadingValue(initialKw);
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setReadingImage(base64);
        handleSingleImageScan(base64, file);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetryPendingReading = async (id: string) => {
    // Find the item
    const pending = pendingReadings.find((p) => p.id === id);
    if (!pending) return;

    // Set loading state, clear any previous errors
    setPendingReadings((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, loading: true, error: null } : item
      )
    );

    try {
      const response = await fetch("/api/parse-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: pending.preview }),
      });
      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "Error de análisis con IA");
      }

      setPendingReadings((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                value: resJson.data.value ? resJson.data.value.toString() : item.value,
                date: resJson.data.date || item.date, // Keep client extracted date as primary fallback
                loading: false,
                success: true,
                isSimulated: !!resJson.data.isSimulated,
                error: resJson.data.isQuotaExceeded 
                  ? "Límite de cuota de la IA superado. Por favor, escribe los kW manualmente."
                  : (resJson.data.isSimulated ? "No se pudo extraer con IA. Verifica kW/fecha." : null),
              }
            : item
        )
      );
    } catch (err: any) {
      console.error("Error al reintentar lectura con IA:", err);
      setPendingReadings((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                loading: false,
                error: err.message || "No se pudo leer con IA.",
              }
            : item
        )
      );
    }
  };

  const MAX_BATCH_READINGS = 15;

  const handleMultipleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const rawFilesArray: File[] = Array.from(e.target.files);
      setErrorMsg(null);
      setBatchNotice(null);

      const totalSelected = rawFilesArray.length;
      let filesArray = rawFilesArray;

      // 1. Cap to MAX_BATCH_READINGS per upload batch
      if (totalSelected > MAX_BATCH_READINGS) {
        filesArray = rawFilesArray.slice(0, MAX_BATCH_READINGS);
        setBatchNotice(
          `Has seleccionado ${totalSelected} fotos. Para no saturar la IA y garantizar que todas se carguen correctamente, se han seleccionado únicamente las primeras ${MAX_BATCH_READINGS} lecturas. Podrás subir las ${totalSelected - MAX_BATCH_READINGS} restantes en un próximo lote.`
        );
      }

      // 2. Cap based on existing pendingReadings in queue
      const spaceLeft = MAX_BATCH_READINGS - pendingReadings.length;
      if (spaceLeft <= 0) {
        setBatchNotice(
          `Has alcanzado el límite máximo de ${MAX_BATCH_READINGS} lecturas por lote/día en la lista. Guarda o limpia la lista para añadir nuevas fotos.`
        );
        if (e.target) e.target.value = "";
        return;
      } else if (filesArray.length > spaceLeft) {
        filesArray = filesArray.slice(0, spaceLeft);
        setBatchNotice(
          `Límite de ${MAX_BATCH_READINGS} lecturas alcanzado. Se han añadido únicamente las primeras ${spaceLeft} fotos de tu selección.`
        );
      }

      if (e.target) e.target.value = "";

      const newPendings: PendingReading[] = await Promise.all(
        filesArray.map(async (file: File) => {
          const preview = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(file);
          });
          
          // Smart extraction of date right away
          const initialDate = extractDateFromFile(file);
          const initialKw = extractKwFromFile(file);
          
          return {
            id: "pending-" + Math.random().toString(36).substr(2, 9),
            file,
            preview,
            value: initialKw,
            date: initialDate,
            loading: true,
            error: null,
            success: false,
          };
        })
      );

      setPendingReadings((prev) => [...prev, ...newPendings]);

      // Process each sequentially to respect rate limits and high demand on Free Tier
      let localQuotaExceeded = false;
      for (const pending of newPendings) {
        if (localQuotaExceeded) {
          // Immediately set as completed with simulated state and filename extraction fallback
          setPendingReadings((prev) =>
            prev.map((item) =>
              item.id === pending.id
                ? {
                    ...item,
                    loading: false,
                    success: true,
                    isSimulated: true,
                    error: "Límite de cuota IA alcanzado. Verificado localmente con nombre de archivo.",
                  }
                : item
            )
          );
          continue;
        }

        try {
          const response = await fetch("/api/parse-reading", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: pending.preview })
          });
          const resJson = await response.json();
          if (!response.ok || !resJson.success) {
            throw new Error(resJson.error || "Error de análisis con IA");
          }

          const isQuota = !!resJson.data?.isQuotaExceeded || (!resJson.data?.value && resJson.data?.isSimulated);
          if (isQuota) {
            localQuotaExceeded = true;
            setErrorMsg("⚠️ Se ha alcanzado el límite de solicitudes de la IA. Las imágenes están cargadas pero debes ingresar o verificar los kW manualmente.");
          }
          
          setPendingReadings((prev) =>
            prev.map((item) =>
              item.id === pending.id
                ? {
                    ...item,
                    value: resJson.data.value ? resJson.data.value.toString() : item.value,
                    // Keep the highly accurate client-extracted date unless Gemini provided a clear one
                    date: resJson.data.date || item.date,
                    loading: false,
                    success: true,
                    isSimulated: !!resJson.data.isSimulated || isQuota,
                    error: isQuota 
                      ? "Límite de cuota de la IA superado. Por favor, escribe los kW manualmente."
                      : (resJson.data.isSimulated ? "No se pudo extraer con IA. Verifica kW/fecha." : null),
                  }
                : item
            )
          );
        } catch (err: any) {
          console.error("Error al procesar lectura en serie:", err);
          const isQuotaErr = err.message?.includes("cuota") || err.message?.includes("quota") || err.message?.includes("QUOTA") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("429");
          if (isQuotaErr) {
            localQuotaExceeded = true;
          }

          setPendingReadings((prev) =>
            prev.map((item) =>
              item.id === pending.id
                ? {
                    ...item,
                    loading: false,
                    // If rate limit/quota error, let the user know, but keep the item for manual editing
                    error: isQuotaErr
                      ? "Cuota de IA superada. Introduce el valor kW manualmente."
                      : err.message || "No se pudo leer con IA.",
                    isSimulated: true, // Mark as simulated so they can fill it
                  }
                : item
            )
          );
        }
        // Small stagger delay to keep requests healthy
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  };

  const handleRemovePending = (id: string) => {
    setPendingReadings((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdatePendingField = (id: string, field: "value" | "date", val: string) => {
    setPendingReadings((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: val } : p))
    );
  };

  const handleSaveAllMultipleReadings = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (user.role !== "inquilino_editar") {
      setErrorMsg("No tienes permisos para registrar lecturas (Solo Consulta).");
      return;
    }

    if (pendingReadings.length === 0) {
      setErrorMsg("No hay lecturas cargadas para guardar.");
      return;
    }

    const effectiveLandlordUid = user.landlordUid || property?.landlordUid || localStorage.getItem("current_landlord_uid");
    const effectiveApartment = (user.apartment && user.apartment !== "none") ? user.apartment : "A";

    if (!effectiveLandlordUid) {
      setErrorMsg("No se pudo identificar el código del propietario para vincular la lectura. Por favor contacta al propietario.");
      return;
    }

    const sanitizedReadings = pendingReadings.map((p) => {
      const cleanValStr = (p.value !== null && p.value !== undefined ? p.value.toString() : "").replace(",", ".").trim();
      return {
        ...p,
        cleanValueStr: cleanValStr,
        numValue: parseFloat(cleanValStr)
      };
    });

    const invalidItems = sanitizedReadings.filter(p => isNaN(p.numValue) || p.numValue < 0 || !p.date);
    if (invalidItems.length > 0) {
      setErrorMsg(`⚠️ Hay ${invalidItems.length} lectura(s) pendientes con valor o fecha vacíos/inválidos. Por favor escribe los kWh antes de guardar.`);
      return;
    }

    // 1. Check for duplicate dates WITHIN the batch itself
    const batchDates = sanitizedReadings.map(p => p.date);
    const duplicateBatchDates = batchDates.filter((date, index) => batchDates.indexOf(date) !== index);
    if (duplicateBatchDates.length > 0) {
      const uniqueDupes = Array.from(new Set(duplicateBatchDates));
      setErrorMsg(`⚠️ No se pueden guardar varias lecturas con la misma fecha en el mismo lote (${uniqueDupes.join(", ")}). Modifica o elimina las fotos duplicadas.`);
      return;
    }

    // 2. Check for duplicate dates against ALREADY SAVED DATABASE READINGS
    const existingDbDupes = sanitizedReadings.filter(rd => 
      readings.some(r => r.apartment === effectiveApartment && r.date === rd.date)
    );

    if (existingDbDupes.length > 0) {
      const dupeDatesList = existingDbDupes.map(d => `${d.date} (${d.cleanValueStr} kWh)`).join(", ");
      const confirmBatch = window.confirm(
        `⚠️ ATENCIÓN: Se han detectado ${existingDbDupes.length} lecturas que YA fueron registradas anteriormente para las siguientes fechas:\n\n${dupeDatesList}\n\n¿Deseas REEMPLAZAR los registros antiguos con los nuevos valores de este lote? En ningún caso se duplicarán los cargos.`
      );
      if (!confirmBatch) {
        return; // Cancel saving batch
      }
    }

    try {
      for (const rd of sanitizedReadings) {
        await dbService.addReadingLuz({
          landlordUid: effectiveLandlordUid,
          tenantUid: user.uid,
          apartment: effectiveApartment as "A" | "B",
          date: rd.date,
          value: rd.numValue,
          imageUrl: rd.preview
        });
      }

      setSuccessMsg(`¡Se han registrado/actualizado ${sanitizedReadings.length} lecturas correctamente!`);
      setPendingReadings([]);
      setIsAddingReading(false);
      loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al registrar las lecturas");
    }
  };

  const handleAddReadingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (user.role !== "inquilino_editar") {
      setErrorMsg("No tienes permisos para registrar lecturas (Solo Consulta).");
      return;
    }

    const cleanVal = readingValue.toString().replace(",", ".").trim();
    const parsedVal = parseFloat(cleanVal);
    if (!readingValue || isNaN(parsedVal) || parsedVal <= 0) {
      setErrorMsg("Por favor, introduce un valor numérico de kWh correcto y mayor que cero");
      return;
    }

    const effectiveLandlordUid = user.landlordUid || property?.landlordUid || localStorage.getItem("current_landlord_uid");
    const effectiveApartment = (user.apartment && user.apartment !== "none") ? user.apartment : "A";

    if (!effectiveLandlordUid) {
      setErrorMsg("No se pudo identificar el código del propietario para vincular la lectura.");
      return;
    }

    // Check if reading for readingDate already exists for this apartment
    const existingReading = readings.find(r => r.apartment === effectiveApartment && r.date === readingDate);
    if (existingReading) {
      const confirmOverwrite = window.confirm(
        `⚠️ ATENCIÓN: Ya existe una lectura registrada para la fecha ${readingDate} en tu sub-medidor (${existingReading.value} kWh).\n\n¿Deseas REEMPLAZAR la lectura anterior con este nuevo valor (${parsedVal} kWh)? Ningún cargo será duplicado.`
      );
      if (!confirmOverwrite) {
        return; // Cancel submit
      }
    }

    try {
      await dbService.addReadingLuz({
        landlordUid: effectiveLandlordUid,
        tenantUid: user.uid,
        apartment: effectiveApartment as "A" | "B",
        date: readingDate,
        value: parsedVal,
        imageUrl: readingImage || undefined
      });

      setSuccessMsg(existingReading ? "¡Lectura actualizada correctamente (reemplazando registro anterior)!" : "¡Lectura diaria de sub-medidor guardada correctamente!");
      setReadingValue("");
      setReadingImage(null);
      setIsAddingReading(false);
      loadData();
      
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al registrar la lectura");
    }
  };

  const handleMarkNotifRead = async (notifId: string) => {
    await dbService.markNotificationAsRead(notifId);
    if (user.landlordUid) {
      const nt = await dbService.getNotifications(user.uid);
      setNotifications(nt);
    }
  };

  // Find editing apartment
  const editingApartment: "A" | "B" = user.role === "inquilino_editar"
    ? (user.apartment === "B" ? "B" : "A")
    : (user.apartment === "A" ? "B" : "A");

  // Active bills
  const activeLuzStrict = billsLuz.find(b => b.startDate.startsWith(selectedMonth) || b.endDate.startsWith(selectedMonth));
  const isLuzFallback = !activeLuzStrict && billsLuz.length > 0;
  const activeLuz = activeLuzStrict || (billsLuz.length > 0 ? billsLuz[0] : undefined);

  const activeAguaStrict = billsAgua.find(b => {
    const startYm = b.startDate.substring(0, 7);
    const endYm = b.endDate.substring(0, 7);
    return selectedMonth >= startYm && selectedMonth <= endYm;
  });
  const isAguaFallback = !activeAguaStrict && billsAgua.length > 0;
  const activeAgua = activeAguaStrict || (billsAgua.length > 0 ? billsAgua[0] : undefined);

  // Split results
  const luzSplit = activeLuz ? calculateLuzSplit(activeLuz, readings, editingApartment) : null;
  const aguaSplit = activeAgua ? calculateAguaSplit(activeAgua) : null;

  // Specific user costs
  const userLuzCost = luzSplit ? (user.apartment === "A" ? luzSplit.totalA : luzSplit.totalB) : 0;
  const userLuzKwh = luzSplit ? (user.apartment === "A" ? luzSplit.kwhA : luzSplit.kwhB) : 0;
  const userLuzPct = luzSplit ? (user.apartment === "A" ? luzSplit.pctA : luzSplit.pctB) : 0.5;

  const userAguaCost = aguaSplit ? (user.apartment === "A" ? aguaSplit.monthlyCostA : aguaSplit.monthlyCostB) : 0;
  const userAguaDaily = aguaSplit ? (user.apartment === "A" ? aguaSplit.dailyCostA : aguaSplit.dailyCostB) : 0;

  // Check if we should warn tenant to upload daily readings (e.g. if no reading exists for today)
  const todayStr = new Date().toISOString().split("T")[0];
  const hasReadingToday = readings.some(r => r.apartment === user.apartment && r.date === todayStr);
  const showReadingReminder = !hasReadingToday;

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  // Filter readings specific to this tenant's apartment
  const tenantReadings = readings.filter(r => r.apartment === user.apartment);

  // Calculate days for the selected month to check missing uploads
  const daysList = getDaysListForMonth(selectedMonth);
  const missingDays = daysList.filter(d => !d.isFuture && !tenantReadings.some(r => r.date === d.dateStr));

  const chartData = [...tenantReadings]
    .slice(0, 15)
    .reverse()
    .map(r => ({
      fecha: r.date.substring(5), // MM-DD
      "kWh Contador": r.value
    }));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center font-sans">
        <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
        <span className="mt-2 text-xs text-slate-500 font-mono uppercase tracking-wider font-bold">Cargando panel de inquilino...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 bg-blue-600 rounded flex items-center justify-center shadow-md">
              <User className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold font-display text-slate-900 uppercase tracking-tight">Inquilino Apt {user.apartment}</h1>
                <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                  user.role === "inquilino_editar" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                }`}>
                  {user.role === "inquilino_editar" ? "Escritura" : "Solo Consulta"}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative">
            
            {/* Notification Bell */}
            <button
              onClick={() => setNotifBellOpen(!notifBellOpen)}
              className="p-2 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded border border-slate-200 transition relative cursor-pointer"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 bg-rose-500 rounded-full ring-2 ring-white animate-pulse"></span>
              )}
            </button>

            {notifBellOpen && (
              <div className="absolute right-0 top-11 bg-white rounded border border-slate-200 shadow-xl p-3 w-72 z-50 space-y-2.5">
                <div className="flex justify-between items-center border-b border-slate-150 pb-2">
                  <span className="font-bold text-xs text-slate-800 uppercase tracking-wider font-display">Notificaciones ({unreadNotifCount})</span>
                  <button onClick={() => setNotifBellOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase">Cerrar</button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {notifications.map(n => (
                    <div key={n.id} className={`p-2 rounded text-xs space-y-1 border ${n.read ? "bg-slate-50 text-slate-500 border-slate-150" : "bg-blue-50/50 text-blue-900 border-blue-100"}`}>
                      <div className="flex justify-between items-start">
                        <span className="font-bold">{n.title}</span>
                        {!n.read && (
                          <button onClick={() => handleMarkNotifRead(n.id)} className="text-[9px] text-blue-600 hover:underline font-bold uppercase">Leído</button>
                        )}
                      </div>
                      <p className="leading-relaxed text-[11px] text-slate-600">{n.body}</p>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <p className="text-center text-slate-400 text-xs py-4">No tienes notificaciones</p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={onLogout}
              className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded border border-slate-200 transition cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 space-y-4">

        {/* Success Messages banner */}
        {successMsg && (
          <div className="p-3 bg-emerald-50 rounded border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Automatic Reminders when daily readings are missing */}
        {showReadingReminder && user.role === "inquilino_editar" && (
          <div className="p-3 bg-amber-50 rounded border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 shadow-xs">
            <Clock className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold uppercase tracking-wider text-[10px] text-amber-800">Recordatorio de Lectura Diaria: </span>
              <p className="text-xs text-amber-800 leading-normal">
                Aún no has subido tu lectura de sub-medidor para hoy ({todayStr}). Recuerda registrarla para calcular con precisión tu reparto de luz.
              </p>
              <button
                onClick={() => setIsAddingReading(true)}
                className="mt-1 text-[10px] uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded font-bold transition cursor-pointer"
              >
                Subir Lectura de Hoy
              </button>
            </div>
          </div>
        )}

        {/* Top filter for month splits and PDF generator */}
        <div className="bg-white rounded p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider font-display">Consulta de Reparto y Descargas</h2>
            <p className="text-[11px] text-slate-400">Verifica la factura activa y descarga informes PDF mensuales para tu control</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-slate-200 rounded text-xs p-1.5 bg-slate-50 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 font-mono"
            />
            {property && (
              <div className="flex items-center gap-1.5">
                <ReportPDFButton
                  property={property}
                  billsLuz={billsLuz}
                  billsAgua={billsAgua}
                  readings={readings}
                  selectedMonth={selectedMonth}
                  editingApartment={editingApartment}
                />
                {activeAgua && (
                  <WaterReportPDFButton
                    property={property}
                    billAgua={activeAgua}
                    label="Reporte PDF Agua"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-slate-200 bg-white rounded p-1 shadow-xs gap-1">
          <button
            onClick={() => setCurrentDashboardTab("summary")}
            className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center justify-center gap-2 ${
              currentDashboardTab === "summary"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Zap className="h-4 w-4" /> Resumen de Consumos y Reparto
          </button>
          <button
            onClick={() => setCurrentDashboardTab("calendar")}
            className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center justify-center gap-2 relative ${
              currentDashboardTab === "calendar"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Calendar className="h-4 w-4" /> Calendario de Fotos y Lecturas
            {missingDays.length > 0 && (
              <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse absolute top-1 right-2"></span>
            )}
          </button>
        </div>

        {/* CALENDAR VIEW TAB */}
        {currentDashboardTab === "calendar" && (
          <div className="space-y-4 font-sans">
            {/* Missing readings notification banner */}
            {missingDays.length > 0 ? (
              <div className="p-3.5 bg-rose-50 text-rose-900 rounded border border-rose-200 text-xs flex items-start gap-2.5 shadow-sm">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-rose-800 font-display">Atención: Lecturas Faltantes en {selectedMonth}</span>
                  <p className="text-xs text-rose-800 leading-normal font-medium">
                    Te falta registrar la lectura de tu sub-medidor para <span className="font-bold text-rose-950">{missingDays.length} días</span> de este mes: {
                      [...missingDays].reverse().slice(0, 8).map(d => d.day).join(", ")
                    }{missingDays.length > 8 ? "..." : ""}.
                    {user.role === "inquilino_editar" 
                      ? " Por favor, sube las imágenes correspondientes para poder calcular correctamente tu reparto de luz."
                      : " El inquilino con permisos de escritura debe subir estas lecturas."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-50 text-emerald-900 rounded border border-emerald-200 text-xs flex items-center gap-2 shadow-sm">
                <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-800 font-display">¡Felicidades! Tienes todas las lecturas al día para el mes seleccionado ({selectedMonth})</span>
              </div>
            )}

            {/* List of days and images ordered */}
            <div className="bg-white rounded p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-150 pb-3 gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider font-display">Estado diario de lecturas e imágenes</h3>
                  <p className="text-[11px] text-slate-400">Ordenado por días del mes seleccionado. Pulsa "Subir" para rellenar un día faltante o visualiza la foto.</p>
                </div>
                <div className="text-[10px] text-slate-500 font-mono bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">
                  Total Registrado: <span className="font-bold text-slate-800">{tenantReadings.filter(r => r.date.startsWith(selectedMonth)).length}</span> / {daysList.filter(d => !d.isFuture).length} días
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {daysList.map((dayItem) => {
                  const reading = tenantReadings.find((r) => r.date === dayItem.dateStr);
                  
                  // Simple Date parsing for nicer display
                  let formattedDayName = "";
                  try {
                    const parts = dayItem.dateStr.split("-");
                    const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    formattedDayName = dateObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
                  } catch (e) {
                    formattedDayName = dayItem.dateStr;
                  }

                  return (
                    <div 
                      key={dayItem.dateStr}
                      className={`p-3 rounded border transition flex flex-col justify-between gap-3 ${
                        reading 
                          ? "border-slate-200 bg-slate-50 hover:bg-slate-100" 
                          : dayItem.isFuture
                            ? "border-slate-100 bg-slate-50/40 opacity-60"
                            : "border-rose-200 bg-rose-50/10 hover:bg-rose-50/20"
                      }`}
                    >
                      {/* Day Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] text-slate-400 font-mono tracking-wider font-bold">DÍA {dayItem.day}</span>
                          <h4 className="text-xs font-bold text-slate-800 capitalize mt-0.5">{formattedDayName}</h4>
                        </div>
                        {reading ? (
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-bold uppercase tracking-wider">
                            Registrado
                          </span>
                        ) : dayItem.isFuture ? (
                          <span className="text-[9px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full border border-slate-200 font-bold uppercase tracking-wider">
                            Futuro
                          </span>
                        ) : (
                          <span className="text-[9px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200 font-bold uppercase tracking-wider animate-pulse">
                            Faltante
                          </span>
                        )}
                      </div>

                      {/* Reading details & image preview if exists */}
                      {reading ? (
                        <div className="flex gap-2.5 items-center bg-white p-2 rounded border border-slate-150">
                          {reading.imageUrl ? (
                            <div 
                              onClick={() => setZoomImageUrl(reading.imageUrl!)}
                              className="relative group cursor-pointer w-14 h-14 rounded border border-slate-200 overflow-hidden shrink-0 shadow-xs bg-slate-50"
                              title="Haz clic para ampliar la imagen"
                            >
                              <img src={reading.imageUrl} alt="Contador proof" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center">
                                <Eye className="h-3.5 w-3.5 text-white" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded flex items-center justify-center border border-slate-150 shrink-0 text-[10px] font-mono">
                              Sin Foto
                            </div>
                          )}
                          <div className="flex-1 space-y-0.5">
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Lectura Registrada</span>
                            <p className="text-sm font-bold text-slate-800 font-mono leading-none">{reading.value.toFixed(1)} kWh</p>
                            <p className="text-[8px] text-slate-400 font-mono leading-none mt-0.5">Guardado: {new Date(reading.createdAt || "").toLocaleDateString("es-ES", {hour: "numeric", minute:"numeric"})}</p>
                          </div>
                        </div>
                      ) : dayItem.isFuture ? (
                        <p className="text-[10px] text-slate-400 italic">No es necesario subir la lectura de este día todavía.</p>
                      ) : (
                        user.role === "inquilino_editar" ? (
                          <div className="space-y-1.5 p-2.5 bg-rose-50/50 rounded border border-dashed border-rose-200 text-center">
                            <p className="text-[10px] text-rose-800 leading-normal font-semibold">⚠️ Falta subir lectura diaria</p>
                            <button
                              onClick={() => {
                                setReadingDate(dayItem.dateStr);
                                setActiveTab("single");
                                setIsAddingReading(true);
                              }}
                              className="w-full py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-[4px] text-[10px] font-bold uppercase tracking-wider transition cursor-pointer shadow-xs font-sans"
                            >
                              Subir Lectura
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5 p-2.5 bg-slate-50 rounded border border-dashed border-slate-200 text-center">
                            <p className="text-[10px] text-slate-500 font-semibold">Sin lectura registrada</p>
                          </div>
                        )
                      )}

                      {/* Reading actions */}
                      {reading && (
                        <div className="pt-2 border-t border-slate-150 mt-1">
                          {deletingReadingId === reading.id ? (
                            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-center space-y-1.5 animate-fadeIn">
                              <p className="text-[10px] font-bold text-rose-900 leading-tight">
                                ¿Eliminar lectura del día {dayItem.day} ({reading.value.toFixed(1)} kWh)?
                              </p>
                              <div className="flex justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await dbService.deleteReadingLuz(reading.id);
                                      setSuccessMsg(`Lectura del día ${dayItem.day} eliminada correctamente.`);
                                      setDeletingReadingId(null);
                                      loadData();
                                      setTimeout(() => setSuccessMsg(null), 3000);
                                    } catch (e: any) {
                                      setErrorMsg("No se pudo eliminar la lectura.");
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[9px] font-bold uppercase transition cursor-pointer shadow-xs"
                                >
                                  Sí, eliminar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingReadingId(null)}
                                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[9px] font-bold uppercase transition cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setReadingDate(dayItem.dateStr);
                                  setReadingValue(reading.value.toString());
                                  setActiveTab("single");
                                  setIsAddingReading(true);
                                }}
                                className="text-[9px] text-blue-600 hover:text-blue-800 font-bold uppercase hover:underline transition cursor-pointer flex items-center gap-1 font-mono"
                                title="Volver a subir o corregir la lectura de este día"
                              >
                                <RefreshCw className="h-3 w-3" /> Reemplazar
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingReadingId(reading.id)}
                                className="text-[9px] text-rose-600 hover:text-rose-800 font-bold uppercase hover:underline transition cursor-pointer flex items-center gap-1 font-mono"
                                title="Eliminar la lectura de este día"
                              >
                                <Trash2 className="h-3 w-3" /> Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SUMMARY MODE ONLY VIEWS */}
        {currentDashboardTab === "summary" && (
          <div className="space-y-4">
            {/* Live Tuya Smart Meter Status */}
            <TuyaMeterPanel user={user} onSyncComplete={loadData} isTenantView={true} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Electricity Luz Split Details */}
              <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded flex items-center justify-center border border-blue-100">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Electricidad (Luz) del Mes</h3>
                      <p className="text-[10px] text-slate-400">Repartido según consumo de tus sub-medidores</p>
                    </div>
                  </div>
                  {activeLuz ? (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isLuzFallback 
                        ? "bg-amber-50 text-amber-800 border-amber-200" 
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}>
                      {isLuzFallback ? "Última Factura" : "Activa"}
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-400 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-slate-200">Sin factura</span>
                  )}
                </div>

                {isLuzFallback && (
                  <div className="p-2.5 bg-amber-50/60 rounded border border-amber-200 text-amber-800 text-[10px] leading-relaxed font-sans">
                    ⚠️ <span className="font-bold">Nota:</span> Mostrando la factura de luz más reciente disponible ({luzSplit?.startDate} a {luzSplit?.endDate}), ya que no se ha registrado ninguna para el mes de {selectedMonth}.
                  </div>
                )}

                {luzSplit ? (
                  <div className="space-y-4">
                    {luzSplit.isPendingReadings ? (
                      <div className="p-3 bg-rose-50 rounded border border-rose-200 text-rose-800 text-[11px] leading-relaxed space-y-2">
                        <div className="flex items-center gap-1.5 font-bold text-rose-900 uppercase tracking-wide text-[10px]">
                          <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                          <span>Lecturas Diarias Faltantes ({luzSplit.missingDates.length} días)</span>
                        </div>
                        <p className="font-semibold text-rose-800 leading-normal">
                          El cálculo del reparto de luz está pausado para este periodo hasta que se suban todas las lecturas diarias.
                        </p>
                        {user.role === "inquilino_editar" ? (
                          <>
                            <p className="text-rose-700 font-medium">
                              Como tienes permisos de escritura, debes registrar las lecturas pendientes para habilitar el reparto.
                            </p>
                            <button
                              onClick={() => {
                                setReadingDate(luzSplit.missingDates[0]);
                                setActiveTab("single");
                                setIsAddingReading(true);
                              }}
                              className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 font-sans"
                            >
                              <Plus className="h-3.5 w-3.5" /> Subir lectura faltante ({luzSplit.missingDates[0]})
                            </button>
                          </>
                        ) : (
                          <p className="text-rose-700 font-medium">
                            El inquilino del apartamento {luzSplit.editingApartment} debe subir las lecturas diarias que faltan.
                          </p>
                        )}
                        <div className="mt-1 font-mono text-[9px] bg-white p-1.5 rounded border border-rose-100">
                          <span className="font-bold text-rose-900 block mb-0.5 font-sans">Días pendientes:</span>
                          <div className="max-h-24 overflow-y-auto whitespace-pre-line text-rose-950 font-medium leading-relaxed">
                            {luzSplit.missingDates.join(", ")}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2 bg-slate-50 rounded border border-slate-150 text-center flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Consumido (Tu)</span>
                            <p className="text-sm font-bold text-slate-800 font-mono mt-0.5">{userLuzKwh.toFixed(1)} kWh</p>
                          </div>
                          <div className="p-2 bg-slate-50 rounded border border-slate-150 text-center flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Factura</span>
                            <p className="text-sm font-bold text-slate-850 font-mono mt-0.5">{luzSplit.totalAmount.toFixed(1)}€</p>
                          </div>
                          <div className="p-2 bg-blue-600 rounded text-center text-white shadow-sm flex flex-col justify-center">
                            <span className="text-[10px] opacity-90 font-bold uppercase tracking-widest">Tu Cuota</span>
                            <p className="text-sm font-bold font-mono mt-0.5">{userLuzCost.toFixed(2)}€</p>
                          </div>
                        </div>

                        <div className="text-xs space-y-2 bg-slate-50 p-3 rounded border border-slate-200 font-medium">
                          <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1 font-display">Desglose del Cálculo de Luz:</p>
                          <div className="flex justify-between text-slate-600 font-mono">
                            <span>Tus kWh consumidos:</span>
                            <span className="font-bold text-slate-800">{userLuzKwh.toFixed(1)} kWh</span>
                          </div>
                          <div className="flex justify-between text-slate-600 font-mono">
                            <span>Total kWh Apartamentos (A + B):</span>
                            <span className="font-bold text-slate-800">{(luzSplit.kwhA + luzSplit.kwhB).toFixed(1)} kWh</span>
                          </div>
                          <div className="flex justify-between text-slate-600 font-mono">
                            <span>Valor calculado de cada kW:</span>
                            <span className="font-bold text-slate-800">{(luzSplit.totalAmount / (luzSplit.kwhA + luzSplit.kwhB || 1)).toFixed(4)}€/kWh</span>
                          </div>
                          <div className="flex justify-between text-slate-600 font-mono border-t border-slate-200 pt-1.5 mt-1.5">
                            <span>Tu cuota (kWh × Valor kW):</span>
                            <span className="font-bold text-blue-600">{userLuzCost.toFixed(2)}€</span>
                          </div>
                        </div>
                      </>
                    )}

                    {user.role === "inquilino_editar" && (
                      <button
                        onClick={() => setIsAddingReading(true)}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer font-sans"
                      >
                        <Plus className="h-4 w-4" /> Registrar o Escanear Lecturas (IA)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 rounded">
                    El propietario no ha subido la factura de luz para este periodo.
                  </div>
                )}
              </div>

              {/* Water quarterly details and requested daily/monthly average metric */}
              <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center border border-emerald-100">
                      <Droplet className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Agua del Periodo (Trimestral)</h3>
                      <p className="text-[10px] text-slate-400">Dividido equitativamente 50/50</p>
                    </div>
                  </div>
                  {activeAgua ? (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isAguaFallback 
                        ? "bg-amber-50 text-amber-800 border-amber-200" 
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}>
                      {isAguaFallback ? "Última Factura" : "Activa"}
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-400 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-slate-200">Sin factura</span>
                  )}
                </div>

                {isAguaFallback && (
                  <div className="p-2.5 bg-amber-50/60 rounded border border-amber-200 text-amber-800 text-[10px] leading-relaxed font-sans">
                    ⚠️ <span className="font-bold">Nota:</span> Mostrando la factura de agua más reciente disponible, ya que no hay ninguna registrada que cubra el mes de {selectedMonth}.
                  </div>
                )}

                {aguaSplit ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 bg-slate-50 rounded border border-slate-150 text-center flex flex-col justify-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Coste Diario</span>
                        <p className="text-xs font-bold text-slate-850 font-mono mt-0.5">{userAguaDaily.toFixed(2)}€/día</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-150 text-center flex flex-col justify-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Coste Mensual</span>
                        <p className="text-xs font-bold text-slate-850 font-mono mt-0.5">{userAguaCost.toFixed(2)}€/mes</p>
                      </div>
                      <div className="p-2 bg-emerald-600 rounded text-center text-white shadow-sm flex flex-col justify-center">
                        <span className="text-[10px] opacity-90 font-bold uppercase tracking-widest">Cuota Total</span>
                        <p className="text-xs font-bold font-mono mt-0.5">{(aguaSplit.totalAmount / 2).toFixed(2)}€</p>
                      </div>
                    </div>

                    <div className="text-xs bg-slate-50 p-3 rounded border border-slate-200 text-slate-500 space-y-1.5 leading-relaxed font-sans">
                      <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1 font-display">Métricas de consumo de agua:</p>
                      <p>Factura de Agua correspondiente al periodo del <span className="font-bold text-slate-700">{aguaSplit.startDate}</span> al <span className="font-bold text-slate-700">{aguaSplit.endDate}</span> ({aguaSplit.totalDays} días).</p>
                      <p>Al ser un piso dividido, se divide el coste total de {aguaSplit.totalAmount.toFixed(2)}€ entre dos apartamentos, resultando en un coste total por apartamento de {(aguaSplit.totalAmount / 2).toFixed(2)}€ para los 3 meses.</p>
                    </div>

                    {property && activeAgua && (
                      <div className="pt-1">
                        <WaterReportPDFButton
                          property={property}
                          billAgua={activeAgua}
                          label="Descargar Reporte PDF de Agua con Factura"
                          className="w-full justify-center"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 rounded">
                    El propietario no ha subido la factura de agua trimestral para este periodo.
                  </div>
                )}
              </div>

            </div>

            {/* Historial de Facturas y Repartos */}
            <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">Historial de Facturas y Repartos</h3>
                  <p className="text-[10px] text-slate-400">Consulta todas las facturas de Luz y Agua subidas por el propietario</p>
                </div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono">Historial</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-2 px-1">Servicio</th>
                      <th className="py-2 px-1">Periodo</th>
                      <th className="py-2 px-1 text-right">Importe Total</th>
                      <th className="py-2 px-1 text-center">Consumo Total</th>
                      <th className="py-2 px-1 text-right text-blue-700 font-sans">Tu Cuota a Pagar</th>
                      <th className="py-2 px-1 text-center font-bold font-sans">Estado / Reparto</th>
                      <th className="py-2 px-1 text-center font-bold font-sans">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
                    {/* Electricity Bills */}
                    {billsLuz.map((b) => {
                      const split = calculateLuzSplit(b, readings, editingApartment);
                      const myShare = user.apartment === "A" ? split.totalA : split.totalB;
                      const myKwh = user.apartment === "A" ? split.kwhA : split.kwhB;
                      const myPct = (user.apartment === "A" ? split.pctA : split.pctB) * 100;
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-2.5 px-1 font-bold text-slate-900 font-sans flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span>Luz</span>
                          </td>
                          <td className="py-2.5 px-1 text-slate-500">{b.startDate} al {b.endDate}</td>
                          <td className="py-2.5 px-1 text-right font-bold text-slate-800">{b.totalAmount.toFixed(2)}€</td>
                          <td className="py-2.5 px-1 text-center text-slate-450">{b.totalKwh} kWh</td>
                          <td className="py-2.5 px-1 text-right text-blue-600 font-bold">
                            {split.isPendingReadings ? (
                              <span className="text-rose-600 text-[10px] font-sans font-semibold flex items-center justify-end gap-1">
                                <Clock className="h-3 w-3 shrink-0" /> Pendiente
                              </span>
                            ) : (
                              `${myShare.toFixed(2)}€`
                            )}
                          </td>
                          <td className="py-2.5 px-1 text-center font-sans text-[10px] text-slate-500">
                            {split.isPendingReadings ? (
                              <span className="bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-200">
                                Incompleto
                              </span>
                            ) : (
                              `${myKwh.toFixed(1)} kWh (${myPct.toFixed(0)}%)`
                            )}
                          </td>
                          <td className="py-2.5 px-1 text-center font-sans">
                            <span className="text-[10px] text-slate-300">-</span>
                          </td>
                        </tr>
                      );
                    })}
                    
                    {/* Water Bills */}
                    {billsAgua.map((b) => {
                      const split = calculateAguaSplit(b);
                      const myShare = user.apartment === "A" ? split.totalA : split.totalB;
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-2.5 px-1 font-bold text-slate-900 font-sans flex items-center gap-1.5">
                            <Droplet className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span>Agua</span>
                          </td>
                          <td className="py-2.5 px-1 text-slate-500">{b.startDate} al {b.endDate}</td>
                          <td className="py-2.5 px-1 text-right font-bold text-slate-800">{b.totalAmount.toFixed(2)}€</td>
                          <td className="py-2.5 px-1 text-center text-slate-450">{b.totalVolume || 0} m³</td>
                          <td className="py-2.5 px-1 text-right text-blue-600 font-bold">{myShare.toFixed(2)}€</td>
                          <td className="py-2.5 px-1 text-center font-sans text-[10px] text-slate-500">
                            Reparto Fijo (50%)
                          </td>
                          <td className="py-2.5 px-1 text-center font-sans">
                            {property && (
                              <WaterReportPDFButton
                                property={property}
                                billAgua={b}
                                variant="icon"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {billsLuz.length === 0 && billsAgua.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-xs text-slate-400 font-sans">
                          El propietario aún no ha registrado ninguna factura.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Read add form popup modal or toggle */}
        {isAddingReading && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
            <div className="bg-white rounded w-full max-w-lg overflow-hidden shadow-2xl border border-slate-300 flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 bg-blue-100 text-blue-600 rounded flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">
                      Registrar Lecturas del Sub-medidor
                    </h3>
                    <p className="text-[10px] text-slate-400">Introduce o escanea tus lecturas de luz</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsAddingReading(false);
                    setPendingReadings([]);
                    setReadingImage(null);
                    setReadingValue("");
                  }} 
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabs selector */}
              <div className="flex border-b border-slate-200 bg-slate-50/50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("single")}
                  className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer ${
                    activeTab === "single"
                      ? "bg-white text-blue-600 shadow-xs border border-slate-200 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Lectura Única
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("multiple")}
                  className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === "multiple"
                      ? "bg-white text-blue-600 shadow-xs border border-slate-200 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  Escanear Múltiples (IA)
                </button>
              </div>

              {/* Error and Success notifications inside modal */}
              <div className="px-4 pt-3 empty:hidden">
                {errorMsg && (
                  <div className="p-2.5 bg-rose-50 text-rose-800 rounded border border-rose-150 text-xs font-semibold flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-150 text-xs font-semibold flex items-start gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}
              </div>

              {/* Modal Body */}
              <div className="p-4 overflow-y-auto flex-1 max-h-[60vh] space-y-4">
                {activeTab === "single" ? (
                  <form onSubmit={handleAddReadingSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha de Lectura</label>
                        <input
                          type="date"
                          value={readingDate}
                          onChange={(e) => setReadingDate(e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-200 p-2 text-xs bg-slate-50 text-slate-800 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor kWh Sub-medidor</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ej: 1465.2"
                          value={readingValue}
                          onChange={(e) => setReadingValue(e.target.value)}
                          className="mt-1 block w-full rounded border border-slate-200 p-2 text-xs bg-slate-50 text-slate-800 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Single Photo Upload with Proof preview */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Imagen Prueba del Contador (Se autocompletará con IA si la subes)
                      </label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`border border-dashed rounded p-4 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[140px] ${
                          isParsingSingle ? "border-blue-500 bg-blue-50/20" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageChange}
                          accept="image/*"
                          className="hidden"
                        />
                        {isParsingSingle ? (
                          <div className="space-y-2 flex flex-col items-center">
                            <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider font-mono">IA analizando foto... leyendo kWh y fecha</span>
                          </div>
                        ) : readingImage ? (
                          <div className="relative w-full max-w-xs mx-auto">
                            <img src={readingImage} alt="Meter preview" className="max-h-28 mx-auto rounded border border-slate-250 object-cover" />
                            {/* Annotation Overlay */}
                            {readingValue && (
                              <div className="absolute bottom-1 right-2 left-2 bg-slate-950/80 backdrop-blur-[2px] text-white p-1 rounded-sm text-center leading-none">
                                <p className="text-[9px] font-bold text-emerald-400">{readingValue} kW</p>
                                <p className="text-[7px] text-slate-300 font-mono mt-0.5">{readingDate}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <Camera className="h-6 w-6 text-slate-400 mb-1" />
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider text-[10px]">Arrastra o selecciona foto</span>
                            <span className="text-[9px] text-slate-400 mt-0.5">Gemini rellenará la fecha y los kW automáticamente</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isParsingSingle}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs uppercase tracking-wider transition cursor-pointer shadow-md disabled:bg-blue-400 disabled:cursor-not-allowed font-sans font-bold"
                    >
                      Guardar Lectura de Hoy
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3">
                    {/* Quota Limit Info Badge */}
                    <div className="bg-amber-50/80 border border-amber-200/90 rounded-lg p-2.5 text-left flex items-start gap-2.5 text-xs text-amber-900 shadow-xs">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-[11px] uppercase tracking-wide text-amber-950 flex items-center gap-1.5">
                          <span>Límite Diario de IA: Máximo 15 lecturas por lote</span>
                          <span className="bg-amber-200 text-amber-900 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">15 máx</span>
                        </p>
                        <p className="text-[10px] text-amber-800 leading-snug">
                          Para garantizar que todas las fotos se analicen sin errores y sin saturar los servicios de IA, solo se procesan hasta <strong>15 lecturas a la vez</strong>. Puedes guardar un lote y subir las restantes a continuación.
                        </p>
                      </div>
                    </div>

                    {/* Batch Notice Message */}
                    {batchNotice && (
                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 flex items-start gap-2 shadow-xs">
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-bold">Aviso de Límite de Lote: </span>
                          {batchNotice}
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setBatchNotice(null)} 
                          className="text-blue-500 hover:text-blue-800 text-sm font-bold leading-none px-1"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Batch Photo Upload zone */}
                    <div 
                      onClick={() => multipleFileInputRef.current?.click()}
                      className="border border-dashed border-slate-200 rounded p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-slate-50 transition flex flex-col items-center justify-center min-h-[110px]"
                    >
                      <input
                        type="file"
                        ref={multipleFileInputRef}
                        onChange={handleMultipleFilesChange}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      <Upload className="h-6 w-6 text-blue-500 mb-1.5" />
                      <span className="text-xs text-slate-700 font-bold uppercase tracking-wider text-[11px]">Seleccionar o Arrastrar Fotos (Hasta 15)</span>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-sm">
                        Sube las fotos de tu medidor. La IA extraerá la fecha y kWh automáticamente de cada imagen.
                      </p>
                    </div>

                    {/* Pending readings grid / list */}
                    {pendingReadings.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-150 pb-1.5">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lecturas Detectadas por IA ({pendingReadings.length})</span>
                          <button
                            type="button"
                            onClick={() => setPendingReadings([])}
                            className="text-[9px] text-rose-600 hover:underline font-bold uppercase cursor-pointer"
                          >
                            Limpiar Todo
                          </button>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {pendingReadings.map((item) => (
                            <div 
                              key={item.id} 
                              className={`p-2.5 rounded border flex gap-3 items-center transition ${
                                item.error 
                                  ? "border-rose-300 bg-rose-50/30 shadow-xs" 
                                  : "border-slate-200 bg-slate-50"
                              }`}
                            >
                              {/* Image Preview with overlay annotation */}
                              <div className="relative w-16 h-16 rounded border border-slate-300 overflow-hidden shrink-0 shadow-xs bg-white">
                                <img src={item.preview} alt="Meter thumbnail" className="w-full h-full object-cover" />
                                {item.loading ? (
                                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                                  </div>
                                ) : (
                                  item.value && (
                                    <div className="absolute bottom-0.5 right-0.5 left-0.5 bg-slate-950/80 backdrop-blur-[1px] text-[7px] font-bold text-emerald-400 text-center rounded-xs leading-none py-0.5">
                                      {item.value} kW
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Editable Fields for verification */}
                              <div className="flex-1 flex flex-col gap-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Luz (kW / kWh)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      disabled={item.loading}
                                      value={item.value}
                                      onChange={(e) => handleUpdatePendingField(item.id, "value", e.target.value)}
                                      placeholder={item.loading ? "Analizando..." : "kWh detectado"}
                                      className="mt-0.5 block w-full rounded border border-slate-250 p-1 text-xs bg-white text-slate-800 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Fecha Asignada</label>
                                    <input
                                      type="date"
                                      disabled={item.loading}
                                      value={item.date}
                                      onChange={(e) => handleUpdatePendingField(item.id, "date", e.target.value)}
                                      className="mt-0.5 block w-full rounded border border-slate-250 p-1 text-[11px] bg-white text-slate-800 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                                    />
                                  </div>
                                </div>
                                {item.error && (
                                  <div className="text-[9px] text-rose-700 font-semibold flex items-center gap-1 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-150">
                                    <AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />
                                    <span>{item.error}</span>
                                  </div>
                                )}
                              </div>

                              {/* Actions container */}
                              <div className="flex flex-col gap-1 shrink-0">
                                {/* Retry button if error */}
                                {item.error && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryPendingReading(item.id)}
                                    className="p-1.5 text-blue-600 hover:text-blue-800 rounded-md hover:bg-white border border-slate-200 transition cursor-pointer flex items-center justify-center shadow-xs"
                                    title="Reintentar escaneo de IA"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                
                                {/* Delete button */}
                                <button
                                  type="button"
                                  onClick={() => handleRemovePending(item.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-white border border-transparent hover:border-slate-200 transition cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveAllMultipleReadings}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs uppercase tracking-wider transition cursor-pointer shadow-md flex items-center justify-center gap-1.5 font-sans font-bold"
                        >
                          <Check className="h-4 w-4" /> Guardar Todas las Lecturas con IA
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingReading(false);
                    setPendingReadings([]);
                    setReadingImage(null);
                    setReadingValue("");
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Readings Chart and table */}
        {currentDashboardTab === "summary" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded p-4 border border-slate-200 shadow-sm lg:col-span-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 font-display">Historial de Lecturas (kWh) de tu Sub-medidor</h3>
              {chartData.length > 0 ? (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorReading" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="fecha" stroke="#94a3b8" fontSize={9} fontStyle="font-mono" />
                      <YAxis stroke="#94a3b8" fontSize={9} fontStyle="font-mono" domain={['dataMin - 100', 'dataMax + 100']} />
                      <Tooltip contentStyle={{ borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                      <Area type="monotone" dataKey="kWh Contador" stroke="#2563eb" strokeWidth={1.5} fillOpacity={1} fill="url(#colorReading)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-200 rounded">
                  No hay lecturas registradas. Sube tu primera lectura para comenzar.
                </div>
              )}
            </div>

            {/* Detailed table list of readings */}
            <div className="bg-white rounded p-4 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3 font-display">Lecturas Registradas</h3>
              <div className="overflow-y-auto max-h-60 space-y-2 pr-1">
                {tenantReadings.slice(0, 10).map(r => (
                  <div key={r.id} className="p-2 bg-slate-50 rounded border border-slate-150 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                      <div>
                        <p className="font-bold text-slate-800 font-mono">{r.value.toFixed(1)} kWh</p>
                        <p className="text-[10px] text-slate-400 font-mono">{r.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.imageUrl && (
                        <div 
                          onClick={() => setZoomImageUrl(r.imageUrl!)}
                          className="relative group cursor-pointer w-12 h-12 rounded border border-slate-200 overflow-hidden shrink-0 shadow-xs"
                        >
                          <img src={r.imageUrl} alt="Contador proof" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-center items-center text-center p-1">
                            <span className="text-[8px] text-emerald-400 font-bold font-mono leading-none">{r.value.toFixed(1)} kW</span>
                            <span className="text-[6px] text-white font-mono mt-0.5 leading-none">{r.date}</span>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 text-[7px] text-emerald-400 font-bold font-mono py-0.5 text-center leading-none">
                            {r.value.toFixed(0)} kW
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setReadingToEdit(r);
                            setEditReadingDate(r.date);
                            setEditReadingValue(r.value.toString());
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                          title="Modificar fecha o valor de la lectura"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setReadingToDelete(r)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Eliminar lectura"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {tenantReadings.length === 0 && (
                  <p className="text-center text-slate-400 text-xs py-12 font-mono">No hay lecturas registradas.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reading Edit Modal */}
        {readingToEdit && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded border border-slate-250 p-5 max-w-sm w-full space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                <div className="flex items-center gap-2 text-blue-600">
                  <Edit className="h-5 w-5 shrink-0" />
                  <h4 className="font-bold text-sm uppercase tracking-wider font-display">Modificar Lectura</h4>
                </div>
                <button
                  onClick={() => setReadingToEdit(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Fecha de la Lectura
                  </label>
                  <input
                    type="date"
                    value={editReadingDate}
                    onChange={(e) => setEditReadingDate(e.target.value)}
                    className="w-full rounded border border-slate-300 p-2 bg-white font-mono font-bold text-slate-800 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Valor del Sub-medidor (kWh)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editReadingValue}
                    onChange={(e) => setEditReadingValue(e.target.value)}
                    className="w-full rounded border border-slate-300 p-2 bg-white font-mono font-bold text-slate-800 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {readingToEdit.imageUrl && (
                  <div className="pt-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Foto Comprobante</span>
                    <div className="w-full h-24 rounded border border-slate-200 overflow-hidden bg-slate-50 relative">
                      <img src={readingToEdit.imageUrl} alt="Contador" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-150">
                <button
                  onClick={() => setReadingToEdit(null)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition font-sans"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!editReadingDate) {
                      setErrorMsg("Por favor selecciona una fecha válida.");
                      return;
                    }
                    const parsed = parseFloat(editReadingValue.toString().replace(",", ".").trim());
                    if (isNaN(parsed) || parsed < 0) {
                      setErrorMsg("Por favor ingresa un valor numérico de kWh correcto.");
                      return;
                    }
                    try {
                      await dbService.updateReadingLuz(readingToEdit.id, {
                        date: editReadingDate,
                        value: parsed
                      });
                      setSuccessMsg(`Lectura actualizada con éxito a la fecha ${editReadingDate}.`);
                      setTimeout(() => setSuccessMsg(null), 4000);
                      setReadingToEdit(null);
                      loadData();
                    } catch (err: any) {
                      setErrorMsg(`Error al actualizar la lectura: ${err.message || String(err)}`);
                    }
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer transition font-sans flex items-center gap-1 font-bold"
                >
                  <Save className="h-3 w-3" />
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reading Deletion Confirmation Modal */}
        {readingToDelete && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded border border-slate-250 p-5 max-w-sm w-full space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <h4 className="font-bold text-sm uppercase tracking-wider font-display">¿Eliminar Lectura de Contador?</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                ¿Estás seguro de que deseas eliminar la lectura del <strong className="text-slate-900 font-mono">{readingToDelete.date}</strong> (<strong className="text-slate-900 font-mono">{readingToDelete.value.toFixed(1)} kWh</strong>)? Esta acción eliminará la lectura de la base de datos.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setReadingToDelete(null)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition font-sans"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    try {
                      await dbService.deleteReadingLuz(readingToDelete.id);
                      setSuccessMsg(`Lectura del ${readingToDelete.date} eliminada con éxito.`);
                      setTimeout(() => setSuccessMsg(null), 4000);
                      setReadingToDelete(null);
                      loadData();
                    } catch (err) {
                      console.error("Error al eliminar lectura:", err);
                    }
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer transition font-sans flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Sí, Eliminar Lectura
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Zoom Image Modal */}
        {zoomImageUrl && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer animate-fade-in" onClick={() => setZoomImageUrl(null)}>
            <div className="relative max-w-3xl max-h-[90vh] bg-white rounded overflow-hidden shadow-2xl border border-slate-300 cursor-default" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={() => setZoomImageUrl(null)} 
                className="absolute top-2.5 right-2.5 p-1.5 bg-slate-950/75 hover:bg-slate-950 text-white rounded-full transition cursor-pointer z-50 shadow-md hover:scale-105"
              >
                <X className="h-4.5 w-4.5" />
              </button>
              <img src={zoomImageUrl} alt="Contador Ampliado" className="max-w-full max-h-[80vh] object-contain block mx-auto" />
              <div className="bg-slate-900 text-white p-3 text-center text-xs font-mono">
                Captura original de tu sub-medidor
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
