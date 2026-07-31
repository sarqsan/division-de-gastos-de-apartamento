import React, { useState, useRef, useEffect } from "react";
import { Upload, Sparkles, X, Check, Calendar, DollarSign, Zap, Droplet, AlertTriangle, FileText, Image as ImageIcon } from "lucide-react";
import { fileToImageDataUrl } from "../utils/pdfToImage";

interface BillParserModalProps {
  onClose: () => void;
  initialServiceType?: "luz" | "agua";
  onSave: (billData: {
    tipo: "luz" | "agua";
    startDate: string;
    endDate: string;
    totalAmount: number;
    totalKwh: number;
    fixedCost: number;
    variableCost: number;
    totalVolume: number;
    fileUrl?: string;
  }) => void;
}

export default function BillParserModal({ onClose, onSave, initialServiceType }: BillParserModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Parsed and editable state
  const [parsed, setParsed] = useState(false);
  const [tipo, setTipo] = useState<"luz" | "agua">(initialServiceType || "luz");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalKwh, setTotalKwh] = useState<number>(0);
  const [fixedCost, setFixedCost] = useState<number>(0);
  const [variableCost, setVariableCost] = useState<number>(0);
  const [totalVolume, setTotalVolume] = useState<number>(0);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [fileDataUrl, setFileDataUrl] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatically process file to image data URL whenever file changes
  useEffect(() => {
    if (file) {
      fileToImageDataUrl(file)
        .then((dataUrl) => {
          setFileDataUrl(dataUrl);
        })
        .catch((err) => {
          console.error("Error processing file to data URL:", err);
        });
    } else {
      setFileDataUrl(undefined);
    }
  }, [file]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  // Submit file to Express server proxy for Gemini parsing
  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);

    try {
      // Convert file (PDF, HEIC, WEBP, PNG, JPG, etc.) to normalized JPEG image Data URL
      const convertedDataUrl = await fileToImageDataUrl(file);
      setFileDataUrl(convertedDataUrl);
      
      const response = await fetch("/api/parse-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileBase64: convertedDataUrl || (await fileToBase64(file)),
          mimeType: "image/jpeg",
          fileName: file.name,
          forcedServiceType: initialServiceType
        })
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "Error al analizar la factura");
      }

      const extracted = resJson.data;

      // Update state with parsed values
      setTipo(initialServiceType || (extracted.tipo === "agua" ? "agua" : "luz"));
      setStartDate(extracted.startDate || "");
      setEndDate(extracted.endDate || "");
      setTotalAmount(extracted.totalAmount || 0);
      setTotalKwh(extracted.totalKwh || 0);
      setFixedCost(extracted.fixedCost || 0);
      setVariableCost(extracted.variableCost || 0);
      setTotalVolume(extracted.totalVolume || 0);
      setIsQuotaExceeded(!!extracted.isQuotaExceeded);
      setIsApiKeyMissing(!!extracted.isApiKeyMissing || (extracted.errorMessage && extracted.errorMessage.includes("GEMINI_API_KEY")));
      setIsSimulated(!!extracted.isSimulated);

      setParsed(true);
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "";
      if (msg.includes("GEMINI_API_KEY")) {
        setIsApiKeyMissing(true);
      }
      setError(
        msg || 
        "Hubo un error al conectar con la IA de Gemini. Verifica la variable GEMINI_API_KEY en Render o ingresa los datos manualmente."
      );
    } finally {
      setParsing(false);
    }
  };

  const handleManualEntry = () => {
    setTipo(initialServiceType || "luz");
    setStartDate(new Date().toISOString().split("T")[0]);
    // default 30 days after
    const end = new Date();
    end.setDate(end.getDate() + 30);
    setEndDate(end.toISOString().split("T")[0]);
    setTotalAmount(150);
    setTotalKwh(300);
    setFixedCost(40);
    setVariableCost(110);
    setTotalVolume(0);
    setIsQuotaExceeded(false);
    setIsSimulated(false);
    setParsed(true);
  };

  const handleSave = () => {
    if (!startDate || !endDate || totalAmount <= 0) {
      setError("Por favor, rellene las fechas y el importe total.");
      return;
    }

    onSave({
      tipo,
      startDate,
      endDate,
      totalAmount,
      totalKwh,
      fixedCost,
      variableCost,
      totalVolume,
      fileUrl: fileDataUrl
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded w-full max-w-md overflow-hidden shadow-2xl border border-slate-300 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-blue-100 text-blue-700 rounded flex items-center justify-center border border-blue-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-display">Añadir Nueva Factura</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
 
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!parsed ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 leading-normal">
                Sube una imagen o archivo PDF de la factura. Nuestra IA Gemini extraerá automáticamente las fechas, consumos y costes para facilitarte el reparto.
              </p>
 
              {/* Drag and drop zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition ${
                  dragActive 
                    ? "border-blue-500 bg-blue-50/20" 
                    : "border-slate-250 hover:border-blue-400 hover:bg-slate-50/50"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.bmp,.tiff,.tif"
                  className="hidden"
                />
                <div className="mx-auto h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-2">
                  <Upload className="h-5 w-5" />
                </div>
                {file ? (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-800">{file.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-800">Arrastra tu factura aquí o haz clic</p>
                    <p className="text-[10px] text-slate-450">Soporta PDF, JPG, PNG, WEBP, HEIC, TIFF y más formatos</p>
                  </div>
                )}
              </div>
 
              {isApiKeyMissing && (
                <div className="p-3 bg-red-50 rounded border border-red-300 text-red-950 text-[11px] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-red-800 text-xs">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    🚨 Falta añadir GEMINI_API_KEY en Render
                  </div>
                  <p className="text-slate-700 leading-snug">
                    Para que la IA procese facturas automáticamente en tu web desplegada en Render:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-800 text-[10.5px]">
                    <li>Entra en tu panel de <a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">dashboard.render.com</a>.</li>
                    <li>Abre tu Web Service (<strong>reparto-gastos-luz-agua</strong>).</li>
                    <li>En el menú izquierdo, haz clic en <strong>Environment</strong>.</li>
                    <li>Pulsa <strong>Add Environment Variable</strong>.</li>
                    <li>Clave (Key): <code className="bg-white px-1 py-0.5 rounded border border-red-200 font-bold text-red-900">GEMINI_API_KEY</code></li>
                    <li>Valor (Value): Tu clave de Gemini (obtén una gratis en <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">aistudio.google.com</a>).</li>
                    <li>Pulsa <strong>Save Changes</strong>. Render se actualizará solo.</li>
                  </ol>
                </div>
              )}

              {error && !isApiKeyMissing && (
                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-amber-800 text-[11px] flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Nota de la IA: </span>
                    {error}
                  </div>
                </div>
              )}
 
              {parsing ? (
                <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center space-y-2">
                  <div className="relative mx-auto h-8 w-8">
                    <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-xs font-bold text-slate-800">Analizando factura con Gemini AI...</p>
                  <p className="text-[10px] text-slate-400">Extrayendo fechas de consumo, potencia, kWh e importe total</p>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleParse}
                    disabled={!file}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 text-white rounded font-bold uppercase tracking-wider text-[10px] hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Analizar con Gemini
                  </button>
                  <button
                    onClick={handleManualEntry}
                    className="flex-1 py-2 px-3 border border-slate-250 text-slate-700 rounded font-bold uppercase tracking-wider text-[10px] hover:bg-slate-50 transition cursor-pointer"
                  >
                    Ingreso Manual
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Editing / Reviewing Form */
            <div className="space-y-3">
              {isApiKeyMissing ? (
                <div className="p-3 bg-red-50 rounded border border-red-300 text-red-950 text-[11px] space-y-1.5 mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-red-800 text-xs">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    🚨 Falta configurar GEMINI_API_KEY en Render
                  </div>
                  <p className="text-slate-700 leading-snug">
                    No se ha podido conectar con Gemini porque falta la variable de entorno en Render. Rellena los datos manualmente o configúrala en Render:
                  </p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-slate-800 text-[10.5px]">
                    <li>En <a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">dashboard.render.com</a> &rarr; Tu Web Service &rarr; <strong>Environment</strong>.</li>
                    <li>Añade <code className="bg-white px-1 py-0.5 rounded border border-red-200 font-bold text-red-900">GEMINI_API_KEY</code> con tu clave de <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Google AI Studio</a>.</li>
                  </ol>
                </div>
              ) : isQuotaExceeded ? (
                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-amber-800 text-[11px] flex gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Límite de Cuota de IA excedido: </span>
                    Se ha cargado una plantilla de estimación local. Por favor, introduce los importes y fechas reales manualmente de tu factura.
                  </div>
                </div>
              ) : isSimulated ? (
                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-amber-800 text-[11px] flex gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Uso de datos alternativos: </span>
                    No pudimos procesar la factura con la IA de Gemini. Por favor, revisa y corrige todos los campos manualmente con tu factura.
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-emerald-50 rounded border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-1.5 mb-1">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Datos extraídos con éxito mediante IA. Revisa y ajusta antes de guardar:</span>
                </div>
              )}
 
              {/* Attached File Preview Card */}
              {fileDataUrl && (
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 flex items-center gap-3">
                  <div className="h-12 w-12 rounded bg-slate-900 border border-slate-300 overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                    <img src={fileDataUrl} alt="Vista previa factura" className="h-full w-full object-contain rounded-xs" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{file?.name || "Factura_Adjunta.jpg"}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        <Check className="h-2.5 w-2.5" /> Copia de Factura Guardada
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Service Type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider">Servicio</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => { setTipo("luz"); setTotalVolume(0); }}
                    className={`flex items-center justify-center gap-1.5 p-2 border rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                      tipo === "luz" 
                        ? "border-blue-600 bg-blue-50/50 text-blue-700" 
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Factura Luz (Mensual)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTipo("agua"); setTotalKwh(0); setFixedCost(0); setVariableCost(0); }}
                    className={`flex items-center justify-center gap-1.5 p-2 border rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                      tipo === "agua" 
                        ? "border-blue-600 bg-blue-50/50 text-blue-700" 
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <Droplet className="h-3.5 w-3.5" />
                    Factura Agua (Trimestral)
                  </button>
                </div>
              </div>
 
              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Inicio de Periodo
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-200 p-2 text-slate-800 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Fin de Periodo
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-200 p-2 text-slate-800 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                  />
                </div>
              </div>
 
              {/* Total Cost */}
              <div>
                <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Coste Total de la Factura (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 block w-full rounded border border-slate-200 p-2 text-slate-800 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                />
              </div>
 
              {/* Conditional fields based on type */}
              {tipo === "luz" ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-450 uppercase tracking-wider">
                        Consumo (kWh)
                      </label>
                      <input
                        type="number"
                        value={totalKwh}
                        onChange={(e) => setTotalKwh(parseInt(e.target.value) || 0)}
                        className="mt-1 block w-full rounded border border-slate-200 p-1.5 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-450 uppercase tracking-wider">
                        Fijo / Potencia (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={fixedCost}
                        onChange={(e) => setFixedCost(parseFloat(e.target.value) || 0)}
                        className="mt-1 block w-full rounded border border-slate-200 p-1.5 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-450 uppercase tracking-wider">
                        Variable / Energ. (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={variableCost}
                        onChange={(e) => setVariableCost(parseFloat(e.target.value) || 0)}
                        className="mt-1 block w-full rounded border border-slate-200 p-1.5 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    *El coste fijo se dividirá al 50%. El coste variable se dividirá proporcionalmente según los kWh consumidos por los contadores parciales diarios de cada inquilino.
                  </p>
                </>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                    Volumen Consumido (m³)
                  </label>
                  <input
                    type="number"
                    value={totalVolume}
                    onChange={(e) => setTotalVolume(parseInt(e.target.value) || 0)}
                    className="mt-1 block w-full rounded border border-slate-200 p-2 text-slate-800 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    *La factura de agua se dividirá de manera equitativa (50/50) entre ambos apartamentos del piso.
                  </p>
                </div>
              )}
 
              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setParsed(false)}
                  className="flex-1 py-2 px-3 border border-slate-250 text-slate-700 rounded font-bold uppercase tracking-wider text-[10px] hover:bg-slate-50 transition cursor-pointer"
                >
                  Volver a Subir
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 py-2 px-3 bg-blue-600 text-white rounded font-bold uppercase tracking-wider text-[10px] hover:bg-blue-700 transition cursor-pointer shadow-sm"
                >
                  Confirmar y Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
