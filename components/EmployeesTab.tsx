"use client";
import { useState, useEffect, useRef } from "react";
import { supabase, Employee, AttendanceRecord } from "@/lib/supabase";
import { localdb } from "@/lib/localdb";
import { QRCodeCanvas } from "qrcode.react";
import { 
  MessageCircle, 
  X, 
  Download, 
  UserPlus, 
  FileText, 
  Truck, 
  Shield, 
  Users, 
  FileSpreadsheet, 
  CheckCircle2, 
  Loader2,
  ChevronDown,
  Pencil,
  Trash2,
  Search,
  Clock,
  LogOut,
  LogIn,
  QrCode,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FolderArchive,
  Globe,
  Building2,
  UserMinus,
  UserX,
  CalendarOff
} from "lucide-react";
import { appLogger } from "@/lib/logger";
import { getDefaultCheckoutTime } from "@/lib/autoCheckout";
import { ORGANISATIONS, DEFAULT_ORGANISATION, getEmployeeOrganisation } from "@/lib/organisation";
import { RECOMMENDED_DEPARTMENTS } from "@/lib/departments";
import { getEmployeeExitDate, isEmployeeExited } from "@/lib/exitStatus";
import { convertTo24Hour, formatTimeForDisplay, formatTimeForSave, parseDateAnd24HourToISTTimestamp } from "@/lib/timeFormat";
import { updateCachedAttendance } from "@/lib/offlineBackup";
import { 
  getStaffVerifyUrl, 
  getVerificationBaseUrl, 
  generateCardCanvas, 
  exportAllQrsAsZip, 
  triggerBlobDownload 
} from "@/lib/qrUtils";

export default function EmployeesTab({ 
  role = "admin", 
  initialAiData, 
  onAiDataConsumed 
}: { 
  role?: "admin" | "guard", 
  initialAiData?: any, 
  onAiDataConsumed?: () => void 
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // CSV Upload States
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<Employee[]>([]);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  // Form states
  const [category, setCategory] = useState("Staff"); // Staff, Visitor, Volunteer, Vehicle
  const [empId, setEmpId] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [groupMembers, setGroupMembers] = useState<string[]>([""]);
  const [allowEntryTime, setAllowEntryTime] = useState(false);
  const [enableDefaultCheckout, setEnableDefaultCheckout] = useState(false);
  const [defaultCheckoutTime, setDefaultCheckoutTime] = useState("");
  const [organisation, setOrganisation] = useState<string>(DEFAULT_ORGANISATION);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Search & Category Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

  // Dual QR Pass & Bulk ZIP Export States
  const [activePassTab, setActivePassTab] = useState<'identity' | 'attendance'>('identity');
  const [copiedPassUrl, setCopiedPassUrl] = useState(false);
  const [showZipModal, setShowZipModal] = useState(false);
  const [zipExportType, setZipExportType] = useState<'identity' | 'attendance' | 'both'>('identity');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0, name: '' });

  // Edit Employee States
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Staff");
  const [editDepartment, setEditDepartment] = useState("");
  const [editPhone, setEditPhone] = useState("+91 ");
  const [editVehiclePlate, setEditVehiclePlate] = useState("");
  const [editDocumentFile, setEditDocumentFile] = useState<File | null>(null);
  const [editExistingDocUrl, setEditExistingDocUrl] = useState<string | undefined>(undefined);
  const [editGroupMembers, setEditGroupMembers] = useState<string[]>([""]);
  const [editAllowEntryTime, setEditAllowEntryTime] = useState(false);
  const [editEnableDefaultCheckout, setEditEnableDefaultCheckout] = useState(false);
  const [editDefaultCheckoutTime, setEditDefaultCheckoutTime] = useState("");
  const [editOrganisation, setEditOrganisation] = useState<string>(DEFAULT_ORGANISATION);
  const [editExitDate, setEditExitDate] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Forgot QR Manual Attendance States (Admin only)
  const [showForgotQrModal, setShowForgotQrModal] = useState(false);
  const [forgotQrSearch, setForgotQrSearch] = useState("");
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingTodayAttendance, setLoadingTodayAttendance] = useState(false);
  const [forgotQrTimeMode, setForgotQrTimeMode] = useState<'now' | 'custom'>('now');
  const [forgotQrCustomTime, setForgotQrCustomTime] = useState("");
  const [forgotQrProcessingId, setForgotQrProcessingId] = useState<string | null>(null);
  const [forgotQrToast, setForgotQrToast] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (role === 'guard' && category !== 'Visitor') {
      setCategory('Visitor');
    }
  }, [role, category]);

  useEffect(() => {
    fetchEmployees();
    
    const channel = supabase
      .channel('employees_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          fetchEmployees();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      if (navigator.onLine) fetchEmployees();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  async function fetchEmployees() {
    let allEmps: Employee[] = [];
    if (navigator.onLine) {
      // Exclude Guard and GuestGuard credential accounts from general staff registry queries
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .neq('category', 'Guard')
        .neq('category', 'GuestGuard')
        .order('createdAt', { ascending: false });
      if (!error && data) {
        allEmps = data;
        localStorage.setItem('cached_employees', JSON.stringify(data));
      }
    } else {
      const cached = localStorage.getItem('cached_employees');
      if (cached) allEmps = JSON.parse(cached);
    }
    
    const queuedEmps = await localdb.employeeQueue.toArray();
    const merged = [...queuedEmps, ...allEmps].reduce((acc: Employee[], curr: any) => {
      const current = curr as Employee;
      if (!acc.find((item: Employee) => item.empId === current.empId)) acc.push(current);
      return acc;
    }, [] as Employee[]);
    
    merged.sort((a: Employee, b: Employee) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    setEmployees(merged);
    setLoading(false);
  }

  // Pre-fill when guard takes visitor photo
  useEffect(() => {
    if (initialAiData) {
      setCategory('Visitor');
      generateNewId('Visitor');
      setName(initialAiData.name || "");
      setDepartment(initialAiData.address || "");
      setPhone("+91 ");
      setVehiclePlate(initialAiData.id_number || "");
      setGroupMembers([""]);
      
      if (initialAiData.capturedImage) {
        fetch(initialAiData.capturedImage)
          .then(res => res.arrayBuffer())
          .then(buf => {
            const file = new File([buf], "ai_scan_capture.jpg", { type: "image/jpeg" });
            setDocumentFile(file);
          }).catch(err => console.error("Error creating file from image", err));
      } else {
        setDocumentFile(null);
      }
      
      setShowForm(true);
      if (onAiDataConsumed) onAiDataConsumed();
    }
  }, [initialAiData]);

  const generateNewId = (cat: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const prefix = cat === 'Staff' ? 'EMP' : cat === 'Volunteer' ? 'VOL' : cat === 'Vehicle' ? 'VEH' : cat === 'Parcel' ? 'PAR' : 'VIS';
    setEmpId(`${prefix}-${result}`);
  };

  const handleOpenForm = () => {
    const defaultCat = role === 'guard' ? 'Visitor' : 'Staff';
    setCategory(defaultCat);
    generateNewId(defaultCat);
    setName("");
    setDepartment("");
    setPhone("+91 ");
    setVehiclePlate("");
    setDocumentFile(null);
    setGroupMembers([""]);
    setAllowEntryTime(false);
    setOrganisation(DEFAULT_ORGANISATION);
    setShowForm(true);
  };

  const filteredEmployees = employees.filter(emp => {
    // Hide internal Guard/GuestGuard credential accounts from general staff/visitor registry
    if (emp.category === 'Guard' || emp.category === 'GuestGuard') {
      return false;
    }

    // 1. Category Filter
    if (selectedCategoryFilter !== "All") {
      const empCat = emp.category || "Staff";
      if (empCat.toLowerCase() !== selectedCategoryFilter.toLowerCase()) {
        return false;
      }
    }

    // 2. Search Query Filter
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const cleanQ = q.replace(/\D/g, "");

    const nameMatch = (emp.name || "").toLowerCase().includes(q);
    const idMatch = (emp.empId || "").toLowerCase().includes(q);
    const deptMatch = (emp.department || "").toLowerCase().includes(q);
    const phoneMatch = cleanQ.length > 2 
      ? (emp.phone || "").replace(/\D/g, "").includes(cleanQ)
      : (emp.phone || "").toLowerCase().includes(q);
    const plateMatch = (emp.vehicle_plate || "").toLowerCase().includes(q);
    const groupMatch = (emp.group_members || "").toLowerCase().includes(q);
    const catMatch = (emp.category || "Staff").toLowerCase().includes(q);
    const orgMatch = getEmployeeOrganisation(emp).toLowerCase().includes(q);
    const exitMatch = isEmployeeExited(emp) && ("exited".includes(q) || "inactive".includes(q) || (getEmployeeExitDate(emp) || "").includes(q));

    return nameMatch || idMatch || deptMatch || phoneMatch || plateMatch || groupMatch || catMatch || orgMatch || exitMatch;
  });

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditName(emp.name || "");
    setEditCategory(emp.category || "Staff");
    setEditDepartment(emp.department || "");
    setEditPhone(emp.phone || "+91 ");
    setEditVehiclePlate(emp.vehicle_plate || "");
    setEditExistingDocUrl(emp.document_url || undefined);
    setEditDocumentFile(null);
    const isAllowed = emp.allow_entry_time_edit === true || (typeof emp.group_members === 'string' && emp.group_members.includes('__ALLOW_ENTRY_TIME_EDIT__'));
    setEditAllowEntryTime(!!isAllowed);
    const defCheckout = getDefaultCheckoutTime(emp);
    setEditEnableDefaultCheckout(!!defCheckout);
    setEditDefaultCheckoutTime(defCheckout || "19:00");
    setEditOrganisation(getEmployeeOrganisation(emp) || DEFAULT_ORGANISATION);
    const exitD = getEmployeeExitDate(emp);
    setEditExitDate(exitD || "");
    const cleanMembers = (emp.group_members || '')
      .split(',')
      .map(m => m.trim())
      .filter(m => m && !m.startsWith('__'));
    setEditGroupMembers(cleanMembers.length > 0 ? cleanMembers : [""]);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !editName.trim()) return;

    setIsSavingEdit(true);
    try {
      let document_url = editExistingDocUrl;

      if (editDocumentFile) {
        if (!navigator.onLine) {
          alert("You must be online to upload new ID documents.");
          setIsSavingEdit(false);
          return;
        }
        const fileExt = editDocumentFile.name.split('.').pop() || 'jpg';
        const fileName = `${editingEmployee.empId}_${Date.now()}.${fileExt}`.replace(/\s+/g, '_');
        const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, editDocumentFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
        document_url = publicUrl;
      }

      const defaultCheckoutVal = (editCategory === 'Staff' && editEnableDefaultCheckout && editDefaultCheckoutTime)
        ? convertTo24Hour(editDefaultCheckoutTime)
        : undefined;

      const filteredGroup = editGroupMembers.filter(m => m.trim() !== "");
      let groupMembersVal: string | undefined = filteredGroup.length > 0 ? filteredGroup.join(", ") : undefined;
      if (editCategory === 'Staff') {
        const tags: string[] = [];
        if (editAllowEntryTime) tags.push('__ALLOW_ENTRY_TIME_EDIT__');
        if (defaultCheckoutVal) tags.push(`__DEFAULT_CHECKOUT:${defaultCheckoutVal}__`);
        if (editOrganisation) tags.push(`__ORG:${editOrganisation}__`);
        if (editExitDate) tags.push(`__EXIT_DATE:${editExitDate}__`);
        groupMembersVal = tags.length > 0 ? tags.join(", ") : undefined;
      }

      const updatedEmp: Employee = {
        ...editingEmployee,
        name: editName.trim(),
        department: editDepartment.trim() || (editCategory === 'Vehicle' ? 'Logistics' : 'General'),
        phone: editPhone.trim(),
        category: editCategory,
        vehicle_plate: editVehiclePlate.trim() || undefined,
        document_url: document_url || undefined,
        group_members: groupMembersVal,
        allow_entry_time_edit: editAllowEntryTime,
        default_checkout_time: defaultCheckoutVal || undefined,
        organisation: editCategory === 'Staff' ? (editOrganisation || undefined) : undefined,
        exit_date: editCategory === 'Staff' ? (editExitDate || null) : null,
      };

      if (navigator.onLine) {
        const { error } = await supabase
          .from('employees')
          .update({
            name: updatedEmp.name,
            department: updatedEmp.department,
            phone: updatedEmp.phone,
            category: updatedEmp.category,
            vehicle_plate: updatedEmp.vehicle_plate || null,
            document_url: updatedEmp.document_url || null,
            group_members: updatedEmp.group_members || null,
            allow_entry_time_edit: updatedEmp.allow_entry_time_edit,
            default_checkout_time: updatedEmp.default_checkout_time || null,
            organisation: updatedEmp.organisation || null,
            exit_date: updatedEmp.exit_date || null
          })
          .eq('empId', updatedEmp.empId);

        if (error) {
          // If columns don't exist yet, retry without them
          // The fallback tag in group_members ensures it persists in DB anyway!
          const { error: retryError } = await supabase
            .from('employees')
            .update({
              name: updatedEmp.name,
              department: updatedEmp.department,
              phone: updatedEmp.phone,
              category: updatedEmp.category,
              vehicle_plate: updatedEmp.vehicle_plate || null,
              document_url: updatedEmp.document_url || null,
              group_members: updatedEmp.group_members || null
            })
            .eq('empId', updatedEmp.empId);
          if (retryError) throw retryError;
        }
      } else {
        await localdb.employeeQueue.put(updatedEmp);
      }

      // Update cached_employees
      const cached = localStorage.getItem('cached_employees');
      if (cached) {
        try {
          const list: Employee[] = JSON.parse(cached);
          const idx = list.findIndex(e => e.empId === updatedEmp.empId);
          if (idx !== -1) {
            list[idx] = updatedEmp;
          } else {
            list.unshift(updatedEmp);
          }
          localStorage.setItem('cached_employees', JSON.stringify(list));
        } catch (err) {
          console.error("Cache update error:", err);
        }
      }

      // Update local state
      setEmployees(prev => prev.map(e => e.empId === updatedEmp.empId ? updatedEmp : e));
      if (selectedEmployee && selectedEmployee.empId === updatedEmp.empId) {
        setSelectedEmployee(updatedEmp);
      }

      appLogger.info("Registry", `Updated profile ${updatedEmp.name} (${updatedEmp.empId})`);
      alert(`Success! Details for ${updatedEmp.name} have been updated.`);
      setEditingEmployee(null);
    } catch (err: any) {
      console.error("Failed to update profile:", err);
      alert("Error updating profile: " + (err.message || String(err)));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!editingEmployee) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete ${editingEmployee.name} (${editingEmployee.empId}) from the registry? This cannot be undone.`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      if (navigator.onLine) {
        const { error } = await supabase.from('employees').delete().eq('empId', editingEmployee.empId);
        if (error) throw error;
      } else {
        await localdb.employeeQueue.delete(editingEmployee.empId);
      }

      // Update cache
      const cached = localStorage.getItem('cached_employees');
      if (cached) {
        try {
          const list: Employee[] = JSON.parse(cached);
          const filtered = list.filter(e => e.empId !== editingEmployee.empId);
          localStorage.setItem('cached_employees', JSON.stringify(filtered));
        } catch (err) {
          console.error("Cache update error:", err);
        }
      }

      setEmployees(prev => prev.filter(e => e.empId !== editingEmployee.empId));
      if (selectedEmployee && selectedEmployee.empId === editingEmployee.empId) {
        setSelectedEmployee(null);
      }
      appLogger.info("Registry", `Deleted profile ${editingEmployee.name} (${editingEmployee.empId})`);
      alert(`${editingEmployee.name} has been removed from registry.`);
      setEditingEmployee(null);
    } catch (err: any) {
      console.error("Failed to delete profile:", err);
      alert("Error deleting profile: " + (err.message || String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value;
    setCategory(cat);
    generateNewId(cat);
    if (cat === 'Vehicle') {
      setDepartment("Logistics");
    }
  };

  // CSV Parser (handles quotes, commas, CRLF/LF)
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let inQuotes = false;
    let currentVal = '';
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      const nextChar = i + 1 < text.length ? text[i + 1] : '';

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentVal += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentVal.trim());
        currentVal = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(currentVal.trim());
        currentVal = '';
        if (row.some(cell => cell.length > 0)) {
          lines.push(row);
        }
        row = [];
      } else {
        currentVal += char;
      }
      i++;
    }

    if (currentVal.length > 0 || row.length > 0) {
      row.push(currentVal.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
    }

    return lines;
  };

  const parseCsvToEmployees = (text: string, existingList: Employee[]): Employee[] => {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    const nameIdx = headers.findIndex(h => h.includes('name') || h === 'person' || h === 'employee');
    const catIdx = headers.findIndex(h => h.includes('cat') || h.includes('type') || h.includes('role') || h.includes('designation'));
    const deptIdx = headers.findIndex(h => h.includes('dept') || h.includes('department') || h.includes('purpose'));
    const orgIdx = headers.findIndex(h => h === 'org' || h === 'organisation' || h === 'organization' || h.includes('organisation') || h.includes('organization'));
    const exitIdx = headers.findIndex(h => h.includes('exit') || h.includes('reliev'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('cell'));
    const idNumIdx = headers.findIndex(h => h.includes('identity') || h.includes('aadhar') || h.includes('pan') || h.includes('plate') || h.includes('license'));
    const empIdIdx = headers.findIndex(h => h === 'empid' || h === 'id' || h === 'code' || h === 'employeeid');

    const usedIds = new Set(existingList.map(e => e.empId));
    const result: Employee[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : '';
      if (!rawName) continue;

      const rawCat = catIdx !== -1 && row[catIdx] ? row[catIdx].trim().toLowerCase() : '';
      let cat = 'Staff';
      if (rawCat.includes('vol')) cat = 'Volunteer';
      else if (rawCat.includes('veh')) cat = 'Vehicle';
      else if (rawCat.includes('vis')) cat = 'Visitor';
      else if (rawCat.includes('par')) cat = 'Parcel';
      else cat = 'Staff';

      let dept = deptIdx !== -1 && row[deptIdx] ? row[deptIdx].trim() : '';
      if (!dept) {
        dept = cat === 'Vehicle' ? 'Logistics' : 'General';
      }

      let orgVal: string | undefined = undefined;
      if (orgIdx !== -1 && row[orgIdx]) {
        const rawOrg = row[orgIdx].trim();
        const matched = ORGANISATIONS.find(o => o.toLowerCase() === rawOrg.toLowerCase());
        orgVal = matched || rawOrg;
      }

      let ph = phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx].trim() : '';
      if (ph && !ph.startsWith('+')) {
        const cleanDigits = ph.replace(/\D/g, '');
        if (cleanDigits.length === 10) {
          ph = '+91 ' + cleanDigits;
        }
      }

      const idVal = idNumIdx !== -1 && row[idNumIdx] ? row[idNumIdx].trim() : '';

      let id = empIdIdx !== -1 && row[empIdIdx] ? row[empIdIdx].trim() : '';
      if (!id || usedIds.has(id)) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const prefix = cat === 'Staff' ? 'EMP' : cat === 'Volunteer' ? 'VOL' : cat === 'Vehicle' ? 'VEH' : 'VIS';
        let uniqueId = '';
        do {
          let code = '';
          for (let c = 0; c < 4; c++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          uniqueId = `${prefix}-${code}`;
        } while (usedIds.has(uniqueId));
        id = uniqueId;
      }
      usedIds.add(id);

      let exitVal: string | undefined = undefined;
      if (exitIdx !== -1 && row[exitIdx]) {
        exitVal = row[exitIdx].trim();
      }

      const tags: string[] = [];
      if (cat === 'Staff') {
        if (orgVal || DEFAULT_ORGANISATION) tags.push(`__ORG:${orgVal || DEFAULT_ORGANISATION}__`);
        if (exitVal) tags.push(`__EXIT_DATE:${exitVal}__`);
      }

      result.push({
        empId: id,
        name: rawName,
        category: cat,
        department: dept,
        phone: ph || '+91 ',
        vehicle_plate: idVal || undefined,
        organisation: cat === 'Staff' ? (orgVal || DEFAULT_ORGANISATION) : undefined,
        exit_date: cat === 'Staff' ? (exitVal || null) : null,
        group_members: tags.length > 0 ? tags.join(', ') : undefined,
        createdAt: new Date().toISOString()
      });
    }

    return result;
  };

  const downloadCategoryTemplate = (categoryType: 'All' | 'Staff' | 'Volunteer' | 'Vehicle' | 'Visitor' = 'All') => {
    const rows: string[] = ["Name,Category,Department,Phone,Identity_ID,Organisation"];
    let filename = `sample_${categoryType.toLowerCase()}_template.csv`;

    if (categoryType === 'Staff') {
      rows.push("Ramesh Sharma,Staff,Operations,+91 9876543210,Aadhar-1234-5678,Peepal Farm");
      rows.push("Priya Singh,Staff,Administration,+91 9876543211,PAN-ABCDE1234F,Sine Info");
    } else if (categoryType === 'Volunteer') {
      rows.push("Sunita Patel,Volunteer,Kitchen,+91 9876543212,Aadhar-5678-9012,");
      rows.push("Amit Kumar,Volunteer,Event Support,+91 9876543213,Voter-XYZ9876,");
    } else if (categoryType === 'Vehicle') {
      rows.push("Delivery Van 01,Vehicle,Logistics,,MH-12-AB-1234,");
      rows.push("Patrol Jeep 02,Vehicle,Security,,DL-01-CD-5678,");
    } else if (categoryType === 'Visitor') {
      rows.push("Rahul Verma,Visitor,Maintenance,+91 9876543214,DL-12345678,");
      rows.push("Anjali Roy,Visitor,Client Meeting,+91 9876543215,Aadhar-4321-8765,");
    } else {
      filename = "sample_all_categories_template.csv";
      rows.push("Ramesh Sharma,Staff,Operations,+91 9876543210,Aadhar-1234-5678,Peepal Farm");
      rows.push("Sunita Patel,Volunteer,Kitchen,+91 9876543211,PAN-ABCDE1234F,");
      rows.push("Delivery Van 01,Vehicle,Logistics,,MH-12-AB-1234,");
      rows.push("Rahul Verma,Visitor,Maintenance,+91 9876543214,DL-12345678,");
    }

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadCsvTemplate = () => downloadCategoryTemplate('All');

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        alert("The selected CSV file is empty.");
        return;
      }
      const parsed = parseCsvToEmployees(text, employees);
      if (parsed.length === 0) {
        alert("No valid rows could be found in the CSV. Please make sure the CSV has column headers (e.g. Name, Category, Department, Phone) and at least one person's name.");
        return;
      }
      setCsvPreviewData(parsed);
      setShowCsvModal(true);
    };
    reader.onerror = () => {
      alert("Failed to read the file.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmCsvImport = async () => {
    if (csvPreviewData.length === 0) return;
    setIsImportingCsv(true);

    try {
      if (navigator.onLine) {
        const batchSize = 50;
        for (let i = 0; i < csvPreviewData.length; i += batchSize) {
          const chunk = csvPreviewData.slice(i, i + batchSize);
          const { error } = await supabase.from('employees').insert(chunk);
          if (error) throw error;
        }
      } else {
        for (const emp of csvPreviewData) {
          await localdb.employeeQueue.put(emp);
        }
        const cached = localStorage.getItem('cached_employees');
        const currentList = cached ? JSON.parse(cached) : [];
        const mergedList = [...csvPreviewData, ...currentList];
        localStorage.setItem('cached_employees', JSON.stringify(mergedList));
      }

      const count = csvPreviewData.length;
      setShowCsvModal(false);
      setCsvPreviewData([]);
      await fetchEmployees();
      alert(`Success! ${count} profiles have been added to the registry.`);
    } catch (err: any) {
      alert("Error importing profiles: " + (err.message || err));
    } finally {
      setIsImportingCsv(false);
    }
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!empId || !name) return;
    
    setIsUploading(true);
    let document_url = "";
    
    if (documentFile) {
      if (!navigator.onLine) {
        alert("You must be online to upload ID documents.");
        setIsUploading(false);
        return;
      }
      try {
        const fileExt = documentFile.name.split('.').pop() || 'jpg';
        const fileName = `${empId}_${Date.now()}.${fileExt}`.replace(/\s+/g, '_');
        const { error } = await supabase.storage.from('documents').upload(fileName, documentFile, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
        document_url = publicUrl;
      } catch (err: any) {
        alert("Upload failed. Make sure 'documents' bucket exists and has public INSERT policy. Error: " + err.message);
        setIsUploading(false);
        return;
      }
    }
    
    const defaultCheckoutVal = (category === 'Staff' && enableDefaultCheckout && defaultCheckoutTime)
      ? convertTo24Hour(defaultCheckoutTime)
      : undefined;

    const filteredGroup = groupMembers.filter(m => m.trim() !== "");
    let groupMembersVal: string | undefined = filteredGroup.length > 0 ? filteredGroup.join(", ") : undefined;
    if (category === 'Staff') {
      const tags: string[] = [];
      if (allowEntryTime) tags.push('__ALLOW_ENTRY_TIME_EDIT__');
      if (defaultCheckoutVal) tags.push(`__DEFAULT_CHECKOUT:${defaultCheckoutVal}__`);
      if (organisation) tags.push(`__ORG:${organisation}__`);
      groupMembersVal = tags.length > 0 ? tags.join(", ") : undefined;
    }

    const newEmp: Employee = {
      empId, 
      name, 
      department, 
      phone, 
      category,
      document_url: document_url || undefined,
      vehicle_plate: vehiclePlate || undefined,
      group_members: groupMembersVal,
      allow_entry_time_edit: allowEntryTime,
      default_checkout_time: defaultCheckoutVal || undefined,
      organisation: category === 'Staff' ? (organisation || undefined) : undefined,
      createdAt: new Date().toISOString()
    };
    
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('employees').insert([newEmp]);
        if (error) {
          const sanitized = { ...newEmp };
          delete sanitized.allow_entry_time_edit;
          delete sanitized.default_checkout_time;
          delete sanitized.organisation;
          delete sanitized.organization;
          const { error: retryErr } = await supabase.from('employees').insert([sanitized]);
          if (retryErr) throw retryErr;
        }
      } catch (err: any) {
        alert("Error adding profile: " + err.message);
        setIsUploading(false);
        return;
      }
    } else {
      await localdb.employeeQueue.put(newEmp);
      const cached = localStorage.getItem('cached_employees');
      const currentList = cached ? JSON.parse(cached) : [];
      currentList.unshift(newEmp);
      localStorage.setItem('cached_employees', JSON.stringify(currentList));
    }
    
    setEnableDefaultCheckout(false);
    setDefaultCheckoutTime("");
    setOrganisation(DEFAULT_ORGANISATION);
    setIsUploading(false);
    setShowForm(false);
    fetchEmployees();
  }

  const handleExportZip = async () => {
    if (employees.length === 0) {
      alert("No registered profiles found to export.");
      return;
    }
    setIsExportingZip(true);
    setZipProgress({ current: 0, total: employees.length, name: 'Starting export...' });
    try {
      const blob = await exportAllQrsAsZip(employees, {
        type: zipExportType,
        onProgress: (current, total, name) => {
          setZipProgress({ current, total, name });
        }
      });
      const typeLabel = zipExportType === 'identity' ? 'Identity_Cards' : zipExportType === 'attendance' ? 'Attendance_Passes' : 'All_Passes';
      triggerBlobDownload(blob, `Peepal_Farm_${typeLabel}.zip`);
      setShowZipModal(false);
    } catch (err: any) {
      console.error("ZIP export failed:", err);
      alert("Failed to generate ZIP archive: " + (err?.message || "Unknown error"));
    } finally {
      setIsExportingZip(false);
    }
  };

  const todayDateStr = new Date().toISOString().split('T')[0];

  const fetchTodayAttendance = async () => {
    setLoadingTodayAttendance(true);
    let records: AttendanceRecord[] = [];

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('date', todayDateStr);
        if (!error && Array.isArray(data)) {
          records = data;
        }
      } catch (err) {
        console.warn("Could not fetch today's attendance online:", err);
      }
    }

    try {
      const queued = await localdb.syncQueue.where({ date: todayDateStr }).toArray();
      if (Array.isArray(queued) && queued.length > 0) {
        const map = new Map<string, AttendanceRecord>();
        for (const r of records) map.set(r.recordId, r);
        for (const q of queued) map.set(q.recordId, q as any);
        records = Array.from(map.values());
      }
    } catch (e) {}

    if (records.length === 0) {
      try {
        const raw = localStorage.getItem('cached_logs');
        if (raw) {
          const list: AttendanceRecord[] = JSON.parse(raw);
          if (Array.isArray(list)) {
            records = list.filter(r => r.date === todayDateStr);
          }
        }
      } catch (e) {}
    }

    setTodayAttendance(records);
    setLoadingTodayAttendance(false);
  };

  const handleOpenForgotQrModal = () => {
    setShowForgotQrModal(true);
    setForgotQrSearch("");
    setForgotQrTimeMode('now');
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setForgotQrCustomTime(`${hh}:${mm}`);
    setForgotQrToast(null);
    fetchTodayAttendance();
  };

  const handleManualPunch = async (emp: Employee, targetAction: 'IN' | 'OUT') => {
    if (isEmployeeExited(emp)) {
      setForgotQrToast({
        success: false,
        msg: `Cannot log attendance: ${emp.name} has left the organisation (Exit Date: ${getEmployeeExitDate(emp)}). QR is deactivated.`
      });
      return;
    }

    setForgotQrProcessingId(emp.empId);
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      
      let punchTimeStr = formatTimeForSave(today);
      let punchTimestamp = today.getTime();

      if (forgotQrTimeMode === 'custom' && forgotQrCustomTime) {
        const parsedTs = parseDateAnd24HourToISTTimestamp(dateStr, forgotQrCustomTime);
        if (!Number.isNaN(parsedTs)) {
          punchTimestamp = parsedTs;
          punchTimeStr = formatTimeForDisplay(forgotQrCustomTime);
        }
      }

      // Find staff member's latest record for today
      const staffRecords = todayAttendance.filter(r => r.empId === emp.empId && r.date === dateStr);
      staffRecords.sort((a, b) => (b.inTimestamp || 0) - (a.inTimestamp || 0));
      const latestRecord = staffRecords.length > 0 ? staffRecords[0] : null;

      if (targetAction === 'IN') {
        const newRecord: AttendanceRecord = {
          recordId: crypto.randomUUID(),
          empId: emp.empId,
          empName: emp.name,
          department: emp.department || 'General',
          category: emp.category || 'Staff',
          date: dateStr,
          inTime: punchTimeStr,
          inTimestamp: punchTimestamp,
          status: 'IN',
          isSynced: navigator.onLine ? 1 : 0,
          updatedAt: new Date().toISOString()
        };

        if (navigator.onLine) {
          const { error } = await supabase.from('attendance').insert([newRecord]);
          if (error) throw error;
        } else {
          await localdb.syncQueue.put(newRecord as any);
        }

        updateCachedAttendance(newRecord as any);
        setTodayAttendance(prev => [newRecord, ...prev]);

        setForgotQrToast({
          success: true,
          msg: `Checked IN: ${emp.name} at ${punchTimeStr}`
        });
        appLogger.info("Admin", `Manual Check-IN for ${emp.name} (${emp.empId}) at ${punchTimeStr}`);
      } else {
        if (!latestRecord || latestRecord.status !== 'IN') {
          throw new Error(`${emp.name} does not have an active Check-IN record for today.`);
        }

        const diffMs = punchTimestamp - (latestRecord.inTimestamp || punchTimestamp);
        const hrs = Math.max(0, Math.floor(diffMs / 3600000));
        const mins = Math.max(0, Math.floor((diffMs % 3600000) / 60000));
        const totalHours = `${hrs}h ${mins}m`;

        const updatedRecord: AttendanceRecord = {
          ...latestRecord,
          empName: emp.name || latestRecord.empName,
          department: emp.department || latestRecord.department,
          category: emp.category || latestRecord.category,
          outTime: punchTimeStr,
          outTimestamp: punchTimestamp,
          totalHours: totalHours,
          status: 'OUT',
          isSynced: navigator.onLine ? 1 : 0,
          updatedAt: new Date().toISOString()
        };

        if (navigator.onLine) {
          const { error } = await supabase
            .from('attendance')
            .update(updatedRecord)
            .eq('recordId', latestRecord.recordId);
          if (error) throw error;
        } else {
          await localdb.syncQueue.put(updatedRecord as any);
        }

        updateCachedAttendance(updatedRecord as any);
        setTodayAttendance(prev => prev.map(r => r.recordId === updatedRecord.recordId ? updatedRecord : r));

        setForgotQrToast({
          success: true,
          msg: `Checked OUT: ${emp.name} at ${punchTimeStr} (${totalHours})`
        });
        appLogger.info("Admin", `Manual Check-OUT for ${emp.name} (${emp.empId}) at ${punchTimeStr} (${totalHours})`);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ams_attendance_updated'));
        window.dispatchEvent(new CustomEvent('ams_today_count_changed'));
      }
    } catch (err: any) {
      setForgotQrToast({
        success: false,
        msg: err.message || "Failed to update attendance."
      });
    } finally {
      setForgotQrProcessingId(null);
    }
  };

  const filteredForgotQrStaff = employees.filter(e => {
    if (e.category === 'Vehicle' || e.category === 'Parcel') return false;
    if (!forgotQrSearch.trim()) return true;
    const q = forgotQrSearch.toLowerCase().trim();
    return (
      e.name?.toLowerCase().includes(q) ||
      e.empId?.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q) ||
      e.phone?.includes(q)
    );
  });

  const getCategoryIcon = (cat?: string) => {
    if (cat === 'Vehicle') return <Truck size={16} className="text-amber-500" />;
    if (cat === 'Visitor') return <UserPlus size={16} className="text-emerald-500" />;
    if (cat === 'Volunteer') return <Users size={16} className="text-purple-500" />;
    return <Shield size={16} className="text-blue-500" />;
  };

  return (
    <div className="p-4 pb-20 max-w-md mx-auto space-y-4">
      {/* Registry Responsive Header */}
      <div className="space-y-2.5">
        {/* Row 1: Title & Actions (Registry ... Forgot QR ... Add New) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <h2 className="text-2xl font-black text-gray-800 tracking-tight">Registry</h2>
            <span className="bg-slate-100 text-slate-600 text-xs font-black px-2.5 py-0.5 rounded-full border border-slate-200/80 shrink-0">
              {employees.length}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {role === 'admin' && (
              <button 
                type="button"
                onClick={handleOpenForgotQrModal}
                className="bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-900 border border-amber-300/80 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold flex items-center shadow-xs active:scale-95 transition-all whitespace-nowrap h-9 cursor-pointer"
                title="Manual Attendance for staff who forgot their QR code"
              >
                <QrCode size={15} className="mr-1.5 text-amber-700 shrink-0" />
                <span>Forgot QR</span>
              </button>
            )}

            <button 
              type="button"
              onClick={handleOpenForm}
              className="bg-blue-900 hover:bg-blue-800 active:bg-blue-950 text-white px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold flex items-center shadow-xs active:scale-95 transition-all whitespace-nowrap shrink-0 h-9 cursor-pointer"
            >
              <UserPlus size={15} className="mr-1.5 shrink-0" />
              <span>Add New</span>
            </button>
          </div>
        </div>

        {/* Row 2: Secondary Tool Actions (Upload CSV & Bulk ZIP Export) */}
        {role === 'admin' && (
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="file" 
              accept=".csv,text/csv"
              ref={csvInputRef}
              onChange={handleCsvFileSelect}
              className="hidden"
            />
            {/* Upload CSV Split Button with Categories Sample Menu */}
            <div className="relative inline-flex items-stretch rounded-xl border border-emerald-200 bg-emerald-50/90 shadow-xs h-9 min-w-0">
              <button 
                type="button"
                onClick={() => csvInputRef.current?.click()}
                className="flex-1 flex items-center justify-center px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100/80 active:bg-emerald-200 transition-colors border-r border-emerald-200 rounded-l-[11px] whitespace-nowrap min-w-0 truncate"
                title="Upload CSV to add members in bulk"
              >
                <FileSpreadsheet size={15} className="mr-1.5 text-emerald-600 shrink-0" />
                <span className="truncate">Upload CSV</span>
              </button>
              <button 
                type="button"
                onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                className="flex items-center justify-center px-2 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 transition-colors rounded-r-[11px] shrink-0"
                title="Download sample CSV template for each category"
                aria-label="Download sample CSV template"
              >
                <ChevronDown size={14} className={`text-emerald-700 transition-transform duration-200 ${showTemplateMenu ? 'rotate-180' : ''}`} />
              </button>

              {showTemplateMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTemplateMenu(false)} />
                  <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fade-in text-xs">
                    <div className="px-2.5 py-1.5 font-bold text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-100 mb-1">
                      Download Sample CSV
                    </div>
                    <button 
                      type="button"
                      onClick={() => { downloadCategoryTemplate('Staff'); setShowTemplateMenu(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 text-blue-700 font-bold flex items-center justify-between transition-colors"
                    >
                      <span>👤 Staff Template</span>
                      <Download size={13} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => { downloadCategoryTemplate('Volunteer'); setShowTemplateMenu(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-purple-50 text-purple-700 font-bold flex items-center justify-between transition-colors"
                    >
                      <span>🤝 Volunteer Template</span>
                      <Download size={13} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => { downloadCategoryTemplate('Vehicle'); setShowTemplateMenu(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-50 text-amber-700 font-bold flex items-center justify-between transition-colors"
                    >
                      <span>🚚 Vehicle Template</span>
                      <Download size={13} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => { downloadCategoryTemplate('Visitor'); setShowTemplateMenu(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-emerald-700 font-bold flex items-center justify-between transition-colors"
                    >
                      <span>🏷️ Visitor Template</span>
                      <Download size={13} />
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button 
                      type="button"
                      onClick={() => { downloadCategoryTemplate('All'); setShowTemplateMenu(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 text-gray-800 font-bold flex items-center justify-between transition-colors"
                    >
                      <span>📁 All Categories Combined</span>
                      <Download size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Bulk QRs ZIP Button */}
            <button
              type="button"
              onClick={() => setShowZipModal(true)}
              className="flex items-center justify-center px-2.5 text-xs font-bold text-indigo-800 bg-indigo-50/90 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 rounded-xl shadow-xs transition-colors h-9 whitespace-nowrap min-w-0 truncate"
              title="Download all QR identity cards in a ZIP folder for bulk printing"
            >
              <FolderArchive size={15} className="mr-1.5 text-indigo-600 shrink-0" />
              <span className="truncate">Bulk QRs ZIP</span>
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="bg-white p-5 rounded-2xl shadow-lg border border-gray-100 mb-6 animate-fade-in relative">
          <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
          
          <h3 className="text-lg font-bold mb-4 text-gray-800">Register Profile</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Category</label>
              <select 
                value={category}
                onChange={handleCategoryChange}
                className={`w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium ${role === 'guard' ? 'opacity-70 cursor-not-allowed' : ''}`}
                disabled={role === 'guard'}
              >
                {role === 'admin' && <option value="Staff">Staff</option>}
                <option value="Visitor">Visitor</option>
                {role === 'admin' && <option value="Volunteer">Volunteer</option>}
                {role === 'admin' && <option value="Vehicle">Vehicle</option>}
              </select>
            </div>

            <div className="flex space-x-3">
              <div className="w-1/2">
                <label className="block text-xs font-bold text-gray-500 mb-1">ID (Auto-generated)</label>
                <input 
                  type="text" 
                  value={empId} 
                  readOnly
                  disabled
                  className="w-full bg-gray-100 border border-gray-200 p-3 rounded-xl outline-none font-mono text-gray-500 cursor-not-allowed select-none font-bold"
                  title="Auto-generated unique ID (non-editable)"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  {category === 'Vehicle' ? 'Vehicle Name *' : category === 'Parcel' ? 'Courier / Delivery Svc *' : 'Full Name *'}
                </label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            {category === 'Vehicle' ? (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">License Plate Number</label>
                <input 
                  type="text" 
                  value={vehiclePlate} 
                  onChange={e => setVehiclePlate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                  placeholder="e.g. MH-12-AB-1234"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex space-x-3">
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {category === 'Visitor' ? 'Purpose/Org' : category === 'Parcel' ? 'Tracking # / Desc' : 'Department'}
                    </label>
                    <input 
                      type="text" 
                      list="register-dept-recommendations"
                      value={department} 
                      onChange={e => setDepartment(e.target.value)}
                      placeholder={category === 'Staff' ? "Type or pick department" : ""}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                    />
                    <datalist id="register-dept-recommendations">
                      {RECOMMENDED_DEPARTMENTS.map(dept => (
                        <option key={dept} value={dept} />
                      ))}
                    </datalist>
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Phone Number</label>
                    <input 
                      type="tel" 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              
                {category !== 'Parcel' && (
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Identity ID No. (Aadhar, PAN, etc.)</label>
                    <input 
                      type="text" 
                      value={vehiclePlate} 
                      onChange={e => setVehiclePlate(e.target.value)}
                      placeholder="e.g. 1234-5678-9012"
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                    />
                  </div>
                )}

                {category === 'Staff' && (
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center space-x-1">
                      <Building2 size={13} className="text-gray-500" />
                      <span>Organisation</span>
                    </label>
                    <select
                      value={organisation}
                      onChange={e => setOrganisation(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                    >
                      {ORGANISATIONS.map(org => (
                        <option key={org} value={org}>{org}</option>
                      ))}
                    </select>
                  </div>
                )}

                {category === 'Staff' && (
                  <>
                    <div className="p-3.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 rounded-2xl flex items-center justify-between shadow-2xs mt-3">
                      <div className="pr-3">
                        <div className="flex items-center space-x-1.5">
                          <Clock size={16} className="text-blue-700 shrink-0" />
                          <span className="text-xs font-extrabold text-gray-800">Allow Entry Time Edit</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                          When enabled, guards can edit this staff member's punch-in / entry time from Today's Attendance.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={allowEntryTime}
                        onClick={() => setAllowEntryTime(!allowEntryTime)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          allowEntryTime ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            allowEntryTime ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-200/80 rounded-2xl shadow-2xs mt-3">
                      <div className="flex items-center justify-between">
                        <div className="pr-3">
                          <div className="flex items-center space-x-1.5">
                            <LogOut size={16} className="text-indigo-700 shrink-0" />
                            <span className="text-xs font-extrabold text-gray-800">Default Check-Out Time (Optional)</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                            Auto checks out staff at this time if they leave late and guard is unavailable.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enableDefaultCheckout}
                          onClick={() => {
                            const next = !enableDefaultCheckout;
                            setEnableDefaultCheckout(next);
                            if (next && !defaultCheckoutTime) setDefaultCheckoutTime("19:00");
                          }}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            enableDefaultCheckout ? 'bg-indigo-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              enableDefaultCheckout ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {enableDefaultCheckout && (
                        <div className="mt-3 pt-3 border-t border-indigo-200/60 animate-fade-in space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-gray-700">Auto Check-Out At:</label>
                            <input
                              type="time"
                              value={defaultCheckoutTime}
                              onChange={(e) => setDefaultCheckoutTime(e.target.value)}
                              className="bg-white border border-indigo-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-bold uppercase mr-1">Quick:</span>
                            {['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setDefaultCheckoutTime(preset)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                                  defaultCheckoutTime === preset
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                    : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200'
                                }`}
                              >
                                {formatTimeForDisplay(preset)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {category === 'Visitor' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">ID Document (Optional Photo)</label>
                  <div className="relative w-full bg-blue-50 border-2 border-dashed border-blue-200 p-4 rounded-xl text-center hover:bg-blue-100 transition-colors">
                    <input 
                      type="file" 
                      accept="image/*"
                      capture="environment"
                      onChange={e => e.target.files && setDocumentFile(e.target.files[0])}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="text-blue-600 font-bold flex flex-col items-center justify-center w-full">
                      {documentFile ? (
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <img src={URL.createObjectURL(documentFile)} alt="Preview" className="w-full max-h-32 object-contain rounded-lg border-2 border-green-400 shadow-sm" />
                          <div className="flex items-center text-green-600">
                            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>Photo Ready!</span>
                          </div>
                          <span className="text-xs text-gray-500 max-w-full truncate px-4">{documentFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          Tap to open Camera (Optional)
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-500">Group Members (Optional)</label>
                  {groupMembers.map((member, idx) => (
                    <div key={idx} className="flex space-x-2">
                      <input 
                        type="text" 
                        value={member}
                        onChange={(e) => {
                          const newMembers = [...groupMembers];
                          newMembers[idx] = e.target.value;
                          setGroupMembers(newMembers);
                        }}
                        placeholder={`Member ${idx + 1} Name`}
                        className="flex-1 bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => setGroupMembers([...groupMembers, ""])}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg"
                  >
                    + Add another person
                  </button>
                </div>
              </>
            )}

            <div className="flex space-x-3 pt-2">
              <button 
                type="button" 
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isUploading}
                className="flex-1 bg-blue-900 text-white py-3 rounded-xl font-bold shadow-md disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Preview & Confirm Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-800 text-base">Import from CSV</h3>
                  <p className="text-xs text-gray-500 font-medium truncate max-w-[200px]">{csvFileName} • {csvPreviewData.length} records</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowCsvModal(false); setCsvPreviewData([]); }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-white transition-colors"
                disabled={isImportingCsv}
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-gray-100 bg-gray-50/70">
              {['Staff', 'Volunteer', 'Vehicle', 'Visitor'].map(cat => {
                const count = csvPreviewData.filter(d => d.category === cat).length;
                if (count === 0) return null;
                return (
                  <span key={cat} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-700">
                    {cat}: <span className="text-emerald-700 font-extrabold">{count}</span>
                  </span>
                );
              })}
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {csvPreviewData.map((item, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-200/80 p-3 rounded-xl flex items-center justify-between text-xs hover:border-emerald-300 transition-colors">
                  <div className="overflow-hidden flex-1 mr-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900 truncate text-sm">{item.name}</span>
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        item.category === 'Vehicle' ? 'bg-amber-100 text-amber-700' :
                        item.category === 'Volunteer' ? 'bg-purple-100 text-purple-700' :
                        item.category === 'Visitor' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {item.category}
                      </span>
                    </div>
                    <div className="text-gray-500 mt-1 flex flex-wrap gap-x-2 text-[11px] font-medium">
                      <span>Dept: {item.department}</span>
                      {item.phone && item.phone !== '+91 ' && <span>• Ph: {item.phone}</span>}
                      {item.vehicle_plate && <span>• ID: {item.vehicle_plate}</span>}
                    </div>
                  </div>
                  <div className="font-mono text-[10px] font-bold text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">
                    {item.empId}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1.5 px-1">
                <span className="text-gray-500 font-medium">Total: {csvPreviewData.length} records ready</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-gray-400 font-medium">Samples:</span>
                  <button type="button" onClick={() => downloadCategoryTemplate('Staff')} className="text-blue-600 font-bold hover:underline">Staff</button>
                  <span>•</span>
                  <button type="button" onClick={() => downloadCategoryTemplate('Volunteer')} className="text-purple-600 font-bold hover:underline">Volunteer</button>
                  <span>•</span>
                  <button type="button" onClick={() => downloadCategoryTemplate('Vehicle')} className="text-amber-600 font-bold hover:underline">Vehicle</button>
                  <span>•</span>
                  <button type="button" onClick={() => downloadCategoryTemplate('Visitor')} className="text-emerald-600 font-bold hover:underline">Visitor</button>
                  <span>•</span>
                  <button type="button" onClick={() => downloadCategoryTemplate('All')} className="text-gray-700 font-bold hover:underline">All</button>
                </div>
              </div>

              <div className="flex space-x-2 pt-1">
                <button 
                  type="button" 
                  onClick={() => { setShowCsvModal(false); setCsvPreviewData([]); }}
                  disabled={isImportingCsv}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={confirmCsvImport}
                  disabled={isImportingCsv}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-bold shadow-md flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  {isImportingCsv ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} className="mr-1.5" />
                      Import All ({csvPreviewData.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Search & Category Filter Bar */}
      {!loading && employees.length > 0 && (
        <div className="space-y-2 mb-1">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff, ID, phone..."
                className="w-full bg-white border border-gray-200 pl-9 pr-8 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm shadow-xs font-medium placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="relative w-32 shrink-0">
              <select 
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="appearance-none w-full bg-white text-gray-700 font-bold py-2.5 pl-3 pr-7 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 text-xs shadow-xs cursor-pointer truncate"
              >
                <option value="All">All ({employees.length})</option>
                <option value="Staff">👤 Staff ({employees.filter(e => (e.category || 'Staff') === 'Staff').length})</option>
                <option value="Volunteer">🤝 Volunteer ({employees.filter(e => e.category === 'Volunteer').length})</option>
                <option value="Vehicle">🚚 Vehicle ({employees.filter(e => e.category === 'Vehicle').length})</option>
                <option value="Visitor">🏷️ Visitor ({employees.filter(e => e.category === 'Visitor').length})</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Filter Status Badge / Reset */}
          {(searchQuery.trim() !== "" || selectedCategoryFilter !== "All") && (
            <div className="flex items-center justify-between text-xs px-1 text-gray-500 animate-fade-in flex-wrap gap-1">
              <span>
                Found <b className="text-gray-800">{filteredEmployees.length}</b> {filteredEmployees.length === 1 ? 'result' : 'results'}
                {selectedCategoryFilter !== 'All' ? ` in ${selectedCategoryFilter}` : ''}
                {searchQuery ? ` for "${searchQuery}"` : ''}
              </span>
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSelectedCategoryFilter("All"); }}
                className="text-blue-600 font-bold hover:underline ml-auto"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading registry...</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200 p-6 space-y-3">
          <p>No profiles registered yet.</p>
          {role === 'admin' && (
            <div className="pt-2 flex justify-center space-x-2">
              <button 
                onClick={() => csvInputRef.current?.click()}
                className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100"
              >
                Upload CSV
              </button>
              <button 
                onClick={downloadCsvTemplate}
                className="text-xs text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 flex items-center"
              >
                <Download size={12} className="mr-1" /> Template
              </button>
            </div>
          )}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 p-6 space-y-2">
          <Search size={26} className="mx-auto text-gray-300 mb-1" />
          <p className="font-bold text-gray-700 text-sm">No matching records found</p>
          <p className="text-xs text-gray-500">
            No profile matches your search query {searchQuery ? `"${searchQuery}"` : ''} {selectedCategoryFilter !== 'All' ? `in category ${selectedCategoryFilter}` : ''}.
          </p>
          <button
            type="button"
            onClick={() => { setSearchQuery(""); setSelectedCategoryFilter("All"); }}
            className="text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors mt-2"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEmployees.map(emp => (
            <div 
              key={emp.empId} 
              onClick={() => setSelectedEmployee(emp)}
              className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1 mr-2">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-base sm:text-lg shrink-0
                  ${emp.category === 'Vehicle' ? 'bg-amber-100 text-amber-700' : 
                    emp.category === 'Visitor' ? 'bg-emerald-100 text-emerald-700' : 
                    emp.category === 'Volunteer' ? 'bg-purple-100 text-purple-700' : 
                    emp.category === 'Parcel' ? 'bg-purple-100 text-purple-700' : 
                    'bg-blue-100 text-blue-700'}`}>
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <h3 className="font-bold text-gray-800 text-sm sm:text-base truncate">{emp.name}</h3>
                    <span className="flex items-center text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md shrink-0">
                      {getCategoryIcon(emp.category)} <span className="ml-1">{emp.category || 'Staff'}</span>
                    </span>
                    {isEmployeeExited(emp) && (
                      <span className="inline-flex items-center text-[9px] uppercase tracking-wider font-extrabold bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 rounded-md shrink-0" title={`Staff exited organisation on ${getEmployeeExitDate(emp)}`}>
                        <UserX size={10} className="mr-0.5 text-red-600" /> Exited ({getEmployeeExitDate(emp)})
                      </span>
                    )}
                    {getEmployeeOrganisation(emp) && (
                      <span className="inline-flex items-center text-[9px] uppercase tracking-wider font-extrabold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md shrink-0" title={`Organisation: ${getEmployeeOrganisation(emp)}`}>
                        <Building2 size={10} className="mr-0.5 text-amber-700" /> {getEmployeeOrganisation(emp)}
                      </span>
                    )}
                    {emp.category === 'Staff' && (emp.allow_entry_time_edit === true || (typeof emp.group_members === 'string' && emp.group_members.includes('__ALLOW_ENTRY_TIME_EDIT__'))) && (
                      <span className="hidden sm:inline-flex items-center text-[9px] uppercase tracking-wider font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md shrink-0" title="Guard can edit entry time">
                        <Clock size={10} className="mr-0.5 text-emerald-600" /> Time Edit
                      </span>
                    )}
                    {emp.category === 'Staff' && getDefaultCheckoutTime(emp) && (
                      <span className="inline-flex items-center text-[9px] uppercase tracking-wider font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-md shrink-0" title={`Auto checkout at ${formatTimeForDisplay(getDefaultCheckoutTime(emp))}`}>
                        <LogOut size={10} className="mr-0.5 text-indigo-600" /> Auto-Out {formatTimeForDisplay(getDefaultCheckoutTime(emp))}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
                    {emp.empId} • {emp.category === 'Vehicle' ? emp.vehicle_plate : emp.department}
                    {getEmployeeOrganisation(emp) && ` • ${getEmployeeOrganisation(emp)}`}
                    {isEmployeeExited(emp) && ` • ⛔ Relieved: ${getEmployeeExitDate(emp)}`}
                    {emp.vehicle_plate && emp.category !== 'Vehicle' && ` • ID: ${emp.vehicle_plate}`}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
                {emp.document_url && (
                  <div className="text-emerald-500 bg-emerald-50 p-2 rounded-xl" title="Document Attached">
                    <FileText size={16} />
                  </div>
                )}
                {role === 'admin' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(emp);
                    }}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs flex items-center space-x-1 transition-all active:scale-95 shadow-xs whitespace-nowrap shrink-0"
                    title={`Edit ${emp.name}`}
                    aria-label={`Edit ${emp.name}`}
                  >
                    <Pencil size={13} className="text-blue-600 shrink-0" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Profile Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-800 text-base">Edit {editCategory} Details</h3>
                  <p className="text-xs text-gray-500 font-mono font-bold">{editingEmployee.empId}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-white transition-colors"
                disabled={isSavingEdit || isDeleting}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Category</label>
                <select 
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                >
                  <option value="Staff">Staff</option>
                  <option value="Volunteer">Volunteer</option>
                  <option value="Vehicle">Vehicle</option>
                  <option value="Visitor">Visitor</option>
                </select>
              </div>

              <div className="flex space-x-3">
                <div className="w-1/3">
                  <label className="block text-xs font-bold text-gray-500 mb-1">ID (Fixed)</label>
                  <input 
                    type="text" 
                    value={editingEmployee.empId} 
                    readOnly
                    disabled
                    className="w-full bg-gray-100 border border-gray-200 p-3 rounded-xl outline-none font-mono text-gray-500 cursor-not-allowed select-none font-bold text-xs"
                    title="Employee ID cannot be changed"
                  />
                </div>
                <div className="w-2/3">
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    {editCategory === 'Vehicle' ? 'Vehicle Name *' : 'Full Name *'}
                  </label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                    required
                  />
                </div>
              </div>

              {editCategory === 'Vehicle' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">License Plate Number</label>
                  <input 
                    type="text" 
                    value={editVehiclePlate} 
                    onChange={e => setEditVehiclePlate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase text-sm"
                    placeholder="e.g. MH-12-AB-1234"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex space-x-3">
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        {editCategory === 'Visitor' ? 'Purpose/Org' : 'Department'}
                      </label>
                      <input 
                        type="text" 
                        list="edit-dept-recommendations"
                        value={editDepartment} 
                        onChange={e => setEditDepartment(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                        placeholder="e.g. Operations, Admin"
                      />
                      <datalist id="edit-dept-recommendations">
                        {RECOMMENDED_DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept} />
                        ))}
                      </datalist>
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Phone Number</label>
                      <input 
                        type="tel" 
                        value={editPhone} 
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                        placeholder="+91 "
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Identity ID No. (Aadhar, PAN, etc.)</label>
                    <input 
                      type="text" 
                      value={editVehiclePlate} 
                      onChange={e => setEditVehiclePlate(e.target.value)}
                      placeholder="e.g. 1234-5678-9012"
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Organisation Dropdown (for Staff) */}
              {editCategory === 'Staff' && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center space-x-1">
                    <Building2 size={13} className="text-gray-500" />
                    <span>Organisation</span>
                  </label>
                  <select
                    value={editOrganisation}
                    onChange={(e) => setEditOrganisation(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                  >
                    {ORGANISATIONS.map(org => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Allow Entry Time Edit Toggle (for Staff) */}
              {editCategory === 'Staff' && (
                <>
                  <div className="p-3.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
                    <div className="pr-3">
                      <div className="flex items-center space-x-1.5">
                        <Clock size={16} className="text-blue-700 shrink-0" />
                        <span className="text-xs font-extrabold text-gray-800">Allow Entry Time Edit</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                        When enabled, guards can edit this staff member's punch-in / entry time from Today's Attendance.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editAllowEntryTime}
                      onClick={() => setEditAllowEntryTime(!editAllowEntryTime)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        editAllowEntryTime ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          editAllowEntryTime ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-200/80 rounded-2xl shadow-2xs mt-3">
                    <div className="flex items-center justify-between">
                      <div className="pr-3">
                        <div className="flex items-center space-x-1.5">
                          <LogOut size={16} className="text-indigo-700 shrink-0" />
                          <span className="text-xs font-extrabold text-gray-800">Default Check-Out Time (Optional)</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                          Auto checks out staff at this time if they leave late and guard is unavailable.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editEnableDefaultCheckout}
                        onClick={() => {
                          const next = !editEnableDefaultCheckout;
                          setEditEnableDefaultCheckout(next);
                          if (next && !editDefaultCheckoutTime) setEditDefaultCheckoutTime("19:00");
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          editEnableDefaultCheckout ? 'bg-indigo-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            editEnableDefaultCheckout ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {editEnableDefaultCheckout && (
                      <div className="mt-3 pt-3 border-t border-indigo-200/60 animate-fade-in space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-gray-700">Auto Check-Out At:</label>
                          <input
                            type="time"
                            value={editDefaultCheckoutTime}
                            onChange={(e) => setEditDefaultCheckoutTime(e.target.value)}
                            className="bg-white border border-indigo-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-gray-400 font-bold uppercase mr-1">Quick:</span>
                          {['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setEditDefaultCheckoutTime(preset)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                                editDefaultCheckoutTime === preset
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200'
                              }`}
                            >
                              {formatTimeForDisplay(preset)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Exit Date / Organisation Relieving Section */}
                  <div className={`p-3.5 rounded-2xl border transition-all mt-3 ${
                    editExitDate ? 'bg-red-50/80 border-red-200' : 'bg-gray-50/80 border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="pr-2">
                        <div className="flex items-center space-x-1.5">
                          <UserMinus size={16} className={editExitDate ? 'text-red-700' : 'text-gray-600'} />
                          <span className={`text-xs font-extrabold ${editExitDate ? 'text-red-900' : 'text-gray-800'}`}>
                            Exit Date (Deactivates QR)
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                          For staff who switch or leave the organisation. Deactivates their attendance QR immediately.
                        </p>
                      </div>
                      {!editExitDate ? (
                        <button
                          type="button"
                          onClick={() => {
                            const todayStr = new Date().toISOString().split('T')[0];
                            setEditExitDate(todayStr);
                          }}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-700 text-xs font-bold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
                        >
                          + Add Exit Date
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditExitDate("")}
                          className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-bold rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer"
                          title="Reactivate staff by removing exit date"
                        >
                          Clear / Reactivate
                        </button>
                      )}
                    </div>

                    {editExitDate && (
                      <div className="mt-3 pt-3 border-t border-red-200/80 flex items-center justify-between space-x-3 animate-fade-in">
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold text-red-800 mb-1">
                            Official Relieving Date
                          </label>
                          <input
                            type="date"
                            value={editExitDate}
                            onChange={(e) => setEditExitDate(e.target.value)}
                            className="w-full bg-white border border-red-300 p-2 rounded-xl text-xs font-bold text-red-900 outline-none focus:ring-2 focus:ring-red-500 shadow-xs"
                          />
                        </div>
                        <div className="text-[11px] text-red-600 font-extrabold self-end pb-2 flex items-center shrink-0">
                          <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5 animate-pulse"></span>
                          QR Deactivated
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ID Document / Photo section */}
              <div className="pt-1">
                <label className="block text-xs font-bold text-gray-500 mb-1">Attached Document / ID Photo</label>
                {editExistingDocUrl && !editDocumentFile && (
                  <div className="mb-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-blue-700 font-medium">
                      <FileText size={16} />
                      <a href={editExistingDocUrl} target="_blank" rel="noreferrer" className="underline font-bold hover:text-blue-900 truncate max-w-[180px]">
                        View Current Document
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditExistingDocUrl(undefined)}
                      className="text-red-500 hover:text-red-700 text-[11px] font-bold"
                    >
                      Remove
                    </button>
                  </div>
                )}
                
                <div className="relative w-full bg-gray-50 border-2 border-dashed border-gray-200 p-3 rounded-xl text-center hover:bg-gray-100 transition-colors">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => e.target.files && setEditDocumentFile(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-gray-500 text-xs font-medium flex flex-col items-center justify-center">
                    {editDocumentFile ? (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <CheckCircle2 size={15} className="mr-1" /> New File: {editDocumentFile.name}
                      </span>
                    ) : (
                      <span>{editExistingDocUrl ? "Tap to Replace Document (Optional)" : "Tap to Upload ID Photo / Document (Optional)"}</span>
                    )}
                  </div>
                </div>
              </div>

              {editCategory === 'Visitor' && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-500">Group Members (Optional)</label>
                  {editGroupMembers.map((member, idx) => (
                    <div key={idx} className="flex space-x-2">
                      <input 
                        type="text" 
                        value={member}
                        onChange={(e) => {
                          const newMembers = [...editGroupMembers];
                          newMembers[idx] = e.target.value;
                          setEditGroupMembers(newMembers);
                        }}
                        placeholder={`Member ${idx + 1} Name`}
                        className="flex-1 bg-gray-50 border border-gray-200 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                      />
                    </div>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => setEditGroupMembers([...editGroupMembers, ""])}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg"
                  >
                    + Add person
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-3 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setEditingEmployee(null)}
                  disabled={isSavingEdit || isDeleting}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingEdit || isDeleting}
                  className="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>

              {/* Delete profile option */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleDeleteEmployee}
                  disabled={isSavingEdit || isDeleting}
                  className="text-xs text-red-600 hover:text-red-700 font-bold hover:underline inline-flex items-center space-x-1"
                >
                  <Trash2 size={13} className="text-red-500" />
                  <span>{isDeleting ? "Deleting..." : "Delete Profile"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk ZIP Export Modal */}
      {showZipModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 sm:p-6 relative max-h-[92dvh] flex flex-col">
            <button 
              onClick={() => !isExportingZip && setShowZipModal(false)}
              disabled={isExportingZip}
              className="absolute top-4 right-4 p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 z-10"
            >
              <X size={18} />
            </button>

            <div className="flex items-center space-x-3 mb-4 shrink-0">
              <div className="p-2.5 rounded-2xl bg-indigo-100 text-indigo-700">
                <FolderArchive size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-800 text-base">Bulk QR Pass Download</h3>
                <p className="text-xs text-gray-500 font-medium">Download all {employees.length} passes in a single ZIP</p>
              </div>
            </div>

            <div className="space-y-4 mb-4 text-xs overflow-y-auto flex-1 pr-0.5">
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 text-indigo-950 leading-relaxed">
                <p className="font-bold mb-1">📦 Ready for Bulk Printing</p>
                <p className="text-indigo-800">
                  Generates individual high-resolution PNG pass cards for all <b>{employees.length}</b> registered personnel and packages them into a clean ZIP folder.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Select Card Type to Export</label>
                <div className="space-y-2">
                  <label className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all ${
                    zipExportType === 'identity' ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}>
                    <input 
                      type="radio" 
                      name="zipType" 
                      value="identity" 
                      checked={zipExportType === 'identity'} 
                      onChange={() => setZipExportType('identity')}
                      disabled={isExportingZip}
                      className="mt-0.5 mr-2.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold text-gray-800 block text-xs">🪪 Identity Cards (Public URL QR - Recommended)</span>
                      <span className="text-gray-500 text-[11px] mt-0.5 block">
                        Stores verification URL. Smartphone camera scan redirects to verified identity page. Ideal for printing physical ID cards.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all ${
                    zipExportType === 'attendance' ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}>
                    <input 
                      type="radio" 
                      name="zipType" 
                      value="attendance" 
                      checked={zipExportType === 'attendance'} 
                      onChange={() => setZipExportType('attendance')}
                      disabled={isExportingZip}
                      className="mt-0.5 mr-2.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-bold text-gray-800 block text-xs">⏱️ Gate Attendance Passes (Internal QR)</span>
                      <span className="text-gray-500 text-[11px] mt-0.5 block">
                        Stores raw ID format. For internal gate logging devices.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all ${
                    zipExportType === 'both' ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}>
                    <input 
                      type="radio" 
                      name="zipType" 
                      value="both" 
                      checked={zipExportType === 'both'} 
                      onChange={() => setZipExportType('both')}
                      disabled={isExportingZip}
                      className="mt-0.5 mr-2.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <span className="font-bold text-gray-800 block text-xs">📁 Both Sets (Identity + Attendance Cards)</span>
                      <span className="text-gray-500 text-[11px] mt-0.5 block">
                        Includes both cards for each personnel in separate named files.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {isExportingZip && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center">
                      <Loader2 size={13} className="animate-spin mr-1.5 text-indigo-600" />
                      Generating Cards...
                    </span>
                    <span>{zipProgress.current} / {zipProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full transition-all duration-200 rounded-full"
                      style={{ width: `${zipProgress.total ? (zipProgress.current / zipProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    Processing: {zipProgress.name}
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-2 shrink-0 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowZipModal(false)}
                disabled={isExportingZip}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-xs transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportZip}
                disabled={isExportingZip || employees.length === 0}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-colors flex items-center justify-center disabled:opacity-50"
              >
                {isExportingZip ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1.5" />
                    Packaging ZIP...
                  </>
                ) : (
                  <>
                    <Download size={14} className="mr-1.5" />
                    Download ZIP
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {selectedEmployee && (() => {
        const verifyUrl = getStaffVerifyUrl(selectedEmployee.empId);
        const legacyPayload = JSON.stringify({ empId: selectedEmployee.empId });
        const activeQrValue = activePassTab === 'identity' ? verifyUrl : legacyPayload;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative max-h-[92dvh] flex flex-col">
              <button 
                onClick={() => setSelectedEmployee(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 z-10 transition-colors"
              >
                <X size={18} />
              </button>
              
              <div className="p-5 sm:p-6 pb-4 flex flex-col items-center overflow-y-auto flex-1">
                {/* Category Banner Pill */}
                <div className={`w-full text-center py-1.5 mb-4 rounded-lg font-bold text-xs tracking-widest uppercase
                  ${selectedEmployee.category === 'Vehicle' ? 'bg-amber-100 text-amber-700' : 
                    selectedEmployee.category === 'Visitor' ? 'bg-emerald-100 text-emerald-700' : 
                    selectedEmployee.category === 'Volunteer' ? 'bg-purple-100 text-purple-700' : 
                    selectedEmployee.category === 'Parcel' ? 'bg-purple-100 text-purple-700' : 
                    'bg-blue-100 text-blue-700'}`}>
                  {selectedEmployee.category === 'Vehicle' ? 'VEHICLE PASS' : selectedEmployee.category === 'Visitor' ? 'VISITOR PASS' : selectedEmployee.category === 'Volunteer' ? 'VOLUNTEER PASS' : selectedEmployee.category === 'Parcel' ? 'PARCEL TRACKER' : 'STAFF PASS'}
                </div>

                {/* Dual QR Type Selector Tabs */}
                <div className="w-full grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-2xl mb-4 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActivePassTab('identity')}
                    className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                      activePassTab === 'identity'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ShieldCheck size={14} />
                    <span>Identity QR (URL)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePassTab('attendance')}
                    className={`py-2 px-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                      activePassTab === 'attendance'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock size={14} />
                    <span>Gate QR (ID Only)</span>
                  </button>
                </div>

                {/* Hidden canvases used for card generation */}
                <div className="hidden">
                  <QRCodeCanvas 
                    id="qr-canvas-identity"
                    value={verifyUrl} 
                    size={260}
                    level="H"
                    includeMargin={true}
                  />
                  <QRCodeCanvas 
                    id="qr-canvas-attendance"
                    value={legacyPayload} 
                    size={260}
                    level="H"
                    includeMargin={true}
                  />
                </div>

                {/* Deactivated QR Alert if Staff Exited */}
                {isEmployeeExited(selectedEmployee) && (
                  <div className="w-full bg-red-50 border border-red-200 rounded-2xl p-3 mb-3 text-center animate-fade-in">
                    <span className="text-xs font-bold text-red-800 flex items-center justify-center">
                      <UserX size={15} className="mr-1.5 text-red-600" />
                      QR Code Deactivated (Staff Exited)
                    </span>
                    <p className="text-[11px] text-red-700 mt-1 leading-snug">
                      Exit Date: <strong>{getEmployeeExitDate(selectedEmployee)}</strong>. This QR cannot be scanned through the attendance webapp.
                    </p>
                  </div>
                )}

                {/* Visible QR Code Display Box */}
                <div className={`p-4 rounded-2xl shadow-inner border mb-3 relative transition-all ${
                  isEmployeeExited(selectedEmployee)
                    ? 'bg-red-50/50 border-red-300'
                    : activePassTab === 'identity' ? 'bg-emerald-50/40 border-emerald-200' : 'bg-blue-50/40 border-blue-200'
                }`}>
                  <QRCodeCanvas 
                    value={activeQrValue} 
                    size={175}
                    level="H"
                  />
                  {isEmployeeExited(selectedEmployee) && (
                    <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                      <UserX size={34} className="text-red-600 mb-1" />
                      <span className="text-xs font-black text-red-700 uppercase tracking-wider">QR Deactivated</span>
                      <span className="text-[10px] font-bold text-red-600 mt-0.5">Left: {getEmployeeExitDate(selectedEmployee)}</span>
                    </div>
                  )}
                </div>

                {/* Contextual description for the active QR */}
                {activePassTab === 'identity' ? (
                  <div className="w-full bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-2.5 mb-3 text-center">
                    <span className="text-[11px] font-bold text-emerald-800 flex items-center justify-center">
                      <ShieldCheck size={13} className="mr-1 text-emerald-600" />
                      Public Verification QR (For ID Card Print)
                    </span>
                    <p className="text-[10px] text-emerald-700 mt-0.5 leading-snug">
                      Scanning with any standard phone camera verifies their official identity.
                    </p>
                    <div className="mt-2 flex items-center justify-between bg-white rounded-lg px-2 py-1 border border-emerald-200 text-[11px]">
                      <span className="font-mono text-emerald-900 truncate max-w-[190px]">
                        {verifyUrl}
                      </span>
                      <div className="flex items-center space-x-1 shrink-0 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(verifyUrl);
                            setCopiedPassUrl(true);
                            setTimeout(() => setCopiedPassUrl(false), 2000);
                          }}
                          className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                          title="Copy verification URL"
                        >
                          {copiedPassUrl ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                        <a
                          href={verifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                          title="Open verification page in new tab"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full bg-blue-50/80 border border-blue-200/80 rounded-xl p-2.5 mb-3 text-center">
                    <span className="text-[11px] font-bold text-blue-800 flex items-center justify-center">
                      <Clock size={13} className="mr-1 text-blue-600" />
                      Gate Attendance QR (Legacy Internal)
                    </span>
                    <p className="text-[10px] text-blue-700 mt-0.5 leading-snug">
                      Stores raw ID for gate check-in / check-out terminals.
                    </p>
                    <div className="mt-2 bg-white rounded-lg px-2 py-1 border border-blue-200 text-[11px] font-mono text-blue-900 text-center truncate">
                      {legacyPayload}
                    </div>
                  </div>
                )}

                <h2 className="text-xl font-bold text-gray-800 text-center">{selectedEmployee.name}</h2>
                <p className="text-gray-500 font-mono text-xs mt-0.5 font-bold">{selectedEmployee.empId}</p>

                {getEmployeeOrganisation(selectedEmployee) && (
                  <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-amber-900 text-xs font-semibold">
                    <Building2 size={13} className="text-amber-700" />
                    <span>{getEmployeeOrganisation(selectedEmployee)}</span>
                  </div>
                )}

                {isEmployeeExited(selectedEmployee) && (
                  <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-red-800 text-xs font-semibold">
                    <UserX size={13} className="text-red-600" />
                    <span>Relieved / Exit Date: {getEmployeeExitDate(selectedEmployee)}</span>
                  </div>
                )}

                {(() => {
                  const cleanGroup = selectedEmployee.group_members
                    ?.split(',')
                    .map(m => m.trim())
                    .filter(m => m && !m.startsWith('__'))
                    .join(', ');
                  if (!cleanGroup) return null;
                  return (
                    <div className="mt-2.5 bg-gray-50 p-2.5 rounded-xl w-full text-center border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-0.5">Group Members</span>
                      <span className="text-xs font-medium text-gray-700">{cleanGroup}</span>
                    </div>
                  );
                })()}
                
                {selectedEmployee.document_url && (
                  <a 
                    href={selectedEmployee.document_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="mt-3 text-xs text-blue-600 font-medium flex items-center bg-blue-50 px-3 py-1.5 rounded-lg"
                  >
                    <FileText size={14} className="mr-1.5" /> View Attached Document
                  </a>
                )}
              </div>

              <div className="bg-gray-50 p-4 border-t border-gray-100 px-6 space-y-2 shrink-0">
                {role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      const empToEdit = selectedEmployee;
                      setSelectedEmployee(null);
                      handleOpenEditModal(empToEdit);
                    }}
                    className="w-full bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-800 border border-blue-200 py-2.5 rounded-xl flex items-center justify-center font-bold transition-colors text-xs active:scale-95 shadow-xs"
                  >
                    <Pencil size={14} className="mr-1.5 text-blue-600" /> Edit Staff Details
                  </button>
                )}
                <div className="w-full flex space-x-2">
                  <button 
                    onClick={() => {
                      const canvasId = activePassTab === 'identity' ? 'qr-canvas-identity' : 'qr-canvas-attendance';
                      const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement;
                      if (!qrCanvas) return;
                      const cardCanvas = generateCardCanvas(qrCanvas, selectedEmployee, { type: activePassTab });
                      const fileName = `${selectedEmployee.name.replace(/\s+/g, '_')}_${activePassTab === 'identity' ? 'Identity_Card' : 'Attendance_Pass'}.png`;

                      if (cardCanvas.toBlob) {
                        cardCanvas.toBlob((blob) => {
                          if (!blob) {
                            const url = cardCanvas.toDataURL("image/png");
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = fileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            return;
                          }
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = fileName;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }, 1000);
                        }, "image/png");
                      } else {
                        const url = cardCanvas.toDataURL("image/png");
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }
                    }}
                    className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl flex items-center justify-center font-bold shadow-sm transition-colors text-xs active:scale-95"
                  >
                    <Download size={16} className="mr-1 text-gray-600" />
                    Download {activePassTab === 'identity' ? 'ID Card' : 'Pass'}
                  </button>

                  <button 
                    onClick={async () => {
                      const canvasId = activePassTab === 'identity' ? 'qr-canvas-identity' : 'qr-canvas-attendance';
                      const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement;
                      if (!qrCanvas) return;
                      const cardCanvas = generateCardCanvas(qrCanvas, selectedEmployee, { type: activePassTab });
                      const cardLabel = activePassTab === 'identity' ? 'Identity_Card' : 'Attendance_Pass';
                      
                      cardCanvas.toBlob(async (blob) => {
                        if (!blob) return;
                        const file = new File([blob], `${selectedEmployee.name.replace(/\s+/g, '_')}_${cardLabel}.png`, { type: "image/png" });
                        
                        const useDirectWhatsApp = selectedEmployee.phone && selectedEmployee.phone.length > 5;
                        
                        if (useDirectWhatsApp) {
                          if (!navigator.onLine) {
                            alert("You must be online to generate and upload the cloud link for this pass.");
                            return;
                          }
                          try {
                            const fileName = `${selectedEmployee.empId}_${cardLabel}_${Date.now()}.png`;
                            const { error } = await supabase.storage.from('qr-passes').upload(fileName, file, { cacheControl: '3600', upsert: false });
                            if (error) {
                              alert("Failed to upload image. Did you create the 'qr-passes' public bucket?");
                              return;
                            }
                            const passPageUrl = `${window.location.origin}/pass/${fileName}`;
                            const cleanPhone = (selectedEmployee.phone || '').replace(/\D/g,'');
                            const msg = `Hello ${selectedEmployee.name},\n\nOpen the link to view your ${activePassTab === 'identity' ? 'Official Identity Card' : 'Attendance Pass'} and download it:\n${passPageUrl}`;
                            const waUrl = `https://wa.me/${cleanPhone}?text=` + encodeURIComponent(msg);
                            window.open(waUrl, "_blank");
                          } catch (err) {
                            alert("An error occurred while uploading the pass.");
                          }
                        } else if (navigator.canShare && navigator.canShare({ files: [file] })) {
                          try {
                            await navigator.share({
                              title: activePassTab === 'identity' ? 'Identity Card' : 'Attendance Pass',
                              text: `Here is the ${activePassTab === 'identity' ? 'Official Identity Card' : 'Attendance QR Pass'} for ${selectedEmployee.name}.`,
                              files: [file]
                            });
                          } catch (err: any) {
                            console.log("Share cancelled or failed", err);
                          }
                        } else {
                          alert("Please add a phone number for this profile to share via WhatsApp.");
                        }
                      }, "image/png");
                    }}
                    className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white py-3 rounded-xl flex items-center justify-center font-bold shadow-md transition-colors text-xs active:scale-95"
                  >
                    <MessageCircle size={16} className="mr-1" /> WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Forgot QR Manual Attendance Modal (Admin Only) */}
      {showForgotQrModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative max-h-[92dvh] flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 sm:p-5 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                  <QrCode size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Forgot QR Code</h3>
                  <p className="text-[11px] text-amber-100 font-medium">Manual Check-In & Check-Out</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowForgotQrModal(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Notification Toast inside Modal */}
            {forgotQrToast && (
              <div className={`p-3 text-xs font-bold flex items-center justify-between border-b ${
                forgotQrToast.success 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                <div className="flex items-center space-x-2 truncate mr-2">
                  {forgotQrToast.success ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <AlertCircle size={16} className="text-red-600 shrink-0" />}
                  <span className="truncate">{forgotQrToast.msg}</span>
                </div>
                <button type="button" onClick={() => setForgotQrToast(null)} className="text-gray-400 hover:text-gray-700 shrink-0 text-xs font-extrabold cursor-pointer">✕</button>
              </div>
            )}

            {/* Controls Bar: Search & Punch Time Configuration */}
            <div className="p-4 pb-2 border-b border-gray-100 space-y-3 shrink-0 bg-gray-50/50">
              {/* Search Box */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                <input
                  type="text"
                  value={forgotQrSearch}
                  onChange={(e) => setForgotQrSearch(e.target.value)}
                  placeholder="Search staff name, ID, phone..."
                  className="w-full bg-white border border-gray-200 pl-9 pr-8 py-2 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                  autoFocus
                />
                {forgotQrSearch && (
                  <button 
                    type="button" 
                    onClick={() => setForgotQrSearch("")}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 text-xs p-0.5 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Time Mode Selector */}
              <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700 flex items-center gap-1">
                    <Clock size={13} className="text-amber-600" /> Punch Time:
                  </span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setForgotQrTimeMode('now')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        forgotQrTimeMode === 'now' 
                          ? 'bg-amber-600 text-white shadow-xs' 
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Now (Real-Time)
                    </button>
                    <button
                      type="button"
                      onClick={() => setForgotQrTimeMode('custom')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        forgotQrTimeMode === 'custom' 
                          ? 'bg-amber-600 text-white shadow-xs' 
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Custom Time
                    </button>
                  </div>
                </div>

                {forgotQrTimeMode === 'custom' && (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                    <span className="text-[11px] font-bold text-gray-500">Select Time:</span>
                    <input
                      type="time"
                      value={forgotQrCustomTime}
                      onChange={(e) => setForgotQrCustomTime(e.target.value)}
                      className="bg-gray-50 border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-gray-800 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Staff List */}
            <div className="overflow-y-auto p-4 space-y-2.5 flex-1 bg-slate-50/50">
              {loadingTodayAttendance ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Loader2 size={24} className="animate-spin mx-auto text-amber-500" />
                  <p className="text-xs font-bold">Loading today's status...</p>
                </div>
              ) : filteredForgotQrStaff.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <p className="text-xs font-bold">No staff found matching "{forgotQrSearch}".</p>
                </div>
              ) : (
                filteredForgotQrStaff.map(emp => {
                  const staffRecords = todayAttendance.filter(r => r.empId === emp.empId && r.date === todayDateStr);
                  staffRecords.sort((a, b) => (b.inTimestamp || 0) - (a.inTimestamp || 0));
                  const latestRecord = staffRecords.length > 0 ? staffRecords[0] : null;
                  const isCurrentlyIn = latestRecord && latestRecord.status === 'IN';
                  const isProcessing = forgotQrProcessingId === emp.empId;
                  const isExited = isEmployeeExited(emp);

                  return (
                    <div 
                      key={emp.empId}
                      className={`bg-white p-3.5 rounded-2xl border shadow-2xs transition-all flex items-center justify-between gap-3 ${
                        isExited ? 'border-red-200 bg-red-50/20' : 'border-gray-100 hover:border-amber-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-extrabold text-sm text-gray-800 truncate">{emp.name}</h4>
                          <span className="text-[9px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold shrink-0">{emp.empId}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {emp.department} {emp.phone ? `• ${emp.phone}` : ''}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {isExited ? (
                            <span className="inline-flex items-center text-[10px] font-extrabold bg-red-100 text-red-800 px-2 py-0.5 rounded-md border border-red-300">
                              <UserX size={10} className="mr-1 text-red-600" />
                              Relieved / Exited ({getEmployeeExitDate(emp)}) • QR Deactivated
                            </span>
                          ) : isCurrentlyIn ? (
                            <span className="inline-flex items-center text-[10px] font-extrabold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span>
                              Currently IN ({latestRecord?.inTime})
                            </span>
                          ) : latestRecord?.outTime ? (
                            <span className="inline-flex items-center text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                              OUT at {latestRecord.outTime} {latestRecord.totalHours ? `(${latestRecord.totalHours})` : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200">
                              Not Checked In Today
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center space-x-1.5">
                        {isExited ? (
                          <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-xl">
                            Deactivated
                          </span>
                        ) : isCurrentlyIn ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleManualPunch(emp, 'OUT')}
                            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-1 active:scale-95 cursor-pointer"
                          >
                            {isProcessing ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <>
                                <LogOut size={13} />
                                <span>Check OUT</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleManualPunch(emp, 'IN')}
                            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center space-x-1 active:scale-95 cursor-pointer"
                          >
                            {isProcessing ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <>
                                <LogIn size={13} />
                                <span>Check IN</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between shrink-0 font-medium">
              <span>{filteredForgotQrStaff.length} staff member(s)</span>
              <button 
                type="button" 
                onClick={fetchTodayAttendance}
                className="text-amber-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
