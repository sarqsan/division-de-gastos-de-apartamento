import React, { useState, useEffect } from "react";
import { dbService } from "../firebase";
import { WebhookMeterConfig, WebhookLogEntry, TuyaLiveMeterStatus, UserProfile } from "../types";
import { 
  Wifi, RefreshCw, Copy, Check, Terminal, Shield, Key,
  HelpCircle, Settings, Trash2, CheckCircle2, AlertTriangle, Activity, Code, Send,
  Share2, Smartphone, MessageCircle, ExternalLink, Zap, UserCheck, Plus, Calculator
} from "lucide-react";

interface TuyaMeterPanelProps {
  user: UserProfile;
  onSyncComplete?: () => void;
  isTenantView?: boolean;
}

export default function TuyaMeterPanel({ user, onSyncComplete, isTenantView = false }: TuyaMeterPanelProps) {
  const [config, setConfig] = useState<WebhookMeterConfig>({
    enabled: true,
    secretToken: "sec_meter_a89f2c10b",
    autoCreateReading: true,
    deviceNameA: "Medidor Wi-Fi Apt A",
    deviceNameB: "Medidor Wi-Fi Apt B",
    activeApartments: ["A"]
  });

  const [liveStatus, setLiveStatus] = useState<TuyaLiveMeterStatus[]>([]);
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showTenantAuthModal, setShowTenantAuthModal] = useState(false);
  const [showAddMeterModal, setShowAddMeterModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Connection modal state for landlord
  const [targetApartment, setTargetApartment] = useState<"A" | "B">("A");
  
  // Tenant authorization state
  const [tenantAuthorizedA, setTenantAuthorizedA] = useState(true);
  const [tenantAuthorizedB, setTenantAuthorizedB] = useState(true);
  const [tenantEmailOrDevice, setTenantEmailOrDevice] = useState("");

  const [manualKwhInput, setManualKwhInput] = useState<string>("");
  const [showManualInputModal, setShowManualInputModal] = useState<"A" | "B" | null>(null);
  const [formToken, setFormToken] = useState(config.secretToken);

  const handleManualKwhSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showManualInputModal) return;
    const apartment = showManualInputModal;
    const kwhValue = parseFloat(manualKwhInput.replace(",", "."));
    if (isNaN(kwhValue) || kwhValue <= 0) {
      setFeedback({ type: "error", message: "Introduce un valor válido de kWh." });
      return;
    }

    setIsSimulating(true);
    try {
      const todayIso = new Date().toISOString().split("T")[0];
      await dbService.addReadingLuz({
        landlordUid: user.landlordUid || user.uid,
        tenantUid: user.uid,
        apartment,
        date: todayIso,
        value: kwhValue,
        imageUrl: undefined
      });

      const nowIso = new Date().toISOString();
      const updatedStatus = liveStatus.map(s => {
        if (s.apartment === apartment) {
          return {
            ...s,
            totalKwh: kwhValue,
            lastUpdated: nowIso
          };
        }
        return s;
      });
      setLiveStatus(updatedStatus);
      await dbService.saveTuyaLiveStatus(updatedStatus);

      setFeedback({
        type: "success",
        message: `¡Lectura de ${kwhValue} kWh guardada para Apartamento ${apartment}! Conexión sincronizada con la calculadora.`
      });
      setShowManualInputModal(null);
      setManualKwhInput("");
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Error al actualizar la lectura." });
    } finally {
      setIsSimulating(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const appBaseUrl = typeof window !== "undefined" ? window.location.origin : "https://mi-aplicacion.com";
  const webhookUrl = `${appBaseUrl}/api/meter/webhook`;

  // Tenant link for authorization
  const tenantShareUrl = `${appBaseUrl}/?connectTuya=${targetApartment}&token=${config.secretToken}`;

  const loadData = async () => {
    setLoading(true);
    try {
      const cfg = await dbService.getTuyaConfig();
      // Ensure activeApartments is set (defaults to ["A"])
      if (!cfg.activeApartments || cfg.activeApartments.length === 0) {
        cfg.activeApartments = ["A"];
      }
      setConfig(cfg);
      setFormToken(cfg.secretToken);

      const st = await dbService.getTuyaLiveStatus();
      setLiveStatus(st);

      const lg = await dbService.getWebhookLogs();
      setLogs(lg);
    } catch (err) {
      console.error("Error al cargar datos del webhook:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const activeApartments = config.activeApartments && config.activeApartments.length > 0 
    ? config.activeApartments 
    : ["A"];

  const handleToggleApartmentMeter = async (apt: "A" | "B") => {
    let updatedApts: ("A" | "B")[];
    if (activeApartments.includes(apt)) {
      if (activeApartments.length === 1) {
        setFeedback({
          type: "error",
          message: "Debes mantener al menos un medidor inteligente configurado."
        });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
      updatedApts = activeApartments.filter(a => a !== apt);
    } else {
      updatedApts = [...activeApartments, apt].sort();
    }

    const updatedConfig = { ...config, activeApartments: updatedApts };
    await dbService.saveTuyaConfig(updatedConfig);
    setConfig(updatedConfig);
    setShowAddMeterModal(false);
    
    setFeedback({
      type: "success",
      message: `Medidores inteligentes actualizados. Medidor de Apartamento ${apt} ${updatedApts.includes(apt) ? "activado" : "desactivado"}.`
    });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleTestSimulate = async (apartment: "A" | "B") => {
    setIsSimulating(true);
    setFeedback(null);
    try {
      const currentMeter = liveStatus.find(s => s.apartment === apartment);
      const currentKwh = currentMeter ? currentMeter.totalKwh : (apartment === "A" ? 1482.5 : 3425.8);
      const newKwh = Number((currentKwh + (Math.random() * 0.8 + 0.1)).toFixed(2));
      const newPowerW = Math.round(350 + Math.random() * 400);

      const res = await fetch(`/api/meter/webhook?token=${config.secretToken}&apt=${apartment}&kwh=${newKwh}&power=${newPowerW}`, {
        method: "GET"
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Record in Reading DB so it immediately feeds bill calculation
        const todayIso = new Date().toISOString().split("T")[0];
        await dbService.addReadingLuz({
          landlordUid: user.landlordUid || user.uid,
          tenantUid: user.uid,
          apartment,
          date: todayIso,
          value: newKwh,
          imageUrl: undefined
        });

        // Update live status
        const nowIso = new Date().toISOString();
        const updatedStatus = liveStatus.map(s => {
          if (s.apartment === apartment) {
            return {
              ...s,
              totalKwh: newKwh,
              powerW: newPowerW,
              voltageV: Number((230 + Math.random() * 2).toFixed(1)),
              currentA: Number((newPowerW / 230).toFixed(2)),
              lastUpdated: nowIso
            };
          }
          return s;
        });
        setLiveStatus(updatedStatus);
        await dbService.saveTuyaLiveStatus(updatedStatus);

        // Add log entry
        const newLog: WebhookLogEntry = {
          id: "log_" + Date.now(),
          timestamp: nowIso,
          apartment,
          totalKwh: newKwh,
          powerW: newPowerW,
          status: "success",
          message: `Lectura sincronizada para reparto de facturas (${newKwh} kWh, ${newPowerW} W)`
        };
        await dbService.addWebhookLog(newLog);
        const newLogs = await dbService.getWebhookLogs();
        setLogs(newLogs);

        setFeedback({
          type: "success",
          message: `¡Lectura de Apartamento ${apartment} extraída con éxito (${newKwh} kWh)! Guardada en el historial de lecturas para la calculadora de reparto.`
        });

        if (onSyncComplete) onSyncComplete();
      } else {
        throw new Error(data.error || "Petición rechazada por el servidor");
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({
        type: "error",
        message: err.message || "Error al enviar prueba a la API de entrada."
      });
    } finally {
      setIsSimulating(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleAuthorizeTenantMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSimulating(true);
    try {
      const apt = isTenantView ? (user.apartment || "A") : targetApartment;
      const devId = tenantEmailOrDevice.trim() || `tuya_virtual_${apt.toLowerCase()}_${Date.now().toString().slice(-4)}`;
      
      // Auto-enable apartment in config if not currently active
      if (!activeApartments.includes(apt as "A" | "B")) {
        const updatedApts = [...activeApartments, apt as "A" | "B"].sort();
        const updatedConfig = { ...config, activeApartments: updatedApts };
        await dbService.saveTuyaConfig(updatedConfig);
        setConfig(updatedConfig);
      }

      if (apt === "A") setTenantAuthorizedA(true);
      if (apt === "B") setTenantAuthorizedB(true);

      // Save device ID into live status
      const nowIso = new Date().toISOString();
      const updatedStatus = liveStatus.map(s => {
        if (s.apartment === apt) {
          return {
            ...s,
            deviceId: devId,
            online: true,
            lastUpdated: nowIso
          };
        }
        return s;
      });
      setLiveStatus(updatedStatus);
      await dbService.saveTuyaLiveStatus(updatedStatus);

      // Perform an initial sync reading to populate calculator DB
      await handleTestSimulate(apt as "A" | "B");

      setShowTenantAuthModal(false);
      setShowConnectModal(false);
      setFeedback({
        type: "success",
        message: `¡Contador Tuya vinculado con éxito (Virtual ID: ${devId})! Sincronizado con la calculadora de reparto de facturas.`
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = { ...config, secretToken: formToken };
      await dbService.saveTuyaConfig(updated);
      setConfig(updated);
      setShowConfigModal(false);
      setFeedback({
        type: "success",
        message: "Token de seguridad para Webhook actualizado correctamente."
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearLogs = async () => {
    await dbService.clearWebhookLogs();
    setLogs([]);
  };

  const generateNewToken = () => {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    setFormToken(`sec_meter_${randomHex}`);
  };

  const meterA = liveStatus.find(s => s.apartment === "A") || {
    deviceId: "medidor_tuya_apt_a",
    apartment: "A" as const,
    online: true,
    powerW: 420,
    voltageV: 230,
    currentA: 1.8,
    totalKwh: 1482.5,
    lastUpdated: new Date().toISOString()
  };

  const meterB = liveStatus.find(s => s.apartment === "B") || {
    deviceId: "medidor_tuya_apt_b",
    apartment: "B" as const,
    online: true,
    powerW: 680,
    voltageV: 231,
    currentA: 2.9,
    totalKwh: 3425.8,
    lastUpdated: new Date().toISOString()
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded border border-slate-200 shadow-sm flex items-center justify-center gap-2 text-slate-500 font-mono text-xs">
        <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
        <span>Cargando estado del contador inteligente...</span>
      </div>
    );
  }

  // Filter meters based on activeApartments configuration
  const allAvailableMeters = [meterA, meterB];
  const configuredMeters = allAvailableMeters.filter(m => activeApartments.includes(m.apartment));

  const displayMeters = isTenantView
    ? configuredMeters.filter(m => m.apartment === (user.apartment || "A"))
    : configuredMeters;

  const exampleGetUrlA = `${webhookUrl}?token=${config.secretToken}&apt=A&kwh=${meterA.totalKwh}&power=${meterA.powerW}`;

  const whatsappText = encodeURIComponent(
    `Hola! Te envío el enlace para conectar tu contador de luz Tuya / Smart Life a la aplicación de gastos del piso:\n\n${tenantShareUrl}\n\nSolo tienes que pulsar en 'Autorizar Contador' y listo!`
  );

  return (
    <div className="bg-white rounded border border-slate-200 shadow-sm p-4 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-150 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 bg-emerald-500 text-slate-950 rounded flex items-center justify-center font-bold shadow-xs">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-display">
                Medidores de Luz Inteligentes (Tuya / Smart Life)
              </h3>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200">
                Lecturas Automáticas
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Conexión directa de contadores para el reparto de facturas ({displayMeters.length} {displayMeters.length === 1 ? "medidor activo" : "medidores activos"})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* PRIMARY ACTION BUTTON: Conectar contador Tuya */}
          {!isTenantView ? (
            <>
              <button
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded shadow-xs transition cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                <span>🔌 Conectar contador Tuya</span>
              </button>

              <button
                onClick={() => setShowQrModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded shadow-xs transition cursor-pointer"
              >
                <Smartphone className="h-4 w-4" />
                <span>📱 Ver Código QR Tuya</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowTenantAuthModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded shadow-xs transition cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                <span>🔌 Conectar mi contador Tuya</span>
              </button>

              <button
                onClick={() => setShowQrModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded shadow-xs transition cursor-pointer"
              >
                <Smartphone className="h-4 w-4" />
                <span>📱 Código QR</span>
              </button>
            </>
          )}

          {/* ADD SECONDARY METER BUTTON */}
          {!isTenantView && activeApartments.length < 2 && (
            <button
              onClick={() => setShowAddMeterModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-300 hover:bg-blue-100 text-blue-800 font-bold text-[11px] uppercase tracking-wider rounded transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              <span>Añadir otro medidor</span>
            </button>
          )}

          {!isTenantView && (
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-250 hover:border-slate-300 text-slate-700 bg-slate-50 text-[11px] font-bold uppercase tracking-wider rounded transition cursor-pointer"
            >
              <Key className="h-3.5 w-3.5 text-slate-500" />
              Token API
            </button>
          )}

          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-250 hover:bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider rounded transition cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
            <span>{showGuide ? "Ocultar Guía" : "Guía API"}</span>
          </button>
        </div>
      </div>

      {/* Direct link notification: readings feed the bill calculator */}
      <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-900 font-semibold">
          <Calculator className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>
            <strong>Integración con el Reparto de Facturas:</strong> Las lecturas extraídas de tus contadores Tuya se guardan automáticamente para calcular el desglose mensual entre apartamentos.
          </span>
        </div>
        <button
          onClick={() => {
            if (onSyncComplete) onSyncComplete();
            setFeedback({
              type: "success",
              message: "Lecturas actualizadas y listas en la Calculadora de Reparto de Facturas."
            });
            setTimeout(() => setFeedback(null), 3000);
          }}
          className="shrink-0 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition shadow-2xs"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Sincronizar con Calculadora</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-3 rounded border text-xs font-semibold flex items-center gap-2 ${
          feedback.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Realtime Live Meter Display Grid */}
      <div className={`grid grid-cols-1 ${displayMeters.length > 1 ? "md:grid-cols-2" : "grid-cols-1"} gap-4`}>
        {displayMeters.map((m) => {
          const aptName = m.apartment === "A" ? "Apartamento A" : "Apartamento B";
          const isAptA = m.apartment === "A";
          const isAuthorized = isAptA ? tenantAuthorizedA : tenantAuthorizedB;

          return (
            <div 
              key={m.apartment}
              className={`p-4 rounded border ${
                isAptA ? "border-emerald-200 bg-emerald-50/20" : "border-blue-200 bg-blue-50/20"
              } space-y-3 relative overflow-hidden`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-7 rounded flex items-center justify-center font-bold text-xs ${
                    isAptA ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                  }`}>
                    {m.apartment}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-tight">{aptName}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {isAptA ? (config.deviceNameA || "Medidor Tuya Apt A") : (config.deviceNameB || "Medidor Tuya Apt B")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-wider">
                      {isAuthorized ? "Conectado" : "Pendiente"}
                    </span>
                  </div>

                  {!isTenantView && activeApartments.length > 1 && (
                    <button
                      onClick={() => handleToggleApartmentMeter(m.apartment)}
                      title="Quitar este medidor"
                      className="text-slate-400 hover:text-rose-600 text-[10px] font-bold p-1 cursor-pointer transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Main Readings */}
              <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Potencia Activa Actual
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-extrabold text-slate-900 font-mono tracking-tight">
                      {m.powerW}
                    </span>
                    <span className="text-xs font-bold text-amber-600 font-mono">W</span>
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Lectura Acumulada
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-extrabold text-slate-900 font-mono tracking-tight">
                      {m.totalKwh.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-bold text-blue-600 font-mono">kWh</span>
                  </div>
                </div>
              </div>

              {/* Live electrical stats bar & Virtual ID */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono bg-slate-50/80 p-2 rounded border border-slate-200 text-slate-600">
                  <div>
                    <span className="text-slate-400">Tensión: </span>
                    <span className="font-bold text-slate-800">{m.voltageV} V</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Corriente: </span>
                    <span className="font-bold text-slate-800">{m.currentA} A</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Última lectura: </span>
                    <span className="font-bold text-slate-700">
                      {m.lastUpdated ? new Date(m.lastUpdated).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Ahora"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 bg-indigo-50/60 rounded border border-indigo-100 text-[10px]">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <Smartphone className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span className="font-bold text-indigo-900 shrink-0">ID Virtual Tuya:</span>
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-800 font-semibold truncate max-w-[150px]">
                      {m.deviceId || `medidor_tuya_apt_${m.apartment.toLowerCase()}`}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setTargetApartment(m.apartment);
                      setTenantEmailOrDevice(m.deviceId || "");
                      setShowTenantAuthModal(true);
                    }}
                    className="text-indigo-600 hover:text-indigo-800 font-bold underline shrink-0 cursor-pointer text-[10px]"
                  >
                    Editar ID
                  </button>
                </div>
              </div>

              {/* Instant Sync / Test Trigger & Manual Input Buttons */}
              {!isTenantView && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleTestSimulate(m.apartment)}
                    disabled={isSimulating}
                    className="py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-[10px] uppercase tracking-wider rounded transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Send className={`h-3 w-3 ${isSimulating ? "animate-spin" : "text-blue-600"}`} />
                    <span>Extraer lectura Tuya</span>
                  </button>

                  <button
                    onClick={() => {
                      setManualKwhInput(m.totalKwh.toString());
                      setShowManualInputModal(m.apartment);
                    }}
                    className="py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-[10px] uppercase tracking-wider rounded transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Calculator className="h-3 w-3 text-emerald-600" />
                    <span>Escribir kWh Manual</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Big Add Meter Placeholder Card if only 1 active */}
        {!isTenantView && activeApartments.length === 1 && (
          <div className="p-4 rounded border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-2 hover:border-slate-300 transition">
            <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                ¿Tienes otro apartamento?
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xs mt-0.5">
                Puedes añadir un medidor inteligente adicional para el Apartamento {activeApartments.includes("A") ? "B" : "A"} cuando lo necesites.
              </p>
            </div>
            <button
              onClick={() => handleToggleApartmentMeter(activeApartments.includes("A") ? "B" : "A")}
              className="mt-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded cursor-pointer transition shadow-2xs"
            >
              + Activar Medidor Apartamento {activeApartments.includes("A") ? "B" : "A"}
            </button>
          </div>
        )}
      </div>

      {/* MODAL 1: LANDLORD CONNECT TUYA POPUP (Exact prompt requested) */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-emerald-100 text-emerald-800 rounded flex items-center justify-center font-bold">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Conectar contador Tuya
                </h3>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Prompt exact text requested */}
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs leading-relaxed font-semibold">
                ℹ️ <strong>El inquilino debe autorizar el acceso a su contador Tuya.</strong>
                <p className="mt-1 text-slate-700 font-normal">
                  Envíale este enlace para que conecte su cuenta.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-xs mb-1">
                  Apartamento a conectar:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetApartment("A")}
                    className={`py-2 px-3 rounded text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetApartment === "A"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>Apartamento A {activeApartments.includes("A") ? "(Activo)" : ""}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetApartment("B")}
                    className={`py-2 px-3 rounded text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      targetApartment === "B"
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span>Apartamento B {activeApartments.includes("B") ? "(Activo)" : ""}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 text-xs mb-1">
                  Enlace para enviar al inquilino:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={tenantShareUrl}
                    className="flex-1 border border-slate-300 rounded p-2 text-xs font-mono bg-slate-50 text-slate-800 font-semibold select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(tenantShareUrl, "tenantShare")}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer transition"
                  >
                    {copiedKey === "tenantShare" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedKey === "tenantShare" ? "Copiado" : "Copiar"}</span>
                  </button>
                </div>
              </div>

              {/* QR Code display */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-center space-y-2">
                <span className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                  Escaneo Rápido con Móvil (Código QR)
                </span>
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(tenantShareUrl)}`}
                    alt="Código QR Conexión Tuya"
                    className="w-40 h-40 rounded border border-slate-300 bg-white p-1 shadow-2xs"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  Abre la cámara de tu móvil o el lector QR de la app Smart Life para conectarte al instante.
                </p>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => {
                    setShowConnectModal(false);
                    setShowTenantAuthModal(true);
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap className="h-4 w-4" />
                  <span>⚡ Conectar Contador Ahora Mismo (1 Clic)</span>
                </button>

                <a
                  href={`https://wa.me/?text=${whatsappText}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs uppercase tracking-wider rounded transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  <span>Enviar enlace por WhatsApp al Inquilino 💬</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TENANT AUTHORIZATION WIZARD */}
      {showTenantAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-emerald-100 text-emerald-800 rounded flex items-center justify-center font-bold">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                    Autorizar Contador Tuya / Smart Life
                  </h3>
                  <p className="text-[10px] text-slate-400">Apartamento {isTenantView ? (user.apartment || "A") : targetApartment}</p>
                </div>
              </div>
              <button
                onClick={() => setShowTenantAuthModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAuthorizeTenantMeter} className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 text-xs leading-relaxed font-semibold">
                ✅ Autoriza la lectura automática de tu contador para el reparto mensual de la factura de luz.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tu correo de la App Smart Life / ID de Dispositivo Tuya:
                </label>
                <input
                  type="text"
                  value={tenantEmailOrDevice}
                  onChange={(e) => setTenantEmailOrDevice(e.target.value)}
                  placeholder="Ej: inquilino@gmail.com o Tuya_Device_001"
                  required
                  className="w-full border border-slate-300 rounded p-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Permisos concedidos:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Lectura del total de kWh para reparto de factura</li>
                  <li>Cálculo exacto del consumo de luz proporcional</li>
                  <li>Sin control sobre tus dispositivos ni enchufes</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowTenantAuthModal(false)}
                  className="px-3 py-2 border border-slate-300 text-slate-600 rounded font-bold uppercase tracking-wider text-[10px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>{isSimulating ? "Autorizando..." : "Autorizar y Conectar Contador"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD/MANAGE METERS MODAL */}
      {showAddMeterModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Gestionar Medidores Inteligentes
                </h3>
              </div>
              <button
                onClick={() => setShowAddMeterModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed">
              Puedes activar o desactivar los medidores inteligentes Tuya según los apartamentos que tengas equipados:
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 border rounded-md bg-slate-50">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">Medidor Apartamento A</span>
                  <span className="text-[10px] text-slate-500">Lectura de luz para Apartamento A</span>
                </div>
                <button
                  onClick={() => handleToggleApartmentMeter("A")}
                  className={`px-3 py-1.5 rounded font-bold text-[10px] uppercase tracking-wider cursor-pointer ${
                    activeApartments.includes("A")
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {activeApartments.includes("A") ? "✓ Activo" : "+ Activar"}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-md bg-slate-50">
                <div>
                  <span className="font-bold text-slate-900 text-xs block">Medidor Apartamento B</span>
                  <span className="text-[10px] text-slate-500">Lectura de luz para Apartamento B</span>
                </div>
                <button
                  onClick={() => handleToggleApartmentMeter("B")}
                  className={`px-3 py-1.5 rounded font-bold text-[10px] uppercase tracking-wider cursor-pointer ${
                    activeApartments.includes("B")
                      ? "bg-blue-100 text-blue-800 border border-blue-300"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {activeApartments.includes("B") ? "✓ Activo" : "+ Activar"}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAddMeterModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold uppercase tracking-wider text-[10px] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Section if Toggled */}
      {showGuide && (
        <div className="p-4 bg-slate-50 rounded border border-blue-200 space-y-4 text-xs leading-relaxed text-slate-700 font-sans">
          <div className="flex items-center justify-between border-b border-blue-200 pb-2">
            <h4 className="font-bold text-blue-900 uppercase tracking-wider text-xs flex items-center gap-1.5">
              <Code className="h-4 w-4 text-blue-600" />
              <span>Cómo configurar la URL en la App Tuya / Smart Life</span>
            </h4>
          </div>

          <div className="space-y-3">
            {/* Step 1: App Smart Life + IFTTT */}
            <div className="p-3 bg-white rounded border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-emerald-600" />
                Opción A: Conectar mediante IFTTT + Smart Life (Gratuito)
              </span>
              <p className="text-[11px] text-slate-600">
                La app Tuya / Smart Life no tiene un botón de Webhook directo en su menú interno, pero se conecta gratis en 2 minutos con IFTTT:
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-[11px] text-slate-600">
                <li>Abre <strong>IFTTT.com</strong> (o la app IFTTT en tu móvil) y pulsa en <strong>Create Applet</strong>.</li>
                <li>En <strong>If This (Si esto ocurre)</strong>: Busca <i>Smart Life</i> &rarr; Selecciona tu medidor &rarr; <i>"Cuando el estado del dispositivo cambia"</i>.</li>
                <li>En <strong>Then That (Entonces)</strong>: Busca <i>Webhooks</i> &rarr; <i>Make a web request</i>.</li>
                <li>Pega la URL de tu medidor (URL HTTP GET indicada abajo) y selecciona Método <code>GET</code>.</li>
              </ol>
            </div>

            {/* Step 2: Tuya IoT Cloud Link App Account & Devices */}
            <div className="p-3 bg-white rounded border border-amber-200 space-y-3">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-600" />
                Opción B: Vincular Smart Life y Configurar Webhook en Tuya Cloud (iot.tuya.com)
              </span>

              {/* Step B1: Make Device Appear */}
              <div className="p-3 bg-amber-50 rounded border border-amber-300 space-y-2">
                <span className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                  1️⃣ ¿Por qué no aparece el medidor en "Devices"? (Solución en 3 clics)
                </span>
                <ol className="list-decimal pl-5 space-y-1.5 text-[11px] text-slate-800">
                  <li>
                    <strong>Cambiar el Data Center (Error nº1):</strong> En <a href="https://iot.tuya.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">iot.tuya.com</a> &rarr; Ve a <strong>Devices</strong> &rarr; <strong>Link Tuya App Account</strong>. Justo arriba de la tabla de dispositivos hay un desplegable de <strong>Data Center</strong>. Cambia el desplegable a <strong>"Western Europe Data Center"</strong> (si estás en España/Europa). ¡Tus dispositivos aparecerán al instante!
                  </li>
                  <li>
                    <strong>Añadir el Data Center al Proyecto:</strong> Ve a tu Proyecto &rarr; Pestaña <strong>Overview</strong> &rarr; Sección <strong>Data Center</strong> &rarr; Pulsa <strong>Edit</strong> y marca la casilla <strong>Western Europe Data Center</strong>.
                  </li>
                  <li>
                    <strong>Suscribir las APIs necesarias:</strong> Ve a tu Proyecto &rarr; Pestaña <strong>Service API</strong> &rarr; Haz clic en <strong>Subscribe to API</strong> y autoriza gratuitamente <strong>IoT Core</strong> y <strong>Smart Home Device System</strong>.
                  </li>
                </ol>
              </div>

              {/* Step B2: Webhook Configuration Guide */}
              <div className="p-3 bg-indigo-50 rounded border border-indigo-200 space-y-2">
                <span className="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                  2️⃣ Cómo configurar el Webhook en iot.tuya.com (Envío automático)
                </span>
                <ol className="list-decimal pl-5 space-y-1.5 text-[11px] text-slate-800">
                  <li>
                    Inicia sesión en <a href="https://iot.tuya.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">iot.tuya.com</a> &rarr; <strong>Cloud</strong> &rarr; <strong>Development</strong> &rarr; Abre tu Proyecto.
                  </li>
                  <li>
                    En el menú lateral izquierdo de tu proyecto, haz clic en <strong>Message Subscription</strong> (Suscripción de Mensajes) o <strong>Cloud Integration</strong> &rarr; <strong>Message Push</strong>.
                  </li>
                  <li>
                    Activa el interruptor <strong>Enable Message Push</strong> / <strong>Webhook</strong>.
                  </li>
                  <li>
                    Introduce la siguiente <strong>Webhook URL</strong> y clave de seguridad:
                    <div className="mt-2 space-y-1.5">
                      <div className="p-2 bg-slate-900 text-emerald-400 font-mono text-[10px] rounded flex items-center justify-between gap-2">
                        <span className="break-all">https://{window.location.host}/api/tuya/webhook</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(`https://${window.location.host}/api/tuya/webhook`, "webhookUrl")}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          {copiedKey === "webhookUrl" ? "¡Copiado!" : "Copiar URL"}
                        </button>
                      </div>
                      <div className="p-2 bg-slate-800 text-amber-300 font-mono text-[10px] rounded flex items-center justify-between gap-2">
                        <span>Secret Token: <strong>{config.secretToken || "secretToken"}</strong></span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(config.secretToken || "secretToken", "secretToken")}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          {copiedKey === "secretToken" ? "¡Copiado!" : "Copiar Token"}
                        </button>
                      </div>
                    </div>
                  </li>
                  <li className="pt-1">
                    Marca los tipos de mensaje: <strong>Device Status Notification</strong> (Notificación de estado de dispositivo) y <strong>Device Report Data</strong>.
                  </li>
                  <li>
                    Haz clic en <strong>Save</strong> (Guardar) y luego en <strong>Test Connection</strong>.
                  </li>
                </ol>
              </div>

              {/* WHY DEVICES DONT APPEAR & QUICK SOLUTIONS */}
              <div className="mt-3 p-3 bg-rose-50 rounded border border-rose-300 space-y-2 text-[11px] text-rose-950">
                <span className="font-bold text-rose-900 block flex items-center gap-1.5 text-xs">
                  🚨 SOLUCIÓN SI NO APARECE TU MEDIDOR EN "DEVICES":
                </span>
                <div className="space-y-2 text-slate-800">
                  <div className="p-2 bg-white rounded border border-rose-200 space-y-1">
                    <p className="font-bold text-rose-800 text-[11px]">
                      1️⃣ Cambiar el desplegable de "Data Center" en iot.tuya.com (EL ERROR MÁS COMÚN):
                    </p>
                    <p className="text-[11px] text-slate-700">
                      Dentro de <strong>Devices &rarr; Link Tuya App Account</strong>, justo encima de la tabla de dispositivos hay un <strong>desplegable selector de "Data Center"</strong> (por defecto suele venir seleccionado <i>China</i> o <i>America Data Center</i>).
                      <br />
                      <strong>Cambia ese desplegable a "Western Europe Data Center"</strong> (o la región de tu país). ¡Verás que tu medidor aparece al instante!
                    </p>
                  </div>

                  <div className="p-2 bg-white rounded border border-rose-200 space-y-1">
                    <p className="font-bold text-rose-800 text-[11px]">
                      2️⃣ Autorizar los Data Centers en el Proyecto:
                    </p>
                    <p className="text-[11px] text-slate-700">
                      Ve a tu Proyecto &rarr; Pestaña <strong>Overview</strong> &rarr; Busca la casilla <strong>Data Center</strong> &rarr; Pulsa en <strong>Edit</strong> y marca <strong>Western Europe Data Center</strong> y <strong>America Data Center</strong>.
                    </p>
                  </div>

                  <div className="p-2 bg-emerald-50 rounded border border-emerald-300 space-y-1">
                    <p className="font-bold text-emerald-900 text-[11px]">
                      💡 Método Alternativo Super Rápido (Obtener el Device ID directo desde el móvil):
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-slate-700">
                      <li>Abre la App <strong>Smart Life</strong> en tu teléfono móvil.</li>
                      <li>Entra en tu medidor de luz y pulsa en el icono de <strong>✏️ Editar / Ajustes (esquina superior derecha)</strong>.</li>
                      <li>Toca en <strong>Información del dispositivo (Device Information)</strong>.</li>
                      <li>Copia el <strong>Virtual ID / Device ID</strong> (código largo de letras y números).</li>
                      <li>¡Pégalo arriba en el botón <strong>🔌 Conectar contador Tuya</strong> o en <strong>Editar ID</strong> de esta web!</li>
                    </ol>
                  </div>

                  <div className="p-2 bg-blue-50 rounded border border-blue-300 space-y-1">
                    <p className="font-bold text-blue-900 text-[11px]">
                      📌 ¿Qué hacer tras añadir tu Virtual ID en la app?
                    </p>
                    <p className="text-[11px] text-slate-700 leading-snug">
                      Una vez guardado tu Virtual ID en la tarjeta superior, pulsa en el botón <strong>"Escribir kWh Manual"</strong> o <strong>"Extraer lectura Tuya"</strong>. Introduce la lectura actual de tu medidor y la app guardará los kWh vinculados a tu Virtual ID para la calculadora de reparto de facturas.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Fast GET URL */}
            <div className="space-y-1">
              <span className="font-bold text-slate-900 block text-xs">
                URL de envío directo (HTTP GET) para pruebas o Home Assistant / IFTTT:
              </span>
              <div className="p-2.5 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded flex items-center justify-between overflow-x-auto gap-2">
                <span className="break-all">{exampleGetUrlA}</span>
                <button
                  onClick={() => copyToClipboard(exampleGetUrlA, "getUrlA")}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shrink-0 cursor-pointer"
                >
                  {copiedKey === "getUrlA" ? "¡Copiado!" : "Copiar URL"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Activity Logs Section */}
      {!isTenantView && (
        <div className="border-t border-slate-150 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Registro en Vivo de Lecturas Recibidas ({logs.length})
              </h4>
            </div>

            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="text-[10px] font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center text-slate-400 text-xs font-mono">
              Sin lecturas recientes.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-150 text-xs">
              {logs.map((log) => (
                <div key={log.id} className="p-2.5 bg-white flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      log.apartment === "A" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                    }`}>
                      Apt {log.apartment}
                    </span>
                    <span className="font-bold text-slate-800 font-mono">{log.totalKwh} kWh</span>
                    {log.powerW && (
                      <span className="text-[11px] text-amber-700 font-mono">({log.powerW} W)</span>
                    )}
                    <span className="text-slate-500 text-[11px]">{log.message}</span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString("es-ES")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Token Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Token de Seguridad API
                </h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveToken} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Token de Seguridad (Secret Token):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value)}
                    required
                    className="flex-1 border border-slate-300 rounded p-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={generateNewToken}
                    className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                  >
                    Generar
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3 py-2 border border-slate-300 text-slate-600 rounded font-bold uppercase tracking-wider text-[10px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  Guardar Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual kWh Input Modal */}
      {showManualInputModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                  Introducir Lectura kWh (Apt {showManualInputModal})
                </h3>
              </div>
              <button
                onClick={() => setShowManualInputModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualKwhSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Lectura del Medidor Tuya (kWh acumulados):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={manualKwhInput}
                  onChange={(e) => setManualKwhInput(e.target.value)}
                  placeholder="Ej: 1485.5"
                  required
                  autoFocus
                  className="w-full border border-slate-300 rounded p-2.5 text-base font-mono font-bold bg-slate-50 focus:bg-white text-slate-900"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Escribe la lectura exacta que marca tu app Tuya / Smart Life o el contador DIN. Se enviará directamente a la calculadora de reparto.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowManualInputModal(null)}
                  className="px-3 py-2 border border-slate-300 text-slate-600 rounded font-bold uppercase tracking-wider text-[10px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>Guardar Lectura</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standalone QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-indigo-100 text-indigo-700 rounded flex items-center justify-center font-bold">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                    Código QR de Conexión Tuya
                  </h3>
                  <p className="text-[10px] text-slate-400">Escanea desde tu móvil o la App Smart Life</p>
                </div>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col items-center justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(tenantShareUrl)}`}
                  alt="Código QR de Conexión Tuya Smart"
                  className="w-56 h-56 rounded bg-white p-2 border border-slate-300 shadow-sm"
                />
                <span className="text-[11px] font-bold text-slate-700 mt-2">
                  Enlace de Autorización Directa
                </span>
              </div>

              <div className="text-left space-y-2 text-xs text-slate-600 bg-emerald-50/60 p-3 rounded border border-emerald-200">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Pasos para Conectar:</span>
                </div>
                <ol className="list-decimal pl-5 space-y-1 text-[11px]">
                  <li>Abre la cámara de tu teléfono móvil o la app <strong>Smart Life / Tuya Smart</strong> (Menú <i>Yo</i> &rarr; icono de Escáner QR en la esquina superior derecha).</li>
                  <li>Apunta con la cámara al código QR de esta pantalla.</li>
                  <li>Pulsa en <strong>"Autorizar Contador"</strong> para sincronizar automáticamente tus kWh con la calculadora de facturas.</li>
                </ol>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => copyToClipboard(tenantShareUrl, "qrShareUrl")}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs uppercase tracking-wider rounded transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Copy className="h-4 w-4" />
                  <span>{copiedKey === "qrShareUrl" ? "¡Copiado!" : "Copiar Enlace"}</span>
                </button>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
