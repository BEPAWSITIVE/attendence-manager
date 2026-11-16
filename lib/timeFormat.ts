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

