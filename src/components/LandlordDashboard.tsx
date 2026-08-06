import React, { useState, useEffect, FormEvent } from "react";
import { dbService } from "../firebase";
import { UserProfile, BillLuz, BillAgua, ReadingLuz, PropertyDetails } from "../types";
import { calculateLuzSplit, calculateAguaSplit } from "../utils/calculator";
import { extractDateFromFile, extractKwFromFile } from "../utils/readingHelpers";
import BillParserModal from "./BillParserModal";
import ReportPDFButton from "./ReportPDFButton";
import WaterReportPDFButton from "./WaterReportPDFButton";
import TuyaMeterPanel from "./TuyaMeterPanel";
import { 
  Plus, LogOut, Key, Calendar, MapPin, Zap, Droplet, Users, 
  ChevronRight, RefreshCw, Bell, AlertCircle, FileText, CheckCircle, Flame,
  Trash2, Edit, Save, X, ShieldCheck, Mail, Shield, Info, Check, Eye,
  Upload, Camera, Sparkles, Image as ImageIcon, AlertTriangle, Gauge, Star, Wifi
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface LandlordDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

interface PendingReading {
  id: string;
  file: File;
  preview: string;
  value: string;
  date: string;
  loading: boolean;
  error: string | null;
  success: boolean;
  isSimulated?: boolean;
}

export default function LandlordDashboard({ user, onLogout }: LandlordDashboardProps) {
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [billsLuz, setBillsLuz] = useState<BillLuz[]>([]);
  const [billsAgua, setBillsAgua] = useState<BillAgua[]>([]);
  const [readings, setReadings] = useState<ReadingLuz[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [billModalType, setBillModalType] = useState<"luz" | "agua" | null>(null);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-07");
  const [notificationSuccess, setNotificationSuccess] = useState<string | null>(null);

  // New state variables for deleting and viewing bills
  const [billToDelete, setBillToDelete] = useState<{ id: string; tipo: "luz" | "agua"; startDate: string; endDate: string } | null>(null);
  const [billToView, setBillToView] = useState<{ id: string; tipo: "luz" | "agua"; totalAmount: number; startDate: string; endDate: string; totalKwh?: number; fixedCost?: number; variableCost?: number; totalVolume?: number } | null>(null);

  // Navigation tabs: "resumen" | "lecturas" | "tuya" | "gestion"
  const [activeTab, setActiveTab] = useState<"resumen" | "lecturas" | "tuya" | "gestion">("resumen");
  
  // Landlord Meter Reading Upload states
  const [defaultReadingApt, setDefaultReadingApt] = useState<"A" | "B">(() => {
    return (localStorage.getItem(`default_reading_apt_${user.uid}`) || localStorage.getItem("default_reading_apt") || "A") as "A" | "B";
  });
  const [readingTargetApt, setReadingTargetApt] = useState<"A" | "B">(defaultReadingApt);
  const [activeReadingSubTab, setActiveReadingSubTab] = useState<"batch" | "single">("batch");
  const currentYear = new Date().getFullYear();
  const isJanuary = new Date().getMonth() === 0;
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const handleReadingYearChange = (newYear: number) => {
    setSelectedYear(newYear);
    if (singleReadingDate) {
      const parts = singleReadingDate.split("-");
      if (parts.length === 3) {
        setSingleReadingDate(`${newYear}-${parts[1]}-${parts[2]}`);
      }
    }
  };

  const [singleReadingDate, setSingleReadingDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [singleReadingValue, setSingleReadingValue] = useState<string>("");
  const [singleReadingImage, setSingleReadingImage] = useState<string | null>(null);
  const [isParsingSingle, setIsParsingSingle] = useState<boolean>(false);
  const [pendingReadings, setPendingReadings] = useState<PendingReading[]>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const [readingToDelete, setReadingToDelete] = useState<ReadingLuz | null>(null);
  const [readingToEdit, setReadingToEdit] = useState<ReadingLuz | null>(null);
  const [editReadingDate, setEditReadingDate] = useState<string>("");
  const [editReadingValue, setEditReadingValue] = useState<string>("");
  const [editReadingApt, setEditReadingApt] = useState<"A" | "B">("A");
  const [deletingReadingId, setDeletingReadingId] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const [tenants, setTenants] = useState<UserProfile[]>([]);
  const [isEditingCodes, setIsEditingCodes] = useState(false);
  const [codesForm, setCodesForm] = useState({
    codeAptA_ver: "",
    codeAptA_editar: "",
    codeAptB_ver: "",
    codeAptB_editar: "",
  });

  // Tenant form states
  const [isAddingTenant, setIsAddingTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState<UserProfile | null>(null);
  const [tenantForm, setTenantForm] = useState({
    email: "",
    role: "inquilino_editar" as "inquilino_ver" | "inquilino_editar",
    apartment: "A" as "A" | "B" | "none",
    name: "",
    accessKey: "",
  });
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<{ uid: string; email: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const prop = await dbService.getProperty(user.uid);
      setProperty(prop);
      setAddressInput(prop.address);
      setCodesForm({
        codeAptA_ver: prop.codeAptA_ver,
        codeAptA_editar: prop.codeAptA_editar,
        codeAptB_ver: prop.codeAptB_ver,
        codeAptB_editar: prop.codeAptB_editar,
      });

      const bl = await dbService.getBillsLuz(user.uid);
      setBillsLuz(bl);

      const ba = await dbService.getBillsAgua(user.uid);
      setBillsAgua(ba);

      const rd = await dbService.getReadingsLuz(user.uid);
      setReadings(rd);

      // Load tenants
      const tn = await dbService.getTenants(user.uid);
      setTenants(tn);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.uid]);

  const handleSaveBill = async (billData: any) => {
    try {
      if (billData.tipo === "luz") {
        await dbService.addBillLuz({
          landlordUid: user.uid,
          totalAmount: billData.totalAmount,
          startDate: billData.startDate,
          endDate: billData.endDate,
          totalKwh: billData.totalKwh,
          fixedCost: billData.fixedCost,
          variableCost: billData.variableCost,
          fileUrl: billData.fileUrl
        });

        const editTenant = tenants.find(t => t.role === "inquilino_editar");
        const editApartment: "A" | "B" = editTenant && (editTenant.apartment === "A" || editTenant.apartment === "B")
          ? editTenant.apartment
          : "A";

        const [sYear, sMonth, sDay] = billData.startDate.split("-").map(Number);
        const [eYear, eMonth, eDay] = billData.endDate.split("-").map(Number);
        const start = new Date(sYear, sMonth - 1, sDay);
        const end = new Date(eYear, eMonth - 1, eDay);
        let current = new Date(start);
        const missing: string[] = [];
        
        while (current < end) {
          const y = current.getFullYear();
          const m = (current.getMonth() + 1).toString().padStart(2, "0");
          const d = current.getDate().toString().padStart(2, "0");
          const dateStr = `${y}-${m}-${d}`;
          const hasReading = readings.some(r => r.apartment === editApartment && r.date === dateStr);
          if (!hasReading) {
            missing.push(dateStr);
          }
          current.setDate(current.getDate() + 1);
        }

        if (missing.length > 0) {
          await dbService.createNotificationForTenants(
            user.uid,
            "Lecturas pendientes para Factura de Luz",
            `Se ha subido la factura de luz del periodo ${billData.startDate} al ${billData.endDate}. Falta subir la lectura de los días: ${missing.join(", ")}. Por favor, regístralas para poder realizar el cálculo del reparto.`
          );
          setNotificationSuccess(`Factura de luz registrada. ¡ATENCIÓN! Faltan lecturas para los días: ${missing.join(", ")}. Se ha enviado una notificación al inquilino para que las suba.`);
        } else {
          setNotificationSuccess(`Factura de luz registrada con éxito.`);
        }
      } else {
        await dbService.addBillAgua({
          landlordUid: user.uid,
          totalAmount: billData.totalAmount,
          startDate: billData.startDate,
          endDate: billData.endDate,
          totalVolume: billData.totalVolume,
          fileUrl: billData.fileUrl
        });
        setNotificationSuccess(`Factura de agua registrada con éxito.`);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAddress = async () => {
    try {
      const updated = await dbService.updatePropertyAddress(user.uid, addressInput);
      setProperty(updated);
      setIsEditingAddress(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCodes = async () => {
    try {
      if (
        !codesForm.codeAptA_ver.trim() || 
        !codesForm.codeAptA_editar.trim() || 
        !codesForm.codeAptB_ver.trim() || 
        !codesForm.codeAptB_editar.trim()
      ) {
        throw new Error("Todos los códigos de acceso son obligatorios");
      }
      const updated = await dbService.updatePropertyCodes(user.uid, codesForm);
      setProperty(updated);
      setIsEditingCodes(false);
      setNotificationSuccess("Códigos de registro actualizados con éxito");
      setTimeout(() => setNotificationSuccess(null), 4000);
    } catch (err) {
      if (err instanceof Error) {
        alert(err.message);
      }
    }
  };

  const handleAddOrUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantError(null);
    try {
      if (!tenantForm.email.trim()) {
        throw new Error("El correo electrónico es obligatorio");
      }
      
      if (editingTenant) {
        await dbService.updateTenant(
          editingTenant.uid,
          tenantForm.email,
          tenantForm.role,
          tenantForm.apartment,
          tenantForm.name,
          tenantForm.accessKey
        );
        setNotificationSuccess(`Inquilino ${tenantForm.email} actualizado con éxito`);
      } else {
        await dbService.addTenant(
          user.uid,
          tenantForm.email,
          tenantForm.role,
          tenantForm.apartment,
          tenantForm.name,
          tenantForm.accessKey
        );
        setNotificationSuccess(`Inquilino ${tenantForm.email} registrado con éxito`);
      }

      // Reset states
      setIsAddingTenant(false);
      setEditingTenant(null);
      setTenantForm({ email: "", role: "inquilino_editar", apartment: "A", name: "", accessKey: "" });
      setTimeout(() => setNotificationSuccess(null), 4000);
      loadData();
    } catch (err) {
      if (err instanceof Error) {
        setTenantError(err.message);
      }
    }
  };

  const handleEditTenantClick = (tenant: UserProfile) => {
    setEditingTenant(tenant);
    setTenantForm({
      email: tenant.email,
      role: tenant.role as "inquilino_ver" | "inquilino_editar",
      apartment: tenant.apartment,
      name: tenant.name || "",
      accessKey: tenant.accessKey || ""
    });
    setIsAddingTenant(true);
    setTenantError(null);
  };

  const handleDeleteTenantClick = (tenantUid: string, email: string) => {
    setTenantToDelete({ uid: tenantUid, email });
  };

  const confirmDeleteTenant = async () => {
    if (!tenantToDelete) return;
    try {
      await dbService.deleteTenant(tenantToDelete.uid);
      setNotificationSuccess(`Inquilino ${tenantToDelete.email} eliminado correctamente`);
      setTimeout(() => setNotificationSuccess(null), 4000);
      setTenantToDelete(null);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendReminder = async () => {
    try {
      // Create notification for all tenants
      await dbService.createNotificationForTenants(
        user.uid,
        "Recordatorio de Lectura",
        "Se acerca la fecha de facturación mensual de la luz. Por favor, sube una foto y la lectura actual del contador de tu apartamento hoy."
      );
      setNotificationSuccess("Recordatorios automáticos enviados con éxito a todos los inquilinos");
      setTimeout(() => setNotificationSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  // --- LANDLORD METER READINGS HANDLERS ---
  const MAX_BATCH_READINGS = 15;

  const handleSingleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const extractedDate = extractDateFromFile(file, selectedYear);
      if (extractedDate) {
        setSingleReadingDate(extractedDate);
      }
      const extractedKw = extractKwFromFile(file);
      if (extractedKw) {
        setSingleReadingValue(extractedKw);
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setSingleReadingImage(base64);

        // Run Gemini AI parsing
        setIsParsingSingle(true);
        try {
          const response = await fetch("/api/parse-reading", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: base64, targetYear: selectedYear }),
          });
          const resJson = await response.json();
          if (response.ok && resJson.success) {
            if (resJson.data.value) {
              setSingleReadingValue(resJson.data.value.toString());
            }
            if (resJson.data.date) {
              setSingleReadingDate(resJson.data.date);
            }
          }
        } catch (err) {
          console.warn("IA parsing failed, keeping extracted fallback values:", err);
        } finally {
          setIsParsingSingle(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSingleReadingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!singleReadingValue || isNaN(Number(singleReadingValue))) {
      alert("Por favor ingresa un número de kWh válido.");
      return;
    }

    const existingReading = readings.find(r => r.apartment === readingTargetApt && r.date === singleReadingDate);
    if (existingReading) {
      const confirmOverwrite = window.confirm(
        `⚠️ ATENCIÓN: Ya existe una lectura registrada para la fecha ${singleReadingDate} en el Apartamento ${readingTargetApt} (${existingReading.value} kWh).\n\n¿Deseas REEMPLAZAR la lectura anterior con este nuevo valor (${singleReadingValue} kWh)? Ningún cargo será duplicado.`
      );
      if (!confirmOverwrite) {
        return; // Cancel submit
      }
    }

    try {
      await dbService.addReadingLuz({
        landlordUid: user.uid,
        tenantUid: user.uid,
        apartment: readingTargetApt,
        date: singleReadingDate,
        value: Number(singleReadingValue),
        imageUrl: singleReadingImage || undefined,
      });
      setNotificationSuccess(
        existingReading 
          ? `Lectura del día ${singleReadingDate} actualizada con éxito para el Apartamento ${readingTargetApt} (reemplazando registro anterior).`
          : `Lectura del día ${singleReadingDate} (${singleReadingValue} kWh) guardada con éxito para el Apartamento ${readingTargetApt}.`
      );
      setTimeout(() => setNotificationSuccess(null), 4000);
      setSingleReadingValue("");
      setSingleReadingImage(null);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMultipleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const rawFilesArray: File[] = Array.from(e.target.files);
      setBatchNotice(null);

      const totalSelected = rawFilesArray.length;
      let filesArray = rawFilesArray;

      if (totalSelected > MAX_BATCH_READINGS) {
        filesArray = rawFilesArray.slice(0, MAX_BATCH_READINGS);
        setBatchNotice(
          `Has seleccionado ${totalSelected} fotos. Se procesarán las primeras ${MAX_BATCH_READINGS} lecturas en este lote.`
        );
      }

      const spaceLeft = MAX_BATCH_READINGS - pendingReadings.length;
      if (spaceLeft <= 0) {
        setBatchNotice(`Has alcanzado el límite máximo de ${MAX_BATCH_READINGS} lecturas en la lista. Guarda o limpia la lista.`);
        if (e.target) e.target.value = "";
        return;
      } else if (filesArray.length > spaceLeft) {
        filesArray = filesArray.slice(0, spaceLeft);
        setBatchNotice(`Se han añadido las primeras ${spaceLeft} fotos de tu selección.`);
      }

      if (e.target) e.target.value = "";

      const newPendings: PendingReading[] = await Promise.all(
        filesArray.map(async (file: File) => {
          const preview = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(file);
          });
          const initialDate = extractDateFromFile(file, selectedYear);
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

      let localQuotaExceeded = false;
      for (const pending of newPendings) {
        if (localQuotaExceeded) {
          setPendingReadings((prev) =>
            prev.map((item) =>
              item.id === pending.id
                ? {
                    ...item,
                    loading: false,
                    success: true,
                    isSimulated: true,
                    error: "Límite de cuota de IA alcanzado. La foto se cargó; ingresa los kWh manualmente.",
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
            body: JSON.stringify({ fileBase64: pending.preview, targetYear: selectedYear }),
          });
          const resJson = await response.json();

          const isQuota = !response.ok || !resJson.success || !!resJson.data?.isQuotaExceeded || (!resJson.data?.value && resJson.data?.isSimulated);

          if (isQuota) {
            localQuotaExceeded = true;
            setBatchNotice(
              "⚠️ La Inteligencia Artificial de Gemini alcanzó su límite de solicitudes por minuto/día. Todas las fotos se mantuvieron cargadas, pero debes ingresar o verificar los valores kWh manualmente antes de guardar."
            );
          }

          if (response.ok && resJson.success) {
            setPendingReadings((prev) =>
              prev.map((item) =>
                item.id === pending.id
                  ? {
                      ...item,
                      value: resJson.data.value ? resJson.data.value.toString() : item.value,
                      date: resJson.data.date || item.date,
                      loading: false,
                      success: true,
                      isSimulated: !!resJson.data.isSimulated || isQuota,
                      error: isQuota
                        ? "Límite de cuota de IA alcanzado. Ingresa los kWh manualmente."
                        : (!resJson.data.value
                            ? "No se pudo extraer el valor kWh con IA. Introdúcelo manualmente."
                            : null),
                    }
                  : item
              )
            );
          } else {
            setPendingReadings((prev) =>
              prev.map((item) =>
                item.id === pending.id
                  ? {
                      ...item,
                      loading: false,
                      success: true,
                      isSimulated: true,
                      error: "No se pudo leer con IA. Introduce los kWh manualmente.",
                    }
                  : item
              )
            );
          }
        } catch (err: any) {
          localQuotaExceeded = true;
          setBatchNotice(
            "⚠️ Ocurrió un límite de cuota o error en la IA. Las imágenes se mantuvieron cargadas para ingresar los datos manualmente."
          );
          setPendingReadings((prev) =>
            prev.map((item) =>
              item.id === pending.id
                ? {
                    ...item,
                    loading: false,
                    success: true,
                    isSimulated: true,
                    error: "Límite de cuota o error de IA. Introduce los kWh manualmente.",
                  }
                : item
            )
          );
        }

        // Stagger delay between sequential API calls to prevent triggering Gemini rate limit 429
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  const handleSaveBatchReadings = async () => {
    if (pendingReadings.length === 0) {
      alert("No hay lecturas cargadas para guardar.");
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
      alert(`⚠️ Hay ${invalidItems.length} lectura(s) pendientes con valor de kWh o fecha vacíos/inválidos. Por favor ingresa los datos numéricos antes de guardar.`);
      return;
    }

    // 1. Check for duplicate dates WITHIN the batch itself
    const batchDates = sanitizedReadings.map(p => p.date);
    const duplicateBatchDates = batchDates.filter((date, index) => batchDates.indexOf(date) !== index);
    if (duplicateBatchDates.length > 0) {
      const uniqueDupes = Array.from(new Set(duplicateBatchDates));
      alert(
        `⚠️ No se pueden guardar varias lecturas con la misma fecha en el mismo lote (${uniqueDupes.join(", ")}). Modifica o elimina las fotos duplicadas antes de guardar.`
      );
      return;
    }

    // 2. Check for duplicate dates against ALREADY SAVED DATABASE READINGS
    const existingDbDupes = sanitizedReadings.filter(rd => 
      readings.some(r => r.apartment === readingTargetApt && r.date === rd.date)
    );

    if (existingDbDupes.length > 0) {
      const dupeDatesList = existingDbDupes.map(d => `${d.date} (${d.cleanValueStr} kWh)`).join(", ");
      const confirmBatch = window.confirm(
        `⚠️ ATENCIÓN: Se han detectado ${existingDbDupes.length} lecturas que YA fueron registradas anteriormente en el Apartamento ${readingTargetApt} para las fechas:\n\n${dupeDatesList}\n\n¿Deseas REEMPLAZAR los registros antiguos con los nuevos valores de este lote? En ningún caso se duplicarán los cargos.`
      );
      if (!confirmBatch) {
        return; // Cancel saving batch
      }
    }

    try {
      for (const r of sanitizedReadings) {
        await dbService.addReadingLuz({
          landlordUid: user.uid,
          tenantUid: user.uid,
          apartment: readingTargetApt,
          date: r.date,
          value: r.numValue,
          imageUrl: r.preview,
        });
      }

      setNotificationSuccess(`¡Éxito! Se han guardado/actualizado ${sanitizedReadings.length} lecturas de luz para el Apartamento ${readingTargetApt} sin duplicados.`);
      setTimeout(() => setNotificationSuccess(null), 4000);
      setPendingReadings([]);
      setBatchNotice(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(`Error al guardar las lecturas: ${err.message || String(err)}`);
    }
  };

  // Find editing apartment
  const foundEditingTenant = tenants.find(t => t.role === "inquilino_editar");
  const editingApartment: "A" | "B" = foundEditingTenant && (foundEditingTenant.apartment === "A" || foundEditingTenant.apartment === "B")
    ? foundEditingTenant.apartment
    : "A";

  // Extract active bill for the selected month to show active splitting (with fallback to latest)
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

  // Calculate results
  const luzSplit = activeLuz ? calculateLuzSplit(activeLuz, readings, editingApartment) : null;
  const aguaSplit = activeAgua ? calculateAguaSplit(activeAgua) : null;

  // Prepare chart data combining last 5 Luz bills
  const chartData = [...billsLuz]
    .slice(0, 6)
    .reverse()
    .map(b => {
      const split = calculateLuzSplit(b, readings, editingApartment);
      return {
        mes: b.startDate.substring(0, 7),
        "Total (€)": b.totalAmount,
        "Apt A (€)": split.totalA,
        "Apt B (€)": split.totalB,
      };
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center font-sans">
        <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
        <span className="mt-2 text-xs text-slate-500 font-mono uppercase tracking-wider font-bold">Cargando panel de propietario...</span>
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
              <Users className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display text-slate-900 uppercase tracking-tight">Panel Propietario</h1>
              <p className="text-[10px] text-slate-400 font-mono">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendReminder}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded border border-amber-200 transition cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5" />
              Notificar Lectura
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded border border-slate-200 transition cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 space-y-4">
        
        {/* Alerts / Feedback Banner */}
        {notificationSuccess && (
          <div className="p-3 bg-emerald-50 rounded border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{notificationSuccess}</span>
          </div>
        )}

        {/* Tab Selection Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-4 pt-1 rounded shadow-sm gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("resumen")}
            className={`flex items-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "resumen"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Zap className="h-4 w-4" />
            Resumen de Gastos
          </button>
          <button
            onClick={() => setActiveTab("lecturas")}
            className={`flex items-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "lecturas"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Gauge className="h-4 w-4" />
            Cargar / Gestionar Lecturas
          </button>
          <button
            onClick={() => setActiveTab("tuya")}
            className={`flex items-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "tuya"
                ? "border-emerald-600 text-emerald-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Wifi className="h-4 w-4 text-emerald-500" />
            Medidores Tuya IoT 🔌
          </button>
          <button
            onClick={() => {
              setActiveTab("gestion");
              setIsAddingTenant(false);
              setEditingTenant(null);
            }}
            className={`flex items-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "gestion"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Users className="h-4 w-4" />
            Administrar Inquilinos
          </button>
        </div>

        {activeTab === "resumen" ? (
          <>
            {/* Property & Action Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Property Info Card */}
              <div className="bg-white rounded p-4 border border-slate-200 shadow-sm lg:col-span-2 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Dirección del Inmueble</span>
                    <MapPin className="h-4 w-4 text-slate-400" />
                  </div>
                  {isEditingAddress ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        className="block w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 text-slate-950 font-bold"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleSaveAddress}
                          className="text-[10px] uppercase tracking-wider bg-blue-600 text-white px-2.5 py-1 rounded font-bold hover:bg-blue-700 transition cursor-pointer"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setIsEditingAddress(false)}
                          className="text-[10px] uppercase tracking-wider border border-slate-200 text-slate-600 px-2.5 py-1 rounded font-bold hover:bg-slate-50 transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-base font-bold font-display text-slate-900 leading-tight">
                        {property?.address || "Cargando..."}
                      </h2>
                      <button
                        onClick={() => setIsEditingAddress(true)}
                        className="mt-1.5 text-[10px] uppercase tracking-wider text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                      >
                        Editar Dirección
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-3 mt-4">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span className="font-medium">Configuración de la división</span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 text-[10px] font-bold uppercase tracking-wider">2 Apartamentos</span>
                  </div>
                </div>
              </div>

              {/* Action Trigger Card */}
              <div className="bg-white rounded p-4 border border-slate-200 shadow-sm lg:col-span-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded flex items-center justify-center border border-blue-100">
                    <FileText className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">Sube tu factura mensual</h3>
                    <p className="text-[11px] text-slate-450 mt-1 leading-normal">
                      Sube la factura de luz cada mes, o de agua cada 3 meses. El motor inteligente de Gemini extraerá el periodo y coste para distribuirlo equitativamente.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      setBillModalType("luz");
                      setIsModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded font-bold uppercase tracking-wider text-xs transition cursor-pointer shadow-sm"
                  >
                    <Zap className="h-4 w-4 shrink-0 text-slate-950" />
                    <span>Subir Factura de Luz</span>
                  </button>
                  <button
                    onClick={() => {
                      setBillModalType("agua");
                      setIsModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded font-bold uppercase tracking-wider text-xs transition cursor-pointer shadow-sm"
                  >
                    <Droplet className="h-4 w-4 shrink-0 text-white" />
                    <span>Subir Factura de Agua</span>
                  </button>
                </div>
              </div>
            </div>

        {/* Selected Month Report and splits */}
        {/* Expenses splits */}
        <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-150 pb-2">
              <div>
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">Cálculo de Reparto de Gastos</h3>
                <p className="text-[11px] text-slate-400">Selecciona el mes para ver el desglose y generar informes</p>
              </div>

              {/* Month Selector */}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Luz Card */}
              <div className="p-3.5 rounded border border-blue-200 bg-blue-50/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 bg-blue-100 text-blue-600 rounded flex items-center justify-center border border-blue-200">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Electricidad (Luz)</h4>
                      <p className="text-[10px] text-slate-400">Sincronización mensual</p>
                    </div>
                  </div>
                  {activeLuz ? (
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
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
                  <div className="p-2 bg-amber-50/65 rounded border border-amber-200 text-amber-800 text-[10px] leading-relaxed font-sans">
                    ⚠️ <span className="font-bold">Nota:</span> Mostrando la factura de luz más reciente disponible, ya que no se ha registrado ninguna para el mes de {selectedMonth}.
                  </div>
                )}

                {luzSplit ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-slate-600 border-b border-blue-100 pb-1 font-mono">
                      <span>Periodo:</span>
                      <span className="font-bold text-slate-800">{luzSplit.startDate} a {luzSplit.endDate}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 font-mono">
                      <span>Coste Total:</span>
                      <span className="font-bold text-slate-900">{luzSplit.totalAmount.toFixed(2)}€</span>
                    </div>

                    {luzSplit.isPendingReadings ? (
                      <div className="p-3 bg-rose-50 rounded border border-rose-200 text-rose-800 text-[11px] leading-relaxed space-y-2">
                        <div className="flex items-center gap-1.5 font-bold text-rose-900 uppercase tracking-wide text-[10px]">
                          <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                          <span>Lecturas Incompletas ({luzSplit.missingDates.length} días)</span>
                        </div>
                        <p className="font-semibold text-rose-800 leading-normal">
                          El cálculo del reparto está pausado. El apartamento que escribe (Apartamento {luzSplit.editingApartment}) debe subir obligatoriamente las lecturas de todos los días del periodo.
                        </p>
                        <div className="mt-1 font-mono text-[9px] bg-white p-1.5 rounded border border-rose-100">
                          <span className="font-bold text-rose-900 block mb-0.5">Fechas pendientes de lectura:</span>
                          <div className="max-h-24 overflow-y-auto whitespace-pre-line text-rose-950 font-medium leading-relaxed">
                            {luzSplit.missingDates.join(", ")}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs text-slate-600 font-mono">
                          <span>Valor de cada kW:</span>
                          <span className="font-bold text-slate-800">{(luzSplit.totalAmount / (luzSplit.kwhA + luzSplit.kwhB || 1)).toFixed(4)}€/kWh</span>
                        </div>
                        
                        {/* Visual bar split */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                            <span className="text-emerald-700">Apt A ({luzSplit.kwhA.toFixed(0)} kWh)</span>
                            <span className="text-blue-700">Apt B ({luzSplit.kwhB.toFixed(0)} kWh)</span>
                          </div>
                          <div className="h-2 w-full bg-slate-200 rounded overflow-hidden flex border border-slate-300">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${luzSplit.pctA * 100}%` }}></div>
                            <div className="bg-blue-600 h-full transition-all" style={{ width: `${luzSplit.pctB * 100}%` }}></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-200 pt-2 font-mono">
                          <div className="bg-white p-1.5 rounded border border-slate-200 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Apt A paga:</p>
                            <p className="text-xs font-bold text-emerald-600">{luzSplit.totalA.toFixed(2)}€</p>
                          </div>
                          <div className="bg-white p-1.5 rounded border border-slate-200 text-center">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Apt B paga:</p>
                            <p className="text-xs font-bold text-blue-600">{luzSplit.totalB.toFixed(2)}€</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-250 rounded">
                    No hay factura de luz subida para este mes.
                  </div>
                )}
              </div>

              {/* Water Card */}
              <div className="p-3.5 rounded border border-emerald-200 bg-emerald-50/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center border border-emerald-200">
                      <Droplet className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Agua (Trimestral)</h4>
                      <p className="text-[10px] text-slate-400">Reparto 50/50</p>
                    </div>
                  </div>
                  {activeAgua ? (
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
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
                  <div className="p-2 bg-amber-50/65 rounded border border-amber-200 text-amber-800 text-[10px] leading-relaxed font-sans">
                    ⚠️ <span className="font-bold">Nota:</span> Mostrando la factura de agua más reciente disponible, ya que no se ha registrado ninguna para el mes de {selectedMonth}.
                  </div>
                )}

                {aguaSplit ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-slate-600 border-b border-emerald-100 pb-1 font-mono">
                      <span>Periodo:</span>
                      <span className="font-bold text-slate-800">{aguaSplit.startDate} a {aguaSplit.endDate}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 font-mono">
                      <span>Coste Trimestral:</span>
                      <span className="font-bold text-slate-900">{aguaSplit.totalAmount.toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 font-mono">
                      <span>Eq. Mensual Total:</span>
                      <span className="font-bold text-slate-800">{aguaSplit.monthlyCostTotal.toFixed(2)}€/mes</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-200 pt-2 font-mono">
                      <div className="bg-white p-1.5 rounded border border-slate-200 text-center">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Apt A paga/mes:</p>
                        <p className="text-xs font-bold text-emerald-600">{aguaSplit.monthlyCostA.toFixed(2)}€</p>
                      </div>
                      <div className="bg-white p-1.5 rounded border border-slate-200 text-center">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Apt B paga/mes:</p>
                        <p className="text-xs font-bold text-blue-600">{aguaSplit.monthlyCostB.toFixed(2)}€</p>
                      </div>
                    </div>

                    {property && activeAgua && (
                      <div className="pt-1">
                        <WaterReportPDFButton
                          property={property}
                          billAgua={activeAgua}
                          label="Descargar Reporte PDF Agua con Factura"
                          className="w-full justify-center"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-mono border border-dashed border-slate-250 rounded">
                    No hay factura de agua activa para este mes.
                  </div>
                )}
              </div>
            </div>
          </div>

        {/* Historial de Facturas Subidas */}
        <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">Historial de Facturas (Luz y Agua)</h3>
              <p className="text-[10px] text-slate-400">Listado de todas las facturas cargadas y sus repartos correspondientes</p>
            </div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono">Total: {billsLuz.length + billsAgua.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2 px-1">Servicio</th>
                  <th className="py-2 px-1">Periodo</th>
                  <th className="py-2 px-1 text-right">Importe Total</th>
                  <th className="py-2 px-1 text-center">Detalle / Consumo</th>
                  <th className="py-2 px-1 text-right text-emerald-750">Apt A paga</th>
                  <th className="py-2 px-1 text-right text-blue-750">Apt B paga</th>
                  <th className="py-2 px-1 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
                {/* Electricity Bills */}
                {billsLuz.map((b) => {
                  const split = calculateLuzSplit(b, readings);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-2.5 px-1 font-bold text-slate-900 font-sans flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span>Luz</span>
                      </td>
                      <td className="py-2.5 px-1 text-slate-500">{b.startDate} al {b.endDate}</td>
                      <td className="py-2.5 px-1 text-right font-bold text-slate-800">{b.totalAmount.toFixed(2)}€</td>
                      <td className="py-2.5 px-1 text-center text-slate-500">{b.totalKwh} kWh</td>
                      <td className="py-2.5 px-1 text-right text-emerald-600 font-bold">{split.totalA.toFixed(2)}€</td>
                      <td className="py-2.5 px-1 text-right text-blue-600 font-bold">{split.totalB.toFixed(2)}€</td>
                      <td className="py-2.5 px-1 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setBillToView({ ...b, tipo: "luz" })}
                            className="text-[10px] uppercase font-bold text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition cursor-pointer flex items-center gap-0.5"
                            title="Ver detalles de factura"
                          >
                            <Eye className="h-3 w-3" /> Ver
                          </button>
                          <button
                            onClick={() => setBillToDelete({ id: b.id, tipo: "luz", startDate: b.startDate, endDate: b.endDate })}
                            className="text-[10px] uppercase font-bold text-rose-600 hover:text-rose-800 px-1.5 py-0.5 rounded hover:bg-rose-50 transition cursor-pointer"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                
                {/* Water Bills */}
                {billsAgua.map((b) => {
                  const split = calculateAguaSplit(b);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-2.5 px-1 font-bold text-slate-900 font-sans flex items-center gap-1.5">
                        <Droplet className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>Agua</span>
                      </td>
                      <td className="py-2.5 px-1 text-slate-500">{b.startDate} al {b.endDate}</td>
                      <td className="py-2.5 px-1 text-right font-bold text-slate-800">{b.totalAmount.toFixed(2)}€</td>
                      <td className="py-2.5 px-1 text-center text-slate-500">{b.totalVolume || 0} m³ (50/50)</td>
                      <td className="py-2.5 px-1 text-right text-emerald-600 font-bold">{split.totalA.toFixed(2)}€</td>
                      <td className="py-2.5 px-1 text-right text-blue-600 font-bold">{split.totalB.toFixed(2)}€</td>
                      <td className="py-2.5 px-1 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          {property && (
                            <WaterReportPDFButton
                              property={property}
                              billAgua={b}
                              variant="icon"
                            />
                          )}
                          <button
                            onClick={() => setBillToView({ ...b, tipo: "agua" })}
                            className="text-[10px] uppercase font-bold text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition cursor-pointer flex items-center gap-0.5"
                            title="Ver detalles de factura"
                          >
                            <Eye className="h-3 w-3" /> Ver
                          </button>
                          <button
                            onClick={() => setBillToDelete({ id: b.id, tipo: "agua", startDate: b.startDate, endDate: b.endDate })}
                            className="text-[10px] uppercase font-bold text-rose-600 hover:text-rose-800 px-1.5 py-0.5 rounded hover:bg-rose-50 transition cursor-pointer"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {billsLuz.length === 0 && billsAgua.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-xs text-slate-400 font-sans">
                      No hay facturas subidas en el historial. Sube una factura para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts & Graphs Trend */}
        {chartData.length > 0 && (
          <div className="bg-white rounded p-4 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display mb-3">Histórico de Gastos Eléctricos</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#64748b" fontSize={9} fontClassName="font-mono" />
                  <YAxis stroke="#64748b" fontSize={9} fontClassName="font-mono" />
                  <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1', padding: '6px' }} />
                  <Area type="monotone" dataKey="Total (€)" stroke="#2563eb" strokeWidth={1.5} fillOpacity={1} fill="url(#colorTotal)" />
                  <Area type="monotone" dataKey="Apt A (€)" stroke="#10b981" strokeWidth={1.2} fillOpacity={0} />
                  <Area type="monotone" dataKey="Apt B (€)" stroke="#6366f1" strokeWidth={1.2} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Readings and Activity Logs */}
        <div className="bg-white rounded p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">Últimas Lecturas de Sub-medidores</h3>
              <p className="text-[10px] text-slate-400">Lecturas diarias enviadas por inquilinos habilitados</p>
            </div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Historial general</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2 px-1">Apartamento</th>
                  <th className="py-2 px-1">Fecha</th>
                  <th className="py-2 px-1 text-right">Lectura (kWh)</th>
                  <th className="py-2 px-1 text-center">Foto Prueba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
                {readings.slice(0, 10).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="py-2 px-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${r.apartment === "A" ? "bg-emerald-500" : "bg-blue-600"}`}></span>
                      <span className="font-bold text-slate-900 font-sans">Apartamento {r.apartment}</span>
                    </td>
                    <td className="py-2 px-1 text-slate-400 text-[10px]">{r.date}</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-800">{r.value.toFixed(1)} kWh</td>
                    <td className="py-2 px-1 text-center">
                      {r.imageUrl ? (
                        <div className="inline-block relative group cursor-pointer">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-150 border border-slate-300 text-slate-600 px-1.5 py-0.5 rounded group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                            Ver Imagen
                          </span>
                          <div className="absolute bottom-5 right-0 hidden group-hover:block z-50 bg-slate-950 p-1 rounded border border-slate-700 shadow-xl w-40">
                            <img src={r.imageUrl} alt="Sub-meter proof" className="rounded-sm max-h-24 w-full object-cover" referrerPolicy="no-referrer" />
                            <p className="text-[9px] text-white text-center mt-1 font-sans">Contador Apt {r.apartment}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300">No adjunta</span>
                      )}
                    </td>
                  </tr>
                ))}
                {readings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-xs text-slate-400">
                      No hay lecturas registradas. Los inquilinos deben subirlas diariamente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        ) : activeTab === "lecturas" ? (
          <div className="space-y-4 animate-fade-in">
            {/* Header & Target Apartment Selection */}
            <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display flex items-center gap-1.5">
                    <Gauge className="h-4 w-4 text-blue-600" />
                    Cargar y Gestionar Lecturas de Medidores
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Como propietario, puedes subir lecturas en nombre de los inquilinos si no las han subido o te envían las fotos.
                  </p>
                </div>

                {/* Apartment Target Toggle */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200 shrink-0">
                    <button
                      onClick={() => setReadingTargetApt("A")}
                      className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1.5 ${
                        readingTargetApt === "A"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Apartamento A
                      {defaultReadingApt === "A" && (
                        <Star className="h-3 w-3 fill-amber-300 text-amber-300 shrink-0" title="Apartamento predeterminado" />
                      )}
                    </button>
                    <button
                      onClick={() => setReadingTargetApt("B")}
                      className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1.5 ${
                        readingTargetApt === "B"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Apartamento B
                      {defaultReadingApt === "B" && (
                        <Star className="h-3 w-3 fill-amber-300 text-amber-300 shrink-0" title="Apartamento predeterminado" />
                      )}
                    </button>
                  </div>

                  {defaultReadingApt !== readingTargetApt ? (
                    <button
                      onClick={() => {
                        localStorage.setItem(`default_reading_apt_${user.uid}`, readingTargetApt);
                        localStorage.setItem("default_reading_apt", readingTargetApt);
                        setDefaultReadingApt(readingTargetApt);
                        setNotificationSuccess(`Apartamento ${readingTargetApt} fijado como predeterminado para la carga de lecturas.`);
                        setTimeout(() => setNotificationSuccess(null), 3500);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded cursor-pointer transition flex items-center gap-1 shrink-0 font-sans"
                      title="Fijar este apartamento como predeterminado por defecto para cargar lecturas"
                    >
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      Fijar como predeterminado
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200/80 flex items-center gap-1 shrink-0 font-sans">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      Predeterminado
                    </span>
                  )}
                </div>
              </div>

              {/* Upload Sub-tabs */}
              <div className="flex border-b border-slate-100 gap-2 pt-1">
                <button
                  onClick={() => setActiveReadingSubTab("batch")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
                    activeReadingSubTab === "batch"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  Lote de Fotos con IA
                </button>
                <button
                  onClick={() => setActiveReadingSubTab("single")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
                    activeReadingSubTab === "single"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Lectura Individual Manual
                </button>
              </div>

              {/* BATCH UPLOAD SECTION */}
              {/* Year Switcher Control for Landlord */}
              <div className="p-2.5 bg-blue-50/50 rounded border border-blue-200/80 space-y-1.5 mb-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" /> Año Predeterminado de Lecturas
                  </label>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                    {selectedYear}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleReadingYearChange(currentYear)}
                    className={`py-1 px-2 rounded text-[11px] font-bold border transition cursor-pointer ${
                      selectedYear === currentYear
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-white text-slate-700 border-slate-250 hover:bg-slate-100"
                    }`}
                  >
                    {currentYear} (Año actual)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReadingYearChange(currentYear - 1)}
                    className={`py-1 px-2 rounded text-[11px] font-bold border transition cursor-pointer ${
                      selectedYear === currentYear - 1
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-white text-slate-700 border-slate-250 hover:bg-slate-100"
                    }`}
                  >
                    {currentYear - 1} (Año anterior)
                  </button>
                </div>
                {isJanuary && (
                  <p className="text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200 flex items-start gap-1">
                    <span className="shrink-0">💡</span>
                    <span>
                      <strong>Enero:</strong> Si estás subiendo fotos de lecturas de Diciembre del año pasado, selecciona <strong>{currentYear - 1}</strong>.
                    </span>
                  </p>
                )}
              </div>

              {activeReadingSubTab === "batch" ? (
                <div className="space-y-4 pt-2">
                  <div className="p-3 bg-blue-50/50 rounded border border-blue-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="text-xs text-slate-600">
                      <p className="font-bold text-slate-800">
                        Sube hasta {MAX_BATCH_READINGS} fotos para el <span className="text-blue-700 font-extrabold">Apartamento {readingTargetApt}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        La IA escaneará el contador y extraerá la fecha y la lectura automáticamente.
                      </p>
                    </div>

                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-xs shrink-0">
                      <Camera className="h-3.5 w-3.5" />
                      Seleccionar Fotos
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMultipleFilesChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {batchNotice && (
                    <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>{batchNotice}</span>
                    </div>
                  )}

                  {/* Pending Readings List */}
                  {pendingReadings.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-xs font-bold uppercase text-slate-700">
                          Lecturas Pendientes de Confirmar ({pendingReadings.length})
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPendingReadings([])}
                            className="text-[10px] font-bold uppercase text-slate-400 hover:text-rose-600"
                          >
                            Limpiar Lote
                          </button>
                          <button
                            onClick={handleSaveBatchReadings}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded transition shadow-xs cursor-pointer"
                          >
                            Guardar Todas las Lecturas
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {pendingReadings.map((p) => (
                          <div key={p.id} className="p-2.5 bg-slate-50 rounded border border-slate-200 space-y-2 relative">
                            <div className="relative h-28 bg-slate-900 rounded overflow-hidden">
                              <img src={p.preview} alt="Reading preview" className="w-full h-full object-cover" />
                              {p.loading && (
                                <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                  <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                                  <span>Escaneando IA...</span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <div>
                                <label className="text-[9px] font-bold uppercase text-slate-400">Fecha de Lectura</label>
                                <input
                                  type="date"
                                  value={p.date}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPendingReadings(prev => prev.map(item => item.id === p.id ? { ...item, date: val } : item));
                                  }}
                                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono bg-white"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-bold uppercase text-slate-400">Valor Lectura (kWh)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={p.value}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPendingReadings(prev => prev.map(item => item.id === p.id ? { ...item, value: val } : item));
                                  }}
                                  placeholder="Ej: 1465.5"
                                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono font-bold bg-white text-slate-900"
                                />
                              </div>

                              {p.error && (
                                <div className="p-1.5 bg-amber-50 rounded border border-amber-200 text-[9px] text-amber-800 font-medium">
                                  ⚠️ {p.error}
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => setPendingReadings(prev => prev.filter(item => item.id !== p.id))}
                              className="absolute top-1 right-1 p-1 bg-slate-900/60 hover:bg-rose-600 text-white rounded-full transition"
                              title="Eliminar de la lista"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* SINGLE UPLOAD FORM */
                <form onSubmit={handleSingleReadingSubmit} className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Apartamento Asignado
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`Apartamento ${readingTargetApt}`}
                        className="w-full border border-slate-200 bg-slate-100 rounded px-2.5 py-1.5 text-xs font-bold text-slate-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Fecha de la Lectura
                      </label>
                      <input
                        type="date"
                        value={singleReadingDate}
                        onChange={(e) => setSingleReadingDate(e.target.value)}
                        className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Lectura de Contador (kWh)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={singleReadingValue}
                          onChange={(e) => setSingleReadingValue(e.target.value)}
                          placeholder="Ej: 1465.2"
                          className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          required
                        />
                        {isParsingSingle && (
                          <div className="absolute right-2 top-2 flex items-center gap-1 text-[10px] text-blue-600 font-bold">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            <span>IA...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Foto Comprobante del Contador (Opcional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSingleImageChange}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                  </div>

                  {singleReadingImage && (
                    <div className="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-200">
                      <img src={singleReadingImage} alt="Meter preview" className="h-16 w-20 object-cover rounded border border-slate-300" />
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">Foto de contador adjunta</p>
                        <p className="text-[10px] text-slate-400">Procesada correctamente por la aplicación</p>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider transition shadow-xs cursor-pointer"
                  >
                    Guardar Lectura de Contador
                  </button>
                </form>
              )}
            </div>

            {/* REGISTERED READINGS TABLE FOR LANDLORD */}
            <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">
                    Historial Completo de Lecturas de Medidores
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Todas las lecturas registradas para el Apartamento A y B en la base de datos
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                  Total: {readings.length}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-2 px-2">Apartamento</th>
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2 text-right">Lectura (kWh)</th>
                      <th className="py-2 px-2 text-center">Foto Comprobante</th>
                      <th className="py-2 px-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
                    {readings.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-2 font-bold font-sans">
                          <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${r.apartment === "A" ? "bg-emerald-500" : "bg-blue-600"}`}></span>
                          Apt {r.apartment}
                        </td>
                        <td className="py-2 px-2 text-slate-600">{r.date}</td>
                        <td className="py-2 px-2 text-right font-bold text-slate-900">{r.value.toFixed(1)} kWh</td>
                        <td className="py-2 px-2 text-center">
                          {r.imageUrl ? (
                            <button
                              onClick={() => setZoomImageUrl(r.imageUrl || null)}
                              className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:underline cursor-pointer"
                            >
                              Ver Foto
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300">No adjunta</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                setReadingToEdit(r);
                                setEditReadingDate(r.date);
                                setEditReadingValue(r.value.toString());
                                setEditReadingApt(r.apartment);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                              title="Modificar fecha o valor"
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
                        </td>
                      </tr>
                    ))}
                    {readings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-slate-400 font-sans">
                          No hay lecturas registradas. Utiliza el formulario superior para añadir lecturas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === "tuya" ? (
          <div className="space-y-4 animate-fade-in">
            <TuyaMeterPanel user={user} onSyncComplete={loadData} />
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            
            {/* Tenants Administration Card */}
            <div className="bg-white rounded p-4 border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4.5 w-4.5 text-blue-600" />
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">Inquilinos en el Inmueble</h3>
                    <p className="text-[10px] text-slate-400">Añade o elimina inquilinos y edita sus asignaciones de apartamento</p>
                  </div>
                </div>
                {!isAddingTenant && (
                  <button
                    onClick={() => {
                      setEditingTenant(null);
                      setTenantForm({ email: "", role: "inquilino_editar", apartment: "A", name: "", accessKey: "" });
                      setIsAddingTenant(true);
                      setTenantError(null);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer shadow-xs font-sans font-bold"
                  >
                    <Plus className="h-3 w-3" />
                    Añadir Inquilino Directo
                  </button>
                )}
              </div>

              {/* Add / Edit Tenant Form */}
              {isAddingTenant && (
                <form onSubmit={handleAddOrUpdateTenant} className="p-4 bg-slate-50 rounded border border-blue-100 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                    <h4 className="text-[10px] font-bold uppercase text-blue-800 tracking-wider flex items-center gap-1 font-sans font-bold">
                      <Shield className="h-3.5 w-3.5" />
                      {editingTenant ? `Editar Inquilino: ${editingTenant.email}` : "Registrar Nuevo Inquilino Directo"}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingTenant(false);
                        setEditingTenant(null);
                      }}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {tenantError && (
                    <div className="p-2 bg-rose-50 text-rose-800 border border-rose-100 rounded text-xs flex gap-1.5 items-center">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{tenantError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Users className="h-3 w-3 text-slate-400" /> Nombre del Inquilino
                      </label>
                      <input
                        type="text"
                        value={tenantForm.name}
                        onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                        placeholder="Ej. Juan Pérez"
                        className="mt-1 block w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white text-slate-950 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Mail className="h-3 w-3 text-slate-400" /> Correo Electrónico
                      </label>
                      <input
                        type="email"
                        required
                        value={tenantForm.email}
                        onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                        placeholder="ejemplo@correo.com"
                        className="mt-1 block w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white text-slate-950 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Key className="h-3 w-3 text-slate-400" /> Clave de Acceso
                      </label>
                      <input
                        type="text"
                        value={tenantForm.accessKey}
                        onChange={(e) => setTenantForm({ ...tenantForm, accessKey: e.target.value })}
                        placeholder="Ej. 123456"
                        className="mt-1 block w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white text-slate-950 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" /> Apartamento Asignado
                      </label>
                      <select
                        value={tenantForm.apartment}
                        onChange={(e) => setTenantForm({ ...tenantForm, apartment: e.target.value as any })}
                        className="mt-1 block w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white text-slate-950 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="A">Apartamento A</option>
                        <option value="B">Apartamento B</option>
                        <option value="none">Sin Asignar (Ninguno)</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Shield className="h-3 w-3 text-slate-400" /> Nivel de Permisos
                      </label>
                      <select
                        value={tenantForm.role}
                        onChange={(e) => setTenantForm({ ...tenantForm, role: e.target.value as any })}
                        className="mt-1 block w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white text-slate-950 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="inquilino_editar">Lectura + Foto (Escritura de contadores - puede subir lecturas y fotos)</option>
                        <option value="inquilino_ver">Solo Ver (Lector de repartos - puede visualizar pero no subir lecturas)</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 p-2.5 rounded border border-blue-100 flex items-start gap-1.5">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-blue-800 leading-normal font-sans">
                      <strong>Nota de comodidad:</strong> Los inquilinos creados manualmente por el propietario son verificados automáticamente para que no requieran verificar su correo. Podrán iniciar sesión de inmediato con su correo y la clave de acceso asignada (o la de respaldo <code className="font-mono bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-bold">123456</code>).
                    </p>
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingTenant(false);
                        setEditingTenant(null);
                      }}
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer font-sans font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1 cursor-pointer font-sans font-bold"
                    >
                      <Check className="h-3 w-3" />
                      {editingTenant ? "Actualizar Inquilino" : "Guardar Inquilino"}
                    </button>
                  </div>
                </form>
              )}

              {/* Tenants List Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-450 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-2 px-1">Inquilino / Correo</th>
                      <th className="py-2 px-1">Apartamento</th>
                      <th className="py-2 px-1">Rol / Permisos</th>
                      <th className="py-2 px-1">Estado de Acceso</th>
                      <th className="py-2 px-1 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {tenants.map((t) => (
                      <tr key={t.uid} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-1 font-medium text-slate-900 font-sans">
                          <div className="flex items-center gap-1.5">
                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
                              <Mail className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-800">{t.name || "Sin nombre registrado"}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{t.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-1">
                          {t.apartment === "none" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-250 font-bold">
                              Sin Asignar
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max font-bold ${
                              t.apartment === "A" 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${t.apartment === "A" ? "bg-emerald-500" : "bg-blue-600"}`}></span>
                              Apartamento {t.apartment}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-1">
                          {t.role === "inquilino_editar" ? (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase tracking-wider font-bold">
                              Lectura + Foto (Escritor)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold uppercase tracking-wider font-bold">
                              Solo ver reparto (Lector)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-1">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px]">
                              {t.emailVerified ? (
                                <>
                                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold uppercase tracking-wider text-[9px]">Habilitado</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="h-4 w-4 text-amber-500" />
                                  <span className="text-amber-600 font-bold uppercase tracking-wider text-[9px]">Pendiente de correo</span>
                                </>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <span className="font-semibold text-[9px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Clave: {t.accessKey || "123456"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-1">
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={() => handleEditTenantClick(t)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                              title="Editar Inquilino"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTenantClick(t.uid, t.email)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              title="Eliminar Inquilino"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                          No hay inquilinos registrados bajo tu supervisión. Comparte los códigos de registro o añádelos directamente con el botón de arriba.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Bill Upload Modal */}
      {isModalOpen && (
        <BillParserModal
          initialServiceType={billModalType || "luz"}
          onClose={() => {
            setIsModalOpen(false);
            setBillModalType(null);
          }}
          onSave={handleSaveBill}
        />
      )}

      {/* Custom Deletion Confirmation Modal */}
      {tenantToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded border border-slate-250 p-5 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5" />
              <h4 className="font-bold text-sm uppercase tracking-wider font-display">¿Eliminar Inquilino?</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              ¿Estás seguro de que deseas eliminar al inquilino <strong className="text-slate-900 font-bold">{tenantToDelete.email}</strong>? Esta acción revocará su acceso de inmediato.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTenantToDelete(null)}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition font-sans"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteTenant}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer transition font-sans flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Sí, Eliminar
              </button>
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
                  Apartamento
                </label>
                <select
                  value={editReadingApt}
                  onChange={(e) => setEditReadingApt(e.target.value as "A" | "B")}
                  className="w-full rounded border border-slate-300 p-2 bg-white font-mono font-bold text-slate-800"
                >
                  <option value="A">Apartamento A</option>
                  <option value="B">Apartamento B</option>
                </select>
              </div>

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
                  Valor Registrado (kWh)
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
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Captura Comprobante</span>
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
                    alert("Por favor selecciona una fecha válida");
                    return;
                  }
                  const parsed = parseFloat(editReadingValue.toString().replace(",", ".").trim());
                  if (isNaN(parsed) || parsed < 0) {
                    alert("Por favor ingresa un valor numérico de kWh correcto");
                    return;
                  }
                  try {
                    await dbService.updateReadingLuz(readingToEdit.id, {
                      date: editReadingDate,
                      value: parsed,
                      apartment: editReadingApt
                    });
                    setNotificationSuccess(`Lectura del Apartamento ${editReadingApt} actualizada con éxito a la fecha ${editReadingDate}.`);
                    setTimeout(() => setNotificationSuccess(null), 4000);
                    setReadingToEdit(null);
                    loadData();
                  } catch (err: any) {
                    alert(`Error al actualizar la lectura: ${err.message || String(err)}`);
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
              ¿Estás seguro de que deseas eliminar la lectura del <strong className="text-slate-900 font-mono">{readingToDelete.date}</strong> del <strong className="text-slate-900">Apartamento {readingToDelete.apartment}</strong> (<strong className="text-slate-900 font-mono">{readingToDelete.value.toFixed(1)} kWh</strong>)? Esta acción eliminará el registro de la base de datos.
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
                    setNotificationSuccess(`Lectura del ${readingToDelete.date} (Apt ${readingToDelete.apartment}) eliminada con éxito.`);
                    setTimeout(() => setNotificationSuccess(null), 4000);
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

      {/* Bill Deletion Confirmation Modal */}
      {billToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded border border-slate-250 p-5 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <h4 className="font-bold text-sm uppercase tracking-wider font-display">¿Confirmar Eliminación?</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              ¿Estás seguro de que deseas eliminar la factura de <strong className="text-slate-800 uppercase">{billToDelete.tipo === "luz" ? "Luz" : "Agua"}</strong> del periodo <strong className="text-slate-800">{billToDelete.startDate}</strong> al <strong className="text-slate-800">{billToDelete.endDate}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBillToDelete(null)}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition font-sans"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (billToDelete.tipo === "luz") {
                    await dbService.deleteBillLuz(billToDelete.id);
                  } else {
                    await dbService.deleteBillAgua(billToDelete.id);
                  }
                  setBillToDelete(null);
                  loadData();
                  setNotificationSuccess("Factura eliminada con éxito");
                  setTimeout(() => setNotificationSuccess(null), 4000);
                }}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer transition font-sans flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar Factura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Bill Details Viewer Modal */}
      {billToView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded w-full max-w-md overflow-hidden shadow-2xl border border-slate-350 flex flex-col max-h-[90vh]">
            {/* Modal Title/Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-1.5">
                <div className={`h-6 w-6 rounded flex items-center justify-center border ${
                  billToView.tipo === "luz" 
                    ? "bg-blue-50 text-blue-700 border-blue-200" 
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {billToView.tipo === "luz" ? <Zap className="h-3.5 w-3.5" /> : <Droplet className="h-3.5 w-3.5" />}
                </div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 font-display">
                  Detalles de Factura: {billToView.tipo === "luz" ? "Electricidad (Luz)" : "Agua"}
                </h3>
              </div>
              <button 
                onClick={() => setBillToView(null)} 
                className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
              {/* Document Visualizer Box */}
              <div className="bg-slate-50 rounded border border-slate-200 p-4 space-y-4 relative overflow-hidden shadow-xs">
                {/* Visual watermark */}
                <div className="absolute top-2 right-[-25px] bg-slate-200 text-slate-600 text-[7px] font-bold uppercase tracking-widest py-0.5 px-6 rotate-45 text-center border-y border-slate-300">
                  Verificado
                </div>

                <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight">
                      {billToView.tipo === "luz" ? "IBERDROLA CLIENTES S.A.U." : "AQUALIA GESTIÓN DE AGUAS"}
                    </h4>
                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">CIF: ES-A83920194 • Tel: 900 12 12 12</p>
                    <p className="text-[9px] text-slate-500 font-sans mt-1">
                      Inmueble: <span className="font-semibold text-slate-700">{property?.address || "Dirección del Inmueble"}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      billToView.tipo === "luz" 
                        ? "bg-blue-100 text-blue-800 border-blue-200" 
                        : "bg-emerald-100 text-emerald-800 border-emerald-200"
                    }`}>
                      Factura Oficial
                    </span>
                    <p className="text-[9px] text-slate-400 font-mono mt-1">Nº: {billToView.tipo === "luz" ? "LUZ" : "AGU"}-{billToView.id.substring(4, 10).toUpperCase()}</p>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider font-sans">Periodo Facturado</p>
                    <p className="text-slate-800 font-bold mt-0.5">{billToView.startDate} al {billToView.endDate}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider font-sans">Importe Total</p>
                    <p className="text-slate-900 font-extrabold text-xs mt-0.5">{billToView.totalAmount.toFixed(2)}€</p>
                  </div>
                </div>

                {/* Specific details */}
                {billToView.tipo === "luz" ? (
                  <div className="bg-white rounded border border-slate-200 p-2.5 space-y-1.5">
                    <p className="font-bold text-slate-800 text-[9px] uppercase tracking-wider border-b border-slate-100 pb-0.5">Conceptos Facturados (Luz)</p>
                    <div className="flex justify-between text-slate-600 font-mono text-[11px]">
                      <span>Fijo / Potencia:</span>
                      <span className="font-bold text-slate-800">{(billToView.fixedCost || 0).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between text-slate-600 font-mono text-[11px]">
                      <span>Variable / Energía:</span>
                      <span className="font-bold text-slate-800">{(billToView.variableCost || 0).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between text-slate-600 font-mono text-[11px]">
                      <span>Consumo Total:</span>
                      <span className="font-bold text-slate-800">{billToView.totalKwh || 0} kWh</span>
                    </div>
                    <div className="flex justify-between text-slate-650 font-mono text-[11px] border-t border-slate-100 pt-1 mt-0.5">
                      <span>Precio kW Medio:</span>
                      <span className="font-bold text-blue-700">{(billToView.totalAmount / (billToView.totalKwh || 1)).toFixed(4)} €/kWh</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded border border-slate-200 p-2.5 space-y-1.5">
                    <p className="font-bold text-slate-800 text-[9px] uppercase tracking-wider border-b border-slate-100 pb-0.5">Conceptos Facturados (Agua)</p>
                    <div className="flex justify-between text-slate-600 font-mono text-[11px]">
                      <span>Consumo Total Estimado:</span>
                      <span className="font-bold text-slate-800">{billToView.totalVolume || 0} m³</span>
                    </div>
                    <div className="flex justify-between text-slate-650 font-mono text-[11px] border-t border-slate-100 pt-1 mt-0.5">
                      <span>Criterio de Distribución:</span>
                      <span className="font-bold text-emerald-700">Equitativo (50% por vivienda)</span>
                    </div>
                  </div>
                )}

                {/* Copia de Factura Adjunta */}
                {billToView.fileUrl && (
                  <div className="bg-white rounded border border-slate-200 p-2.5 space-y-1.5">
                    <p className="font-bold text-slate-800 text-[9px] uppercase tracking-wider border-b border-slate-100 pb-0.5 flex items-center justify-between">
                      <span>Documento de Factura Adjunto</span>
                      <span className="text-emerald-600 font-bold">Verificado</span>
                    </p>
                    <div className="relative group rounded overflow-hidden border border-slate-200 max-h-48 bg-slate-950 flex items-center justify-center p-1">
                      <img
                        src={billToView.fileUrl}
                        alt="Copia Factura"
                        className="max-h-44 w-full object-contain cursor-pointer hover:opacity-90 transition rounded"
                        onClick={() => setZoomImageUrl(billToView.fileUrl!)}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImageUrl(billToView.fileUrl!)}
                        className="absolute bottom-2 right-2 px-2 py-1 bg-slate-900/90 hover:bg-slate-900 text-white rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-xs cursor-pointer shadow-md"
                      >
                        <Eye className="h-3 w-3" /> Ampliar Documento
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Distribution Breakdown Details */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 font-display flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  Reparto Equitativo de Cuotas
                </h4>

                {billToView.tipo === "luz" ? (
                  (() => {
                    const split = calculateLuzSplit(billToView as BillLuz, readings);
                    return (
                      <div className="space-y-2 text-xs">
                        <p className="text-slate-450 text-[11px] leading-relaxed">
                          La cuota de electricidad se distribuye multiplicando el coste unitario del kW por los kWh consumidos por el sub-medidor de cada apartamento.
                        </p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* Apt A Split */}
                          <div className="p-2.5 bg-emerald-50/50 rounded border border-emerald-200/60 space-y-1.5">
                            <h5 className="font-bold text-slate-800 uppercase text-[9px] tracking-wider flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Apartamento A
                            </h5>
                            <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
                              <div className="flex justify-between">
                                <span>Consumo:</span>
                                <span className="font-bold text-slate-700">{split.kwhA.toFixed(1)} kWh</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Porcentaje:</span>
                                <span className="font-bold text-slate-700">{(split.pctA * 100).toFixed(0)}%</span>
                              </div>
                              <div className="flex justify-between border-t border-emerald-200/40 pt-1 mt-1 text-emerald-700 font-bold text-xs">
                                <span>Cuota Luz:</span>
                                <span>{split.totalA.toFixed(2)}€</span>
                              </div>
                            </div>
                          </div>

                          {/* Apt B Split */}
                          <div className="p-2.5 bg-blue-50/50 rounded border border-blue-200/60 space-y-1.5">
                            <h5 className="font-bold text-slate-800 uppercase text-[9px] tracking-wider flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span> Apartamento B
                            </h5>
                            <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
                              <div className="flex justify-between">
                                <span>Consumo:</span>
                                <span className="font-bold text-slate-700">{split.kwhB.toFixed(1)} kWh</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Porcentaje:</span>
                                <span className="font-bold text-slate-700">{(split.pctB * 100).toFixed(0)}%</span>
                              </div>
                              <div className="flex justify-between border-t border-blue-200/40 pt-1 mt-1 text-blue-700 font-bold text-xs">
                                <span>Cuota Luz:</span>
                                <span>{split.totalB.toFixed(2)}€</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const split = calculateAguaSplit(billToView as BillAgua);
                    return (
                      <div className="space-y-2 text-xs">
                        <p className="text-slate-450 text-[11px] leading-relaxed">
                          La cuota de agua se distribuye al 50% para cada vivienda al no poseer sub-medidores independientes de agua.
                        </p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {/* Apt A Split */}
                          <div className="p-2.5 bg-emerald-50/50 rounded border border-emerald-200/60 space-y-1.5">
                            <h5 className="font-bold text-slate-800 uppercase text-[9px] tracking-wider flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Apartamento A
                            </h5>
                            <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
                              <div className="flex justify-between border-t border-emerald-200/40 pt-1 mt-1 text-emerald-700 font-bold text-xs">
                                <span>Cuota Agua:</span>
                                <span>{split.totalA.toFixed(2)}€</span>
                              </div>
                            </div>
                          </div>

                          {/* Apt B Split */}
                          <div className="p-2.5 bg-blue-50/50 rounded border border-blue-200/60 space-y-1.5">
                            <h5 className="font-bold text-slate-800 uppercase text-[9px] tracking-wider flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span> Apartamento B
                            </h5>
                            <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
                              <div className="flex justify-between border-t border-blue-200/40 pt-1 mt-1 text-blue-700 font-bold text-xs">
                                <span>Cuota Agua:</span>
                                <span>{split.totalB.toFixed(2)}€</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              {billToView.tipo === "agua" && property ? (
                <WaterReportPDFButton
                  property={property}
                  billAgua={billToView as BillAgua}
                  label="Descargar Reporte PDF con Factura"
                />
              ) : <div></div>}
              <button
                onClick={() => setBillToView(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm transition font-sans"
              >
                Cerrar Detalles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomImageUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 max-w-2xl w-full relative shadow-2xl">
            <button
              onClick={() => setZoomImageUrl(null)}
              className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition cursor-pointer z-10"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-display">Foto Comprobante del Contador</h4>
              <div className="max-h-[70vh] overflow-auto rounded bg-slate-950 p-2 border border-slate-800">
                <img src={zoomImageUrl} alt="Contador ampliacion" className="w-full h-auto object-contain mx-auto rounded" />
              </div>
              <button
                onClick={() => setZoomImageUrl(null)}
                className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cerrar Visualizador
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
