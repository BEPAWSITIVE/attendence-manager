import { Employee } from './supabase';
import JSZip from 'jszip';
import QRCode from 'qrcode';

const STORAGE_KEY_BASE_URL = 'ams_verify_base_url';
export const DEFAULT_PRODUCTION_URL = 'https://attendance.peepalfarm.org';

/**
 * Retrieve the configured public verification base URL.
 * Falls back to window.location.origin or DEFAULT_PRODUCTION_URL.
 */
export function getVerificationBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_BASE_URL);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    if (window.location && window.location.origin) {
      return window.location.origin.replace(/\/+$/, '');
    }
  }
  return DEFAULT_PRODUCTION_URL;
}

/**
 * Save the verification base URL to local storage.
 */
export function setVerificationBaseUrl(url: string): string {
  let clean = (url || '').trim().replace(/\/+$/, '');
  if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_BASE_URL, clean);
    window.dispatchEvent(new CustomEvent('ams_verify_base_url_changed', { detail: { url: clean } }));
  }
  return clean;
}

/**
 * Construct the public identity verification URL for a specific personnel ID.
 */
export function getStaffVerifyUrl(empId: string, customBaseUrl?: string): string {
  const base = (customBaseUrl && customBaseUrl.trim()) ? customBaseUrl.trim().replace(/\/+$/, '') : getVerificationBaseUrl();
  return `${base}/verify/${encodeURIComponent(empId.trim())}`;
}

/**
 * Robust extractor that extracts employee ID from any scan format:
 * 1. JSON string: {"empId": "STF-001"} or {"id": "..."}
 * 2. Full URL: https://.../verify/STF-001 or ?id=STF-001 or ?empId=STF-001
 * 3. Plain string ID: STF-001
 */
export function extractEmpIdFromScan(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. Check if it's JSON format: {"empId": "..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.empId && typeof parsed.empId === 'string' && parsed.empId.trim()) {
        return parsed.empId.trim();
      }
      if (parsed.id && typeof parsed.id === 'string' && parsed.id.trim()) {
        return parsed.id.trim();
      }
    } catch (e) {}
  }

  // 2. Check if it's a URL format (http / https)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      // Check query parameter ?id=... or ?empId=...
      const queryId = url.searchParams.get('id') || url.searchParams.get('empId');
      if (queryId && queryId.trim()) {
        return queryId.trim();
      }

      // Check URL path: e.g. /verify/STF-001 or /id/STF-001 or /pass/STF-001
      const segments = url.pathname.split('/').filter(Boolean);
      const verifyIdx = segments.findIndex(s => {
        const lower = s.toLowerCase();
        return lower === 'verify' || lower === 'id' || lower === 'staff' || lower === 'personnel';
      });

      if (verifyIdx !== -1 && segments[verifyIdx + 1]) {
        return decodeURIComponent(segments[verifyIdx + 1]).trim();
      }

      // Fallback to the last segment of the path if present
      if (segments.length > 0) {
        const last = decodeURIComponent(segments[segments.length - 1]).trim();
        if (last && !last.includes('.')) {
          return last;
        }
      }
    } catch (e) {}
  }

  // 3. Fallback: treat as raw ID (e.g. STF-001, VIS-123)
  if (!trimmed.includes(' ') && trimmed.length >= 2 && trimmed.length <= 40) {
    return trimmed;
  }

  return null;
}

export interface CardCanvasOptions {
  type?: 'identity' | 'attendance';
  baseUrl?: string;
}

/**
 * Render a high-resolution printable ID card canvas with either an Identity QR or an Attendance QR.
 */
export function generateCardCanvas(
  qrCanvas: HTMLCanvasElement, 
  emp: Employee, 
  options: CardCanvasOptions = {}
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 840;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrCanvas;

  const isIdentity = options.type !== 'attendance'; // Identity is default

  // 1. Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, isIdentity ? '#f0fdf4' : '#f0f7ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Header Banner
  let bannerColor = '#2563eb';
  let bannerTitle = 'STAFF ID CARD';

  if (emp.category === 'Vehicle') {
    bannerColor = '#f59e0b';
    bannerTitle = isIdentity ? 'VEHICLE ID CARD' : 'VEHICLE PASS';
  } else if (emp.category === 'Visitor') {
    bannerColor = '#10b981';
    bannerTitle = isIdentity ? 'VISITOR IDENTITY' : 'VISITOR PASS';
  } else if (emp.category === 'Volunteer') {
    bannerColor = '#9333ea';
    bannerTitle = isIdentity ? 'VOLUNTEER ID CARD' : 'VOLUNTEER PASS';
  } else if (emp.category === 'Parcel') {
    bannerColor = '#8b5cf6';
    bannerTitle = 'PARCEL TRACKER';
  } else {
    bannerColor = isIdentity ? '#059669' : '#2563eb';
    bannerTitle = isIdentity ? 'OFFICIAL STAFF ID' : 'STAFF ID CARD';
  }

  ctx.fillStyle = bannerColor;
  ctx.fillRect(0, 0, canvas.width, 140);

  // Top Organization Branding
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PEEPAL FARM / BE PAWSITIVE', canvas.width / 2, 45);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(bannerTitle, canvas.width / 2, 95);

  // 3. Card Body Shadow & Container
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  ctx.roundRect(40, 160, 520, 640, 26);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 4. Verification Tag / QR Description Pill
  ctx.fillStyle = isIdentity ? '#ecfdf5' : '#eff6ff';
  ctx.roundRect(100, 180, 400, 36, 18);
  ctx.fill();

  ctx.fillStyle = isIdentity ? '#047857' : '#1d4ed8';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  const tagText = isIdentity 
    ? 'SCAN WITH ANY PHONE CAMERA TO VERIFY' 
    : 'GATE ATTENDANCE SCAN QR';
  ctx.fillText(tagText, canvas.width / 2, 203);

  // 5. Draw QR Code
  ctx.drawImage(qrCanvas, (canvas.width - 240) / 2, 230, 240, 240);

  // 6. Profile Details
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(emp.name.toUpperCase(), canvas.width / 2, 515);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText((emp.department || 'GENERAL').toUpperCase(), canvas.width / 2, 550);

  // 7. Divider Line
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 580);
  ctx.lineTo(510, 580);
  ctx.stroke();

  // 8. ID & Meta Badges
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`ID: ${emp.empId}`, canvas.width / 2, 625);

  let subDetail = '';
  if (emp.category === 'Vehicle' && emp.vehicle_plate) {
    subDetail = `PLATE: ${emp.vehicle_plate}`;
  } else if (emp.vehicle_plate) {
    subDetail = `ID NO: ${emp.vehicle_plate}`;
  } else if (emp.phone && emp.phone.length > 5) {
    subDetail = `PH: ${emp.phone}`;
  }

  if (subDetail) {
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(subDetail, canvas.width / 2, 665);
  }

  // 9. Card Footer Notice
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  const footerNotice = isIdentity
    ? 'Official digital credential authentication powered by Attendance Manager'
    : 'Authorized gate pass for facility access and timekeeping logging';
  ctx.fillText(footerNotice, canvas.width / 2, 765);

  return canvas;
}

/**
 * Generate a standalone Card Canvas asynchronously without needing an existing DOM element.
 * Useful for bulk generation and downloads.
 */
export async function generateCardCanvasAsync(
  emp: Employee, 
  options: CardCanvasOptions = {}
): Promise<HTMLCanvasElement> {
  const isIdentity = options.type !== 'attendance';
  const qrContent = isIdentity 
    ? getStaffVerifyUrl(emp.empId, options.baseUrl)
    : JSON.stringify({ empId: emp.empId });

  // Render QR Code to offscreen canvas
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrContent, {
    width: 260,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  return generateCardCanvas(qrCanvas, emp, options);
}

export interface ZipExportOptions {
  type?: 'identity' | 'attendance' | 'both';
  baseUrl?: string;
  onProgress?: (current: number, total: number, currentName: string) => void;
}

/**
 * Export all employee QR cards into a clean, organized ZIP archive.
 */
export async function exportAllQrsAsZip(
  employees: Employee[], 
  options: ZipExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder("Peepal_Farm_Staff_ID_Cards") || zip;

  const type = options.type || 'identity';
  const total = employees.length;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const safeName = (emp.name || 'Staff').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeId = (emp.empId || `EMP${i}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const indexStr = String(i + 1).padStart(2, '0');

    if (options.onProgress) {
      options.onProgress(i + 1, total, emp.name);
    }

    if (type === 'identity' || type === 'both') {
      const card = await generateCardCanvasAsync(emp, { type: 'identity', baseUrl: options.baseUrl });
      const dataUrl = card.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      folder.file(`${indexStr}_${safeId}_${safeName}_Identity_Card.png`, base64Data, { base64: true });
    }

    if (type === 'attendance' || type === 'both') {
      const card = await generateCardCanvasAsync(emp, { type: 'attendance', baseUrl: options.baseUrl });
      const dataUrl = card.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      folder.file(`${indexStr}_${safeId}_${safeName}_Gate_Attendance.png`, base64Data, { base64: true });
    }
  }

  // Generate ZIP file blob
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Triggers a browser file download of a Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
