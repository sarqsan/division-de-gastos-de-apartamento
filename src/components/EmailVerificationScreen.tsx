import { useState } from "react";
import { dbService } from "../firebase";
import { UserProfile } from "../types";
import { Mail, CheckCircle2, RefreshCw, LogOut, ShieldAlert } from "lucide-react";

interface EmailVerificationScreenProps {
  user: UserProfile;
  onVerified: (user: UserProfile) => void;
  onLogout: () => void;
}

export default function EmailVerificationScreen({ user, onVerified, onLogout }: EmailVerificationScreenProps) {
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [verifiedSimulated, setVerifiedSimulated] = useState(false);

  const handleResend = () => {
    setLoading(true);
    // Simulate sending email
    setTimeout(() => {
      setResent(true);
      setLoading(false);
    }, 1000);
  };

  const handleSimulateVerification = async () => {
    setLoading(true);
    try {
      const updatedUser = await dbService.verifyEmail();
      setVerifiedSimulated(true);
      setTimeout(() => {
        onVerified(updatedUser);
      }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full mx-auto bg-white rounded p-6 border border-slate-200 shadow-sm text-center">
        <div className="mx-auto h-12 w-12 bg-amber-50 rounded flex items-center justify-center text-amber-600 mb-4 border border-amber-200">
          <ShieldAlert className="h-6 w-6" />
        </div>

        <h2 className="text-xl font-bold font-display text-slate-900 uppercase tracking-tight">
          Verificación de Correo Obligatoria
        </h2>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed font-medium">
          Para garantizar la seguridad y poder recibir las notificaciones automáticas de facturas, es obligatorio que verifiques tu dirección de correo electrónico:
        </p>
        <p className="mt-2 text-sm font-mono font-bold text-slate-800">
          {user.email}
        </p>

        {verifiedSimulated ? (
          <div className="mt-5 p-3 bg-emerald-50 rounded border border-emerald-200 flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider font-mono">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 animate-bounce" />
            ¡Correo verificado con éxito! Redirigiendo...
          </div>
        ) : (
          <div className="mt-6 space-y-2.5">
            <button
              onClick={handleSimulateVerification}
              disabled={loading}
              className="w-full flex justify-center items-center gap-1.5 py-2 px-4 border border-transparent rounded shadow-sm text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              Simular Verificación de Correo
            </button>

            <button
              onClick={handleResend}
              disabled={loading || resent}
              className="w-full flex justify-center items-center gap-1.5 py-2 px-4 border border-slate-200 rounded text-xs font-bold uppercase tracking-wider text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-400 transition cursor-pointer"
            >
              <Mail className="h-4 w-4 text-slate-400" />
              {resent ? "¡Enlace Reenviado!" : "Reenviar Enlace de Verificación"}
            </button>

            <div className="pt-4 border-t border-slate-200 mt-5 flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin text-slate-400" /> Esperando...
              </span>
              <button
                onClick={onLogout}
                className="flex items-center gap-1 hover:text-red-600 transition font-bold"
              >
                <LogOut className="h-3 w-3" /> Cerrar Sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
