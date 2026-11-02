import { supabase, Employee } from './supabase';
import { localdb } from './localdb';
import { appLogger } from './logger';

export interface GuardAccount {
  id: string; // Unique ID, e.g. "GUARD-01", "GUEST-01"
  loginId: string; // User-facing login identifier, e.g. "guard1", "guest_gate"
  name: string; // e.g. "Ramesh Guard" or "Temp Gate Guard"
  password: string; // Plaintext or hash
  type: 'permanent' | 'guest'; // Permanent or Guest/Temporary
  phone?: string;
  gate?: string; // e.g. "Main Gate", "North Gate"
  expiresAt?: string | null; // ISO string for temporary guards
  createdAt: string;
  status: 'active' | 'suspended';
}

const STORAGE_KEY = 'ams_guard_accounts';

/**
 * Pre-seeded default guard accounts if none exist in local storage or cloud
 */
const DEFAULT_GUARDS: GuardAccount[] = [
  {
    id: 'GUARD-001',
    loginId: 'guard',
    name: 'Duty Guard (Main Gate)',
    password: 'password123',
    type: 'permanent',
    gate: 'Main Gate',
    phone: '+91 9876500001',
    createdAt: new Date().toISOString(),
    status: 'active'
  },
  {
    id: 'GUEST-001',
    loginId: 'guest',
    name: 'Temporary Guest Guard',
    password: 'guest123',
    type: 'guest',
    gate: 'Visitor Desk',
    phone: '+91 9876500002',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days default
    createdAt: new Date().toISOString(),
    status: 'active'
  }
];

/**
 * Convert GuardAccount to Employee format for persistent database storage
 */
export const guardToEmployee = (g: GuardAccount): Employee => {
  return {
    empId: g.id,
    name: g.name,
    department: g.gate || (g.type === 'guest' ? 'Temporary Gate' : 'Main Gate'),
    phone: g.phone || '+91 ',
    category: g.type === 'guest' ? 'GuestGuard' : 'Guard',
    vehicle_plate: g.password, // Password stored in vehicle_plate column
    group_members: JSON.stringify({
      loginId: g.loginId.toLowerCase().trim(),
      type: g.type,
      expiresAt: g.expiresAt || null,
      status: g.status || 'active'
    }),
    createdAt: g.createdAt || new Date().toISOString()
  };
};

/**
 * Parse an Employee record into a GuardAccount
 */
export const employeeToGuard = (emp: Employee): GuardAccount | null => {
  if (emp.category !== 'Guard' && emp.category !== 'GuestGuard') return null;
  let meta: any = {};
  try {
    if (emp.group_members && emp.group_members.startsWith('{')) {
      meta = JSON.parse(emp.group_members);
    }
  } catch (e) {}

  return {
    id: emp.empId,
    loginId: meta.loginId || emp.empId.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    name: emp.name,
    password: emp.vehicle_plate || '',
    type: (meta.type || (emp.category === 'GuestGuard' ? 'guest' : 'permanent')) as 'permanent' | 'guest',
    phone: emp.phone,
    gate: emp.department,
    expiresAt: meta.expiresAt || undefined,
    createdAt: emp.createdAt,
    status: meta.status || 'active'
  };
};

/**
 * Retrieve all guard and guest guard accounts (Online + Local Cache fallback)
 */
export async function getGuardAccounts(): Promise<GuardAccount[]> {
  if (typeof window === 'undefined') return DEFAULT_GUARDS;

  let accounts: GuardAccount[] = [];

  // 1. Read from localStorage cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      accounts = JSON.parse(raw);
    }
  } catch (e) {}

  // Also check cached_employees for any Guard / GuestGuard
  try {
    const rawEmps = localStorage.getItem('cached_employees');
    if (rawEmps) {
      const emps: Employee[] = JSON.parse(rawEmps);
      const guardEmps = emps
        .filter(e => e.category === 'Guard' || e.category === 'GuestGuard')
        .map(employeeToGuard)
        .filter(Boolean) as GuardAccount[];

      const map = new Map<string, GuardAccount>();
      accounts.forEach(a => map.set(a.id, a));
      guardEmps.forEach(a => map.set(a.id, a));
      accounts = Array.from(map.values());
    }
  } catch (e) {}

  // 2. Fetch from Supabase if online
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .in('category', ['Guard', 'GuestGuard'])
        .order('createdAt', { ascending: false });

      if (!error && data && data.length > 0) {
        const cloudGuards = data.map(employeeToGuard).filter(Boolean) as GuardAccount[];
        const map = new Map<string, GuardAccount>();
        accounts.forEach(a => map.set(a.id, a));
        cloudGuards.forEach(a => map.set(a.id, a));
        accounts = Array.from(map.values());
      }
    } catch (err) {
      console.warn("Could not fetch guards from cloud:", err);
    }
  }

  // 3. If list is completely empty, initialize with default accounts
  if (accounts.length === 0) {
    accounts = [...DEFAULT_GUARDS];
    // Attempt to persist default accounts in background
    if (navigator.onLine) {
      DEFAULT_GUARDS.forEach(g => {
        supabase.from('employees').upsert([guardToEmployee(g)]).then(() => {}).catch(() => {});
      });
    }
  }

  // Cache back to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {}

  return accounts;
}

/**
 * Create or update a Guard / Guest Guard account
 */
export async function saveGuardAccount(guard: GuardAccount): Promise<{ success: boolean; error?: string }> {
  try {
    const emp = guardToEmployee(guard);

    // 1. Save to Supabase if online
    if (navigator.onLine) {
      const { error } = await supabase.from('employees').upsert([emp]);
      if (error) {
        console.warn("Supabase guard upsert error:", error.message);
      }
    } else {
      await localdb.employeeQueue.put(emp);
    }

    // 2. Update local storage cache
    const current = await getGuardAccounts();
    const idx = current.findIndex(g => g.id === guard.id || g.loginId.toLowerCase() === guard.loginId.toLowerCase());
    if (idx !== -1) {
      current[idx] = guard;
    } else {
      current.unshift(guard);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    // Also update cached_employees so offline backup has it
    try {
      const raw = localStorage.getItem('cached_employees');
      let emps: Employee[] = raw ? JSON.parse(raw) : [];
      const eIdx = emps.findIndex(e => e.empId === emp.empId);
      if (eIdx !== -1) {
        emps[eIdx] = emp;
      } else {
        emps.unshift(emp);
      }
      localStorage.setItem('cached_employees', JSON.stringify(emps));
    } catch (e) {}

    appLogger.info('GuardAuth', `Saved ${guard.type} guard login '${guard.loginId}' (${guard.name})`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ams_guard_accounts_updated'));
    }

    return { success: true };
  } catch (err: any) {
    console.error("Failed to save guard account:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Delete a Guard account
 */
export async function deleteGuardAccount(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (navigator.onLine) {
      const { error } = await supabase.from('employees').delete().eq('empId', id);
      if (error) console.warn("Supabase delete guard error:", error.message);
    }

    const current = await getGuardAccounts();
    const filtered = current.filter(g => g.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    try {
      const raw = localStorage.getItem('cached_employees');
      if (raw) {
        const emps: Employee[] = JSON.parse(raw);
        localStorage.setItem('cached_employees', JSON.stringify(emps.filter(e => e.empId !== id)));
      }
    } catch (e) {}

    appLogger.info('GuardAuth', `Deleted guard account ${id}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ams_guard_accounts_updated'));
    }

    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete guard account:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Verify guard credentials at login
 */
export async function verifyGuardLogin(
  loginId: string, 
  pass: string
): Promise<{ success: boolean; guard?: GuardAccount; error?: string }> {
  if (!loginId || !pass) {
    return { success: false, error: "Please enter both Login ID and Password." };
  }

  const cleanId = loginId.trim().toLowerCase();
  const accounts = await getGuardAccounts();

  // Find by loginId or empId
  const match = accounts.find(g => 
    g.loginId.toLowerCase() === cleanId || 
    g.id.toLowerCase() === cleanId
  );

  if (!match) {
    return { success: false, error: `Invalid Login ID '${loginId}'. Check with your Admin.` };
  }

  if (match.status === 'suspended') {
    return { success: false, error: "This guard account has been suspended. Please contact Admin." };
  }

  // Password verification
  if (match.password !== pass) {
    return { success: false, error: "Incorrect password. Please try again." };
  }

  // Check if guest guard is expired
  if (match.type === 'guest' && match.expiresAt) {
    const expiryTime = new Date(match.expiresAt).getTime();
    if (Date.now() > expiryTime) {
      return { 
        success: false, 
        error: `Temporary guest access expired on ${new Date(match.expiresAt).toLocaleDateString()}. Please request Admin for a new pass.` 
      };
    }
  }

  appLogger.info('GuardAuth', `Guard '${match.name}' (${match.loginId}) successfully authenticated.`);
  return { success: true, guard: match };
}
