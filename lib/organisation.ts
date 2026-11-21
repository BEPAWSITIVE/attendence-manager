import type { Employee } from './supabase';

export const ORGANISATIONS = [
  "Sine Info",
  "Peepal Farm",
  "Peepal Farm Society",
  "Peepal Farm Foundation"
] as const;

export type OrganisationType = typeof ORGANISATIONS[number];

export const DEFAULT_ORGANISATION: OrganisationType = "Peepal Farm";

/**
 * Retrieves the organization name for an employee.
 * Checks the direct column (organisation / organization) as well as the fallback tag (__ORG:Name__) in group_members.
 */
export function getEmployeeOrganisation(emp: Employee | null | undefined): string {
  if (!emp) return "";
  if (emp.organisation && typeof emp.organisation === 'string' && emp.organisation.trim()) {
    return emp.organisation.trim();
  }
  if (emp.organization && typeof emp.organization === 'string' && emp.organization.trim()) {
    return emp.organization.trim();
  }
  if (typeof emp.group_members === 'string') {
    const match = emp.group_members.match(/__ORG:([^_\n,]+)__/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return "";
}
