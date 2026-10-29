import { supabase, Employee, AttendanceRecord, Parcel } from './supabase';
import { localdb } from './localdb';
import { appLogger } from './logger';

export interface OfflineBackupStats {
  employeeCount: number;
  logCount: number;
  parcelCount: number;
  lastBackupTime: string | null;
  isReady: boolean;
}

let isSyncing = false;

/**
 * Perform a full offline backup of employees, today's attendance logs, and parcels.
 * Can be called upon app startup, login, online event, or manual refresh.
 */
export async function syncOfflineDataBackup(): Promise<{
  success: boolean;
  employeeCount: number;
  logCount: number;
  parcelCount: number;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return { success: false, employeeCount: 0, logCount: 0, parcelCount: 0, error: 'SSR environment' };
  }

  if (!navigator.onLine) {
    const stats = getOfflineBackupStats();
    return {
      success: stats.isReady,
      employeeCount: stats.employeeCount,
      logCount: stats.logCount,
      parcelCount: stats.parcelCount,
      error: 'Device is offline. Using existing local cache.'
    };
  }

  if (isSyncing) {
    const stats = getOfflineBackupStats();
    return {
      success: true,
      employeeCount: stats.employeeCount,
      logCount: stats.logCount,
      parcelCount: stats.parcelCount
    };
  }

  isSyncing = true;
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch ALL Employees / Profiles (Staff, Visitors, Vehicles, Volunteers)
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .order('createdAt', { ascending: false });

    if (empErr) throw empErr;

    if (employees && Array.isArray(employees)) {
      localStorage.setItem('cached_employees', JSON.stringify(employees));
    }

    // 2. Fetch Recent Attendance Records (Today + recent days to ensure check-in/out status is accurate offline)
    const { data: logs, error: logErr } = await supabase
      .from('attendance')
      .select('*')
      .order('inTimestamp', { ascending: false })
      .limit(300);

    if (logErr) throw logErr;

    if (logs && Array.isArray(logs)) {
      localStorage.setItem('cached_logs', JSON.stringify(logs));
    }

    // 3. Fetch Recent Parcels
    const { data: parcels, error: parErr } = await supabase
      .from('parcels')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(50);

    if (!parErr && parcels && Array.isArray(parcels)) {
      localStorage.setItem('cached_parcels', JSON.stringify(parcels));
    }

    const nowIso = new Date().toISOString();
    localStorage.setItem('ams_last_backup_time', nowIso);

    const empCount = employees?.length || 0;
    const logCount = logs?.length || 0;
    const parCount = parcels?.length || 0;

    appLogger.info('OfflineBackup', `Instant offline backup ready: ${empCount} profiles, ${logCount} logs, ${parCount} parcels.`);

    // Dispatch event so active components can update in real-time
    window.dispatchEvent(new CustomEvent('ams_offline_backup_completed', {
      detail: {
        employeeCount: empCount,
        logCount,
        parcelCount: parCount,
        timestamp: nowIso
      }
    }));

    return {
      success: true,
      employeeCount: empCount,
      logCount,
      parcelCount: parCount
    };
  } catch (err: any) {
    console.warn('Failed to complete full offline backup:', err);
    appLogger.warn('OfflineBackup', `Offline backup sync issue: ${err.message || String(err)}`);
    const stats = getOfflineBackupStats();
    return {
      success: stats.isReady,
      employeeCount: stats.employeeCount,
      logCount: stats.logCount,
      parcelCount: stats.parcelCount,
      error: err.message || String(err)
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Immediately insert or update an individual employee in local cache.
 */
export function updateCachedEmployee(emp: Employee) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('cached_employees');
    let list: Employee[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(e => e.empId === emp.empId);
    if (idx !== -1) {
      list[idx] = emp;
    } else {
      list.unshift(emp);
    }
    localStorage.setItem('cached_employees', JSON.stringify(list));
  } catch (e) {
    console.error('Failed to update cached_employees:', e);
  }
}

/**
 * Immediately insert or update an individual attendance record in local cache.
 */
export function updateCachedAttendance(record: AttendanceRecord) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('cached_logs');
    let list: AttendanceRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(r => r.recordId === record.recordId);
    if (idx !== -1) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    localStorage.setItem('cached_logs', JSON.stringify(list));
  } catch (e) {
    console.error('Failed to update cached_logs:', e);
  }
}

/**
 * Read current local backup stats.
 */
export function getOfflineBackupStats(): OfflineBackupStats {
  if (typeof window === 'undefined') {
    return { employeeCount: 0, logCount: 0, parcelCount: 0, lastBackupTime: null, isReady: false };
  }
  try {
    const rawEmps = localStorage.getItem('cached_employees');
    const emps = rawEmps ? JSON.parse(rawEmps) : [];
    const rawLogs = localStorage.getItem('cached_logs');
    const logs = rawLogs ? JSON.parse(rawLogs) : [];
    const rawParcels = localStorage.getItem('cached_parcels');
    const parcels = rawParcels ? JSON.parse(rawParcels) : [];
    const lastBackupTime = localStorage.getItem('ams_last_backup_time');

    return {
      employeeCount: Array.isArray(emps) ? emps.length : 0,
      logCount: Array.isArray(logs) ? logs.length : 0,
      parcelCount: Array.isArray(parcels) ? parcels.length : 0,
      lastBackupTime,
      isReady: Array.isArray(emps) && emps.length > 0
    };
  } catch (e) {
    return { employeeCount: 0, logCount: 0, parcelCount: 0, lastBackupTime: null, isReady: false };
  }
}
