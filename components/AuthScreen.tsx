"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, UserCheck, KeyRound } from "lucide-react";
import { syncOfflineDataBackup } from "@/lib/offlineBackup";
import { verifyGuardLogin } from "@/lib/guardAuth";
import Image from "next/image";

export default function AuthScreen({ onGuardLogin }: { onGuardLogin?: () => void }) {
  const [authRole, setAuthRole] = useState<'guard' | 'admin'>('guard');
  const [view, setView] = useState<'login' | 'signup' | 'forgot' | 'update'>('login');
  
  // Guard Login States
  const [guardLoginId, setGuardLoginId] = useState("");
  const [guardPassword, setGuardPassword] = useState("");
  const [showGuardPassword, setShowGuardPassword] = useState(false);
  const [guardLoading, setGuardLoading] = useState(false);

  // Admin Login States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // Check if we just clicked a password reset link
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash && hash.includes("type=recovery")) {
        setAuthRole('admin');
        setView("update");
      }
    };
    checkHash();
    
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthRole('admin');
        setView("update");
      }
    });
    
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleGuardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await verifyGuardLogin(guardLoginId, guardPassword);
      if (!res.success || !res.guard) {
        setError(res.error || "Authentication failed. Please verify your Guard ID and Password.");
        setGuardLoading(false);
        return;
      }

      // Store guard session
      localStorage.setItem('ams_user_role', 'guard');
      localStorage.setItem('ams_guard_session', JSON.stringify({
        id: res.guard.id,
        loginId: res.guard.loginId,
        name: res.guard.name,
        type: res.guard.type,
        gate: res.guard.gate,
        loginTime: Date.now()
      }));

      // Trigger offline backup sync in background
      syncOfflineDataBackup().catch(console.warn);

      if (onGuardLogin) {
        onGuardLogin();
      }
      window.dispatchEvent(new Event('ams_guard_login'));
    } catch (err: any) {
      console.error("Guard login error:", err);
      setError("Login error: " + (err.message || String(err)));
    } finally {
      setGuardLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Instantly begin offline backup
    syncOfflineDataBackup().catch(console.warn);
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else setSuccess("Check your email for a confirmation link!");
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
          
          {/* Role Toggle Switch */}
          <div className="flex bg-gray-100 p-1 rounded-2xl mb-6 shadow-inner">
            <button
              type="button"
              onClick={() => { setAuthRole('guard'); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                authRole === 'guard'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <ShieldCheck size={16} className={authRole === 'guard' ? 'text-emerald-600' : 'text-gray-400'} />
              <span>Guard Login</span>
            </button>

            <button
              type="button"
              onClick={() => { setAuthRole('admin'); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                authRole === 'admin'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <UserCheck size={16} className={authRole === 'admin' ? 'text-blue-600' : 'text-gray-400'} />
              <span>Admin Login</span>
            </button>
          </div>

          <div className="text-center mb-5">
            <h2 className="text-lg font-bold text-gray-800">
              {authRole === 'guard' 
                ? 'Duty Guard Sign In' 
                : (view === 'login' ? 'Administrator Sign In' : view === 'signup' ? 'Create Admin Account' : view === 'forgot' ? 'Reset Admin Password' : 'Set New Password')}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {authRole === 'guard'
                ? 'Enter your Guard Login ID & Password'
                : 'Sign in with your registered email'}
            </p>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold mb-4 text-center leading-relaxed">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded-xl text-xs font-semibold mb-4 text-center">{success}</div>}

          {/* GUARD / GUEST GUARD FORM */}
          {authRole === 'guard' ? (
            <form onSubmit={handleGuardSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 ml-1">Guard Login ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-600">
                    <ShieldCheck size={18} />
                  </div>
                  <input
                    type="text"
                    value={guardLoginId}
                    onChange={(e) => setGuardLoginId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 pl-10 pr-3.5 py-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold font-mono uppercase tracking-wide transition-all"
                    placeholder="e.g. GUARD or GUEST"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 ml-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-600">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showGuardPassword ? "text" : "password"}
                    value={guardPassword}
                    onChange={(e) => setGuardPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 pl-10 pr-10 py-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium transition-all"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowGuardPassword(!showGuardPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showGuardPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={guardLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white p-3.5 rounded-xl font-bold text-sm shadow-md flex items-center justify-center transition-all active:scale-[0.99] disabled:opacity-70"
                >
                  {guardLoading ? <Loader2 size={18} className="animate-spin mr-1.5" /> : (
                    <>
                      <span>Sign In as Guard</span>
                      <ArrowRight size={16} className="ml-2" />
                    </>
                  )}
                </button>
              </div>

              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 text-[11px] text-emerald-800 text-center font-medium leading-relaxed">
                Supports Permanent Guards and Temporary Guest Guards. Login IDs and Passwords are provided by your Admin.
              </div>
            </form>
          ) : (
            /* ADMIN AUTH FORM */
            <form onSubmit={
              view === 'login' ? handleLogin :
              view === 'signup' ? handleSignup :
              view === 'forgot' ? handleResetPassword :
              handleUpdatePassword
            } className="space-y-4">

              {view !== 'update' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Admin Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 pl-10 pr-3.5 py-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                      placeholder="admin@example.com"
                      required
                    />
                  </div>
                </div>
              )}

              {view !== 'forgot' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">Password</label>
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
                      minLength={6}
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

              {view === 'login' && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => { setView('forgot'); setError(""); setSuccess(""); }} className="text-xs font-bold text-blue-600 hover:text-blue-800">
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-xl font-bold text-sm shadow-md flex items-center justify-center transition-colors disabled:opacity-70 mt-2"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : (
                  <>
                    {view === 'login' ? 'Sign In as Admin' : view === 'signup' ? 'Create Account' : view === 'forgot' ? 'Send Reset Link' : 'Save Password'}
                    <ArrowRight size={16} className="ml-2" />
                  </>
                )}
              </button>

              {view !== 'update' && (
                <div className="mt-4 text-center space-y-2">
                  {view === 'login' ? (
                    <p className="text-xs text-gray-500 font-medium">
                      Don't have an admin account? <button onClick={() => { setView('signup'); setError(""); setSuccess(""); }} className="text-blue-600 font-bold hover:underline">Sign up</button>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 font-medium">
                      Already have an account? <button onClick={() => { setView('login'); setError(""); setSuccess(""); }} className="text-blue-600 font-bold hover:underline">Sign in</button>
                    </p>
                  )}
                </div>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
