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
  Layers
} from "lucide-react";
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

  // DB Diagnostic state
  const [testingDb, setTestingDb] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    status: 'idle' | 'success' | 'error';
    latency?: number;
    message?: string;
  }>({ status: 'idle' });

  // Logs state
  const [logViewMode, setLogViewMode] = useState<'system' | 'activity'>('system');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

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

    // Live log listener
    const handleLogAdded = () => loadLogs();
    const handleLogCleared = () => setLogs([]);
    window.addEventListener('ams_log_added', handleLogAdded);
    window.addEventListener('ams_log_cleared', handleLogCleared);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', checkOffline);
      window.removeEventListener('offline', checkOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('ams_log_added', handleLogAdded);
      window.removeEventListener('ams_log_cleared', handleLogCleared);
    };
  }, []);

  const handleInstallClick = async () => {
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

      {/* Footer Info */}
      <div className="text-center pt-2">
        <p className="text-xs text-gray-400 font-medium">Attendance Manager v2.2 (Offline-Ready)</p>
      </div>
    </div>
  );
}
