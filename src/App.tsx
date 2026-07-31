import { useState, useEffect } from "react";
import { dbService } from "./firebase";
import { UserProfile } from "./types";
import AuthScreen from "./components/AuthScreen";
import EmailVerificationScreen from "./components/EmailVerificationScreen";
import LandlordDashboard from "./components/LandlordDashboard";
import TenantDashboard from "./components/TenantDashboard";
import QuickTuyaAuthScreen from "./components/QuickTuyaAuthScreen";
import { RefreshCw } from "lucide-react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // URL search params for Tuya QR connection
  const [tuyaConnectApt, setTuyaConnectApt] = useState<"A" | "B" | null>(null);
  const [tuyaConnectToken, setTuyaConnectToken] = useState<string | null>(null);
  const [bypassQrScreen, setBypassQrScreen] = useState(false);

  useEffect(() => {
    // Check URL parameters for Tuya QR scan
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const rawApt = urlParams.get("connectTuya");
      const token = urlParams.get("token");

      if (rawApt === "A" || rawApt === "B" || rawApt === "a" || rawApt === "b") {
        setTuyaConnectApt(rawApt.toUpperCase() as "A" | "B");
        setTuyaConnectToken(token);
      }
    }

    // Check if user is logged in on mount
    const checkUser = async () => {
      try {
        const user = dbService.getCurrentUser();
        setCurrentUser(user);
      } catch (err) {
        console.error("Error retrieving session:", err);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, []);

  const handleAuthSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setBypassQrScreen(true);
  };

  const handleVerified = (updatedUser: UserProfile) => {
    setCurrentUser(updatedUser);
  };

  const handleLogout = async () => {
    await dbService.logout();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
        <span className="mt-2 text-sm text-slate-500 font-medium">Iniciando aplicación de repartos...</span>
      </div>
    );
  }

  // Route 0: Tuya QR Quick Connection Landing (If scanned QR and not yet bypassed)
  if (tuyaConnectApt && !bypassQrScreen) {
    return (
      <QuickTuyaAuthScreen
        apartment={tuyaConnectApt}
        token={tuyaConnectToken}
        currentUser={currentUser}
        onContinueToApp={() => setBypassQrScreen(true)}
        onGoToLogin={() => setBypassQrScreen(true)}
      />
    );
  }

  // Route 1: Not logged in
  if (!currentUser) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        connectTuyaApartment={tuyaConnectApt}
        onQuickConnectTuya={() => setBypassQrScreen(false)}
      />
    );
  }

  // Route 2: Logged in but Tenant and NOT email verified (mandatory)
  if (currentUser.role !== "propietario" && !currentUser.emailVerified) {
    return (
      <EmailVerificationScreen
        user={currentUser}
        onVerified={handleVerified}
        onLogout={handleLogout}
      />
    );
  }

  // Route 3: Landlord Dashboard
  if (currentUser.role === "propietario") {
    return <LandlordDashboard user={currentUser} onLogout={handleLogout} />;
  }

  // Route 4: Tenant Dashboard (Verified and assigned to apartment)
  return <TenantDashboard user={currentUser} onLogout={handleLogout} />;
}
