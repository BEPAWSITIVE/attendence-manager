"use client";
import { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase, AttendanceRecord, Employee } from "@/lib/supabase";
import { localdb } from "@/lib/localdb";
import { CheckCircle2, AlertCircle, X, Truck, Package, Search, ChevronRight, Loader2, Sparkles, Camera, Flashlight, FlashlightOff, WifiOff, ClipboardList, RefreshCw, Clock } from "lucide-react";
import { syncOfflineDataBackup, updateCachedEmployee, updateCachedAttendance } from "@/lib/offlineBackup";

const getCachedProfile = (id: string): Employee | null => {
  try {
    const cached = localStorage.getItem('cached_employees');
    if (cached) {
      const list: Employee[] = JSON.parse(cached);
      return list.find((e: any) => e.empId === id) || null;
    }
  } catch (e) {}
  return null;
};

const getCombinedRecords = async (id: string, date: string): Promise<any[]> => {
  const queue = await localdb.syncQueue.where({ empId: id, date: date }).toArray();
  let cachedToday: any[] = [];
  try {
    const raw = localStorage.getItem('cached_logs');
    if (raw) {
      const allLogs = JSON.parse(raw);
      cachedToday = allLogs.filter((r: any) => r.empId === id && r.date === date);
    }
  } catch(e) {}
  
  const map = new Map<string, any>();
  for (const r of cachedToday) {
    map.set(r.recordId || `${r.empId}_${r.inTimestamp}`, r);
  }
  for (const r of queue) {
    map.set(r.recordId || `${r.empId}_${r.inTimestamp}`, r);
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => (a.inTimestamp || 0) - (b.inTimestamp || 0));
  return merged;
};

const playSuccessSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // Audio context not allowed or supported
  }
};

export default function ScannerTab() {
  const [scanResult, setScanResult] = useState<{ success: boolean; msg: string; isVehicle?: boolean } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [cachedCount, setCachedCount] = useState(0);

  // Today's Attendance Modal States
  const [showTodayModal, setShowTodayModal] = useState(false);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [todayFilter, setTodayFilter] = useState<'all' | 'in' | 'out'>('all');
  const [todaySearch, setTodaySearch] = useState("");
  const [isLoadingToday, setIsLoadingToday] = useState(false);

  const updateOfflineState = () => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    try {
      const raw = localStorage.getItem('cached_employees');
      const list = raw ? JSON.parse(raw) : [];
      setCachedCount(Array.isArray(list) ? list.length : 0);
    } catch(e) {}
  };

  const fetchTodayRecords = async () => {
    setIsLoadingToday(true);
    const todayStr = new Date().toISOString().split('T')[0];
    let list: AttendanceRecord[] = [];

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('date', todayStr)
          .order('inTimestamp', { ascending: false });
        if (!error && data) list = data;
      } catch (e) {
        console.warn("Could not fetch today records online:", e);
      }
    }

    // Merge with cached_logs
    try {
      const raw = localStorage.getItem('cached_logs');
      if (raw) {
        const allLogs: AttendanceRecord[] = JSON.parse(raw);
        const cachedToday = allLogs.filter(r => r.date === todayStr);
        const map = new Map<string, AttendanceRecord>();
        for (const r of cachedToday) map.set(r.recordId, r);
        for (const r of list) map.set(r.recordId, r);
        list = Array.from(map.values());
      }
    } catch (e) {}

    // Merge with offline syncQueue
    try {
      const queue = await localdb.syncQueue.where({ date: todayStr }).toArray();
      const map = new Map<string, AttendanceRecord>();
      for (const r of list) map.set(r.recordId, r);
      for (const r of queue) map.set(r.recordId, r);
      list = Array.from(map.values());
    } catch (e) {}

    list.sort((a, b) => (b.inTimestamp || 0) - (a.inTimestamp || 0));
    setTodayRecords(list);
    setIsLoadingToday(false);

    window.dispatchEvent(new CustomEvent('ams_today_count_changed', { detail: { count: list.length } }));
    return list;
  };

  const handleOpenTodayModal = async () => {
    if (scannerRef.current) {
      try { scannerRef.current.pause(); } catch(e) {}
    }
    setShowTodayModal(true);
    await fetchTodayRecords();
  };

  const handleCloseTodayModal = () => {
    setShowTodayModal(false);
    if (scannerRef.current) {
      try { scannerRef.current.resume(); } catch(e) {}
    }
  };

  useEffect(() => {
    updateOfflineState();
    if (typeof window !== 'undefined') {
      if (navigator.onLine) {
        syncOfflineDataBackup().then(updateOfflineState).catch(console.warn);
      }
      window.addEventListener('online', updateOfflineState);
      window.addEventListener('offline', updateOfflineState);
      window.addEventListener('ams_offline_backup_completed', updateOfflineState);
      window.addEventListener('ams_open_today_modal', handleOpenTodayModal);
      fetchTodayRecords();
      return () => {
        window.removeEventListener('online', updateOfflineState);
        window.removeEventListener('offline', updateOfflineState);
        window.removeEventListener('ams_offline_backup_completed', updateOfflineState);
        window.removeEventListener('ams_open_today_modal', handleOpenTodayModal);
      };
    }
  }, []);

  const toggleTorch = async () => {
    const nextState = !isTorchOn;
    let applied = false;

    // Method 1: Via html5-qrcode applyVideoConstraints
    if (scannerRef.current) {
      try {
        await (scannerRef.current as any).applyVideoConstraints({
          advanced: [{ torch: nextState }]
        });
        applied = true;
      } catch (err1) {
        console.warn("html5-qrcode applyVideoConstraints torch failed:", err1);
      }
    }

    // Method 2: Direct media track constraints fallback
    if (!applied) {
      try {
        const video = document.querySelector('#reader video') as HTMLVideoElement;
        const stream = video?.srcObject as MediaStream;
        const track = stream?.getVideoTracks()?.[0];
        if (track) {
          await track.applyConstraints({
            advanced: [{ torch: nextState } as any]
          });
          applied = true;
        }
      } catch (err2) {
        console.warn("track.applyConstraints torch failed:", err2);
      }
    }

    if (applied) {
      setIsTorchOn(nextState);
    } else {
      alert("Flashlight is not supported or unavailable on this camera.");
    }
  };
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  const [vehicleModal, setVehicleModal] = useState<{
    profile: Employee;
    lastRecord: AttendanceRecord | null;
  } | null>(null);
  const [parcelModal, setParcelModal] = useState<{ profile: Employee; lastRecord: AttendanceRecord } | null>(null);
  const [pickerName, setPickerName] = useState("");
  
  const [driverName, setDriverName] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [visitedLocation, setVisitedLocation] = useState("");

  const startScanner = async () => {
    if (isScanning || scannerRef.current) return;
    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10 },
          onScanSuccess,
          undefined
        );
      } catch (firstErr: any) {
        console.warn("Direct facingMode environment failed, checking camera list...", firstErr);
        // Fallback for modern Android multi-camera devices
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const backCam = cameras.find(c => 
            c.label.toLowerCase().includes('back') || 
            c.label.toLowerCase().includes('rear') || 
            c.label.toLowerCase().includes('environment') ||
            c.label.toLowerCase().includes('0')
          ) || cameras[cameras.length - 1];

          await html5QrCode.start(
            backCam.id,
            { fps: 10 },
            onScanSuccess,
            undefined
          );
        } else {
          throw firstErr;
        }
      }
      setIsScanning(true);
    } catch (err: any) {
      console.error("Failed to start scanner on device:", err);
      setScanResult({ 
        success: false, 
        msg: "Camera access failed. Please ensure camera permission is allowed in your browser settings." 
      });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        if (isTorchOn) {
          try {
            const video = document.querySelector('#reader video') as HTMLVideoElement;
            const stream = video?.srcObject as MediaStream;
            const track = stream?.getVideoTracks()?.[0];
            await track?.applyConstraints({ advanced: [{ torch: false } as any] });
          } catch (e) {}
          setIsTorchOn(false);
        }
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        setIsScanning(false);
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  };

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  const onScanSuccess = async (decodedText: string) => {
    try {
      const data = JSON.parse(decodedText);
      const empId = data.empId;
      if (!empId) throw new Error("Invalid format");

      if (scannerRef.current) {
        try { scannerRef.current.pause(); } catch(e) {}
      }

      const today = new Date();
      const dateStr = today.toISOString().split("T")[0];
      const timeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let empData: Employee | null = null;
      let existingRecords: any[] = [];
      
      if (navigator.onLine) {
        try {
          const { data: profile } = await supabase.from('employees').select('*').eq('empId', empId).single();
          if (profile) {
            empData = profile;
            updateCachedEmployee(profile);
          } else {
            empData = getCachedProfile(empId);
          }

          const { data: existing } = await supabase
            .from('attendance')
            .select('*')
            .eq('date', dateStr)
            .eq('empId', empId)
            .order('inTimestamp', { ascending: true });
          
          const localQueue = await localdb.syncQueue.where({ empId: empId, date: dateStr }).toArray();
          const combined = [...(existing || []), ...localQueue];
          combined.sort((a, b) => (a.inTimestamp || 0) - (b.inTimestamp || 0));
          existingRecords = combined;
        } catch (netErr) {
          console.warn("Online scan fetch failed, using offline fallback:", netErr);
          empData = getCachedProfile(empId);
          existingRecords = await getCombinedRecords(empId, dateStr);
        }
      } else {
        empData = getCachedProfile(empId);
        existingRecords = await getCombinedRecords(empId, dateStr);
      }
      
      if (!empData) {
        setScanResult({ success: false, msg: `Profile ${empId} not found.` });
        setTimeout(() => {
          setScanResult(null);
          if (scannerRef.current) { try { scannerRef.current.resume(); } catch(e) {} }
        }, 3000);
        return;
      }

      const emp = empData;
      let lastRecord = existingRecords.length > 0 ? existingRecords[existingRecords.length - 1] : null;

      if (emp.category === 'Vehicle') {
        setVehicleModal({ profile: emp, lastRecord });
        return; 
      }
      
      if (emp.category === 'Parcel' && lastRecord && lastRecord.status === 'IN') {
        setParcelModal({ profile: emp, lastRecord });
        return;
      }

      if (lastRecord && lastRecord.status === 'IN') {
        const outTimestamp = today.getTime();
        const diffMs = outTimestamp - lastRecord.inTimestamp;
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        
        const updatedRecord = {
          ...lastRecord,
          empName: emp.name || lastRecord.empName,
          department: emp.department || lastRecord.department,
          category: emp.category || lastRecord.category,
          outTime: timeStr,
          outTimestamp: outTimestamp,
          totalHours: `${hrs}h ${mins}m`,
          status: 'OUT',
          isSynced: navigator.onLine ? 1 : 0,
          updatedAt: today.toISOString()
        };

        if (navigator.onLine) {
          await supabase.from('attendance').update(updatedRecord).eq('recordId', lastRecord.recordId);
        } else {
          await localdb.syncQueue.put(updatedRecord);
        }
        updateCachedAttendance(updatedRecord as any);
        
        playSuccessSound();
        setScanResult({ success: true, msg: `${emp.name} Checked OUT at ${timeStr}` + (navigator.onLine ? '' : ' (Offline)') });
      } else {
        const newRecord = {
          recordId: crypto.randomUUID(),
          empId: emp.empId,
          empName: emp.name,
          department: emp.department,
          category: emp.category,
          date: dateStr,
          inTime: timeStr,
          inTimestamp: today.getTime(),
          status: 'IN',
          isSynced: navigator.onLine ? 1 : 0,
          updatedAt: today.toISOString()
        };

        if (navigator.onLine) {
          await supabase.from('attendance').insert([newRecord]);
        } else {
          await localdb.syncQueue.put(newRecord);
        }
        updateCachedAttendance(newRecord as any);
        
        playSuccessSound();
        setScanResult({ success: true, msg: `${emp.name} Checked IN at ${timeStr}` + (navigator.onLine ? '' : ' (Offline)') });
      }

      setTimeout(() => {
        setScanResult(null);
        if (scannerRef.current) {
          try { scannerRef.current.resume(); } catch(e) {}
        }
        fetchTodayRecords();
      }, 2500);

    } catch (err) {
      console.error(err);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e) {}
      }
    }
  };

  const handleVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleModal) return;
    
    const { profile, lastRecord } = vehicleModal;
    const isDispatching = !lastRecord || lastRecord.status === 'OUT'; 
    
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const timeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isDispatching) {
      const newRecord = {
        recordId: crypto.randomUUID(),
        empId: profile.empId,
        empName: profile.name,
        department: profile.department,
        category: profile.category,
        date: dateStr,
        inTime: timeStr,
        inTimestamp: today.getTime(),
        status: 'IN',
        driver_name: driverName,
        meter_out: parseFloat(meterReading),
        isSynced: navigator.onLine ? 1 : 0,
        updatedAt: today.toISOString()
      };

      if (navigator.onLine) {
        await supabase.from('attendance').insert([newRecord]);
      } else {
        await localdb.syncQueue.put(newRecord);
      }
      updateCachedAttendance(newRecord as any);
      playSuccessSound();
      setScanResult({ success: true, isVehicle: true, msg: `Vehicle ${profile.name} Dispatched by ${driverName}` + (navigator.onLine ? '' : ' (Offline)') });
    } else {
      const meterOut = lastRecord.meter_out || 0;
      const meterIn = parseFloat(meterReading);
      const consumed = meterIn >= meterOut ? meterIn - meterOut : 0;
      
      const updatedRecord = {
        ...lastRecord,
        empName: profile.name || lastRecord.empName,
        category: profile.category || lastRecord.category || 'Vehicle',
        outTime: timeStr,
        outTimestamp: today.getTime(),
        meter_in: meterIn,
        location: visitedLocation,
        totalHours: `${consumed} units consumed`,
        status: 'OUT',
        isSynced: navigator.onLine ? 1 : 0,
        updatedAt: today.toISOString()
      };

      if (navigator.onLine) {
        await supabase.from('attendance').update(updatedRecord).eq('recordId', lastRecord.recordId);
      } else {
        await localdb.syncQueue.put(updatedRecord);
      }
      updateCachedAttendance(updatedRecord as any);
      playSuccessSound();
      setScanResult({ success: true, isVehicle: true, msg: `Vehicle ${profile.name} Returned. ${consumed} units used.` + (navigator.onLine ? '' : ' (Offline)') });
    }

    setVehicleModal(null);
    setDriverName("");
    setMeterReading("");
    setVisitedLocation("");
    
    setTimeout(() => {
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e) {}
      }
    }, 3000);
  };

    useEffect(() => {
    const query = searchPhone.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    const timer = setTimeout(async () => {
      let results: Employee[] = [];
      if (navigator.onLine) {
        const { data } = await supabase.from('employees').select('*').or(`phone.ilike.%${query}%,name.ilike.%${query}%`).limit(15);
        if (data) results = data;
      } else {
        const cached = localStorage.getItem('cached_employees');
        if (cached) {
          const emps: Employee[] = JSON.parse(cached);
          const lowerQuery = query.toLowerCase();
          results = emps.filter(e => 
            (e.phone && e.phone.includes(query)) || 
            (e.name && e.name.toLowerCase().includes(lowerQuery))
          ).slice(0, 15);
        }
      }
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchPhone, navigator.onLine]);

  const handleSnapshotScan = async () => {
    if (aiLoading) return;
    
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    if (!video) {
      alert("Camera feed not found. Please wait for the camera to start.");
      return;
    }

    setAiLoading(true);
    try {
      const canvas = document.createElement('canvas');
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      const MAX_DIM = 1024;
      if (width > height && width > MAX_DIM) {
        height *= MAX_DIM / width;
        width = MAX_DIM;
      } else if (height > MAX_DIM) {
        width *= MAX_DIM / height;
        height = MAX_DIM;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, width, height);
      
      const base64 = canvas.toDataURL('image/jpeg', 0.6);
      
      // Flash effect
      const flash = document.createElement('div');
      flash.className = 'absolute inset-0 bg-white z-[100] animate-pulse';
      document.getElementById('reader-container')?.appendChild(flash);
      setTimeout(() => flash.remove(), 200);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [base64] })
      });
      
      if (!res.ok) {
        let errorTxt = "Unknown error";
        try {
          const errData = await res.json();
          errorTxt = errData.error || errData.message || res.statusText;
        } catch(e) {
          errorTxt = await res.text();
        }
        alert("Server Error: " + errorTxt.substring(0, 100));
        setAiLoading(false);
        return;
      }
      
      const data = await res.json();
      setAiLoading(false);
      
      if (data.error) {
        alert("AI Error: " + data.error);
        return;
      }
      
      if (data.type === 'unknown') {
        alert("Could not recognize this as an ID or Parcel. Please try again.");
        return;
      }

      window.dispatchEvent(new CustomEvent('ai_scan_result', { detail: { ...data, capturedImage: base64 } }));
    } catch (err: any) {
      alert("AI Scan failed: " + err.message);
      setAiLoading(false);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_DIM = 1024;
        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAiScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiLoading(true);
    try {
      const base64 = await compressImage(file);
      
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [base64] })
      });
      
      if (!res.ok) {
        let errorTxt = "Unknown error";
        try {
          const errData = await res.json();
          errorTxt = errData.error || errData.message || res.statusText;
        } catch(e) {
          errorTxt = await res.text();
        }
        alert("Server Error: " + errorTxt.substring(0, 100));
        setAiLoading(false);
        return;
      }
      
      const data = await res.json();
      setAiLoading(false);
      
      if (data.error) {
        alert("AI Error: " + data.error);
        return;
      }
      
      if (data.type === 'unknown') {
        alert("Could not recognize this as an ID or Parcel. Please try again.");
        return;
      }

      window.dispatchEvent(new CustomEvent('ai_scan_result', { detail: { ...data, capturedImage: base64 } }));
    } catch (err: any) {
      alert("AI Scan failed: " + err.message);
      setAiLoading(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => { e.preventDefault(); };

  const handleManualSelect = (empId: string) => {
    setManualModalOpen(false);
    setSearchPhone("");
    setSearchResults([]);
    onScanSuccess(JSON.stringify({ empId }));
  };

  const cancelVehicleScan = () => {
    setVehicleModal(null);
    setDriverName("");
    setMeterReading("");
    setVisitedLocation("");
    if (scannerRef.current) { try { scannerRef.current.resume(); } catch(e) {} }
  };

  const handleParcelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parcelModal) return;
    
    const { profile, lastRecord } = parcelModal;
    const today = new Date();
    const timeStr = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updatedRecord = {
      ...lastRecord,
      outTime: timeStr,
      outTimestamp: today.getTime(),
      driver_name: pickerName, // Overload driver_name to store picker name
      status: 'OUT',
      isSynced: navigator.onLine ? 1 : 0,
      updatedAt: today.toISOString()
    };

    if (navigator.onLine) {
      await supabase.from('attendance').update(updatedRecord).eq('recordId', lastRecord.recordId);
    } else {
      await localdb.syncQueue.put(updatedRecord);
    }
    updateCachedAttendance(updatedRecord as any);
    
    playSuccessSound();
    setScanResult({ success: true, msg: `Parcel picked up by ${pickerName}` + (navigator.onLine ? '' : ' (Offline)') });
    setParcelModal(null);
    setPickerName("");
    
    setTimeout(() => {
      setScanResult(null);
      if (scannerRef.current) {
        try { scannerRef.current.resume(); } catch(e) {}
      }
    }, 3000);
  };

  return (
    <div className="w-full h-full flex flex-col relative bg-transparent px-6 justify-center pb-24">
      
      {/* Background decorations for empty state */}
      <div className="fixed bottom-32 -left-6 opacity-80 pointer-events-none z-0">
        <svg width="120" height="150" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 150C10 100 40 70 80 50" stroke="#34D399" strokeWidth="4" strokeLinecap="round" />
          <path d="M40 100C30 80 15 70 0 70C15 90 20 100 40 100Z" fill="#34D399" />
          <path d="M60 70C50 50 35 40 20 40C35 60 40 70 60 70Z" fill="#34D399" />
          <path d="M80 50C70 30 55 20 40 20C55 40 60 50 80 50Z" fill="#10B981" />
        </svg>
      </div>
      <div className="fixed bottom-40 -left-4 w-20 h-12 bg-blue-100 rounded-full opacity-60 mix-blend-multiply blur-sm z-0"></div>

      {/* Embedded Square Camera Viewport */}
      <div className="relative w-full aspect-square bg-gray-100 rounded-[32px] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-[6px] border-[#EAF3FF] z-10 mb-8 mt-4">
        
        <div id="reader" className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full"></div>
        
        {/* Offline Ready Badge on Camera View */}
        {isOffline && (
          <div className="absolute top-4 left-4 z-20 bg-amber-500/90 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-md backdrop-blur-xs flex items-center animate-fade-in">
            <WifiOff size={11} className="mr-1" />
            <span>Offline Ready ({cachedCount})</span>
          </div>
        )}

        {/* Cyan Brackets Overlay */}
        <div className="absolute inset-0 pointer-events-none p-6">
          <div className="w-full h-full relative">
            <div className="absolute top-0 left-0 w-12 h-12 border-t-[4px] border-l-[4px] border-[#38bdf8] rounded-tl-3xl"></div>
            <div className="absolute top-0 right-0 w-12 h-12 border-t-[4px] border-r-[4px] border-[#38bdf8] rounded-tr-3xl"></div>
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[4px] border-l-[4px] border-[#38bdf8] rounded-bl-3xl"></div>
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[4px] border-r-[4px] border-[#38bdf8] rounded-br-3xl"></div>
          </div>
        </div>

        {/* Flashlight / Torch Toggle Button */}
        {isScanning && (
          <button
            type="button"
            onClick={toggleTorch}
            className={`absolute top-4 right-4 z-20 px-3 py-2 rounded-2xl shadow-lg backdrop-blur-md transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer ${
              isTorchOn 
                ? 'bg-amber-400 text-amber-950 shadow-amber-400/50 ring-2 ring-amber-300' 
                : 'bg-black/50 hover:bg-black/70 text-white border border-white/20'
            }`}
            title={isTorchOn ? "Turn Flashlight OFF" : "Turn Flashlight ON"}
            aria-label={isTorchOn ? "Turn Flashlight OFF" : "Turn Flashlight ON"}
          >
            {isTorchOn ? (
              <>
                <Flashlight size={17} className="fill-amber-950" />
                <span className="text-[11px] font-extrabold tracking-wide">FLASH ON</span>
              </>
            ) : (
              <>
                <FlashlightOff size={17} />
                <span className="text-[11px] font-bold tracking-wide">Flash</span>
              </>
            )}
          </button>
        )}
      </div>

      <button 
        onClick={() => { setManualModalOpen(true); if (scannerRef.current) { try { scannerRef.current.pause(); } catch(e) {} } }}
        className="w-full bg-white border border-gray-100 py-3.5 px-4 rounded-[20px] flex items-center justify-between shadow-sm z-10 hover:bg-gray-50 active:scale-95 transition-transform"
      >
        <div className="flex items-center">
          <div className="bg-gray-100 text-gray-500 p-2 rounded-xl mr-4">
            <Search size={20} />
          </div>
          <div className="text-left">
            <span className="block text-gray-800 font-bold text-sm">Forgot QR Code?</span>
            <span className="block text-gray-400 text-[10px] font-bold uppercase tracking-wider mt-0.5">Search Name or Phone</span>
          </div>
        </div>
        <div className="text-gray-400">
          <ChevronRight size={20} />
        </div>
      </button>
        {/* AI Snapshot Button (Moved below scanner) */}
        <button
          onClick={handleSnapshotScan}
          disabled={aiLoading}
          className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white py-4 px-4 rounded-[20px] flex items-center justify-center shadow-md z-10 hover:opacity-90 active:scale-95 transition-all mt-4 disabled:opacity-50"
        >
          {aiLoading ? (
            <><Loader2 size={24} className="animate-spin mr-2" /> <span className="font-bold">Analyzing with AI...</span></>
          ) : (
            <><Camera size={24} className="mr-2" /> <span className="font-bold">Take Photo & AI Scan</span></>
          )}
        </button>
        


            {/* Manual Search Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-start pt-[10vh] justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[80vh]">
            <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-gray-800">Manual Entry</h3>
              <button onClick={() => { setManualModalOpen(false); setSearchResults([]); if (scannerRef.current) { try { scannerRef.current.resume(); } catch(e) {} } }} className="text-gray-400 hover:text-gray-800">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 shrink-0">
              <form onSubmit={handleManualSearch} className="flex space-x-2">
                <input 
                  type="text" 
                  value={searchPhone}
                  onChange={e => setSearchPhone(e.target.value)}
                  placeholder="Name or Phone Number"
                  className="flex-1 bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  autoFocus
                />
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white p-3 rounded-xl font-bold shadow-md active:scale-95 transition-transform"
                >
                  <Search size={20} />
                </button>
              </form>
            </div>

            <div className="overflow-y-auto p-5 pt-0 flex-1 space-y-3 bg-gray-50/50">
              {isSearching && <div className="text-center text-sm text-gray-400 py-4">Searching...</div>}
              
              {!isSearching && searchResults.length === 0 && searchPhone !== "+91 " && (
                <div className="text-center text-sm text-gray-400 py-4">No profiles found for this number.</div>
              )}
              
              {searchResults.map(emp => (
                <div key={emp.empId} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-gray-800">{emp.name}</h4>
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{emp.category || 'Staff'}</span>
                  </div>
                  <button 
                    onClick={() => handleManualSelect(emp.empId)}
                    className="bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-lg font-bold text-xs transition-colors"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Result Toast */}
      {scanResult && !vehicleModal && !parcelModal && (
        <div className="fixed top-8 left-0 right-0 px-4 z-[110] flex justify-center animate-bounce-in">
          <div className={`px-5 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 w-full max-w-sm
            ${scanResult.success 
              ? (scanResult.isVehicle ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')
              : 'bg-red-500 text-white'}`}>
            {scanResult.success 
              ? (scanResult.isVehicle ? <Truck size={24} /> : <CheckCircle2 size={24} />) 
              : <AlertCircle size={24} />}
            <span className="font-bold">{scanResult.msg}</span>
          </div>
        </div>
      )}

      {/* Vehicle Action Modal */}
      {vehicleModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="bg-amber-500 p-6 text-white text-center">
              <Truck size={40} className="mx-auto mb-2 opacity-90" />
              <h3 className="text-xl font-bold">{vehicleModal.profile.name}</h3>
              <p className="opacity-80 text-sm font-mono mt-1">{vehicleModal.profile.vehicle_plate}</p>
            </div>
            
            <form onSubmit={handleVehicleSubmit} className="p-6 space-y-4">
              {(!vehicleModal.lastRecord || vehicleModal.lastRecord.status === 'OUT') ? (
                <>
                  <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm font-bold text-center mb-2">
                    Dispatching Vehicle (Leaving Base)
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Driver Name *</label>
                    <input 
                      type="text" 
                      value={driverName}
                      onChange={e => setDriverName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Current Meter Reading *</label>
                    <input 
                      type="number" 
                      step="any"
                      value={meterReading}
                      onChange={e => setMeterReading(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm font-bold text-center mb-2">
                    Returning Vehicle (Arriving at Base)
                  </div>
                  <div className="text-center text-sm text-gray-500 mb-4">
                    Dispatched by: <span className="font-bold text-gray-800">{vehicleModal.lastRecord.driver_name}</span><br/>
                    Previous Meter: <span className="font-mono font-bold text-gray-800">{vehicleModal.lastRecord.meter_out}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Return Meter Reading *</label>
                    <input 
                      type="number" 
                      step="any"
                      value={meterReading}
                      onChange={e => setMeterReading(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono mb-3"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Location Visited *</label>
                    <input 
                      type="text" 
                      value={visitedLocation}
                      onChange={e => setVisitedLocation(e.target.value)}
                      placeholder="e.g. City Hospital, Downtown"
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </>
              )}

              <div className="flex space-x-3 pt-2">
                <button 
                  type="button" 
                  onClick={cancelVehicleScan}
                  className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold shadow-md"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Today Attendance Popup Modal for Guards */}
      {showTodayModal && (() => {
        const filteredToday = todayRecords.filter(r => {
          if (todayFilter === 'in' && r.status !== 'IN') return false;
          if (todayFilter === 'out' && r.status !== 'OUT') return false;
          if (todaySearch.trim()) {
            const q = todaySearch.toLowerCase().trim();
            const nameMatch = (r.empName || '').toLowerCase().includes(q);
            const idMatch = (r.empId || '').toLowerCase().includes(q);
            const deptMatch = (r.department || '').toLowerCase().includes(q);
            const driverMatch = (r.driver_name || '').toLowerCase().includes(q);
            return nameMatch || idMatch || deptMatch || driverMatch;
          }
          return true;
        });

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
              {/* Header */}
              <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-gray-800 text-base">Today's Attendance</h3>
                    <p className="text-[11px] text-gray-500 font-medium">
                      {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseTodayModal}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-white transition-colors"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Quick Summary Counts */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50/80 border-b border-gray-100 text-center">
                <button 
                  type="button"
                  onClick={() => setTodayFilter('all')}
                  className={`p-2 rounded-xl border transition-all ${
                    todayFilter === 'all' 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <p className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Total Scans</p>
                  <p className="text-base font-extrabold mt-0.5">{todayRecords.length}</p>
                </button>

                <button 
                  type="button"
                  onClick={() => setTodayFilter('in')}
                  className={`p-2 rounded-xl border transition-all ${
                    todayFilter === 'in' 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' 
                      : 'bg-white text-emerald-800 border-gray-200 hover:bg-emerald-50'
                  }`}
                >
                  <p className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Currently IN</p>
                  <p className="text-base font-extrabold mt-0.5 text-emerald-600">{todayRecords.filter(r => r.status === 'IN').length}</p>
                </button>

                <button 
                  type="button"
                  onClick={() => setTodayFilter('out')}
                  className={`p-2 rounded-xl border transition-all ${
                    todayFilter === 'out' 
                      ? 'bg-gray-700 text-white border-gray-700 shadow-xs font-bold' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <p className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Checked OUT</p>
                  <p className="text-base font-extrabold mt-0.5">{todayRecords.filter(r => r.status === 'OUT').length}</p>
                </button>
              </div>

              {/* Search Filter */}
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={todaySearch}
                    onChange={(e) => setTodaySearch(e.target.value)}
                    placeholder="Search by name, ID, vehicle, driver..."
                    className="w-full bg-gray-50 border border-gray-200 pl-8 pr-8 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  {todaySearch && (
                    <button
                      type="button"
                      onClick={() => setTodaySearch("")}
                      className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Records List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {isLoadingToday ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <Loader2 size={24} className="animate-spin mx-auto text-blue-600" />
                    <p className="text-xs">Loading today's attendance...</p>
                  </div>
                ) : filteredToday.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 space-y-1">
                    <ClipboardList size={30} className="mx-auto text-gray-300 mb-1" />
                    <p className="font-bold text-gray-700 text-xs">No records found</p>
                    <p className="text-[11px] text-gray-400">
                      {todayRecords.length === 0 
                        ? "No attendance scans recorded yet today." 
                        : "No records match your search or filter."}
                    </p>
                  </div>
                ) : (
                  filteredToday.map((r) => (
                    <div
                      key={r.recordId}
                      className="bg-white border border-gray-100 hover:border-blue-200 p-3.5 rounded-2xl shadow-2xs transition-all space-y-2.5"
                    >
                      {/* Top Row: Avatar + Full Proper Name + Category Badge on left, Status Badge on right */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start space-x-3 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs mt-0.5 ${
                            r.category === 'Vehicle' ? 'bg-amber-100 text-amber-700' :
                            r.category === 'Volunteer' ? 'bg-purple-100 text-purple-700' :
                            r.category === 'Visitor' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {r.empName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center flex-wrap gap-1.5">
                              <h4 className="font-extrabold text-gray-900 text-sm leading-tight break-words">
                                {r.empName || 'Unknown Name'}
                              </h4>
                              <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                r.category === 'Vehicle' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                r.category === 'Volunteer' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                r.category === 'Visitor' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {r.category || 'Staff'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 font-mono mt-1 break-all">
                              {r.empId} • {r.department || 'General'}
                              {r.driver_name && ` • Driver: ${r.driver_name}`}
                              {r.location && ` • Destination: ${r.location}`}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0 pt-0.5">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase shadow-2xs ${
                            r.status === 'IN' 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}>
                            {r.status === 'IN' ? '● IN' : 'OUT'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: Dedicated In & Out Times Section */}
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-mono bg-gray-50/80 px-3 py-2 rounded-xl">
                        <div className="flex items-center space-x-1.5 text-emerald-800 font-bold">
                          <span className="text-[10px] uppercase font-semibold text-gray-400 font-sans">IN:</span>
                          <span>{r.inTime || '--:--'}</span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] uppercase font-semibold text-gray-400 font-sans">OUT:</span>
                          {r.outTime ? (
                            <span className="font-bold text-gray-800">
                              {r.outTime}
                              {r.totalHours && (
                                <span className="text-[10px] font-sans text-gray-500 ml-1.5 font-normal">
                                  ({r.totalHours})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[11px] font-sans font-bold text-emerald-600 italic">
                              Still Inside
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-500 font-medium">
                  Showing {filteredToday.length} of {todayRecords.length} records
                </span>
                <button
                  type="button"
                  onClick={fetchTodayRecords}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center py-1 px-2 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <RefreshCw size={12} className={`mr-1 ${isLoadingToday ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Parcel Action Modal */}
      {parcelModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="bg-purple-500 p-6 text-white text-center">
              <Package size={40} className="mx-auto mb-2 opacity-90" />
              <h3 className="text-xl font-bold">{parcelModal.profile.name}</h3>
              <p className="opacity-80 text-sm font-mono mt-1">{parcelModal.profile.empId}</p>
            </div>
            
            <form onSubmit={handleParcelSubmit} className="p-6 space-y-4">
              <div className="bg-purple-50 text-purple-800 p-3 rounded-lg text-sm font-bold text-center mb-2">
                Parcel Pickup Authorization
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Name of Person Picking Up *</label>
                <input 
                  type="text" 
                  value={pickerName}
                  onChange={e => setPickerName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setParcelModal(null); setPickerName(""); if (scannerRef.current) { try { scannerRef.current.resume(); } catch(e) {} } }}
                  className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl font-bold shadow-md"
                >
                  Confirm Pickup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
