"use client";
import { useState, useEffect } from "react";
import { Database, CheckCircle2, Download, CloudOff, Info, Share, PlusSquare } from "lucide-react";
import { localdb } from "@/lib/localdb";
import { supabase } from "@/lib/supabase";

export default function SettingsTab() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      return (window as any).deferredPrompt || null;
    }
    return null;
  });
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('android');

  useEffect(() => {
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
    const checkQueue = async () => {
      const attCount = await localdb.syncQueue.count();
      const empCount = await localdb.employeeQueue.count();
      setPendingSync(attCount + empCount);
    };
    checkQueue();
    
    const handleOnline = async () => {
      checkOffline();
      
      // Sync Employees first
      const emps = await localdb.employeeQueue.toArray();
      if (emps.length > 0) {
        for (const emp of emps) {
          const { error } = await supabase.from('employees').upsert(emp);
          if (!error) {
            await localdb.employeeQueue.delete(emp.empId);
          } else {
            console.error("Sync emp error:", error);
          }
        }
      }
      
      // Sync Attendance
      const records = await localdb.syncQueue.toArray();
      if (records.length > 0) {
        for (const record of records) {
          const { error } = await supabase.from('attendance').upsert(record);
          if (!error) {
            await localdb.syncQueue.delete(record.recordId);
          } else {
            console.error("Sync attendance error:", error);
          }
        }
      }
      
      checkQueue();
    };
    
    // Auto-sync immediately if online on mount
    if (navigator.onLine) {
      handleOnline();
    }
    
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', checkOffline);
      window.removeEventListener('offline', checkOffline);
      window.removeEventListener('online', handleOnline);
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
        }
      } catch (err) {
        console.warn("Install prompt failed, showing instructions:", err);
        setShowInstructions(true);
      }
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <div className="p-6 pb-20 max-w-md mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Settings</h2>

      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 bg-green-100 text-green-600 rounded-lg">
            <Database size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Database Connection</h3>
            <p className="text-xs text-green-600 font-medium flex items-center">
              <CheckCircle2 size={14} className="mr-1" /> Connected to Supabase
            </p>
          </div>
        </div>
        
        <p className="text-sm text-gray-500">
          This application is now directly connected to your Supabase PostgreSQL database.
        </p>

        {isOffline && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start space-x-2">
            <CloudOff size={18} className="text-orange-500 mt-0.5" />
            <div className="text-sm text-orange-800">
              <p className="font-bold">You are offline.</p>
              <p>Scans will be saved locally and synced automatically when you reconnect.</p>
            </div>
          </div>
        )}

        {pendingSync > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center justify-between">
            <span className="font-bold text-blue-800">{pendingSync} records waiting to sync.</span>
            <button 
              onClick={() => {
                if (navigator.onLine) {
                  // Re-trigger the same sync logic manually
                  const event = new Event('online');
                  window.dispatchEvent(event);
                } else {
                  alert("You are still offline!");
                }
              }}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium text-xs shadow-sm hover:bg-blue-700"
            >
              Sync Now
            </button>
          </div>
        )}
      </div>

      {!isStandalone ? (
        <button 
          onClick={handleInstallClick}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold shadow-md flex items-center justify-center transition-all active:scale-95"
        >
          <Download size={20} className="mr-2" />
          Install App to Device
        </button>
      ) : (
        <div className="w-full bg-emerald-50 text-emerald-800 border border-emerald-200 p-4 rounded-xl font-bold flex items-center justify-center shadow-sm">
          <CheckCircle2 size={20} className="mr-2 text-emerald-600" />
          App Successfully Installed & Ready Offline
        </div>
      )}

      {showInstructions && (
        <div className="relative mt-4 animate-fade-in">
          {platform === 'android' ? (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl relative shadow-sm">
              <button 
                onClick={() => setShowInstructions(false)} 
                className="absolute top-2.5 right-3 text-emerald-600 hover:text-emerald-800 text-xl font-bold"
              >
                ×
              </button>
              <h4 className="font-bold text-emerald-900 flex items-center mb-2">
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
                  <span>Tap <b>Install</b>. The Attendance Manager icon will be placed on your phone and works 100% offline like a native APK app!</span>
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
              <h4 className="font-bold text-blue-900 flex items-center mb-2">
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
              <h4 className="font-bold text-gray-900 flex items-center mb-2">
                <Download size={18} className="mr-2 text-blue-600" /> Install on Computer
              </h4>
              <p className="text-xs text-gray-700">
                Click the <b>Install</b> icon on the right side of your Chrome/Edge browser address bar to install this app on your desktop.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="text-center mt-10">
        <p className="text-xs text-gray-400">Attendance Manager v2.1 (Offline-Ready)</p>
      </div>
    </div>
  );
}
