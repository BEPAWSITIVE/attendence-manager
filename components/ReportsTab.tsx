"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase, AttendanceRecord } from "@/lib/supabase";
import { localdb } from "@/lib/localdb";
import { CalendarDays, Clock, Users, FileBarChart2, ChevronDown , Search, X, MapPin, Navigation } from "lucide-react";

export default function ReportsTab() {
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<AttendanceRecord[]>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('cached_logs');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [employeesMap, setEmployeesMap] = useState<Record<string, any>>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('cached_employees');
      if (cached) {
        try {
          const emps = JSON.parse(cached);
          const map: Record<string, any> = {};
          emps.forEach((e: any) => { if (e?.empId) map[e.empId] = e; });
          return map;
        } catch (e) {}
      }
    }
    return {};
  });
  const [selectedReport, setSelectedReport] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    loadData();

    const handleNetworkChange = () => {
      loadData();
    };
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    const channel = supabase
      .channel('reports_db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        loadData();
      })
      .subscribe();

    const interval = setInterval(() => {
      if (navigator.onLine) loadData();
    }, 30000);

    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  async function loadData() {
    let allLogs: AttendanceRecord[] = [];
    let allEmps: any[] = [];

    // 1. Read cached data from localStorage first
    if (typeof window !== 'undefined') {
      const cachedL = localStorage.getItem('cached_logs');
      if (cachedL) {
        try { allLogs = JSON.parse(cachedL); } catch (e) {}
      }
      const cachedE = localStorage.getItem('cached_employees');
      if (cachedE) {
        try { allEmps = JSON.parse(cachedE); } catch (e) {}
      }
    }

    // 2. Read localdb offline queue and merge
    try {
      const queuedLogs = await localdb.syncQueue.toArray();
      if (queuedLogs && queuedLogs.length > 0) {
        const logMap = new Map<string, AttendanceRecord>();
        allLogs.forEach(l => logMap.set(l.recordId, l));
        queuedLogs.forEach((q: any) => logMap.set(q.recordId, q as AttendanceRecord));
        allLogs = Array.from(logMap.values());
      }
    } catch (e) {
      console.warn("Could not read local syncQueue:", e);
    }

    try {
      const queuedEmps = await localdb.employeeQueue.toArray();
      if (queuedEmps && queuedEmps.length > 0) {
        const empMap = new Map<string, any>();
        allEmps.forEach(e => empMap.set(e.empId, e));
        queuedEmps.forEach((q: any) => empMap.set(q.empId, q));
        allEmps = Array.from(empMap.values());
      }
    } catch (e) {
      console.warn("Could not read local employeeQueue:", e);
    }

    // Update state with local/cached data immediately so UI is never 0
    if (allLogs.length > 0) {
      allLogs.sort((a, b) => (b.inTimestamp || 0) - (a.inTimestamp || 0));
      setLogs([...allLogs]);
    }
    if (allEmps.length > 0) {
      const eMap: Record<string, any> = {};
      allEmps.forEach((e: any) => { if (e?.empId) eMap[e.empId] = e; });
      setEmployeesMap(eMap);
    }

    // 3. If online, fetch fresh data from Supabase
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const [empsRes, attRes] = await Promise.all([
          supabase.from('employees').select('*'),
          supabase.from('attendance').select('*').order('inTimestamp', { ascending: false })
        ]);

        if (!empsRes.error && empsRes.data && empsRes.data.length > 0) {
          allEmps = empsRes.data;
          try {
            localStorage.setItem('cached_employees', JSON.stringify(empsRes.data));
          } catch (e) {}
          const eMap: Record<string, any> = {};
          allEmps.forEach((e: any) => { if (e?.empId) eMap[e.empId] = e; });
          setEmployeesMap(eMap);
        }

        if (!attRes.error && attRes.data && attRes.data.length > 0) {
          let freshLogs = attRes.data as AttendanceRecord[];
          try {
            const queuedLogs = await localdb.syncQueue.toArray();
            if (queuedLogs && queuedLogs.length > 0) {
              const logMap = new Map<string, AttendanceRecord>();
              freshLogs.forEach(l => logMap.set(l.recordId, l));
              queuedLogs.forEach((q: any) => logMap.set(q.recordId, q as AttendanceRecord));
              freshLogs = Array.from(logMap.values());
            }
          } catch (e) {}
          freshLogs.sort((a, b) => (b.inTimestamp || 0) - (a.inTimestamp || 0));
          allLogs = freshLogs;
          try {
            localStorage.setItem('cached_logs', JSON.stringify(attRes.data));
          } catch (e) {}
          setLogs([...allLogs]);
        }
      } catch (err) {
        console.warn("Network error during reports refresh, staying with cached:", err);
      }
    }

    setLoading(false);
  }

  const availableMonths = Array.from(new Set(logs.map(l => l.date ? l.date.substring(0, 7) : "").filter(Boolean))).sort().reverse();
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  if (!availableMonths.includes(currentMonth)) {
    availableMonths.unshift(currentMonth); // ensure current month is always an option
  }

  useEffect(() => {
    if (logs.length > 0) {
      const months = Array.from(new Set(logs.map(l => l.date ? l.date.substring(0, 7) : "").filter(Boolean))).sort().reverse();
      if (months.length > 0 && !months.includes(selectedMonth)) {
        if (months.includes(currentMonth)) {
          setSelectedMonth(currentMonth);
        } else {
          setSelectedMonth(months[0]);
        }
      }
    }
  }, [logs]);

  const filteredLogs = logs.filter(l => {
    if (!l.date.startsWith(selectedMonth)) return false;
    if (l.category === 'Parcel') return false;
    
    const cat = l.category || 'Staff';
    if (selectedCategory === 'All') return true;
    return cat === selectedCategory;
  });

  let daysInMonth = 30;
  if (selectedMonth) {
    const [y, m] = selectedMonth.split('-');
    daysInMonth = new Date(parseInt(y), parseInt(m), 0).getDate();
  }

  const employeeStats = filteredLogs.reduce((acc: any, log: AttendanceRecord) => {
    if (!acc[log.empId]) {
      acc[log.empId] = {
        empId: log.empId,
        name: log.empName,
        category: log.category || 'Staff',
        daysSet: new Set(),
        totalHours: 0,
        totalDistance: 0,
        logs: []
      };
    }
    
    acc[log.empId].logs.push(log);
    
    // Calculate distance for vehicles
    if (log.category === 'Vehicle') {
      const min = Number(log.meter_in) || 0;
      const mout = Number(log.meter_out) || 0;
      if (min > 0 && mout > 0 && min > mout) {
        acc[log.empId].totalDistance += (min - mout);
      }
    }

    
    acc[log.empId].daysSet.add(log.date);
    
    // Accurately calculate duration in hours
    if (log.outTimestamp && log.inTimestamp && log.outTimestamp > log.inTimestamp) {
      acc[log.empId].totalHours += (log.outTimestamp - log.inTimestamp) / 3600000;
    } else if (log.totalHours) {
      // Support formats like "0h 10m", "1h 45m", or "01:30"
      const hMatch = log.totalHours.match(/(\d+)\s*h/i);
      const mMatch = log.totalHours.match(/(\d+)\s*m/i);
      if (hMatch || mMatch) {
        const h = hMatch ? parseInt(hMatch[1], 10) : 0;
        const m = mMatch ? parseInt(mMatch[1], 10) : 0;
        acc[log.empId].totalHours += h + (m / 60);
      } else if (log.totalHours.includes(':')) {
        const [hours, mins] = log.totalHours.split(':').map(Number);
        if (!isNaN(hours) && !isNaN(mins)) {
          acc[log.empId].totalHours += hours + (mins / 60);
        }
      }
    }
    
    return acc;
  }, {});

  const statsList = Object.values(employeeStats).map((stat: any) => {
    const empData = employeesMap[stat.empId] || {};
    const totalMinutes = Math.round(stat.totalHours * 60);
    const displayHours = Math.floor(totalMinutes / 60);
    const displayMinutes = totalMinutes % 60;
    return {
      ...stat,
      phone: empData.phone || '',
      vehicle_plate: empData.vehicle_plate || '',
      workingDays: stat.daysSet.size,
      totalHoursFormatted: `${displayHours}h ${displayMinutes}m`
    };
  })
  .filter((stat: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      stat.name.toLowerCase().includes(q) ||
      stat.empId.toLowerCase().includes(q) ||
      (stat.phone && stat.phone.toLowerCase().includes(q)) ||
      (stat.vehicle_plate && stat.vehicle_plate.toLowerCase().includes(q))
    );
  })
  .sort((a: any, b: any) => b.totalHours - a.totalHours);

  const formatMonthName = (yyyy_mm: string) => {
    const [y, m] = yyyy_mm.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="p-4 pb-20 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          <FileBarChart2 size={24} className="mr-2 text-blue-600" /> Reports
        </h2>
        
        <div className="relative">
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="appearance-none bg-blue-50 text-blue-700 font-bold py-2 pl-3 pr-8 rounded-xl border border-blue-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer"
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>{formatMonthName(m)}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3 text-blue-500 pointer-events-none" />
        </div>
      </div>

      <div className="flex items-center space-x-2 mb-4">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name, ID, Phone, or Plate..."
            className="w-full bg-white border border-gray-200 pl-9 p-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
          />
        </div>
        <div className="relative w-1/3">
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="appearance-none w-full bg-gray-50 text-gray-700 font-bold py-2 pl-3 pr-8 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer"
          >
            <option value="All">All Categories</option>
            <option value="Staff">Staff</option>
            <option value="Volunteer">Volunteer</option>
            <option value="Vehicle">Vehicle</option>
            <option value="Visitor">Visitor</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Crunching numbers...</div>
      ) : (
        <div className="space-y-4">
          
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-md text-white flex justify-between items-center">
            <div>
              <h3 className="text-sm font-medium opacity-80 mb-1">Active Personnel</h3>
              <div className="text-4xl font-extrabold">{statsList.length}</div>
            </div>
            <div className="text-right">
              <h3 className="text-xs font-medium opacity-80 mb-1">In {formatMonthName(selectedMonth)}</h3>
              <div className="text-sm font-bold opacity-90">{daysInMonth} Total Days</div>
            </div>
          </div>

          <h3 className="font-bold text-gray-700 mt-6 mb-2">Individual Records</h3>
          
          {statsList.length === 0 ? (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
              No records found for {formatMonthName(selectedMonth)}.
            </div>
          ) : (
            <div className="space-y-3">
              {statsList.map((stat: any, idx: number) => (
                <div key={idx} onClick={() => setSelectedReport(stat)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-blue-300 transition-colors">
                  <div>
                    <h4 className="font-bold text-gray-800">{stat.name}</h4>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">
                        {stat.category}
                      </span>
                      {stat.phone && <span className="text-[10px] text-gray-500 font-mono">{stat.phone}</span>}
                      {stat.vehicle_plate && <span className="text-[10px] text-gray-500 font-mono">{stat.vehicle_plate}</span>}
                    </div>
                  </div>
                  <div className="text-right flex flex-col space-y-1">
                    <span className="flex items-center text-xs font-bold text-gray-600 justify-end">
                      <CalendarDays size={12} className="mr-1 text-gray-400" />
                      {stat.workingDays} / {daysInMonth} Days
                    </span>
                    {stat.category === 'Vehicle' ? (
                      <span className="flex items-center text-xs font-bold text-amber-600 justify-end">
                        <Navigation size={12} className="mr-1 text-amber-500" />
                        {stat.totalDistance} km
                      </span>
                    ) : (
                      <span className="flex items-center text-xs font-bold text-gray-600 justify-end">
                        <Clock size={12} className="mr-1 text-gray-400" />
                        {stat.totalHoursFormatted}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedReport && mounted && createPortal(
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 pt-safe pb-safe animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedReport(null);
          }}
        >
          <div className="bg-white rounded-3xl w-full max-w-md mx-auto flex flex-col overflow-hidden shadow-2xl max-h-[85vh] my-auto">
            <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0 sticky top-0 z-10 rounded-t-3xl">
              <div className="pr-2 overflow-hidden">
                <h3 className="font-bold text-lg sm:text-xl text-gray-800 leading-tight truncate">{selectedReport.name}</h3>
                <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">{selectedReport.empId} • {selectedReport.category}</p>
              </div>
              <button 
                onClick={() => setSelectedReport(null)} 
                className="w-10 h-10 bg-white text-gray-700 hover:text-black rounded-full flex items-center justify-center shadow-md border border-gray-200 active:scale-90 transition-all shrink-0 ml-2"
                aria-label="Close report modal"
              >
                <X size={20} className="stroke-[2.5]" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex justify-around text-center">
                <div>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Active Days</p>
                  <p className="text-2xl font-black text-blue-900">{selectedReport.workingDays}<span className="text-sm font-bold text-blue-400">/{daysInMonth}</span></p>
                </div>
                {selectedReport.category === 'Vehicle' ? (
                  <div>
                    <p className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-1">Distance</p>
                    <p className="text-2xl font-black text-amber-900">{selectedReport.totalDistance}<span className="text-sm font-bold text-amber-400"> km</span></p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Total Hours</p>
                    <p className="text-lg font-black text-blue-900 mt-1">{selectedReport.totalHoursFormatted}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-3 flex items-center">
                  <Clock size={16} className="mr-2 text-gray-400" /> Activity Log ({formatMonthName(selectedMonth)})
                </h4>
                <div className="space-y-3">
                  {selectedReport.logs.sort((a: any, b: any) => b.inTimestamp - a.inTimestamp).map((log: any) => (
                    <div key={log.recordId} className="bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-gray-700">{log.date}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${log.status === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{log.status}</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium text-gray-500">
                        <div>
                          <p>IN: <span className="text-gray-800">{log.inTime}</span></p>
                          {selectedReport.category === 'Vehicle' && log.meter_in ? <p className="mt-0.5">Meter: {log.meter_in}</p> : null}
                        </div>
                        <div className="text-right">
                          <p>OUT: <span className="text-gray-800">{log.outTime || '--:--'}</span></p>
                          {selectedReport.category === 'Vehicle' && log.meter_out ? <p className="mt-0.5">Meter: {log.meter_out}</p> : null}
                        </div>
                      </div>
                      {selectedReport.category === 'Vehicle' && (Number(log.meter_in) > 0 && Number(log.meter_out) > 0 && Number(log.meter_in) > Number(log.meter_out)) && (
                        <div className="mt-2 pt-2 border-t border-gray-50 text-xs font-bold text-amber-600 text-right">
                          Trip: {Number(log.meter_in) - Number(log.meter_out)} km
                        </div>
                      )}
                      {selectedReport.category === 'Vehicle' && log.location && (
                        <div className="mt-2 pt-2 border-t border-gray-50 text-xs font-medium text-gray-500 flex items-center">
                          <MapPin size={12} className="mr-1" /> {log.location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
