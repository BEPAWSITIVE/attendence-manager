import { NextResponse } from 'next/server';
import { supabase, AttendanceRecord, Employee } from '@/lib/supabase';
import { convertTo24Hour, formatTimeForDisplay, parseDateAnd24HourToISTTimestamp } from '@/lib/timeFormat';

export const dynamic = 'force-dynamic';

function getDefaultCheckoutTime(emp: Employee | null | undefined): string | null {
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

async function handleAutoCheckout() {
  const { data: activeRecords, error: attErr } = await supabase
    .from('attendance')
    .select('*')
    .eq('status', 'IN');

  if (attErr) {
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  }

  if (!activeRecords || activeRecords.length === 0) {
    return NextResponse.json({ success: true, processedCount: 0, message: "No active IN records to process" });
  }

  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('*');

  if (empErr) {
    return NextResponse.json({ error: empErr.message }, { status: 500 });
  }

  const empMap = new Map<string, Employee>();
  for (const emp of (employees || [])) {
    empMap.set(emp.empId, emp);
  }

  const now = Date.now();
  const updatedRecords: AttendanceRecord[] = [];

  for (const record of activeRecords) {
    const emp = empMap.get(record.empId);
    if (!emp) continue;

    const defCheckout24 = getDefaultCheckoutTime(emp);
    if (!defCheckout24) continue;

    const targetTimestamp = parseDateAnd24HourToISTTimestamp(record.date, defCheckout24);
    if (Number.isNaN(targetTimestamp)) continue;

    const inTimestamp = record.inTimestamp || (targetTimestamp - 1);

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
        isSynced: 1,
        updatedAt: new Date().toISOString()
      };

      const { error: updErr } = await supabase
        .from('attendance')
        .update(updated)
        .eq('recordId', record.recordId);

      if (!updErr) {
        updatedRecords.push(updated);
      }
    }
  }

  return NextResponse.json({
    success: true,
    processedCount: updatedRecords.length,
    updated: updatedRecords.map(r => ({
      recordId: r.recordId,
      empName: r.empName,
      date: r.date,
      outTime: r.outTime,
      totalHours: r.totalHours
    }))
  });
}

export async function GET() {
  return handleAutoCheckout();
}

export async function POST() {
  return handleAutoCheckout();
}
