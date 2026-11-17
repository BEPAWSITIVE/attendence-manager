"use client";
import { useEffect, useState, useRef } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { supabase, AttendanceRecord, Employee } from "@/lib/supabase";
import { localdb } from "@/lib/localdb";
import { CheckCircle2, AlertCircle, X, Truck, Package, Search, ChevronRight, ChevronUp, ChevronDown, Loader2, Sparkles, Camera, Flashlight, FlashlightOff, WifiOff, ClipboardList, RefreshCw, Clock, Pencil } from "lucide-react";
import { syncOfflineDataBackup, updateCachedEmployee, updateCachedAttendance } from "@/lib/offlineBackup";
import { getCachedEmployees, getCachedEmployeeById } from "@/lib/employeeCache";
import { formatTimeForSave, formatTimeForDisplay } from "@/lib/timeFormat";
import { extractEmpIdFromScan } from "@/lib/qrUtils";

const getCachedProfile = (id: string): Employee | null => {
  return getCachedEmployeeById(id);
};

const isEntryTimeEditAllowed = (empId: string, empObj?: Employee | null): boolean => {
  const profile = empObj || getCachedProfile(empId);
  if (!profile) return false;
  if (profile.allow_entry_time_edit === true) return true;
  if (typeof profile.group_members === 'string' && profile.group_members.includes('__ALLOW_ENTRY_TIME_EDIT__')) return true;
  return false;
};

const calculateShiftDuration = (inT: string, outT: string): string => {
  if (!inT || !outT) return "";
  const [inH, inM] = inT.split(':').map(Number);
  const [outH, outM] = outT.split(':').map(Number);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return "";
  let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
  if (diffMins < 0) diffMins += 24 * 60;
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hrs}h ${mins}m`;
};

interface ArrowTimePickerProps {
  value: string; // 24-hour format "HH:mm"
  onChange: (newValue: string) => void;
  accentColor?: 'emerald' | 'blue';
}

function ArrowTimePicker({ value, onChange, accentColor = 'emerald' }: ArrowTimePickerProps) {
  const currentTime24 = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const val = value || currentTime24();
  const [hStr, mStr] = val.split(':');
  let rawH = parseInt(hStr || '0', 10);
  const rawM = parseInt(mStr || '0', 10);

  const period: 'AM' | 'PM' = rawH >= 12 ? 'PM' : 'AM';
  let hour12 = rawH % 12;
  if (hour12 === 0) hour12 = 12;
  const minute = isNaN(rawM) ? 0 : rawM;

  const [hourText, setHourText] = useState(String(hour12).padStart(2, '0'));
  const [minText, setMinText] = useState(String(minute).padStart(2, '0'));

  useEffect(() => {
    setHourText(String(hour12).padStart(2, '0'));
  }, [hour12]);

  useEffect(() => {
    setMinText(String(minute).padStart(2, '0'));
  }, [minute]);

  const to24 = (h12: number, m: number, p: 'AM' | 'PM') => {
    let h = h12;
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const adjustHour = (delta: number) => {
    let newH = hour12 + delta;
    if (newH > 12) newH = 1;
    if (newH < 1) newH = 12;
    setHourText(String(newH).padStart(2, '0'));
    onChange(to24(newH, minute, period));
  };

  const adjustMinute = (delta: number) => {
    let newM = minute + delta;
    let newH = hour12;
    let newP = period;

    if (newM >= 60) {
      newM = newM % 60;
      newH += 1;
      if (newH === 12) {
        newP = newP === 'AM' ? 'PM' : 'AM';
      } else if (newH > 12) {
        newH = 1;
      }
    } else if (newM < 0) {
      newM = (newM % 60 + 60) % 60;
      newH -= 1;
      if (newH < 1) {
        newH = 12;
        newP = newP === 'AM' ? 'PM' : 'AM';
      }
    }
    setHourText(String(newH).padStart(2, '0'));
    setMinText(String(newM).padStart(2, '0'));
    onChange(to24(newH, newM, newP));
  };

  const adjustMinutesDelta = (deltaMinutes: number) => {
    let totalMins = rawH * 60 + minute + deltaMinutes;
    totalMins = (totalMins % 1440 + 1440) % 1440;
    const nextH = Math.floor(totalMins / 60);
    const nextM = totalMins % 60;
    const nextP: 'AM' | 'PM' = nextH >= 12 ? 'PM' : 'AM';
    let nextH12 = nextH % 12;
    if (nextH12 === 0) nextH12 = 12;
    setHourText(String(nextH12).padStart(2, '0'));
    setMinText(String(nextM).padStart(2, '0'));
    onChange(`${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`);
  };

  const setNow = () => {
    const now = new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const curP: 'AM' | 'PM' = curH >= 12 ? 'PM' : 'AM';
    let curH12 = curH % 12;
    if (curH12 === 0) curH12 = 12;
    setHourText(String(curH12).padStart(2, '0'));
    setMinText(String(curM).padStart(2, '0'));
    onChange(`${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`);
  };

  const handleHourInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      setHourText('');
      return;
    }
    let num = parseInt(raw, 10);
    if (num > 12) {
      if (raw.length > 2) {
        num = parseInt(raw.slice(-2), 10);
      }
      if (num > 12) {
        num = parseInt(raw.slice(-1), 10) || 12;
      }
      if (num === 0) num = 12;
    }
    setHourText(String(num));
    if (num >= 1 && num <= 12) {
      onChange(to24(num, minute, period));
    }
  };

  const handleHourBlur = () => {
    let num = parseInt(hourText, 10);
    if (isNaN(num) || num < 1 || num > 12) {
      num = hour12;
    }
    setHourText(String(num).padStart(2, '0'));
    onChange(to24(num, minute, period));
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw === '') {
      setMinText('');
      return;
    }
    let num = parseInt(raw, 10);
    if (num > 59) {
      if (raw.length > 2) {
        num = parseInt(raw.slice(-2), 10);
      }
      if (num > 59) num = 59;
    }
    setMinText(raw.length === 1 ? raw : String(num).padStart(2, '0'));
    if (!isNaN(num) && num >= 0 && num <= 59) {
      onChange(to24(hour12, num, period));
    }
  };

  const handleMinBlur = () => {
    let num = parseInt(minText, 10);
    if (isNaN(num) || num < 0 || num > 59) {
      num = minute;
    }
    setMinText(String(num).padStart(2, '0'));
    onChange(to24(hour12, num, period));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'hour' | 'min') => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      type === 'hour' ? adjustHour(1) : adjustMinute(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      type === 'hour' ? adjustHour(-1) : adjustMinute(-1);
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      onChange(to24(hour12, minute, 'AM'));
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      onChange(to24(hour12, minute, 'PM'));
    }
  };

  const isEmerald = accentColor === 'emerald';

  return (
    <div className="flex flex-col items-center bg-gray-50/90 border border-gray-200/80 p-3 rounded-2xl select-none w-full">
      {/* Main Stepper Controls with Keyboard Input */}
      <div className="flex items-center justify-center space-x-2.5 sm:space-x-3">
        {/* Hour Column */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => adjustHour(1)}
            aria-label="Increase Hour"
            className="w-12 h-9 flex items-center justify-center rounded-xl bg-white hover:bg-gray-100 active:scale-95 text-gray-700 shadow-2xs border border-gray-200 transition-all cursor-pointer"
          >
            <ChevronUp size={20} className="stroke-[3]" />
          </button>
          
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={hourText}
            onChange={handleHourInputChange}
            onBlur={handleHourBlur}
            onFocus={(e) => e.target.select()}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            onKeyDown={(e) => handleKeyDown(e, 'hour')}
            aria-label="Hour input"
            className={`w-14 h-12 my-1 bg-white border-2 rounded-2xl text-center font-mono text-2xl font-black text-gray-900 tracking-wider shadow-inner outline-none transition-all cursor-text ${
              isEmerald 
                ? 'border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200' 
                : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
            }`}
          />

          <button
            type="button"
            onClick={() => adjustHour(-1)}
            aria-label="Decrease Hour"
            className="w-12 h-9 flex items-center justify-center rounded-xl bg-white hover:bg-gray-100 active:scale-95 text-gray-700 shadow-2xs border border-gray-200 transition-all cursor-pointer"
          >
            <ChevronDown size={20} className="stroke-[3]" />
          </button>
          <span className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider">Hour</span>
        </div>

        {/* Separator */}
        <div className="flex flex-col items-center justify-center pb-4">
          <span className="font-mono text-2xl font-black text-gray-400">:</span>
        </div>

        {/* Minute Column */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => adjustMinute(1)}
            aria-label="Increase Minute"
            className="w-12 h-9 flex items-center justify-center rounded-xl bg-white hover:bg-gray-100 active:scale-95 text-gray-700 shadow-2xs border border-gray-200 transition-all cursor-pointer"
          >
            <ChevronUp size={20} className="stroke-[3]" />
          </button>

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={minText}
            onChange={handleMinInputChange}
            onBlur={handleMinBlur}
            onFocus={(e) => e.target.select()}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            onKeyDown={(e) => handleKeyDown(e, 'min')}
            aria-label="Minute input"
            className={`w-14 h-12 my-1 bg-white border-2 rounded-2xl text-center font-mono text-2xl font-black text-gray-900 tracking-wider shadow-inner outline-none transition-all cursor-text ${
              isEmerald 
                ? 'border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200' 
                : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
            }`}
          />

          <button
            type="button"
            onClick={() => adjustMinute(-1)}
            aria-label="Decrease Minute"
            className="w-12 h-9 flex items-center justify-center rounded-xl bg-white hover:bg-gray-100 active:scale-95 text-gray-700 shadow-2xs border border-gray-200 transition-all cursor-pointer"
          >
            <ChevronDown size={20} className="stroke-[3]" />
          </button>
          <span className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider">Min</span>
        </div>

        {/* AM / PM Toggle Column */}
        <div className="flex flex-col justify-center space-y-1.5 pb-4 ml-1">
          <button
            type="button"
            onClick={() => onChange(to24(hour12, minute, 'AM'))}
            className={`w-12 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 border cursor-pointer ${
              period === 'AM'
                ? isEmerald 
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                  : 'bg-blue-600 text-white border-blue-700 shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => onChange(to24(hour12, minute, 'PM'))}
            className={`w-12 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 border cursor-pointer ${
              period === 'PM'
                ? isEmerald 
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                  : 'bg-blue-600 text-white border-blue-700 shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {/* Quick Action Chips */}
      <div className="flex items-center justify-center space-x-1 mt-2.5 pt-2 border-t border-gray-200/60 w-full flex-wrap gap-y-1">
        <button
          type="button"
          onClick={() => adjustMinutesDelta(-15)}
          className="px-2 py-0.5 rounded-lg bg-white hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 border border-gray-200 shadow-2xs transition-all cursor-pointer"
        >
          -15m
        </button>
        <button
          type="button"
          onClick={() => adjustMinutesDelta(-5)}
          className="px-2 py-0.5 rounded-lg bg-white hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 border border-gray-200 shadow-2xs transition-all cursor-pointer"
        >
          -5m
        </button>
        <button
          type="button"
          onClick={setNow}
          className={`px-2 py-0.5 rounded-lg active:scale-95 text-[10px] font-black transition-all shadow-2xs border cursor-pointer ${
            isEmerald 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' 
              : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
          }`}
        >
          ● Now
        </button>
        <button
          type="button"
          onClick={() => adjustMinutesDelta(5)}
          className="px-2 py-0.5 rounded-lg bg-white hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 border border-gray-200 shadow-2xs transition-all cursor-pointer"
        >
          +5m
        </button>
        <button
          type="button"
          onClick={() => adjustMinutesDelta(15)}
          className="px-2 py-0.5 rounded-lg bg-white hover:bg-gray-100 active:scale-95 text-[10px] font-bold text-gray-600 border border-gray-200 shadow-2xs transition-all cursor-pointer"
        >
          +15m
        </button>
      </div>
    </div>
  );
}

const convertTo24Hour = (timeStr: string): string => {
  if (!timeStr) return "";
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return `${match24[1].padStart(2, '0')}:${match24[2]}`;
  }
  const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const modifier = (match12[3] || '').toUpperCase();
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return "";
};

const formatTo12Hour = (time24: string): string => {
  if (!time24) return "";
  return formatTimeForDisplay(time24);
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

let sharedAudioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!sharedAudioContext) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioContext();
  }
  const ctx = sharedAudioContext!;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
};

const playSuccessSound = () => {
  try {
    const ctx = getAudioContext();
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
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // Audio context not allowed or supported
  }
};

const playWarningSound = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.12);
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {}
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
  const todayRecordsRef = useRef<AttendanceRecord[]>([]);
  const [todayFilter, setTodayFilter] = useState<'all' | 'in' | 'out'>('all');
  const [todaySearch, setTodaySearch] = useState("");
  const [isLoadingToday, setIsLoadingToday] = useState(false);

  // Guard Edit Entry Time States (Daily Attendance section)
  const [editingInTimeRecord, setEditingInTimeRecord] = useState<AttendanceRecord | null>(null);
  const [newInTimeValue, setNewInTimeValue] = useState("");
  const [newOutTimeValue, setNewOutTimeValue] = useState("");
  const [isSavingInTime, setIsSavingInTime] = useState(false);

  // Guard Scan Time Edit Modal State (Immediate popup upon scanning editable staff)
  const [scanTimeEditModal, setScanTimeEditModal] = useState<{
    profile: Employee;
    mode: 'IN' | 'OUT';
    lastRecord: AttendanceRecord | null;
    dateStr: string;
    inTime: string;
    outTime: string;
  } | null>(null);
  const [isSavingScanEdit, setIsSavingScanEdit] = useState(false);
  const [showInTimeEditorInOutMode, setShowInTimeEditorInOutMode] = useState(false);

  const updateTodayRecord = (record: AttendanceRecord) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const list = todayRecordsRef.current.filter(r => r.date === todayStr && r.recordId !== record.recordId);
    if (record.date === todayStr) list.push(record);
    list.sort((a, b) => (b.inTimestamp || 0) - (a.inTimestamp || 0));
    todayRecordsRef.current = list;
    setTodayRecords(list);
    window.dispatchEvent(new CustomEvent('ams_today_count_changed', { detail: { count: list.length } }));
  };

  const updateOfflineState = () => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    setCachedCount(getCachedEmployees().length);
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
    todayRecordsRef.current = list;
    setTodayRecords(list);
    setIsLoadingToday(false);

    window.dispatchEvent(new CustomEvent('ams_today_count_changed', { detail: { count: list.length } }));
    return list;
  };

  const handleOpenTodayModal = async () => {
    if (scannerRef.current) {
      try { scannerRef.current.pause(true); } catch(e) {}
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

  const handleOpenEditInTime = (record: AttendanceRecord) => {
    setEditingInTimeRecord(record);
    const valIn24 = convertTo24Hour(record.inTime);
    if (valIn24) {
      setNewInTimeValue(valIn24);
    } else {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setNewInTimeValue(`${hh}:${mm}`);
    }

    if (record.outTime) {
      setNewOutTimeValue(convertTo24Hour(record.outTime));
    } else {
      setNewOutTimeValue("");
    }
  };

  const handleSaveInTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInTimeRecord || !newInTimeValue) return;

    setIsSavingInTime(true);
    try {
      const formatted12 = formatTo12Hour(newInTimeValue);
      const [hhStr, mmStr] = newInTimeValue.split(':');
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);

      const dateParts = editingInTimeRecord.date.split('-');
      const newInDate = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        hh,
        mm,
        0
      );
      const newInTimestamp = newInDate.getTime();

      let newTotalHours = editingInTimeRecord.totalHours;
      let newOutTimestamp = editingInTimeRecord.outTimestamp;
      let formattedOut12 = editingInTimeRecord.outTime;

      if (newOutTimeValue && editingInTimeRecord.status === 'OUT') {
        formattedOut12 = formatTo12Hour(newOutTimeValue);
        const [outHhStr, outMmStr] = newOutTimeValue.split(':');
        const newOutDate = new Date(
          parseInt(dateParts[0], 10),
          parseInt(dateParts[1], 10) - 1,
          parseInt(dateParts[2], 10),
          parseInt(outHhStr, 10),
          parseInt(outMmStr, 10),
          0
        );
        newOutTimestamp = newOutDate.getTime();
      }

      if (newOutTimestamp && editingInTimeRecord.status === 'OUT') {
        const diffMs = Math.max(0, newOutTimestamp - newInTimestamp);
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        newTotalHours = `${hrs}h ${mins}m`;
      }

      const updatedRecord: AttendanceRecord = {
        ...editingInTimeRecord,
        inTime: formatted12,
        inTimestamp: newInTimestamp,
        outTime: formattedOut12,
        outTimestamp: newOutTimestamp,
        totalHours: newTotalHours,
        isSynced: navigator.onLine ? 1 : 0,
        updatedAt: new Date().toISOString()
      };

      if (navigator.onLine) {
        const { error } = await supabase
          .from('attendance')
          .update({
            inTime: updatedRecord.inTime,
            inTimestamp: updatedRecord.inTimestamp,
            outTime: updatedRecord.outTime || null,
            outTimestamp: updatedRecord.outTimestamp || null,
            totalHours: updatedRecord.totalHours || null,
            isSynced: 1,
            updatedAt: updatedRecord.updatedAt
          })
          .eq('recordId', updatedRecord.recordId);

        if (error) throw error;
      } else {
        await localdb.syncQueue.put(updatedRecord);
      }

      updateCachedAttendance(updatedRecord);
      updateTodayRecord(updatedRecord);
      
      playSuccessSound();
      setEditingInTimeRecord(null);
    } catch (err: any) {
      console.error("Failed to update attendance time:", err);
      alert("Error updating attendance time: " + (err.message || String(err)));
    } finally {
      setIsSavingInTime(false);
    }
  };

  const handleCancelScanEdit = () => {
    setScanTimeEditModal(null);
    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch (e) {}
    }
  };

  const handleSaveScanEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanTimeEditModal) return;

    const { profile, mode, lastRecord, dateStr, inTime, outTime } = scanTimeEditModal;
    setIsSavingScanEdit(true);

    try {
      const [year, month, day] = dateStr.split('-').map(Number);

      if (mode === 'IN') {
        if (!inTime) throw new Error("Please enter an In Time");
        const formattedIn12 = formatTo12Hour(inTime);
        const [hhStr, mmStr] = inTime.split(':');
        const inDate = new Date(year, month - 1, day, parseInt(hhStr, 10), parseInt(mmStr, 10), 0);
        const inTimestamp = inDate.getTime();

        if (lastRecord && lastRecord.status === 'IN') {
          // Guard is updating the active session's check-in time
          const updatedRecord: AttendanceRecord = {
            ...lastRecord,
            inTime: formattedIn12,
            inTimestamp: inTimestamp,
            isSynced: navigator.onLine ? 1 : 0,
            updatedAt: new Date().toISOString()
          };

          if (navigator.onLine) {
            const { error } = await supabase
              .from('attendance')
              .update({
                inTime: updatedRecord.inTime,
                inTimestamp: updatedRecord.inTimestamp,
                isSynced: 1,
                updatedAt: updatedRecord.updatedAt
              })
              .eq('recordId', updatedRecord.recordId);
            if (error) throw error;
          } else {
            await localdb.syncQueue.put(updatedRecord);
          }

          updateCachedAttendance(updatedRecord);
          updateTodayRecord(updatedRecord);

          playSuccessSound();
          setScanResult({
            success: true,
            msg: `${profile.name} Check IN Updated to ${formattedIn12}` + (navigator.onLine ? '' : ' (Offline)')
          });
        } else {
          // Creating a new IN record
          const newRecord: AttendanceRecord = {
            recordId: crypto.randomUUID(),
            empId: profile.empId,
            empName: profile.name,
            department: profile.department,
            category: profile.category || 'Staff',
            date: dateStr,
            inTime: formattedIn12,
            inTimestamp: inTimestamp,
            status: 'IN',
            isSynced: navigator.onLine ? 1 : 0,
            updatedAt: new Date().toISOString()
          };

          if (navigator.onLine) {
            const { error } = await supabase.from('attendance').insert([newRecord]);
            if (error) throw error;
          } else {
            await localdb.syncQueue.put(newRecord);
          }

          updateCachedAttendance(newRecord);
          updateTodayRecord(newRecord);

          playSuccessSound();
          setScanResult({
            success: true,
            msg: `${profile.name} Checked IN at ${formattedIn12}` + (navigator.onLine ? '' : ' (Offline)')
          });
        }
      } else {
        // Mode === 'OUT'
        if (!outTime) throw new Error("Please enter an Out Time");
        const formattedOut12 = formatTo12Hour(outTime);
        const [outHhStr, outMmStr] = outTime.split(':');
        const outDate = new Date(year, month - 1, day, parseInt(outHhStr, 10), parseInt(outMmStr, 10), 0);
        const outTimestamp = outDate.getTime();

        let effectiveInTime = inTime ? formatTo12Hour(inTime) : (lastRecord?.inTime || formattedOut12);
        let effectiveInTimestamp = lastRecord?.inTimestamp;
        if (inTime) {
          const [inHhStr, inMmStr] = inTime.split(':');
          const inDate = new Date(year, month - 1, day, parseInt(inHhStr, 10), parseInt(inMmStr, 10), 0);
          effectiveInTimestamp = inDate.getTime();
        } else if (!effectiveInTimestamp) {
          effectiveInTimestamp = outTimestamp;
        }

        const diffMs = Math.max(0, outTimestamp - effectiveInTimestamp);
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const totalHours = `${hrs}h ${mins}m`;

        if (lastRecord && lastRecord.status === 'IN') {
          const updatedRecord: AttendanceRecord = {
            ...lastRecord,
            empName: profile.name || lastRecord.empName,
            department: profile.department || lastRecord.department,
            category: profile.category || lastRecord.category || 'Staff',
            inTime: effectiveInTime,
            inTimestamp: effectiveInTimestamp,
            outTime: formattedOut12,
            outTimestamp: outTimestamp,
            totalHours: totalHours,
            status: 'OUT',
            isSynced: navigator.onLine ? 1 : 0,
            updatedAt: new Date().toISOString()
          };

          if (navigator.onLine) {
            const { error } = await supabase.from('attendance').update(updatedRecord).eq('recordId', lastRecord.recordId);
            if (error) throw error;
          } else {
            await localdb.syncQueue.put(updatedRecord);
          }

          updateCachedAttendance(updatedRecord);
          updateTodayRecord(updatedRecord);
        } else {
          // Completed record created directly
          const newRecord: AttendanceRecord = {
            recordId: crypto.randomUUID(),
            empId: profile.empId,
            empName: profile.name,
            department: profile.department,
            category: profile.category || 'Staff',
            date: dateStr,
            inTime: effectiveInTime,
            inTimestamp: effectiveInTimestamp,
            outTime: formattedOut12,
            outTimestamp: outTimestamp,
            totalHours: totalHours,
            status: 'OUT',
            isSynced: navigator.onLine ? 1 : 0,
            updatedAt: new Date().toISOString()
          };

          if (navigator.onLine) {
            const { error } = await supabase.from('attendance').insert([newRecord]);
            if (error) throw error;
          } else {
            await localdb.syncQueue.put(newRecord);
          }

          updateCachedAttendance(newRecord);
          updateTodayRecord(newRecord);
        }

        playSuccessSound();
        setScanResult({
          success: true,
          msg: `${profile.name} Checked OUT at ${formattedOut12} (${totalHours})` + (navigator.onLine ? '' : ' (Offline)')
        });
      }

      setScanTimeEditModal(null);

      setTimeout(() => {
        setScanResult(null);
        if (scannerRef.current) {
          try { scannerRef.current.resume(); } catch (e) {}
        }
      }, 2500);

    } catch (err: any) {
      console.error("Failed to save scan time edit:", err);
      alert("Error saving attendance: " + (err.message || String(err)));
    } finally {
      setIsSavingScanEdit(false);
    }
  };

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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingScanner, setIsStartingScanner] = useState(false);
  const isStartingRef = useRef(false);

  const startScanner = async (isUserGesture: boolean = false) => {
    if (isStartingRef.current) return;
    
    // If scanner instance is already actively scanning
    if (scannerRef.current) {
      try {
        if ((scannerRef.current as any).isScanning) {
          setIsScanning(true);
          return;
        }
      } catch (e) {}
    }

    isStartingRef.current = true;
    setIsStartingScanner(true);
    setCameraError(null);

    try {
      // 1. Check if mediaDevices exists
      if (typeof window !== 'undefined' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
        throw new Error("Camera API is not supported in this browser context. Please make sure you are using HTTPS (e.g. https://...).");
      }

      // 2. Ensure container element #reader exists in DOM
      const readerEl = document.getElementById("reader");
      if (!readerEl) {
        throw new Error("Scanner container element (#reader) not found in DOM.");
      }

      // 3. Clean up any stale scanner instance
      if (scannerRef.current) {
        try {
          if ((scannerRef.current as any).isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch (cleanErr) {
          console.warn("Clean up previous scanner warning:", cleanErr);
        }
        scannerRef.current = null;
      }

      // 4. If triggered by user gesture, trigger getUserMedia directly to provoke browser permission dialog
      if (isUserGesture) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }
          });
          testStream.getTracks().forEach(track => track.stop());
        } catch (permErr: any) {
          if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
            throw new Error("Camera permission was denied. Please tap the lock/settings icon in your browser address bar and allow camera access.");
          }
        }
      }

      // 5. Initialize Html5Qrcode
      const html5QrCode = new Html5Qrcode("reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });
      scannerRef.current = html5QrCode;

      const scanConfig = {
        fps: 10,
        disableFlip: true
      };

      let started = false;

      // Attempt 1: Facing mode environment (standard rear camera)
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          scanConfig,
          onScanSuccess,
          undefined
        );
        started = true;
      } catch (err1) {
        console.warn("Attempt 1 (environment facingMode) failed:", err1);
      }

      // Attempt 2: Query camera list and select back/rear camera ID
      if (!started) {
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            const backCam = cameras.find(c => {
              const label = (c.label || '').toLowerCase();
              return label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('0');
            }) || cameras[cameras.length - 1];

            await html5QrCode.start(
              backCam.id,
              scanConfig,
              onScanSuccess,
              undefined
            );
            started = true;
          }
        } catch (err2) {
          console.warn("Attempt 2 (camera deviceId) failed:", err2);
        }
      }

      // Attempt 3: Any available camera / user facing fallback
      if (!started) {
        try {
          await html5QrCode.start(
            { facingMode: "user" },
            scanConfig,
            onScanSuccess,
            undefined
          );
          started = true;
        } catch (err3: any) {
          console.warn("Attempt 3 (user facing) failed:", err3);
          throw err3;
        }
      }

      setIsScanning(true);
      setCameraError(null);
    } catch (err: any) {
      console.error("Failed to start scanner on device:", err);
      const msg = err?.message || "Camera access failed. Please ensure camera permission is allowed in your browser settings.";
      setCameraError(msg);
      setIsScanning(false);
      scannerRef.current = null;
    } finally {
      isStartingRef.current = false;
      setIsStartingScanner(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
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
        if ((scanner as any).isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch (err) {
        console.warn("Failed to stop scanner gracefully:", err);
      } finally {
        setIsScanning(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        startScanner(false);
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  const onScanSuccess = async (decodedText: string) => {
    try {
      const empId = extractEmpIdFromScan(decodedText);
      if (!empId) throw new Error("Invalid format");

      if (scannerRef.current) {
        try { scannerRef.current.pause(true); } catch(e) {}
      }

      const today = new Date();
      const dateStr = today.toISOString().split("T")[0];
      const timeStr = formatTimeForSave(today);

      let empData: Employee | null = null;
      let existingRecords: any[] = [];
      
      if (navigator.onLine) {
        try {
          const [{ data: profile }, { data: existing }] = await Promise.all([
            supabase.from('employees').select('*').eq('empId', empId).single(),
            supabase
              .from('attendance')
              .select('*')
              .eq('date', dateStr)
              .eq('empId', empId)
              .order('inTimestamp', { ascending: true })
          ]);
          if (profile) {
            empData = profile;
            updateCachedEmployee(profile);
          } else {
            empData = getCachedProfile(empId);
          }

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

      const MIN_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown between scans

      if (emp.category === 'Vehicle') {
        if (lastRecord && lastRecord.status === 'IN') {
          const timeSinceIn = today.getTime() - (lastRecord.inTimestamp || 0);
          if (timeSinceIn < MIN_COOLDOWN_MS) {
            const remSec = Math.ceil((MIN_COOLDOWN_MS - timeSinceIn) / 1000);
            const remMin = Math.floor(remSec / 60);
            const s = remSec % 60;
            const timeText = remMin > 0 ? `${remMin}m ${s}s` : `${remSec}s`;
            playWarningSound();
            setScanResult({
              success: false,
              isVehicle: true,
              msg: `Cooldown: Vehicle ${emp.name} was dispatched just now. Minimum 5 mins gap required before return (${timeText} remaining).`
            });
            setTimeout(() => {
              setScanResult(null);
              if (scannerRef.current) try { scannerRef.current.resume(); } catch(e) {}
            }, 3500);
            return;
          }
        }
        setVehicleModal({ profile: emp, lastRecord });
        return; 
      }
      
      if (emp.category === 'Parcel' && lastRecord && lastRecord.status === 'IN') {
        setParcelModal({ profile: emp, lastRecord });
        return;
      }

      // Check if this staff member has editable check-in/out attendance timing
      if (isEntryTimeEditAllowed(emp.empId, emp)) {
        const isCurrentlyIn = lastRecord && lastRecord.status === 'IN';
        const initialMode: 'IN' | 'OUT' = isCurrentlyIn ? 'OUT' : 'IN';
        
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime24 = `${hh}:${mm}`;

        const existingIn24 = (lastRecord && lastRecord.inTime) ? convertTo24Hour(lastRecord.inTime) : currentTime24;
        
        setScanTimeEditModal({
          profile: emp,
          mode: initialMode,
          lastRecord: lastRecord,
          dateStr: dateStr,
          inTime: isCurrentlyIn ? existingIn24 : currentTime24,
          outTime: isCurrentlyIn ? currentTime24 : ''
        });
        return;
      }

      if (lastRecord && lastRecord.status === 'IN') {
        const outTimestamp = today.getTime();
        const diffMs = outTimestamp - (lastRecord.inTimestamp || 0);

        // Cooldown: prevent accidental double-scan immediately checking out after check-in
        if (diffMs < MIN_COOLDOWN_MS) {
          const remSec = Math.ceil((MIN_COOLDOWN_MS - diffMs) / 1000);
          const remMin = Math.floor(remSec / 60);
          const s = remSec % 60;
          const timeText = remMin > 0 ? `${remMin}m ${s}s` : `${remSec}s`;

          playWarningSound();
          setScanResult({
            success: false,
            msg: `Cooldown active: ${emp.name} checked IN recently. Minimum 5 minutes gap required before checkout (${timeText} remaining).`
          });

          setTimeout(() => {
            setScanResult(null);
            if (scannerRef.current) {
              try { scannerRef.current.resume(); } catch(e) {}
            }
          }, 3500);
          return;
        }

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
        updateTodayRecord(updatedRecord as AttendanceRecord);
        
        playSuccessSound();
        setScanResult({ success: true, msg: `${emp.name} Checked OUT at ${timeStr}` + (navigator.onLine ? '' : ' (Offline)') });
      } else {
        // Checking IN: If already checked OUT today, enforce 5-minute cooldown before checking in again
        if (lastRecord && lastRecord.status === 'OUT' && lastRecord.outTimestamp) {
          const timeSinceOut = today.getTime() - lastRecord.outTimestamp;
          if (timeSinceOut < MIN_COOLDOWN_MS) {
            const remSec = Math.ceil((MIN_COOLDOWN_MS - timeSinceOut) / 1000);
            const remMin = Math.floor(remSec / 60);
            const s = remSec % 60;
            const timeText = remMin > 0 ? `${remMin}m ${s}s` : `${remSec}s`;

            playWarningSound();
            setScanResult({
              success: false,
              msg: `Cooldown active: ${emp.name} checked OUT recently. Minimum 5 minutes gap required before checking in again (${timeText} remaining).`
            });

            setTimeout(() => {
              setScanResult(null);
              if (scannerRef.current) {
                try { scannerRef.current.resume(); } catch(e) {}
              }
            }, 3500);
            return;
          }
        }

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
        updateTodayRecord(newRecord as AttendanceRecord);
        
        playSuccessSound();
        setScanResult({ success: true, msg: `${emp.name} Checked IN at ${timeStr}` + (navigator.onLine ? '' : ' (Offline)') });
      }

      setTimeout(() => {
        setScanResult(null);
        if (scannerRef.current) {
          try { scannerRef.current.resume(); } catch(e) {}
        }
      }, 1500);

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
    const timeStr = formatTimeForSave(today);

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
      updateTodayRecord(newRecord as AttendanceRecord);
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
      updateTodayRecord(updatedRecord as AttendanceRecord);
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
        const emps = getCachedEmployees();
        const lowerQuery = query.toLowerCase();
        results = emps.filter(e =>
          (e.phone && e.phone.includes(query)) ||
          (e.name && e.name.toLowerCase().includes(lowerQuery))
        ).slice(0, 15);
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
    const timeStr = formatTimeForSave(today);

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
    updateTodayRecord(updatedRecord as AttendanceRecord);
    
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
      
      {/* Embedded Square Camera Viewport */}
      <div className="relative w-full aspect-square bg-gray-100 rounded-[32px] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-[6px] border-[#EAF3FF] z-10 mb-8 mt-4">
        
        <div id="reader" className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full [&_#qr-shaded-region]:!hidden [&_svg]:!hidden [&_canvas]:!hidden [&_*]:!border-none"></div>

        {/* Loading state before stream starts */}
        {!isScanning && !cameraError && (
          <div className="absolute inset-0 bg-slate-900 z-10 flex flex-col items-center justify-center text-white/70">
            <Loader2 size={28} className="animate-spin mb-2 text-blue-400" />
            <span className="text-xs font-semibold">Starting camera...</span>
          </div>
        )}

        {/* Camera Permission / Error Recovery UI */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/95 z-20 flex flex-col items-center justify-center p-6 text-center text-white animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-3 border border-red-500/30">
              <Camera size={26} />
            </div>
            <h4 className="font-bold text-sm sm:text-base mb-1.5">Camera Access Needed</h4>
            <p className="text-xs text-gray-300 max-w-[250px] leading-relaxed mb-4">
              {cameraError}
            </p>
            <button
              type="button"
              onClick={() => startScanner(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-2 cursor-pointer"
            >
              <RefreshCw size={14} className={isStartingScanner ? 'animate-spin' : ''} />
              <span>Allow Camera & Retry</span>
            </button>
          </div>
        )}
        
        {/* Offline Ready Badge on Camera View */}
        {isOffline && (
          <div className="absolute top-4 left-4 z-20 bg-amber-500/90 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-md flex items-center animate-fade-in">
            <WifiOff size={11} className="mr-1" />
            <span>Offline Ready ({cachedCount})</span>
          </div>
        )}


        {/* Flashlight / Torch Toggle Button */}
        {isScanning && (
          <button
            type="button"
            onClick={toggleTorch}
            className={`absolute top-4 right-4 z-20 px-3 py-2 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer ${
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
        onClick={() => { setManualModalOpen(true); if (scannerRef.current) { try { scannerRef.current.pause(true); } catch(e) {} } }}
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
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-start pt-[10vh] justify-center p-4 animate-fade-in">
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
      {scanResult && !vehicleModal && !parcelModal && !scanTimeEditModal && (
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
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4 animate-fade-in">
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
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
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
                        <div className="flex items-center space-x-1.5 text-emerald-800 font-bold flex-wrap gap-y-1">
                          <span className="text-[10px] uppercase font-semibold text-gray-400 font-sans">IN:</span>
                          <span>{formatTimeForDisplay(r.inTime, r.inTimestamp)}</span>
                          {isEntryTimeEditAllowed(r.empId) && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditInTime(r)}
                              className="ml-1.5 px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 text-emerald-900 border border-emerald-300 rounded-lg text-[10px] font-bold font-sans flex items-center space-x-1 transition-all active:scale-95 shadow-2xs"
                              title="Edit Entry Time"
                              aria-label={`Edit entry time for ${r.empName}`}
                            >
                              <Pencil size={10} className="text-emerald-700 shrink-0" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] uppercase font-semibold text-gray-400 font-sans">OUT:</span>
                          {r.outTime || r.outTimestamp != null ? (
                            <span className="font-bold text-gray-800 flex items-center flex-wrap gap-1">
                              <span>{formatTimeForDisplay(r.outTime, r.outTimestamp)}</span>
                              {r.totalHours && (
                                <span className="text-[10px] font-sans text-gray-500 font-normal">
                                  ({r.totalHours})
                                </span>
                              )}
                              {isEntryTimeEditAllowed(r.empId) && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditInTime(r)}
                                  className="ml-1 px-2 py-0.5 bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-900 border border-blue-300 rounded-lg text-[10px] font-bold font-sans flex items-center space-x-1 transition-all active:scale-95 shadow-2xs"
                                  title="Edit Exit Time"
                                  aria-label={`Edit exit time for ${r.empName}`}
                                >
                                  <Pencil size={10} className="text-blue-700 shrink-0" />
                                  <span>Edit</span>
                                </button>
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

      {/* Guard Edit Entry Time Modal */}
      {editingInTimeRecord && (
        <div className="fixed inset-0 z-[150] bg-black/75 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative border border-gray-100 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white shadow-inner">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight">Edit Entry Time</h3>
                  <p className="text-[11px] text-emerald-100 mt-0.5">Today's Attendance Punch-In</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingInTimeRecord(null)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                disabled={isSavingInTime}
              >
                <X size={18} />
              </button>
            </div>

            {/* Staff Info */}
            <div className="p-3.5 bg-gray-50 border-b border-gray-100 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shrink-0">
                {editingInTimeRecord.empName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-gray-900 text-sm truncate">{editingInTimeRecord.empName}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                  {editingInTimeRecord.empId} • {editingInTimeRecord.department || 'Staff'}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveInTime} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Current Entry Time Recorded
                </label>
                <div className="p-2.5 bg-gray-100 rounded-xl text-xs font-mono font-bold text-gray-700 flex items-center justify-between">
                  <span>{formatTimeForDisplay(editingInTimeRecord.inTime, editingInTimeRecord.inTimestamp)}</span>
                  <span className="text-[10px] text-gray-500 font-sans">Date: {editingInTimeRecord.date}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 text-center">
                  Entry Time (Check-In) *
                </label>
                <ArrowTimePicker
                  value={newInTimeValue}
                  onChange={setNewInTimeValue}
                  accentColor="emerald"
                />
                {newInTimeValue && (
                  <p className="text-center text-xs font-bold text-emerald-700 mt-2">
                    Selected: {formatTo12Hour(newInTimeValue)}
                  </p>
                )}
              </div>

              {(editingInTimeRecord.status === 'OUT' || editingInTimeRecord.outTime) && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 text-center">
                    Exit Time (Check-Out)
                  </label>
                  <ArrowTimePicker
                    value={newOutTimeValue}
                    onChange={setNewOutTimeValue}
                    accentColor="blue"
                  />
                  {newOutTimeValue && (
                    <p className="text-center text-xs font-bold text-blue-700 mt-2">
                      Selected: {formatTo12Hour(newOutTimeValue)}
                    </p>
                  )}
                  {newInTimeValue && newOutTimeValue && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-xl text-center text-xs font-bold text-blue-800">
                      Total: {calculateShiftDuration(newInTimeValue, newOutTimeValue)}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingInTimeRecord(null)}
                  disabled={isSavingInTime}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInTime || !newInTimeValue}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSavingInTime ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Guard Scan Time Edit Modal (Immediate popup on scan for editable staff) */}
      {scanTimeEditModal && (
        <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative border border-gray-100 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className={`p-4 text-white flex items-center justify-between transition-colors ${
              scanTimeEditModal.mode === 'IN' 
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-700'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white shadow-inner">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                    {scanTimeEditModal.mode === 'IN' ? 'Staff Check IN' : 'Staff Check OUT'}
                  </h3>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    Editable Timing • {scanTimeEditModal.mode === 'IN' ? 'Punch In Time' : 'Punch Out Time'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelScanEdit}
                className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                disabled={isSavingScanEdit}
              >
                <X size={18} />
              </button>
            </div>

            {/* Staff Info Banner */}
            <div className="p-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center text-sm shrink-0 border border-emerald-200">
                  {scanTimeEditModal.profile.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <p className="font-extrabold text-gray-900 text-sm truncate">{scanTimeEditModal.profile.name}</p>
                    <span className="text-[9px] uppercase font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                      {scanTimeEditModal.profile.category || 'Staff'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                    {scanTimeEditModal.profile.empId} • {scanTimeEditModal.profile.department || 'Staff'}
                  </p>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="shrink-0 text-right">
                {scanTimeEditModal.lastRecord && scanTimeEditModal.lastRecord.status === 'IN' ? (
                  <span className="inline-flex items-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    ● IN ({formatTimeForDisplay(scanTimeEditModal.lastRecord.inTime)})
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[10px] font-extrabold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                    ○ Currently OUT
                  </span>
                )}
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="px-5 pt-4">
              <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setShowInTimeEditorInOutMode(false);
                    const now = new Date();
                    const hh = String(now.getHours()).padStart(2, '0');
                    const mm = String(now.getMinutes()).padStart(2, '0');
                    setScanTimeEditModal(prev => prev ? ({
                      ...prev,
                      mode: 'IN',
                      inTime: prev.inTime || `${hh}:${mm}`
                    }) : null);
                  }}
                  className={`py-2 rounded-xl transition-all font-bold ${
                    scanTimeEditModal.mode === 'IN'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ● Check IN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInTimeEditorInOutMode(false);
                    const now = new Date();
                    const hh = String(now.getHours()).padStart(2, '0');
                    const mm = String(now.getMinutes()).padStart(2, '0');
                    setScanTimeEditModal(prev => prev ? ({
                      ...prev,
                      mode: 'OUT',
                      outTime: prev.outTime || `${hh}:${mm}`
                    }) : null);
                  }}
                  className={`py-2 rounded-xl transition-all font-bold ${
                    scanTimeEditModal.mode === 'OUT'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ○ Check OUT
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveScanEdit} className="p-5 space-y-4 overflow-y-auto">
              {scanTimeEditModal.mode === 'IN' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 text-center">
                    Select Check-In Time
                  </label>
                  <ArrowTimePicker
                    value={scanTimeEditModal.inTime}
                    onChange={(newVal) => setScanTimeEditModal(prev => prev ? ({ ...prev, inTime: newVal }) : null)}
                    accentColor="emerald"
                  />
                  {scanTimeEditModal.inTime && (
                    <p className="text-center text-xs font-bold text-emerald-700 mt-2">
                      Selected: {formatTo12Hour(scanTimeEditModal.inTime)}
                    </p>
                  )}
                  {scanTimeEditModal.lastRecord && scanTimeEditModal.lastRecord.status === 'IN' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200 mt-2 text-center font-medium">
                      Note: Updating this will adjust the active Check-In time for today.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* In Time Display with optional edit */}
                  <div className="bg-gray-50 border border-gray-200/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Check-In Time</span>
                      <span className="font-mono text-sm font-bold text-gray-800">
                        {scanTimeEditModal.inTime ? formatTo12Hour(scanTimeEditModal.inTime) : (scanTimeEditModal.lastRecord?.inTime || '--')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInTimeEditorInOutMode(!showInTimeEditorInOutMode)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      {showInTimeEditorInOutMode ? "Done Adjusting" : "Adjust In-Time"}
                    </button>
                  </div>

                  {showInTimeEditorInOutMode && (
                    <div className="p-2.5 bg-emerald-50/50 rounded-2xl border border-emerald-200 animate-fade-in">
                      <label className="block text-[11px] font-bold text-emerald-800 mb-1 text-center">
                        Adjust Check-In Time
                      </label>
                      <ArrowTimePicker
                        value={scanTimeEditModal.inTime}
                        onChange={(newVal) => setScanTimeEditModal(prev => prev ? ({ ...prev, inTime: newVal }) : null)}
                        accentColor="emerald"
                      />
                    </div>
                  )}

                  {/* Out Time Edit */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 text-center">
                      Select Check-Out Time
                    </label>
                    <ArrowTimePicker
                      value={scanTimeEditModal.outTime}
                      onChange={(newVal) => setScanTimeEditModal(prev => prev ? ({ ...prev, outTime: newVal }) : null)}
                      accentColor="blue"
                    />
                    {scanTimeEditModal.outTime && (
                      <p className="text-center text-xs font-bold text-blue-700 mt-2">
                        Selected: {formatTo12Hour(scanTimeEditModal.outTime)}
                      </p>
                    )}
                  </div>

                  {/* Live Duration Calculation */}
                  {scanTimeEditModal.inTime && scanTimeEditModal.outTime && (
                    <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-800">Total Shift Duration:</span>
                      <span className="font-mono font-extrabold text-blue-900 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200">
                        {calculateShiftDuration(scanTimeEditModal.inTime, scanTimeEditModal.outTime) || '0h 0m'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelScanEdit}
                  disabled={isSavingScanEdit}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingScanEdit || (scanTimeEditModal.mode === 'IN' ? !scanTimeEditModal.inTime : !scanTimeEditModal.outTime)}
                  className={`flex-1 text-white py-3 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center ${
                    scanTimeEditModal.mode === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isSavingScanEdit ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    scanTimeEditModal.mode === 'IN' ? 'Confirm Check IN' : 'Confirm Check OUT'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Parcel Action Modal */}
      {parcelModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4 animate-fade-in">
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
