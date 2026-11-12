"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2, User, ShieldCheck } from "lucide-react";
import { syncOfflineDataBackup } from "@/lib/offlineBackup";
import { verifyGuardLogin } from "@/lib/guardAuth";
import Image from "next/image";

export default function AuthScreen({ onGuardLogin }: { onGuardLogin?: () => void }) {
  const [view, setView] = useState<'login' | 'signup' | 'forgot' | 'update'>('login');
  
  // Unified Login States
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // Check if user clicked a password reset link
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash && hash.includes("type=recovery")) {
        setView("update");
      }
    };
    checkHash();
    
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("update");
      }
    });
    
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loginAsGuard = (guard: any) => {
    localStorage.setItem('ams_user_role', 'guard');
    localStorage.setItem('ams_guard_session', JSON.stringify({
      id: guard.id,
      loginId: guard.loginId,
      name: guard.name,
      type: guard.type,
      gate: guard.gate,
      loginTime: Date.now()
    }));

    // Trigger offline backup sync in background
    syncOfflineDataBackup().catch(console.warn);

    if (onGuardLogin) {
      onGuardLogin();
    }
    window.dispatchEvent(new Event('ams_guard_login'));
  };

  const handleUnifiedLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const cleanId = identifier.trim();

    try {
      // 1. If identifier contains '@', it is formatted as an email address (typically Admin)
      if (cleanId.includes('@')) {
        const { data, error: supaErr } = await supabase.auth.signInWithPassword({
          email: cleanId,
          password,
        });

        if (!supaErr && data?.session) {
          syncOfflineDataBackup().catch(console.warn);
          setLoading(false);
          return;
        }

        // In case a guard account was created using an email as their Login ID
        const guardRes = await verifyGuardLogin(cleanId, password);
        if (guardRes.success && guardRes.guard) {
          loginAsGuard(guardRes.guard);
          setLoading(false);
          return;
        }

        setError(supaErr?.message || "Invalid email or password.");
        setLoading(false);
        return;
      }

      // 2. If identifier does not have '@', it is typically a Guard Login ID (e.g. guard, guest, guard1, gate1)
      const guardRes = await verifyGuardLogin(cleanId, password);
      if (guardRes.success && guardRes.guard) {
        loginAsGuard(guardRes.guard);
        setLoading(false);
        return;
      }

      // If it's a specific guard error (e.g. guest pass expired, account suspended, or wrong password)
      if (guardRes.error && (
        guardRes.error.includes("expired") || 
        guardRes.error.includes("suspended") || 
        guardRes.error.includes("Incorrect password")
      )) {
        setError(guardRes.error);
        setLoading(false);
        return;
      }

      // 3. Fallback: Check if Supabase auth accepts this credential
      const { data: fallbackData, error: fallbackSupaErr } = await supabase.auth.signInWithPassword({
        email: cleanId,
        password,
      });

      if (!fallbackSupaErr && fallbackData?.session) {
        syncOfflineDataBackup().catch(console.warn);
        setLoading(false);
        return;
      }

      // If both fail:
      setError(guardRes.error || "Invalid Login ID / Email or Password. Please check your credentials.");
    } catch (err: any) {
      console.error("Unified login error:", err);
      setError("Login failed: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const { error } = await supabase.auth.signUp({ email: identifier.trim(), password });
    if (error) setError(error.message);
    else setSuccess("Check your email for a confirmation link!");
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const { error } = await supabase.auth.resetPasswordForEmail(identifier.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) setError(error.message);
    else setSuccess("Password reset email sent! Check your inbox.");
    setLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Password updated successfully!");
      setTimeout(() => setView('login'), 2000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F9FF] flex flex-col justify-center px-6 py-10 relative overflow-hidden">
      {/* Decorative Blobs */}
      <div className="absolute top-20 -left-10 w-48 h-48 bg-blue-100 rounded-full opacity-50 z-0"></div>
      <div className="absolute top-40 -right-10 w-56 h-56 bg-green-100 rounded-full opacity-50 z-0"></div>

      <div className="relative z-10 w-full max-w-sm mx-auto">
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mx-auto mb-3 flex items-center justify-center">
            <Image src="/logo.jpg" alt="Logo" width={80} height={80} className="object-cover" priority />
          </div>
          <h1 className="text-2xl font-extrabold text-[#1E293B] tracking-tight">Attendance Manager</h1>
          <p className="text-xs font-bold text-gray-400 tracking-wider mt-1">Smart Gate & Staff Registry</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-xl border border-blue-50/50">
          
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-gray-800">
              {view === 'login' ? 'Sign In' : 
               view === 'signup' ? 'Create Admin Account' : 
               view === 'forgot' ? 'Reset Password' : 
               'Set New Password'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {view === 'login' 
                ? 'Enter your Login ID or Email to continue' 
                : view === 'signup'
                ? 'Enter your administrator credentials'
                : view === 'forgot'
                ? 'Enter your registered email address'
                : 'Enter your new password below'}
            </p>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold mb-4 text-center leading-relaxed">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded-xl text-xs font-semibold mb-4 text-center">{success}</div>}

          {/* UNIFIED LOGIN / AUTH FORM */}
          <form 
            onSubmit={
              view === 'login' ? handleUnifiedLogin :
              view === 'signup' ? handleSignup :
              view === 'forgot' ? handleResetPassword :
              handleUpdatePassword
            } 
            className="space-y-4"
          >
            {view !== 'update' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">
                  {view === 'login' ? 'Email or Login ID' : 'Admin Email Address'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    {view === 'login' ? <User size={18} /> : <Mail size={18} />}
                  </div>
                  <input
                    type={view === 'forgot' || view === 'signup' ? 'email' : 'text'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 pl-10 pr-3.5 py-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold transition-all"
                    placeholder={view === 'login' ? 'admin@example.com or guard1' : 'admin@example.com'}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>
            )}

            {view !== 'forgot' && (
              <div>
                <div className="flex justify-between items-center mb-1 ml-1">
                  <label className="block text-xs font-bold text-gray-700">Password</label>
                  {view === 'login' && (
                    <button 
                      type="button" 
                      onClick={() => { setView('forgot'); setError(""); setSuccess(""); }} 
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 pl-10 pr-10 py-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                    placeholder="••••••••"
                    required
                    minLength={view === 'signup' || view === 'update' ? 6 : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white p-3.5 rounded-xl font-bold text-sm shadow-md flex items-center justify-center transition-all disabled:opacity-70"
              >
                {loading ? <Loader2 size={18} className="animate-spin mr-1.5" /> : (
                  <>
                    <span>
                      {view === 'login' ? 'Sign In' :
                       view === 'signup' ? 'Create Account' :
                       view === 'forgot' ? 'Send Reset Link' :
                       'Save Password'}
                    </span>
                    <ArrowRight size={16} className="ml-2" />
                  </>
                )}
              </button>
            </div>

            {view === 'login' && (
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100/70 text-[11px] text-gray-600 text-center leading-relaxed">
                Universal sign-in for <span className="font-bold text-gray-800">Administrators</span>, <span className="font-bold text-gray-800">Duty Guards</span>, and <span className="font-bold text-gray-800">Guest Guards</span>.
              </div>
            )}

            {view !== 'update' && (
              <div className="mt-4 text-center space-y-2">
                {view === 'login' ? (
                  <p className="text-xs text-gray-500 font-medium">
                    Need an admin account?{' '}
                    <button 
                      type="button"
                      onClick={() => { setView('signup'); setError(""); setSuccess(""); }} 
                      className="text-blue-600 font-bold hover:underline"
                    >
                      Sign up
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 font-medium">
                    Already have an account?{' '}
                    <button 
                      type="button"
                      onClick={() => { setView('login'); setError(""); setSuccess(""); }} 
                      className="text-blue-600 font-bold hover:underline"
                    >
                      Back to Sign In
                    </button>
                  </p>
                )}
              </div>
            )}
          </form>

        </div>
      </div>
    </div>
  );
}
