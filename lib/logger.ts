export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  time: string;      // e.g. "14:25:30"
  date: string;      // e.g. "28 Oct 2026"
  level: 'error' | 'warn' | 'info';
  source: string;    // e.g. 'Supabase', 'Sync', 'Scanner', 'Network', 'Runtime', 'Auth'
  message: string;
  details?: string;
  stack?: string;
}

const STORAGE_KEY = 'ams_system_logs';
const MAX_LOGS = 150;

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

export const appLogger = {
  getLogs(): LogEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  add(level: 'error' | 'warn' | 'info', source: string, message: string, details?: any) {
    if (typeof window === 'undefined') return;
    try {
      const now = new Date();
      let detailsStr = '';
      let stackStr = '';

      if (details) {
        if (typeof details === 'string') {
          detailsStr = details;
        } else if (details instanceof Error) {
          detailsStr = details.message;
          stackStr = details.stack || '';
        } else {
          try {
            detailsStr = JSON.stringify(details, null, 2);
          } catch (e) {
            detailsStr = String(details);
          }
        }
      }

      const newEntry: LogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now.toISOString(),
        time: formatTime(now),
        date: formatDate(now),
        level,
        source: source || 'System',
        message: String(message || 'Unknown event'),
        details: detailsStr || undefined,
        stack: stackStr || undefined
      };

      const existing = this.getLogs();
      const updated = [newEntry, ...existing].slice(0, MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      window.dispatchEvent(new CustomEvent('ams_log_added', { detail: newEntry }));
    } catch (err) {
      // Don't crash if localStorage is disabled/full
    }
  },

  error(source: string, message: string, details?: any) {
    this.add('error', source, message, details);
  },

  warn(source: string, message: string, details?: any) {
    this.add('warn', source, message, details);
  },

  info(source: string, message: string, details?: any) {
    this.add('info', source, message, details);
  },

  clear() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('ams_log_cleared'));
    } catch (e) {}
  },

  exportReport(): string {
    const logs = this.getLogs();
    const now = new Date();
    const online = typeof navigator !== 'undefined' ? (navigator.onLine ? 'ONLINE' : 'OFFLINE') : 'UNKNOWN';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

    let out = `====================================================\n`;
    out += `ATTENDANCE MANAGER - SYSTEM DIAGNOSTIC REPORT\n`;
    out += `Generated: ${now.toLocaleString()}\n`;
    out += `Network Status: ${online}\n`;
    out += `Client Platform: ${ua}\n`;
    out += `Total Log Entries: ${logs.length}\n`;
    out += `====================================================\n\n`;

    if (logs.length === 0) {
      out += `No log entries recorded.\n`;
    } else {
      logs.forEach((log, idx) => {
        out += `[#${idx + 1}] [${log.date} ${log.time}] [${log.level.toUpperCase()}] [${log.source}]\n`;
        out += `Message: ${log.message}\n`;
        if (log.details) {
          out += `Details: ${log.details}\n`;
        }
        if (log.stack) {
          out += `Stack Trace:\n${log.stack}\n`;
        }
        out += `----------------------------------------------------\n`;
      });
    }

    return out;
  }
};

export function initGlobalLogger() {
  if (typeof window === 'undefined') return;
  if ((window as any).__ams_logger_initialized) return;
  (window as any).__ams_logger_initialized = true;

  // Initial boot log if empty
  if (appLogger.getLogs().length === 0) {
    appLogger.info('App', `Attendance Manager started (Status: ${navigator.onLine ? 'Online' : 'Offline'})`);
  }

  // Intercept uncaught errors
  window.addEventListener('error', (event) => {
    appLogger.error('Runtime', event.message || 'Uncaught error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });

  // Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || 'Unhandled Promise rejection');
    appLogger.error('Promise', msg, {
      stack: reason?.stack,
      raw: typeof reason === 'object' ? JSON.stringify(reason) : String(reason)
    });
  });

  // Intercept network changes
  window.addEventListener('online', () => {
    appLogger.info('Network', 'Device transitioned to ONLINE (Internet connected)');
  });
  window.addEventListener('offline', () => {
    appLogger.warn('Network', 'Device transitioned to OFFLINE (Operating in local queue mode)');
  });

  // Intercept console.error without infinite recursion
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    try {
      const msg = args.map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch (e) { return String(a); }
        }
        return String(a);
      }).join(' ');

      if (!msg.includes('[AMS-LOGGER]')) {
        appLogger.error('Console', msg, args.length === 1 && typeof args[0] === 'object' ? args[0] : undefined);
      }
    } catch (e) {}
    originalConsoleError.apply(console, args);
  };
}
