import type { Employee } from './supabase';

let lastRaw: string | null | undefined;
let employees: Employee[] = [];
let employeesById = new Map<string, Employee>();

export function getCachedEmployees(): Employee[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cached_employees');
    if (raw !== lastRaw) {
      lastRaw = raw;
      employees = [];
      employeesById = new Map();
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        employees = parsed;
        for (const employee of employees) {
          // Preserve the first matching profile, as Array.find did.
          if (!employeesById.has(employee.empId)) {
            employeesById.set(employee.empId, employee);
          }
        }
      }
    }
    return employees;
  } catch {
    return [];
  }
}

export function getCachedEmployeeById(empId: string): Employee | null {
  const list = getCachedEmployees();
  return list.length ? employeesById.get(empId) || null : null;
}
