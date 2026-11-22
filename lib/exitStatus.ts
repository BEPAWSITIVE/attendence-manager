import type { Employee } from './supabase';

/**
 * Returns the recorded exit date for an employee if they have left or switched the organisation.
 * Checks both the direct database column (exit_date) and the persistent fallback tag (__EXIT_DATE:YYYY-MM-DD__) in group_members.
 */
export function getEmployeeExitDate(emp: Employee | null | undefined): string | null {
  if (!emp) return null;
  if (emp.exit_date && typeof emp.exit_date === 'string' && emp.exit_date.trim()) {
    return emp.exit_date.trim();
  }
  if (typeof emp.group_members === 'string') {
    const match = emp.group_members.match(/__EXIT_DATE:([^_\n,]+)__/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Returns true if the employee has an exit date recorded, meaning their QR code
 * is deactivated and cannot be scanned for attendance.
 */
export function isEmployeeExited(emp: Employee | null | undefined): boolean {
  return !!getEmployeeExitDate(emp);
}
