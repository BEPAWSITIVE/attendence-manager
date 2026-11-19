import { supabase, AttendanceRecord, Employee } from './supabase';
import { localdb } from './localdb';
import { getCachedEmployees, getCachedEmployeeById } from './employeeCache';
import { updateCachedAttendance } from './offlineBackup';
import { convertTo24Hour, formatTimeForDisplay, parseDateAnd24HourToISTTimestamp } from './timeFormat';

/**
 * Extracts and normalizes the configured default check-out time (24-hour "HH:mm") for an employee.
 * Checks both the direct column (default_checkout_time) and the fallback tag (__DEFAULT_CHECKOUT:HH:mm__) in group_members.
 */
export function getDefaultCheckoutTime(emp: Employee | null | undefined): string | null {
  if (!emp) return null;
  if (emp.default_checkout_time && typeof emp.default_checkout_time === 'string' && emp.default_checkout_time.trim()) {
    const val24 = convertTo24Hour(emp.default_checkout_time.trim());
    if (val24) return val24;
  }
  if (typeof emp.group_members === 'string') {
    const match = emp.group_members.match(/__DEFAULT_CHECKOUT:([0-9]{1,2}:[0-9]{2})__/);
    if (match && match[1]) {
      return convertTo24Hour(match[1]);
    }
  }
  return null;
}

let isProcessingAutoCheckout = false;

/**
 * Scans active attendance records (status === 'IN') and automatically checks out
 * any staff member whose configured default check-out time has passed.
 * Works both online (updating Supabase directly) and offline (updating IndexedDB & local cache).
 */
export async function processAutoCheckouts(): Promise<{ checkedOutCount: number; updatedRecords: AttendanceRecord[] }> {
  if (typeof window === 'undefined') return { checkedOutCount: 0, updatedRecords: [] };
  if (isProcessingAutoCheckout) return { checkedOutCount: 0, updatedRecords: [] };

  isProcessingAutoCheckout = true;
  const updatedRecords: AttendanceRecord[] = [];

  try {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let activeRecords: AttendanceRecord[] = [];

    if (isOnline) {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('status', 'IN');

        if (!error && Array.isArray(data)) {
          activeRecords = data;
        }
      } catch (err) {
        console.warn("Could not fetch active attendance records online:", err);
      }
    }

    // Merge with any un-synced offline records in localdb
    try {
      const localActive = await localdb.syncQueue.where({ status: 'IN' }).toArray();
      if (Array.isArray(localActive) && localActive.length > 0) {
        const recordMap = new Map<string, AttendanceRecord>();
        for (const r of activeRecords) recordMap.set(r.recordId, r);
        for (const lr of localActive) recordMap.set(lr.recordId, lr as any);
        activeRecords = Array.from(recordMap.values());
      }
    } catch (e) {
      // IndexedDB might not be open yet
    }

    // If still no records from online or localdb, inspect cached_logs
    if (activeRecords.length === 0) {
      try {
        const raw = localStorage.getItem('cached_logs');
        if (raw) {
          const list: AttendanceRecord[] = JSON.parse(raw);
          if (Array.isArray(list)) {
            activeRecords = list.filter(r => r.status === 'IN');
          }
        }
      } catch (e) {}
    }

    if (activeRecords.length === 0) {
      return { checkedOutCount: 0, updatedRecords: [] };
    }

    // Fetch employee profiles lookup
    const allCached = getCachedEmployees();
    const empLookup = new Map<string, Employee>();
    for (const emp of allCached) {
      empLookup.set(emp.empId, emp);
    }

    const now = Date.now();

    for (const record of activeRecords) {
      if (record.status !== 'IN') continue;

      let emp: Employee | null = empLookup.get(record.empId) || getCachedEmployeeById(record.empId);
      if (!emp && isOnline) {
        try {
          const { data } = await supabase.from('employees').select('*').eq('empId', record.empId).single();
          if (data) {
            const fetchedEmp = data as Employee;
            emp = fetchedEmp;
            empLookup.set(fetchedEmp.empId, fetchedEmp);
          }
        } catch (e) {}
      }

      if (!emp) continue;

      const defCheckout24 = getDefaultCheckoutTime(emp);
      if (!defCheckout24) continue;

      // Compute exact checkout timestamp in Indian Standard Time (IST)
      const targetTimestamp = parseDateAnd24HourToISTTimestamp(record.date, defCheckout24);
      if (Number.isNaN(targetTimestamp)) continue;

      const inTimestamp = record.inTimestamp || (targetTimestamp - 1);

      // Auto checkout conditions:
      // 1. Current time has reached or passed the target checkout time
      // 2. The target checkout timestamp is after the inTimestamp (i.e. not checked in after checkout time)
      if (now >= targetTimestamp && targetTimestamp > inTimestamp) {
        const diffMs = targetTimestamp - inTimestamp;
        const hrs = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const outTimeFormatted = formatTimeForDisplay(defCheckout24);

        const updated: AttendanceRecord = {
          ...record,
          empName: emp.name || record.empName,
          department: emp.department || record.department,
          category: emp.category || record.category,
          outTime: outTimeFormatted,
          outTimestamp: targetTimestamp,
          totalHours: `${hrs}h ${mins}m`,
          status: 'OUT',
          isSynced: isOnline ? 1 : 0,
          updatedAt: new Date().toISOString()
        };

        if (isOnline) {
          try {
            await supabase.from('attendance').update(updated).eq('recordId', record.recordId);
          } catch (err) {
            console.warn(`Online auto-checkout update failed for ${emp.name}, queuing offline:`, err);
            await localdb.syncQueue.put(updated as any);
          }
        } else {
          await localdb.syncQueue.put(updated as any);
        }

        updateCachedAttendance(updated as any);
        updatedRecords.push(updated);

        // Notify active tabs and modals
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ams_attendance_updated', { detail: updated }));
          window.dispatchEvent(new CustomEvent('ams_today_count_changed'));
        }
      }
    }

    return { checkedOutCount: updatedRecords.length, updatedRecords };
  } finally {
    isProcessingAutoCheckout = false;
  }
}
