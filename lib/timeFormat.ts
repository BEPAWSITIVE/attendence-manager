export function formatTimeForSave(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
}

export function formatTimeForDisplay(time?: string | null, timestamp?: number | null): string {
  if (!time || !time.trim()) {
    if (timestamp != null && Number.isFinite(timestamp)) {
      const date = new Date(timestamp);
      if (!Number.isNaN(date.getTime())) return formatTimeForSave(date);
    }
    return '--:--';
  }

  const match = time.trim().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i);
  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];
  const period = match[3]?.toUpperCase();
  if (period) {
    if (hours < 1 || hours > 12) return time;
    return `${hours}:${minutes} ${period}`;
  }
  if (hours > 23) return time;
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export function formatIndianDateTime(date: Date = new Date()): string {
  const datePart = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).toLowerCase();
  return `${datePart} at ${timePart}`;
}

export function convertTo24Hour(timeStr: string): string {
  if (!timeStr) return "";
  const clean = timeStr.trim();
  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return `${match24[1].padStart(2, '0')}:${match24[2]}`;
  }
  const match12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const modifier = (match12[3] || '').toUpperCase();
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return "";
}

export function formatTo12Hour(time24: string): string {
  if (!time24) return "";
  return formatTimeForDisplay(time24);
}

export function parseDateAnd24HourToISTTimestamp(dateStr: string, time24: string): number {
  const normalized24 = convertTo24Hour(time24);
  if (!normalized24) return NaN;
  const [hh, mm] = normalized24.split(':');
  const isoStr = `${dateStr}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00+05:30`;
  return new Date(isoStr).getTime();
}


