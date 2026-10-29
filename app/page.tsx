"use client";

import { useState, useEffect } from "react";
import { Users, QrCode, ClipboardList, Settings, Zap, RefreshCw, LogOut, User, WifiOff, ShieldCheck } from "lucide-react";
import { syncOfflineDataBackup, getOfflineBackupStats, OfflineBackupStats } from "@/lib/offlineBackup";
import ScannerTab from '@/components/ScannerTab';
import EmployeesTab from '@/components/EmployeesTab';
import LogsTab from '@/components/LogsTab';
import SettingsTab from '@/components/SettingsTab';
import ParcelsTab from '@/components/ParcelsTab';
import AuthScreen from '@/components/AuthScreen';
import ReportsTab from '@/components/ReportsTab';
import { FileBarChart2 } from 'lucide-react';
import { Package } from 'lucide-react';
import Image from 'next/image';
import { supabase } from "@/lib/supabase";
import { initGlobalLogger } from "@/lib/logger";

export default function Home() {
  const [role, setRole] = useState<"admin" | "guard">(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('ams_user_role');
      if (cached === 'admin' || cached === 'guard') return cached;
    }
    return "guard";
  });

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ams_active_tab') || sessionStorage.getItem('ams_active_tab');
      const cachedRole = localStorage.getItem('ams_user_role');
      if (saved) {
        if (cachedRole === 'admin' && (saved === 'scanner' || saved === 'parcels')) return 'reports';
        if (cachedRole === 'guard' && (saved === 'reports' || saved === 'settings' || saved === 'logs')) return 'scanner';
        return saved;
      }
      if (cachedRole === 'admin') return 'reports';
    }
    return "scanner";
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ams_active_tab', activeTab);
      sessionStorage.setItem('ams_active_tab', activeTab);
    }
  }, [activeTab]);

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [aiVisitorData, setAiVisitorData] = useState<any>(null);
  const [aiParcelData, setAiParcelData] = useState<any>(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [offlineStats, setOfflineStats] = useState<OfflineBackupStats>(() => getOfflineBackupStats());
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncingBackup, setIsSyncingBackup] = useState(false);
  const [todayCount, setTodayCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('cached_logs');
        if (raw) {
          const todayStr = new Date().toISOString().split('T')[0];
          const logs = JSON.parse(raw);
          return logs.filter((l: any) => l.date === todayStr).length;
        }
      } catch(e) {}
    }
    return 0;
  });

  const fetchRole = async (userId: string) => {
    try {
      const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).single();
      
      if (!error && data && (data.role === "admin" || data.role === "guard")) {
        const resolvedRole = data.role as "admin" | "guard";
        setRole(resolvedRole);
        if (typeof window !== 'undefined') {
          localStorage.setItem('ams_user_role', resolvedRole);
        }
        if (resolvedRole === "admin") {
          setActiveTab((prev) => (prev === "scanner" || prev === "parcels" ? "reports" : prev));
        } else {
          setActiveTab((prev) => (prev === "reports" || prev === "settings" || prev === "logs" ? "scanner" : prev));
        }
        return;
      }

      // If network error, timeout, or offline: preserve cached role
      if (typeof window !== 'undefined') {
        const cachedRole = localStorage.getItem('ams_user_role') as "admin" | "guard" | null;
        if (cachedRole) {
          setRole(cachedRole);
          if (cachedRole === "admin") {
            setActiveTab((prev) => (prev === "scanner" || prev === "parcels" ? "reports" : prev));
          } else {
            setActiveTab((prev) => (prev === "reports" || prev === "settings" || prev === "logs" ? "scanner" : prev));
          }
          return;
        }
      }

      // If server responded cleanly without error but user has no admin record
      if (!error && (!data || data.role !== "admin")) {
        setRole("guard");
        if (typeof window !== 'undefined') {
          localStorage.setItem('ams_user_role', 'guard');
        }
      }
    } catch (err) {
      console.warn("Could not fetch user role (likely offline):", err);
      if (typeof window !== 'undefined') {
        const cachedRole = localStorage.getItem('ams_user_role') as "admin" | "guard" | null;
        if (cachedRole) {
          setRole(cachedRole);
          if (cachedRole === "admin") {
            setActiveTab((prev) => (prev === "scanner" || prev === "parcels" ? "reports" : prev));
          }
        }
      }
    }
  };

  useEffect(() => {
    initGlobalLogger();

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    const triggerBackup = () => {
      if (typeof window !== 'undefined' && navigator.onLine) {
        setIsSyncingBackup(true);
        syncOfflineDataBackup().then(() => {
          setOfflineStats(getOfflineBackupStats());
          setIsSyncingBackup(false);
        }).catch(() => {
          setIsSyncingBackup(false);
        });
      }
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        await fetchRole(session.user.id);
        triggerBackup();
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const hasCached = typeof window !== 'undefined' && localStorage.getItem('ams_user_role');
        if (!hasCached) {
          setRoleLoading(true);
        }
        await fetchRole(session.user.id);
        setRoleLoading(false);
        triggerBackup();
      } else {
        setRole("guard");
        setActiveTab("scanner");
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ams_user_role');
          localStorage.removeItem('ams_active_tab');
          sessionStorage.removeItem('ams_active_tab');
        }
      }
    });

    const handleOnline = () => {
      setIsOffline(false);
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) fetchRole(session.user.id);
      });
      triggerBackup();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setOfflineStats(getOfflineBackupStats());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBackupCompleted = () => {
      setOfflineStats(getOfflineBackupStats());
    };
    window.addEventListener('ams_offline_backup_completed', handleBackupCompleted);

    const handleCountChanged = (e: any) => {
      if (e.detail && typeof e.detail.count === 'number') {
        setTodayCount(e.detail.count);
      }
    };
    window.addEventListener('ams_today_count_changed', handleCountChanged);

    const handleAiScan = (e: any) => {
      const data = e.detail;
      if (data.type === 'visitor') {
        setAiVisitorData(data);
        setActiveTab('employees');
      } else if (data.type === 'parcel') {
        setAiParcelData(data);
        setActiveTab('parcels');
      }
    };
    
    window.addEventListener('ai_scan_result', handleAiScan);

    // Periodic backup sync every 60 seconds when online
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && navigator.onLine) {
        triggerBackup();
      }
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('ams_offline_backup_completed', handleBackupCompleted);
      window.removeEventListener('ams_today_count_changed', handleCountChanged);
      window.removeEventListener('ai_scan_result', handleAiScan);
    };
  }, []);

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ams_user_role');
      localStorage.removeItem('ams_active_tab');
      sessionStorage.removeItem('ams_active_tab');
    }
    setRole("guard");
    setActiveTab("scanner");
    await supabase.auth.signOut();
  };

  if (loading || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F4F9FF]"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <>
      {/* Decorative Background Blobs */}
      <div className="fixed top-20 -left-10 w-48 h-48 -left-20 bg-blue-100 rounded-full opacity-50 z-0 pointer-events-none"></div>
      <div className="fixed top-40 -right-10 w-56 h-56 -right-28 bg-green-100 rounded-full opacity-50 z-0 pointer-events-none"></div>

      <header className="bg-[#F4F9FF] p-4 flex justify-between items-center z-30 relative">
        <div className="flex items-center space-x-2">

          <div className="w-10 h-10 rounded-lg shadow-sm border border-gray-100 overflow-hidden">
             <Image src="/logo.jpg" alt="Logo" width={40} height={40} className="object-cover" priority />
          </div>
          <div className="leading-tight">
            <h1 className="text-[17px] font-extrabold text-[#1E293B] tracking-tight">Attendance</h1>
            <h1 className="text-[17px] font-extrabold text-[#10B981] tracking-tight -mt-1">Manager</h1>
            <p className="text-[10px] font-bold text-gray-400 tracking-wider mt-0.5">Track • Manage • Grow</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 relative">
          {/* Today Attendance Button on Guard Scan Header */}
          {activeTab === 'scanner' && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('ams_open_today_modal'))}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm shadow-blue-500/20 active:scale-95 transition-all shrink-0"
              title="View Today's Attendance List"
            >
              <ClipboardList size={14} className="shrink-0" />
              <span>Today ({todayCount})</span>
            </button>
          )}

          {isOffline && (
            <div className="flex items-center text-[10px] font-extrabold text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-1 rounded-full shadow-xs animate-pulse">
              <WifiOff size={11} className="mr-1 text-amber-600 shrink-0" />
              <span>Offline ({offlineStats.employeeCount})</span>
            </div>
          )}

          {/* Profile Icon Button */}
          <button 
            onClick={() => setShowProfileDropdown(!showProfileDropdown)} 
            className={`w-10 h-10 rounded-full shadow-sm flex items-center justify-center transition-all ${
              showProfileDropdown 
                ? 'bg-blue-600 text-white shadow-blue-200' 
                : 'bg-white text-blue-600 hover:bg-blue-50 border border-blue-100/60'
            }`} 
            title="Account Profile"
          >
            <User size={19} />
          </button>

          <button 
            onClick={handleLogout} 
            className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors border border-gray-100" 
            title="Sign Out"
          >
            <LogOut size={18} className="ml-0.5" />
          </button>

          {/* Profile Popover Dropdown */}
          {showProfileDropdown && (
            <>
              {/* Invisible backdrop to dismiss on click outside */}
              <div 
                className="fixed inset-0 z-40 bg-black/20" 
                onClick={() => setShowProfileDropdown(false)} 
              />
              
              <div className="absolute right-0 top-12 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 animate-fade-in">
                <div className="flex items-center space-x-3 pb-3 border-b border-gray-100">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-100">
                    {session?.user?.email ? session.user.email.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="overflow-hidden flex-1">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Signed In As</p>
                    <p className="text-xs font-bold text-gray-800 truncate" title={session?.user?.email}>
                      {session?.user?.email || "Unknown Email"}
                    </p>
                    <div className="mt-1">
                      <span className={`inline-flex items-center text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider ${
                        role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {role === 'admin' ? 'Admin Access' : 'Guard Access'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500 py-1.5 px-2 bg-gray-50 rounded-xl">
                    <span className="font-medium">User Role</span>
                    <span className="font-bold text-gray-700 capitalize">{role}</span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs py-1.5 px-2 bg-emerald-50 text-emerald-800 rounded-xl font-bold">
                      <span className="flex items-center">
                        <ShieldCheck size={14} className="mr-1 text-emerald-600" />
                        Offline Backup
                      </span>
                      <span>{offlineStats.employeeCount} Profiles Ready</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsSyncingBackup(true);
                        await syncOfflineDataBackup();
                        setOfflineStats(getOfflineBackupStats());
                        setIsSyncingBackup(false);
                      }}
                      disabled={isSyncingBackup || isOffline}
                      className="w-full text-xs font-bold py-1.5 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={`mr-1.5 ${isSyncingBackup ? 'animate-spin text-blue-600' : 'text-gray-500'}`} />
                      {isSyncingBackup ? 'Backing up...' : 'Update Offline Backup Now'}
                    </button>
                  </div>
                  
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      handleLogout();
                    }}
                    className="w-full mt-2 flex items-center justify-center space-x-1.5 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2.5 rounded-xl transition-colors"
                  >
                    <LogOut size={14} />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="h-[calc(100vh-140px)] overflow-y-auto relative">
        {activeTab === "scanner" && role === "guard" && <ScannerTab />}
        {activeTab === "employees" && <EmployeesTab role={role} initialAiData={aiVisitorData} onAiDataConsumed={() => setAiVisitorData(null)} />}
        {activeTab === "logs" && role === "admin" && <LogsTab />}
        {activeTab === "reports" && role === "admin" && <ReportsTab />}
        {activeTab === "settings" && role === "admin" && <SettingsTab />}
        {activeTab === "parcels" && role === "guard" && <ParcelsTab role={role} initialAiData={aiParcelData} onAiDataConsumed={() => setAiParcelData(null)} />}
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 flex justify-around p-3 pb-safe shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-20 rounded-t-3xl">
        {role === 'guard' && (
          <button onClick={() => setActiveTab("scanner")} className={`flex flex-col items-center justify-center w-[70px] h-[70px] rounded-[28px] transition-all ${activeTab === "scanner" ? "bg-[#EAF3FF] text-[#3B82F6]" : "text-gray-400"}`}>
            <QrCode size={24} className={activeTab === "scanner" ? "stroke-2" : "stroke-2"} />
            <span className="text-[10px] mt-1 font-semibold">Scan</span>
          </button>
        )}
        
        <button onClick={() => setActiveTab("employees")} className={`flex flex-col items-center justify-center w-[70px] h-[70px] rounded-[28px] transition-all ${activeTab === "employees" ? "bg-[#EAF3FF] text-[#3B82F6]" : "text-gray-400"}`}>
          <Users size={24} className={activeTab === "employees" ? "stroke-2" : "stroke-2"} />
          <span className="text-[10px] mt-1 font-semibold">{role === 'admin' ? 'Registry' : 'Visitors'}</span>
        </button>
        
        {role === 'guard' && (
          <button onClick={() => setActiveTab("parcels")} className={`flex flex-col items-center justify-center w-[70px] h-[70px] rounded-[28px] transition-all ${activeTab === "parcels" ? "bg-[#EAF3FF] text-[#3B82F6]" : "text-gray-400"}`}>
            <Package size={24} className={activeTab === "parcels" ? "stroke-2" : "stroke-2"} />
            <span className="text-[10px] mt-1 font-semibold">Parcels</span>
          </button>
        )}
        
        {role === 'admin' && (
          <button onClick={() => setActiveTab("reports")} className={`flex flex-col items-center justify-center w-[70px] h-[70px] rounded-[28px] transition-all ${activeTab === "reports" ? "bg-[#EAF3FF] text-[#3B82F6]" : "text-gray-400"}`}>
            <FileBarChart2 size={24} className={activeTab === "reports" ? "stroke-2" : "stroke-2"} />
            <span className="text-[10px] mt-1 font-semibold">Reports</span>
          </button>
        )}
        
        {role === 'admin' && (
          <button onClick={() => setActiveTab("settings")} className={`flex flex-col items-center justify-center w-[70px] h-[70px] rounded-[28px] transition-all ${activeTab === "settings" ? "bg-[#EAF3FF] text-[#3B82F6]" : "text-gray-400"}`}>
            <Settings size={24} className={activeTab === "settings" ? "stroke-2" : "stroke-2"} />
            <span className="text-[10px] mt-1 font-semibold">Settings</span>
          </button>
        )}
      </nav>
    </>
  );
}
