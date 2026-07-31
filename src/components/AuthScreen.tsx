import React, { useState } from "react";
import { dbService } from "../firebase";
import { UserProfile } from "../types";
import { ShieldCheck, User, Mail, Lock, Key, Home, Sparkles, Building, Info } from "lucide-react";

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile) => void;
  connectTuyaApartment?: "A" | "B" | null;
  onQuickConnectTuya?: () => void;
}

export default function AuthScreen({ onAuthSuccess, connectTuyaApartment, onQuickConnectTuya }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<"propietario" | "inquilino">("inquilino");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Quick helper to fill in credentials for testing
  const fillCredentials = (type: "landlord" | "tenantA" | "tenantB") => {
    if (type === "landlord") {
      setEmail("sarqsan2@gmail.com");
      setPassword("propietario123");
      setIsLogin(true);
    } else if (type === "tenantA") {
      setEmail("inquilino_a@example.com");
      setPassword("inquilino123");
      setIsLogin(true);
    } else if (type === "tenantB") {
      setEmail("inquilino_b@example.com");
      setPassword("inquilino123");
      setIsLogin(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const user = await dbService.login(email, password);
        onAuthSuccess(user);
      } else {
        if (role === "propietario") {
          const user = await dbService.register(email, password, "propietario", "none");
          onAuthSuccess(user);
        } else {
          const user = await dbService.register(email, password, "inquilino_ver", "none", code);
          onAuthSuccess(user);
        }
      }
    } catch (err: any) {
      setError(err.message || "Ha ocurrido un error en la autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-10 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-12 w-12 bg-blue-600 rounded flex items-center justify-center shadow-md">
          <Building className="h-6 w-6 text-white" />
        </div>
        <h2 className="mt-4 text-2xl font-bold font-display text-slate-900 uppercase tracking-tight">
          Dividir Facturas de Piso
        </h2>
        <p className="mt-1.5 text-xs text-slate-500 font-medium">
          Reparto justo y automatizado de luz y agua para apartamentos divididos
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        {connectTuyaApartment && (
          <div className="mb-4 p-3 bg-emerald-500 text-white rounded-lg shadow-md space-y-2">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="h-4 w-4" />
              <span>Código QR Tuya Escaneado (Apt {connectTuyaApartment})</span>
            </div>
            <p className="text-[11px] text-emerald-100 leading-snug">
              Puedes realizar la autorización directa en 1 Clic o iniciar sesión para vincular tu usuario.
            </p>
            {onQuickConnectTuya && (
              <button
                type="button"
                onClick={onQuickConnectTuya}
                className="w-full py-1.5 bg-white text-emerald-800 font-extrabold text-[11px] uppercase tracking-wider rounded shadow-xs hover:bg-emerald-50 transition cursor-pointer"
              >
                ⚡ Ir a Autorización Rápida en 1 Clic
              </button>
            )}
          </div>
        )}

        <div className="bg-white py-6 px-5 border border-slate-200 rounded shadow-sm sm:px-8">
          
          {/* Toggle Login / Register */}
          <div className="flex bg-slate-100 p-1 rounded mb-4">
            <button
              onClick={() => { setIsLogin(true); setError(null); }}
              className={`flex-1 text-center py-1.5 text-xs font-bold rounded uppercase tracking-wider transition-all ${
                isLogin ? "bg-white text-blue-600 shadow-xs border border-slate-200/50" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(null); }}
              className={`flex-1 text-center py-1.5 text-xs font-bold rounded uppercase tracking-wider transition-all ${
                !isLogin ? "bg-white text-blue-600 shadow-xs border border-slate-200/50" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Registrarse
            </button>
          </div>

          {/* Quick Setup Helpers */}
          <div className="mb-4 p-3 bg-blue-50/60 rounded border border-blue-100 text-[11px]">
            <p className="font-bold text-blue-900 mb-2 flex items-center gap-1 font-mono uppercase tracking-wider">
              <Sparkles className="h-3 w-3 text-blue-500 animate-pulse" />
              Acceso rápido (Preview):
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => fillCredentials("landlord")}
                className="bg-white hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-blue-700 font-bold transition text-[10px] uppercase font-mono"
              >
                Propietario
              </button>
              <button
                type="button"
                onClick={() => fillCredentials("tenantA")}
                className="bg-white hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-blue-700 font-bold transition text-[10px] uppercase font-mono"
              >
                Inquilino A
              </button>
              <button
                type="button"
                onClick={() => fillCredentials("tenantB")}
                className="bg-white hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-blue-700 font-bold transition text-[10px] uppercase font-mono"
              >
                Inquilino B
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-2.5 bg-rose-50 text-rose-700 text-xs rounded border border-rose-200 flex items-start gap-2">
              <span className="font-bold uppercase tracking-wider font-mono">Error:</span>
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            
            {/* If Register: Toggle Propietario / Inquilino */}
            {!isLogin && (
              <div className="space-y-1 mb-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo de Perfil</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("inquilino")}
                    className={`flex items-center justify-center gap-1.5 p-2 border rounded text-xs transition-all ${
                      role === "inquilino" 
                        ? "border-blue-600 bg-blue-50/50 text-blue-700 font-bold" 
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    Inquilino
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("propietario")}
                    className={`flex items-center justify-center gap-1.5 p-2 border rounded text-xs transition-all ${
                      role === "propietario" 
                        ? "border-blue-600 bg-blue-50/50 text-blue-700 font-bold" 
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                    Propietario
                  </button>
                </div>
              </div>
            )}

            {/* Email field */}
            <div>
              <label htmlFor="email" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Correo Electrónico
              </label>
              <div className="mt-1 relative rounded shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="block w-full pl-8.5 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="mt-1 relative rounded shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="block w-full pl-8.5 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
                />
              </div>
            </div>

            {/* If Register and Inquilino: Access Code */}
            {!isLogin && role === "inquilino" && (
              <div className="p-3 bg-amber-50 border border-amber-200 space-y-2 rounded text-[11px]">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-amber-800 leading-normal">
                    Ingresa el código proporcionado por tu arrendador para configurar tu apartamento (A o B) y tu rol de acceso.
                  </p>
                </div>
                <div>
                  <label htmlFor="code" className="block text-[9px] font-bold text-amber-900 uppercase tracking-wider">
                    Código de Acceso Inquilino
                  </label>
                  <div className="mt-1 relative rounded shadow-xs">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <Key className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <input
                      id="code"
                      name="code"
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Ej: APTA-EDIT"
                      className="block w-full pl-8.5 pr-2.5 py-1.5 bg-white border border-amber-200 rounded text-slate-900 placeholder-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-xs uppercase font-mono"
                    />
                  </div>
                </div>
                <div className="text-[9px] text-slate-500 font-mono">
                  Códigos por defecto: <code className="bg-amber-100 px-1 py-0.5 rounded">APTA-EDIT</code> o <code className="bg-amber-100 px-1 py-0.5 rounded">APTB-VER</code>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-3 w-full flex justify-center py-2 px-4 border border-transparent rounded shadow-sm text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Procesando..." : isLogin ? "Iniciar Sesión" : "Crear Cuenta"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
