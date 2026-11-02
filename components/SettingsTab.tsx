"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Database, 
  CheckCircle2, 
  Download, 
  CloudOff, 
  Info, 
  Share, 
  PlusSquare,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  Activity,
  Wifi,
  WifiOff,
  ShieldCheck,
  Bug,
  Search,
  Zap,
  Clock,
  Layers,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus
} from "lucide-react";
import { getGuardAccounts, saveGuardAccount, deleteGuardAccount, GuardAccount } from "@/lib/guardAuth";
import { syncOfflineDataBackup, getOfflineBackupStats, OfflineBackupStats } from "@/lib/offlineBackup";
import { localdb } from "@/lib/localdb";
import { supabase } from "@/lib/supabase";
import { appLogger, LogEntry } from "@/lib/logger";
import LogsTab from "@/components/LogsTab";

export default function SettingsTab() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      return (window as any).deferredPrompt || null;
    }
    return null;
  });
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [queueBreakdown, setQueueBreakdown] = useState({ attendance: 0, employees: 0, parcels: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('android');
  const [offlineStats, setOfflineStats] = useState<OfflineBackupStats>(() => getOfflineBackupStats());
  const [isSyncingBackup, setIsSyncingBackup] = useState(false);

  // DB Diagnostic state
  const [testingDb, setTestingDb] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    status: 'idle' | 'success' | 'error';
    latency?: number;
    message?: string;
  }>({ status: 'idle' });

  // Guard Credentials state
  const [guards, setGuards] = useState<GuardAccount[]>([]);
  const [guardsLoading, setGuardsLoading] = useState(false);
  const [showAddGuardModal, setShowAddGuardModal] = useState(false);
  const [guardType, setGuardType] = useState<'permanent' | 'guest'>('permanent');
  const [guardName, setGuardName] = useState('');
  const [guardLoginId, setGuardLoginId] = useState('');
  const [guardPassword, setGuardPassword] = useState('');
  const [guardGate, setGuardGate] = useState('Main Gate');
  const [guardPhone, setGuardPhone] = useState('+91 ');
  const [guestValidityDays, setGuestValidityDays] = useState<number>(1);
  const [isSavingGuard, setIsSavingGuard] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [copiedGuardId, setCopiedGuardId] = useState<string | null>(null);
  const [passwordModalGuard, setPasswordModalGuard] = useState<GuardAccount | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const loadGuards = async () => {
    setGuardsLoading(true);
    try {
      const data = await getGuardAccounts();
      setGuards(data);
    } catch (e) {
      console.warn("Failed to load guard accounts:", e);
    } finally {
      setGuardsLoading(false);
    }
  };

  // Logs state
  const [logViewMode, setLogViewMode] = useState<'system' | 'activity'>('system');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const loadLogs = () => {
    setLogs(appLogger.getLogs());
  };

  const checkQueue = async () => {
    try {
      const attCount = await localdb.syncQueue.count();
      const empCount = await localdb.employeeQueue.count();
      const parCount = await localdb.parcelQueue.count();
      setQueueBreakdown({ attendance: attCount, employees: empCount, parcels: parCount });
      setPendingSync(attCount + empCount + parCount);
    } catch (e) {
      console.error("Error reading queues", e);
    }
  };

  const handleSyncNow = async () => {
    if (!navigator.onLine) {
      alert("You are offline! Please reconnect to the internet to sync.");
      appLogger.warn("Sync", "Manual sync attempt skipped: Device is offline");
      return;
    }

    setIsSyncing(true);
    appLogger.info("Sync", "Starting manual cloud sync...");

    try {
      // 1. Sync Employees
      const emps = await localdb.employeeQueue.toArray();
      if (emps.length > 0) {
        for (const emp of emps) {
          const { error } = await supabase.from('employees').upsert(emp);
          if (!error) {
            await localdb.employeeQueue.delete(emp.empId);
            appLogger.info("Sync", `Synced profile: ${emp.name} (${emp.empId})`);
          } else {
            console.error("Sync employee error:", error);
            appLogger.error("Sync", `Failed syncing profile ${emp.name}: ${error.message || JSON.stringify(error)}`, error);
          }
        }
      }

      // 2. Sync Attendance Records
      const records = await localdb.syncQueue.toArray();
      if (records.length > 0) {
        for (const record of records) {
          const { error } = await supabase.from('attendance').upsert(record);
          if (!error) {
            await localdb.syncQueue.delete(record.recordId);
            appLogger.info("Sync", `Synced attendance: ${record.empName} (${record.recordId})`);
          } else {
            console.error("Sync attendance error:", error);
            appLogger.error("Sync", `Failed syncing attendance for ${record.empName}: ${error.message || JSON.stringify(error)}`, error);
          }
        }
      }

      // 3. Sync Parcels
      const parcels = await localdb.parcelQueue.toArray();
      if (parcels.length > 0) {
        for (const parcel of parcels) {
          const { error } = await supabase.from('parcels').upsert(parcel);
          if (!error) {
            await localdb.parcelQueue.delete(parcel.id);
            appLogger.info("Sync", `Synced parcel: ${parcel.company_name} (${parcel.id})`);
          } else {
            console.error("Sync parcel error:", error);
            appLogger.error("Sync", `Failed syncing parcel: ${error.message || JSON.stringify(error)}`, error);
          }
        }
      }

      appLogger.info("Sync", "Cloud sync operation finished.");
    } catch (err: any) {
      console.error("Sync failed:", err);
      appLogger.error("Sync", `General sync failure: ${err.message || String(err)}`, err);
    } finally {
      setIsSyncing(false);
      await checkQueue();
      loadLogs();
    }
  };

  const testDbConnection = async () => {
    if (!navigator.onLine) {
      setDbStatus({ status: 'error', message: 'Device is offline. Internet connection required.' });
      appLogger.warn("Supabase", "DB test connection skipped: Device is offline");
      return;
    }

    setTestingDb(true);
    setDbStatus({ status: 'idle' });
    const startTime = performance.now();

    try {
      const { error } = await supabase.from('employees').select('empId', { count: 'exact', head: true });
      const latency = Math.round(performance.now() - startTime);

      if (error) {
        setDbStatus({ status: 'error', message: error.message || 'Supabase request returned error' });
        appLogger.error("Supabase", `DB Connection Test Failed: ${error.message} (Code: ${error.code})`, error);
      } else {
        setDbStatus({ status: 'success', latency, message: `Connected to Supabase (${latency}ms latency)` });
        appLogger.info("Supabase", `DB Connection Test Success: Latency is ${latency}ms`);
      }
    } catch (err: any) {
      setDbStatus({ status: 'error', message: err.message || 'Connection failed' });
      appLogger.error("Supabase", `DB Connection Exception: ${err.message}`, err);
    } finally {
      setTestingDb(false);
      loadLogs();
    }
  };

  const handleCopyLogs = async () => {
    try {
      const report = appLogger.exportReport();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        // Fallback for Android WebViews or restricted clipboard contexts
        const textarea = document.createElement('textarea');
        textarea.value = report;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      alert("Failed to copy logs to clipboard.");
    }
  };

  const handleClearLogs = () => {
    if (confirm("Are you sure you want to clear all system logs?")) {
      appLogger.clear();
      setLogs([]);
    }
  };

  const handleEraseAllData = async () => {
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      alert('Please type DELETE to confirm data erasure.');
      return;
    }

    if (!navigator.onLine) {
      alert('You must be online to clear cloud data from Supabase.');
      return;
    }

    setIsResetting(true);
    try {
      // 1. Delete all attendance logs from Supabase
      const { error: attErr } = await supabase.from('attendance').delete().neq('recordId', '00000000-0000-0000-0000-000000000000');
      if (attErr) throw attErr;

      // 2. Delete all parcels from Supabase
      const { error: parErr } = await supabase.from('parcels').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (parErr) throw parErr;

      // 3. Delete all employee / visitor profiles from Supabase
      const { error: empErr } = await supabase.from('employees').delete().neq('empId', '___');
      if (empErr) throw empErr;

      // 4. Clear local IndexedDB queues
      await localdb.syncQueue.clear();
      await localdb.employeeQueue.clear();
      await localdb.parcelQueue.clear();

      // 5. Clear cached data and system logs in localStorage
      localStorage.removeItem('cached_logs');
      localStorage.removeItem('cached_employees');
      localStorage.removeItem('cached_parcels');
      appLogger.clear();

      appLogger.info('System', 'All test data successfully purged by administrator.');
      alert('All test data has been successfully erased! Your attendance logs, profiles, parcels, and local cache have been cleaned.');
      setShowResetModal(false);
      window.location.reload();
    } catch (err: any) {
      console.error('Reset failed:', err);
      alert('Failed to erase data: ' + (err.message || String(err)));
    } finally {
      setIsResetting(false);
    }
  };

  const handleSimulateTestError = () => {
    appLogger.error("DiagnosticTest", "Simulated error to verify logging and error detection features", {
      testTimestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      code: "TEST_ERR_404"
    });
    loadLogs();
  };

  useEffect(() => {
    loadLogs();
    loadGuards();

    // Check if installed in standalone PWA mode
    const checkStandalone = () => {
      const standalone = (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      );
      setIsStandalone(standalone);
    };
    checkStandalone();

    // Detect user device platform
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      setPlatform('ios');
    } else if (/Android/.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // PWA Install Prompt Listener
    const handlePrompt = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
    }

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      (window as any).deferredPrompt = null;
      appLogger.info("App", "PWA App installed successfully to device home screen.");
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Offline Detection
    const checkOffline = () => {
      setIsOffline(!navigator.onLine);
    };
    window.addEventListener('online', checkOffline);
    window.addEventListener('offline', checkOffline);
    checkOffline();

    // Check Sync Queue
    checkQueue();
    
    const handleOnline = async () => {
      checkOffline();
      await handleSyncNow();
    };
    
    // Auto-sync immediately if online on mount
    if (navigator.onLine) {
      handleOnline();
    }
    
    window.addEventListener('online', handleOnline);

    // Offline backup event listener
    const handleBackupCompleted = () => setOfflineStats(getOfflineBackupStats());
    window.addEventListener('ams_offline_backup_completed', handleBackupCompleted);

    // Live log listener
    const handleLogAdded = () => loadLogs();
    const handleLogCleared = () => setLogs([]);
    window.addEventListener('ams_log_added', handleLogAdded);
    window.addEventListener('ams_log_cleared', handleLogCleared);

    const handleGuardsUpdated = () => loadGuards();
    window.addEventListener('ams_guard_accounts_updated', handleGuardsUpdated);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', checkOffline);
      window.removeEventListener('offline', checkOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('ams_offline_backup_completed', handleBackupCompleted);
      window.removeEventListener('ams_log_added', handleLogAdded);
      window.removeEventListener('ams_log_cleared', handleLogCleared);
      window.removeEventListener('ams_guard_accounts_updated', handleGuardsUpdated);
    };
  }, []);

  const handleOpenAddGuard = (type: 'permanent' | 'guest' = 'permanent') => {
    setGuardType(type);
    setGuardName('');
    const randomNum = Math.floor(100 + Math.random() * 900);
    setGuardLoginId(type === 'guest' ? `guest${randomNum}` : `guard${randomNum}`);
    setGuardPassword(String(Math.floor(100000 + Math.random() * 900000)));
    setGuardGate('Main Gate');
    setGuardPhone('+91 ');
    setGuestValidityDays(1);
    setShowAddGuardModal(true);
  };

  const handleSaveGuardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardName.trim() || !guardLoginId.trim() || !guardPassword.trim()) {
      alert("Please fill in all required fields (Name, Login ID, Password).");
      return;
    }

    setIsSavingGuard(true);
    try {
      let expiresAt: string | null = null;
      if (guardType === 'guest') {
        const d = new Date();
        d.setDate(d.getDate() + guestValidityDays);
        expiresAt = d.toISOString();
      }

      const id = guardType === 'guest' 
        ? `GUEST-${Date.now().toString(36).toUpperCase()}` 
        : `GUARD-${Date.now().toString(36).toUpperCase()}`;

      const newAccount: GuardAccount = {
        id,
        loginId: guardLoginId.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''),
        name: guardName.trim(),
        password: guardPassword.trim(),
        type: guardType,
        gate: guardGate.trim() || 'Main Gate',
        phone: guardPhone.trim(),
        expiresAt,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      const res = await saveGuardAccount(newAccount);
      if (!res.success) throw new Error(res.error || "Failed to save guard account");

      await loadGuards();
      setShowAddGuardModal(false);
      alert(`Success! Created ${guardType === 'guest' ? 'Temporary Guest Guard' : 'Permanent Guard'} account for ${newAccount.name}. Login ID: ${newAccount.loginId}`);
    } catch (err: any) {
      alert("Error creating guard account: " + err.message);
    } finally {
      setIsSavingGuard(false);
    }
  };

  const handleDeleteGuardAccount = async (guard: GuardAccount) => {
    if (!window.confirm(`Are you sure you want to delete the login for ${guard.name} (${guard.loginId})? They will no longer be able to log in.`)) {
      return;
    }
    try {
      const res = await deleteGuardAccount(guard.id);
      if (!res.success) throw new Error(res.error || "Failed to delete guard");
      await loadGuards();
      alert(`Guard account for ${guard.name} has been removed.`);
    } catch (err: any) {
      alert("Error deleting guard: " + err.message);
    }
  };

  const handleCopyGuardCredentials = (guard: GuardAccount) => {
    const text = `Attendance Manager - Guard Login Details\nName: ${guard.name}\nType: ${guard.type === 'guest' ? 'Guest / Temporary Guard' : 'Permanent Guard'}\nLogin ID: ${guard.loginId}\nPassword: ${guard.password}\nGate: ${guard.gate || 'Main Gate'}${guard.expiresAt ? `\nValid Until: ${new Date(guard.expiresAt).toLocaleDateString()}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopiedGuardId(guard.id);
    setTimeout(() => setCopiedGuardId(null), 2500);
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalGuard || !newPasswordVal.trim()) return;

    setIsUpdatingPassword(true);
    try {
      const updated: GuardAccount = {
        ...passwordModalGuard,
        password: newPasswordVal.trim()
      };
      const res = await saveGuardAccount(updated);
      if (!res.success) throw new Error(res.error || "Failed to update password");
      await loadGuards();
      setPasswordModalGuard(null);
      setNewPasswordVal('');
      alert(`Password updated successfully for ${updated.name} (${updated.loginId}).`);
    } catch (err: any) {
      alert("Error updating password: " + err.message);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleInstallClick = async () => {
    syncOfflineDataBackup().then(() => setOfflineStats(getOfflineBackupStats())).catch(console.warn);
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? (window as any).deferredPrompt : null);
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          (window as any).deferredPrompt = null;
          setIsStandalone(true);
          appLogger.info("App", "User accepted PWA installation prompt.");
        }
      } catch (err) {
        console.warn("Install prompt failed, showing instructions:", err);
        setShowInstructions(true);
      }
    } else {
      setShowInstructions(true);
    }
  };

  // Filtered logs computation
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (selectedFilter !== 'all' && l.level !== selectedFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchMsg = l.message.toLowerCase().includes(query);
        const matchSource = l.source.toLowerCase().includes(query);
        const matchDetails = l.details ? l.details.toLowerCase().includes(query) : false;
        return matchMsg || matchSource || matchDetails;
      }
      return true;
    });
  }, [logs, selectedFilter, searchQuery]);

  const errorCount = useMemo(() => logs.filter(l => l.level === 'error').length, [logs]);
  const warnCount = useMemo(() => logs.filter(l => l.level === 'warn').length, [logs]);
  const infoCount = useMemo(() => logs.filter(l => l.level === 'info').length, [logs]);

  return (
    <div className="p-4 pb-24 max-w-md mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">Settings</h2>
          <p className="text-xs text-gray-500 font-medium">System configuration & diagnostics</p>
        </div>
        <span className="bg-purple-100 text-purple-700 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
          Admin Panel
        </span>
      </div>

      {/* Database Connection & Sync Status Card */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${isOffline ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <Database size={22} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">Database & Cloud Sync</h3>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className={`inline-flex items-center text-xs font-bold ${isOffline ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {isOffline ? (
                    <>
                      <WifiOff size={13} className="mr-1" /> Offline Mode
                    </>
                  ) : (
                    <>
                      <Wifi size={13} className="mr-1" /> Connected to Supabase
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={testDbConnection}
            disabled={testingDb}
            className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 transition-all flex items-center border border-blue-200/60 disabled:opacity-50"
            title="Probe Supabase database and test network latency"
          >
            {testingDb ? (
              <>
                <RefreshCw size={13} className="animate-spin mr-1" /> Testing...
              </>
            ) : (
              <>
                <Zap size={13} className="mr-1 text-blue-600" /> Ping DB
              </>
            )}
          </button>
        </div>

        {/* Database ping diagnostic feedback */}
        {dbStatus.status !== 'idle' && (
          <div className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
            dbStatus.status === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            <div className="flex items-center space-x-2">
              {dbStatus.status === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-red-600 shrink-0" />
              )}
              <span className="font-semibold">{dbStatus.message}</span>
            </div>
            {dbStatus.latency && (
              <span className="font-mono font-bold bg-white/80 px-2 py-0.5 rounded text-[10px] shadow-xs">
                {dbStatus.latency}ms
              </span>
            )}
          </div>
        )}

        {isOffline && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-start space-x-2.5">
            <CloudOff size={18} className="text-orange-500 mt-0.5 shrink-0" />
            <div className="text-xs text-orange-900 leading-relaxed">
              <p className="font-bold">Offline Mode Active</p>
              <p className="text-orange-800 mt-0.5">Scans, visitor registrations, and parcels are saved to local IndexedDB and will auto-sync upon reconnection.</p>
            </div>
          </div>
        )}

        {/* Pending Sync Queue breakdown */}
        <div className={`p-3.5 rounded-xl text-xs border ${
          pendingSync > 0 
            ? 'bg-blue-50/70 border-blue-200 text-blue-900' 
            : 'bg-gray-50 border-gray-100 text-gray-600'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold flex items-center text-xs">
              <Clock size={14} className="mr-1.5 text-blue-600" />
              {pendingSync > 0 ? `${pendingSync} Records Waiting in Local Queue` : "All records synced to cloud"}
            </span>

            {pendingSync > 0 && (
              <button 
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw size={13} className="animate-spin mr-1.5" /> Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={13} className="mr-1.5" /> Sync Now
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="bg-white px-2 py-1 rounded-md border border-gray-200/80 font-medium text-[11px] text-gray-700">
              Attendance: <b>{queueBreakdown.attendance}</b>
            </span>
            <span className="bg-white px-2 py-1 rounded-md border border-gray-200/80 font-medium text-[11px] text-gray-700">
              Profiles: <b>{queueBreakdown.employees}</b>
            </span>
            <span className="bg-white px-2 py-1 rounded-md border border-gray-200/80 font-medium text-[11px] text-gray-700">
              Parcels: <b>{queueBreakdown.parcels}</b>
            </span>
          </div>
        </div>
      </div>

      {/* PWA Device Installation Card */}
      {!isStandalone ? (
        <button 
          onClick={handleInstallClick}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-bold shadow-md flex items-center justify-center transition-all active:scale-95"
        >
          <Download size={20} className="mr-2" />
          Install App to Device (APK / PWA)
        </button>
      ) : (
        <div className="w-full bg-emerald-50 text-emerald-800 border border-emerald-200 p-3.5 rounded-2xl font-bold text-xs flex items-center justify-center shadow-xs">
          <CheckCircle2 size={18} className="mr-2 text-emerald-600" />
          App Successfully Installed & Ready Offline
        </div>
      )}

      {/* Offline Data Vault / Backup Status Card */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h4 className="font-bold text-gray-800 text-xs">Offline Backup Vault</h4>
              <p className="text-[11px] text-gray-500 font-medium">
                {offlineStats.isReady ? `${offlineStats.employeeCount} profiles & logs saved locally` : "Backing up..."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsSyncingBackup(true);
              await syncOfflineDataBackup();
              setOfflineStats(getOfflineBackupStats());
              setIsSyncingBackup(false);
              alert("Offline backup updated successfully! All profiles and logs are ready for offline use.");
            }}
            disabled={isSyncingBackup || !navigator.onLine}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 transition-all flex items-center border border-blue-200/60 disabled:opacity-50"
          >
            <RefreshCw size={12} className={`mr-1.5 ${isSyncingBackup ? 'animate-spin text-blue-600' : 'text-blue-600'}`} />
            {isSyncingBackup ? 'Backing up...' : 'Backup Now'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-500 font-medium">Profiles</p>
            <p className="font-extrabold text-gray-800 text-sm mt-0.5">{offlineStats.employeeCount}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-500 font-medium">Recent Logs</p>
            <p className="font-extrabold text-gray-800 text-sm mt-0.5">{offlineStats.logCount}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-500 font-medium">Parcels</p>
            <p className="font-extrabold text-gray-800 text-sm mt-0.5">{offlineStats.parcelCount}</p>
          </div>
        </div>
      </div>

      {showInstructions && (
        <div className="relative animate-fade-in">
          {platform === 'android' ? (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl relative shadow-sm">
              <button 
                onClick={() => setShowInstructions(false)} 
                className="absolute top-2.5 right-3 text-emerald-600 hover:text-emerald-800 text-xl font-bold"
              >
                ×
              </button>
              <h4 className="font-bold text-emerald-900 flex items-center mb-2 text-sm">
                <Download size={18} className="mr-2 text-emerald-600" /> How to Install on Android
              </h4>
              <p className="text-xs text-emerald-800 mb-3 font-medium">Follow these quick steps in Google Chrome or your Android browser:</p>
              <ol className="text-xs text-emerald-900 space-y-2 ml-1">
                <li className="flex items-start">
                  <span className="font-bold mr-2 bg-emerald-200 text-emerald-800 rounded-full w-5 h-5 flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                  <span>Tap the <b>three dots (⋮)</b> in the top-right corner of Chrome.</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2 bg-emerald-200 text-emerald-800 rounded-full w-5 h-5 flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                  <span>Tap <b>&quot;Install app&quot;</b> (or <b>&quot;Add to Home screen&quot;</b>).</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2 bg-emerald-200 text-emerald-800 rounded-full w-5 h-5 flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                  <span>Tap <b>Install</b>. The Attendance Manager icon will be placed on your phone and works 100% offline like a native app!</span>
                </li>
              </ol>
            </div>
          ) : platform === 'ios' ? (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl relative shadow-sm">
              <button 
                onClick={() => setShowInstructions(false)} 
                className="absolute top-2.5 right-3 text-blue-400 hover:text-blue-600 text-xl font-bold"
              >
                ×
              </button>
              <h4 className="font-bold text-blue-900 flex items-center mb-2 text-sm">
                <Info size={18} className="mr-2 text-blue-600" /> Apple iOS Instructions
              </h4>
              <p className="text-xs text-blue-800 mb-3 font-medium">To install on your iPhone or iPad using Safari:</p>
              <ol className="text-xs text-blue-800 space-y-2 ml-1">
                <li className="flex items-center">
                  1. Tap the <Share size={15} className="mx-1.5 bg-white p-0.5 rounded shadow-sm text-blue-600" /> <b>Share</b> icon at the bottom of Safari.
                </li>
                <li className="flex items-center">
                  2. Scroll down and tap <PlusSquare size={15} className="mx-1.5 text-gray-700" /> <b>Add to Home Screen</b>.
                </li>
              </ol>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl relative shadow-sm">
              <button 
                onClick={() => setShowInstructions(false)} 
                className="absolute top-2.5 right-3 text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
              <h4 className="font-bold text-gray-900 flex items-center mb-2 text-sm">
                <Download size={18} className="mr-2 text-blue-600" /> Install on Computer
              </h4>
              <p className="text-xs text-gray-700">
                Click the <b>Install</b> icon on the right side of your Chrome/Edge browser address bar to install this app on your desktop.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 🛡️ GUARD & GUEST GUARD CREDENTIALS MANAGEMENT SECTION */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/70 to-teal-50/70 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <Shield size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-gray-900 text-sm">Guard & Guest Logins</h3>
              <p className="text-[11px] text-gray-500 font-medium">Manage IDs & passwords for duty guards</p>
            </div>
          </div>

          <div className="flex space-x-1.5">
            <button
              type="button"
              onClick={() => handleOpenAddGuard('permanent')}
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center shadow-xs transition-all active:scale-95"
              title="Add Permanent Guard"
            >
              <UserPlus size={13} className="mr-1" />
              <span>+ Guard</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenAddGuard('guest')}
              className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center shadow-xs transition-all active:scale-95"
              title="Add Temporary Guest Guard"
            >
              <Clock size={13} className="mr-1" />
              <span>+ Guest</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Pill Row */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50/60 border-b border-gray-100 text-center text-xs font-bold">
          <div className="bg-white p-2 rounded-xl border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Total Logins</p>
            <p className="text-sm font-extrabold text-gray-800 mt-0.5">{guards.length}</p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-gray-100">
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-semibold">Permanent</p>
            <p className="text-sm font-extrabold text-emerald-700 mt-0.5">{guards.filter(g => g.type === 'permanent').length}</p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-gray-100">
            <p className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">Guest Guards</p>
            <p className="text-sm font-extrabold text-amber-700 mt-0.5">{guards.filter(g => g.type === 'guest').length}</p>
          </div>
        </div>

        {/* Guard List */}
        <div className="p-3 space-y-2.5 max-h-96 overflow-y-auto">
          {guardsLoading ? (
            <div className="py-8 text-center text-gray-400 text-xs">
              <RefreshCw size={18} className="animate-spin mx-auto mb-1 text-emerald-600" />
              Loading guard credentials...
            </div>
          ) : guards.length === 0 ? (
            <div className="py-8 text-center text-gray-400 space-y-1">
              <Shield size={24} className="mx-auto text-gray-300 mb-1" />
              <p className="font-bold text-gray-700 text-xs">No Guard Logins Found</p>
              <p className="text-[11px] text-gray-400">Tap "+ Guard" or "+ Guest" above to create credentials.</p>
            </div>
          ) : (
            guards.map((guard) => {
              const isPasswordVisible = !!showPasswordMap[guard.id];
              const isGuest = guard.type === 'guest';
              const isExpired = isGuest && guard.expiresAt && (Date.now() > new Date(guard.expiresAt).getTime());

              return (
                <div
                  key={guard.id}
                  className={`p-3 rounded-2xl border transition-all space-y-2 ${
                    isExpired 
                      ? 'bg-red-50/40 border-red-200' 
                      : isGuest 
                      ? 'bg-amber-50/30 border-amber-200/70 hover:border-amber-300' 
                      : 'bg-white border-gray-100 hover:border-emerald-200 shadow-2xs'
                  }`}
                >
                  {/* Top line: Name, Login ID, Type Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        isGuest ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isGuest ? <Clock size={16} /> : <Shield size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <h4 className="font-extrabold text-gray-900 text-xs truncate">{guard.name}</h4>
                          <span className={`text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-md shrink-0 ${
                            isExpired 
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : isGuest 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {isExpired ? 'Expired Guest' : isGuest ? 'Guest Guard' : 'Permanent'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                          Login ID: <span className="font-bold text-gray-800">{guard.loginId}</span> • {guard.gate || 'Main Gate'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Password & Expiry Row */}
                  <div className="flex items-center justify-between text-xs bg-gray-50/80 px-2.5 py-1.5 rounded-xl border border-gray-100">
                    <div className="flex items-center space-x-2 font-mono">
                      <KeyRound size={12} className="text-gray-400 shrink-0" />
                      <span className="text-gray-400 text-[10px]">PASS:</span>
                      <span className="font-bold text-gray-800 text-[11px]">
                        {isPasswordVisible ? guard.password : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPasswordMap(prev => ({ ...prev, [guard.id]: !prev[guard.id] }))}
                        className="text-gray-400 hover:text-gray-700 ml-1 p-0.5"
                        title={isPasswordVisible ? "Hide password" : "Show password"}
                      >
                        {isPasswordVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>

                    {isGuest && guard.expiresAt && (
                      <span className={`text-[10px] font-medium font-sans ${isExpired ? 'text-red-600 font-bold' : 'text-amber-700'}`}>
                        {isExpired ? 'Expired' : `Valid: ${new Date(guard.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons: Copy, Edit Password, Delete */}
                  <div className="flex items-center justify-end space-x-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCopyGuardCredentials(guard)}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-lg text-[11px] font-bold flex items-center space-x-1 transition-all"
                      title="Copy Login ID and Password to Clipboard"
                    >
                      {copiedGuardId === guard.id ? (
                        <>
                          <Check size={11} className="text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} className="text-gray-500" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPasswordModalGuard(guard);
                        setNewPasswordVal(guard.password);
                      }}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold flex items-center space-x-1 transition-all"
                      title="Change Password"
                    >
                      <KeyRound size={11} className="text-blue-600" />
                      <span>Password</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteGuardAccount(guard)}
                      className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                      title="Delete Guard Account"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 🛠️ LOGS & DIAGNOSTICS SECTION (ADMIN ERROR & EVENT LOGS) */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Section Header with View Mode Switch */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Terminal size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 text-sm">System Logs & Diagnostics</h3>
                <p className="text-[11px] text-gray-500 font-medium">Identify issues, errors & sync events</p>
              </div>
            </div>

            {/* Health Badge */}
            {errorCount > 0 ? (
              <span className="bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center">
                <AlertCircle size={12} className="mr-1" /> {errorCount} Error{errorCount > 1 ? 's' : ''}
              </span>
            ) : warnCount > 0 ? (
              <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center">
                <AlertTriangle size={12} className="mr-1" /> {warnCount} Warning{warnCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center">
                <ShieldCheck size={12} className="mr-1" /> Healthy
              </span>
            )}
          </div>

          {/* Toggle between System Error Logs and Attendance Activity Logs */}
          <div className="flex bg-gray-200/80 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setLogViewMode('system')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center ${
                logViewMode === 'system' 
                  ? 'bg-white text-gray-900 shadow-xs' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Bug size={14} className="mr-1.5 text-indigo-600" />
              <span>System & Error Logs</span>
              {errorCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[9px] font-bold">
                  {errorCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setLogViewMode('activity')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center ${
                logViewMode === 'activity' 
                  ? 'bg-white text-gray-900 shadow-xs' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity size={14} className="mr-1.5 text-blue-600" />
              <span>Attendance History</span>
            </button>
          </div>
        </div>

        {/* VIEW 1: SYSTEM & ERROR LOGS */}
        {logViewMode === 'system' && (
          <div className="p-4 space-y-3">
            {/* Action Bar (Copy, Refresh, Clear, Test) */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleCopyLogs}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center transition-colors shadow-xs active:scale-95"
                  title="Copy complete formatted diagnostic report to clipboard"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="mr-1 text-emerald-600" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={13} className="mr-1 text-gray-600" /> Copy Report
                    </>
                  )}
                </button>

                <button
                  onClick={loadLogs}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-1.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
                  title="Refresh logs stream"
                >
                  <RefreshCw size={14} />
                </button>

                <button
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  className="bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 p-1.5 rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-40"
                  title="Clear all system logs"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Simulate Test Error Button */}
              <button
                onClick={handleSimulateTestError}
                className="text-[11px] font-bold text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 border border-gray-200 px-2 py-1.5 rounded-xl transition-colors flex items-center"
                title="Add a test error log to verify error detection"
              >
                <Bug size={12} className="mr-1 text-indigo-500" /> Test Log
              </button>
            </div>

            {/* Filter Chips & Search Bar */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center space-x-1 text-xs">
                <button
                  onClick={() => setSelectedFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    selectedFilter === 'all' 
                      ? 'bg-gray-900 text-white shadow-xs' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  onClick={() => setSelectedFilter('error')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center ${
                    selectedFilter === 'error' 
                      ? 'bg-red-600 text-white shadow-xs' 
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  Errors ({errorCount})
                </button>
                <button
                  onClick={() => setSelectedFilter('warn')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center ${
                    selectedFilter === 'warn' 
                      ? 'bg-amber-600 text-white shadow-xs' 
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  Warn ({warnCount})
                </button>
                <button
                  onClick={() => setSelectedFilter('info')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center ${
                    selectedFilter === 'info' 
                      ? 'bg-blue-600 text-white shadow-xs' 
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  Info ({infoCount})
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter logs by message, source, or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Logs List Container */}
            <div className="max-h-[380px] overflow-y-auto space-y-2 pr-0.5 pt-1">
              {filteredLogs.length === 0 ? (
                <div className="py-8 text-center text-gray-400 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 p-4">
                  <ShieldCheck size={28} className="mx-auto text-emerald-500 mb-2 opacity-80" />
                  <p className="text-xs font-bold text-gray-600">No logs found</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {searchQuery ? 'No logs match your search filter.' : 'All system operations are healthy.'}
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const isError = log.level === 'error';
                  const isWarn = log.level === 'warn';

                  return (
                    <div 
                      key={log.id}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        isError 
                          ? 'bg-red-50/30 border-red-200/80 border-l-4 border-l-red-500' 
                          : isWarn 
                          ? 'bg-amber-50/30 border-amber-200/80 border-l-4 border-l-amber-500'
                          : 'bg-white border-gray-200/80 border-l-4 border-l-blue-500'
                      }`}
                    >
                      {/* Log header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-1.5">
                          {isError ? (
                            <AlertCircle size={14} className="text-red-600 shrink-0" />
                          ) : isWarn ? (
                            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                          ) : (
                            <Info size={14} className="text-blue-600 shrink-0" />
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider font-mono ${
                            isError ? 'bg-red-100 text-red-800' : isWarn ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {log.source}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-400">
                          {log.time}
                        </span>
                      </div>

                      {/* Log Message */}
                      <p className="text-gray-800 font-medium text-xs break-words leading-snug">
                        {log.message}
                      </p>

                      {/* Expandable Details / Stack */}
                      {(log.details || log.stack) && (
                        <div className="mt-2 pt-1 border-t border-gray-200/50">
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp size={12} className="mr-0.5" /> Hide Details
                              </>
                            ) : (
                              <>
                                <ChevronDown size={12} className="mr-0.5" /> View Diagnostic Details
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-1.5 animate-fade-in">
                              <pre className="p-2.5 bg-gray-900 text-gray-100 text-[10px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap break-all select-all leading-normal">
                                {log.details}
                                {log.stack ? `\n\nStack:\n${log.stack}` : ''}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: ATTENDANCE ACTIVITY LOGS (EMBEDDED LOGSTAB) */}
        {logViewMode === 'activity' && (
          <div className="p-4">
            <LogsTab embedded={true} />
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 🗑️ DATA CLEANUP & RESET (ERASE ALL TEST DATA)            */}
      {/* ======================================================== */}
      <div className="bg-red-50/50 border border-red-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-red-100 text-red-600 rounded-xl">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-red-950 text-sm">Data Cleanup & Reset</h3>
              <p className="text-xs text-red-700/80 font-medium">Erase all previous test data before live rollout</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-red-800 leading-relaxed">
          Wipe all test attendance records, registered profiles (Staff, Visitors, Vehicles), and parcels from cloud database and device cache. Admin credentials are safely preserved.
        </p>

        <button
          type="button"
          onClick={() => { setConfirmText(''); setShowResetModal(true); }}
          className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-300 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center transition-all shadow-xs active:scale-95"
        >
          <Trash2 size={15} className="mr-1.5 text-red-500" />
          Erase All Test Data & Logs
        </button>
      </div>

      {/* Create Guard Account Modal */}
      {showAddGuardModal && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative border border-gray-100 flex flex-col max-h-[92vh]">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                  <Shield size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                    {guardType === 'guest' ? 'Create Guest Guard Login' : 'Create Guard Login'}
                  </h3>
                  <p className="text-[11px] text-emerald-100 mt-0.5">
                    {guardType === 'guest' ? 'Temporary access for relief guard' : 'Permanent security guard access'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddGuardModal(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
                disabled={isSavingGuard}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveGuardSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Guard Type</label>
                <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setGuardType('permanent')}
                    className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center space-x-1 ${
                      guardType === 'permanent' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-500'
                    }`}
                  >
                    <Shield size={13} />
                    <span>Permanent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuardType('guest')}
                    className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center space-x-1 ${
                      guardType === 'guest' ? 'bg-white text-amber-800 shadow-xs' : 'text-gray-500'
                    }`}
                  >
                    <Clock size={13} />
                    <span>Guest / Temp</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Guard Name *</label>
                <input
                  type="text"
                  value={guardName}
                  onChange={(e) => setGuardName(e.target.value)}
                  placeholder={guardType === 'guest' ? "e.g. Guest Guard 1" : "e.g. Ramesh Singh"}
                  className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex space-x-2">
                <div className="w-1/2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Login ID *</label>
                  <input
                    type="text"
                    value={guardLoginId}
                    onChange={(e) => setGuardLoginId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. guard1"
                    className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                    required
                  />
                </div>
                <div className="w-1/2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Assigned Gate</label>
                  <input
                    type="text"
                    value={guardGate}
                    onChange={(e) => setGuardGate(e.target.value)}
                    placeholder="e.g. Main Gate"
                    className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">Password / PIN *</label>
                  <button
                    type="button"
                    onClick={() => setGuardPassword(String(Math.floor(100000 + Math.random() * 900000)))}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800"
                  >
                    ⚡ Generate PIN
                  </button>
                </div>
                <input
                  type="text"
                  value={guardPassword}
                  onChange={(e) => setGuardPassword(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500 tracking-wider"
                  required
                />
              </div>

              {/* Guest Guard Validity Duration */}
              {guardType === 'guest' && (
                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2">
                  <label className="block text-xs font-bold text-amber-900">Access Validity Duration</label>
                  <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                    {[
                      { label: '1 Day', days: 1 },
                      { label: '3 Days', days: 3 },
                      { label: '7 Days', days: 7 },
                      { label: '30 Days', days: 30 }
                    ].map(opt => (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => setGuestValidityDays(opt.days)}
                        className={`py-1.5 rounded-lg border text-center transition-all ${
                          guestValidityDays === opt.days
                            ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-amber-100/50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-800 font-medium text-center mt-1">
                    Pass will expire in {guestValidityDays} {guestValidityDays === 1 ? 'day' : 'days'}. Guard will be locked out automatically.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddGuardModal(false)}
                  disabled={isSavingGuard}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingGuard}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSavingGuard ? "Creating..." : "Save Guard"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordModalGuard && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative border border-gray-100">
            <div className="bg-blue-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyRound size={18} />
                <h3 className="font-extrabold text-sm">Change Guard Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalGuard(null)}
                className="p-1 rounded-full hover:bg-white/20 text-white"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveNewPassword} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 font-medium">Updating login password for:</p>
                <p className="font-bold text-gray-900 text-sm">{passwordModalGuard.name}</p>
                <p className="text-xs font-mono text-gray-500">ID: {passwordModalGuard.loginId}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">New Password / PIN *</label>
                  <button
                    type="button"
                    onClick={() => setNewPasswordVal(String(Math.floor(100000 + Math.random() * 900000)))}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                  >
                    ⚡ Generate PIN
                  </button>
                </div>
                <input
                  type="text"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500 tracking-wider"
                  required
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalGuard(null)}
                  disabled={isUpdatingPassword}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword || !newPasswordVal.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {isUpdatingPassword ? "Saving..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={26} />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-extrabold text-gray-900">Erase All Previous Data?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                This action is <b>permanent</b> and cannot be undone. It will delete:
              </p>
              <ul className="text-[11px] text-gray-600 text-left bg-gray-50 p-3 rounded-xl mt-3 space-y-1 font-medium border border-gray-100">
                <li>• All attendance check-in & check-out logs</li>
                <li>• All registered profiles (Staff, Vehicles, Visitors)</li>
                <li>• All parcel records</li>
                <li>• All pending offline sync queues & cache</li>
              </ul>
              <p className="text-[10px] text-emerald-600 font-bold mt-2">
                ✓ Your admin account will NOT be affected.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                Type <b>DELETE</b> to confirm:
              </label>
              <input
                type="text"
                placeholder="DELETE"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full text-center tracking-widest font-mono font-bold text-sm bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 uppercase"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEraseAllData}
                disabled={confirmText.trim().toUpperCase() !== 'DELETE' || isResetting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center"
              >
                {isResetting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin mr-1.5" /> Erasing...
                  </>
                ) : (
                  'Confirm Erase'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center pt-2">
        <p className="text-xs text-gray-400 font-medium">Attendance Manager v2.2 (Offline-Ready)</p>
      </div>
    </div>
  );
}
