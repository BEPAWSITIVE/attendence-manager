/**
 * Recommended department list for staff registration and editing.
 */
export const RECOMMENDED_DEPARTMENTS = [
  "Paravet",
  "Kitchen",
  "Driver",
  "Handler",
  "Rescue",
  "Cleaning",
  "Pharmacy",
  "Enrichment",
  "Doctor",
  "Communication",
  "Animal Area",
  "Admin",
  "Personal",
  "Office Manager",
  "Media",
  "Product",
  "House Keeping",
  "Farm Stay",
  "Gardner"
] as const;

export type RecommendedDepartment = typeof RECOMMENDED_DEPARTMENTS[number];
