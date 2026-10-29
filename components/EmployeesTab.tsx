"use client";
import { useState, useEffect, useRef } from "react";
import { supabase, Employee } from "@/lib/supabase";
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
  Search
} from "lucide-react";
import { appLogger } from "@/lib/logger";

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
  const [isUploading, setIsUploading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Search & Category Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

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
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      const { data, error } = await supabase.from('employees').select('*').order('createdAt', { ascending: false });
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
    setShowForm(true);
  };

  const filteredEmployees = employees.filter(emp => {
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

    return nameMatch || idMatch || deptMatch || phoneMatch || plateMatch || groupMatch || catMatch;
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
    if (emp.group_members) {
      setEditGroupMembers(emp.group_members.split(",").map(m => m.trim()).filter(Boolean));
    } else {
      setEditGroupMembers([""]);
    }
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

      const filteredGroup = editGroupMembers.filter(m => m.trim() !== "");
      const updatedEmp: Employee = {
        ...editingEmployee,
        name: editName.trim(),
        department: editDepartment.trim() || (editCategory === 'Vehicle' ? 'Logistics' : 'General'),
        phone: editPhone.trim(),
        category: editCategory,
        vehicle_plate: editVehiclePlate.trim() || undefined,
        document_url: document_url || undefined,
        group_members: filteredGroup.length > 0 ? filteredGroup.join(", ") : undefined,
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
            group_members: updatedEmp.group_members || null
          })
          .eq('empId', updatedEmp.empId);

        if (error) throw error;
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
    const deptIdx = headers.findIndex(h => h.includes('dept') || h.includes('department') || h.includes('purpose') || h.includes('org'));
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

      result.push({
        empId: id,
        name: rawName,
        category: cat,
        department: dept,
        phone: ph || '+91 ',
        vehicle_plate: idVal || undefined,
        createdAt: new Date().toISOString()
      });
    }

    return result;
  };

  const downloadCategoryTemplate = (categoryType: 'All' | 'Staff' | 'Volunteer' | 'Vehicle' | 'Visitor' = 'All') => {
    const rows: string[] = ["Name,Category,Department,Phone,Identity_ID"];
    let filename = `sample_${categoryType.toLowerCase()}_template.csv`;

    if (categoryType === 'Staff') {
      rows.push("Ramesh Sharma,Staff,Operations,+91 9876543210,Aadhar-1234-5678");
      rows.push("Priya Singh,Staff,Administration,+91 9876543211,PAN-ABCDE1234F");
    } else if (categoryType === 'Volunteer') {
      rows.push("Sunita Patel,Volunteer,Kitchen,+91 9876543212,Aadhar-5678-9012");
      rows.push("Amit Kumar,Volunteer,Event Support,+91 9876543213,Voter-XYZ9876");
    } else if (categoryType === 'Vehicle') {
      rows.push("Delivery Van 01,Vehicle,Logistics,,MH-12-AB-1234");
      rows.push("Patrol Jeep 02,Vehicle,Security,,DL-01-CD-5678");
    } else if (categoryType === 'Visitor') {
      rows.push("Rahul Verma,Visitor,Maintenance,+91 9876543214,DL-12345678");
      rows.push("Anjali Roy,Visitor,Client Meeting,+91 9876543215,Aadhar-4321-8765");
    } else {
      filename = "sample_all_categories_template.csv";
      rows.push("Ramesh Sharma,Staff,Operations,+91 9876543210,Aadhar-1234-5678");
      rows.push("Sunita Patel,Volunteer,Kitchen,+91 9876543211,PAN-ABCDE1234F");
      rows.push("Delivery Van 01,Vehicle,Logistics,,MH-12-AB-1234");
      rows.push("Rahul Verma,Visitor,Maintenance,+91 9876543214,DL-12345678");
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
    
    const filteredGroup = groupMembers.filter(m => m.trim() !== "");
    const newEmp: Employee = {
      empId, 
      name, 
      department, 
      phone, 
      category,
      document_url: document_url || undefined,
      vehicle_plate: vehiclePlate || undefined,
      group_members: filteredGroup.length > 0 ? filteredGroup.join(", ") : undefined,
      createdAt: new Date().toISOString()
    };
    
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('employees').insert([newEmp]);
        if (error) throw error;
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
    
    setIsUploading(false);
    setShowForm(false);
    fetchEmployees();
  }

  // Draw a beautiful ID card
  const generateCardCanvas = (qrCanvas: HTMLCanvasElement, emp: Employee): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return qrCanvas;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#f0f7ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header Banner
    ctx.fillStyle = emp.category === 'Vehicle' ? '#f59e0b' : emp.category === 'Visitor' ? '#10b981' : emp.category === 'Volunteer' ? '#9333ea' : emp.category === 'Parcel' ? '#8b5cf6' : '#2563eb';
    ctx.fillRect(0, 0, canvas.width, 140);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    const bannerTitle = emp.category === 'Vehicle' ? 'VEHICLE PASS' : emp.category === 'Visitor' ? 'VISITOR PASS' : emp.category === 'Volunteer' ? 'VOLUNTEER PASS' : emp.category === 'Parcel' ? 'PARCEL TRACKER' : 'STAFF ID CARD';
    ctx.fillText(bannerTitle, canvas.width / 2, 85);

    // Card Body
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.roundRect(40, 180, 520, 580, 30);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // QR Code
    ctx.drawImage(qrCanvas, (canvas.width - 250) / 2, 220, 250, 250);

    // Profile Details
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(emp.name.toUpperCase(), canvas.width / 2, 530);

    ctx.fillStyle = '#64748b';
    ctx.font = '24px sans-serif';
    ctx.fillText(emp.department.toUpperCase(), canvas.width / 2, 570);

    // Divider
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 610);
    ctx.lineTo(500, 610);
    ctx.stroke();

    // Footer Info
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`ID: ${emp.empId}`, canvas.width / 2, 660);
    
    if (emp.category === 'Vehicle' && emp.vehicle_plate) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`PLATE: ${emp.vehicle_plate}`, canvas.width / 2, 700);
    } else if (emp.vehicle_plate) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`ID NO: ${emp.vehicle_plate}`, canvas.width / 2, 700);
    } else if (emp.phone) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`PH: ${emp.phone}`, canvas.width / 2, 700);
    }

    return canvas;
  };

  const getCategoryIcon = (cat?: string) => {
    if (cat === 'Vehicle') return <Truck size={16} className="text-amber-500" />;
    if (cat === 'Visitor') return <UserPlus size={16} className="text-emerald-500" />;
    if (cat === 'Volunteer') return <Users size={16} className="text-purple-500" />;
    return <Shield size={16} className="text-blue-500" />;
  };

  return (
    <div className="p-4 pb-20 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-gray-800">Registry</h2>
        <div className="flex items-center space-x-2">
          {role === 'admin' && (
            <>
              <input 
                type="file" 
                accept=".csv,text/csv"
                ref={csvInputRef}
                onChange={handleCsvFileSelect}
                className="hidden"
              />
              {/* Upload CSV Split Button with Categories Sample Menu */}
              <div className="relative inline-flex items-stretch rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm h-9">
                <button 
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="flex items-center px-2.5 sm:px-3 text-xs sm:text-sm font-bold text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 transition-colors border-r border-emerald-200 rounded-l-[11px]"
                  title="Upload CSV to add members in bulk"
                >
                  <FileSpreadsheet size={16} className="mr-1.5 text-emerald-600 shrink-0" />
                  <span>Upload CSV</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                  className="flex items-center justify-center px-2 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 transition-colors rounded-r-[11px]"
                  title="Download sample CSV template for each category"
                  aria-label="Download sample CSV template"
                >
                  <ChevronDown size={14} className={`text-emerald-700 transition-transform duration-200 ${showTemplateMenu ? 'rotate-180' : ''}`} />
                </button>

                {showTemplateMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowTemplateMenu(false)} />
                    <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-fade-in text-xs">
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
            </>
          )}
          <button 
            onClick={handleOpenForm}
            className="bg-blue-900 hover:bg-blue-800 text-white px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center shadow-sm active:scale-95 transition-all h-9 shrink-0"
          >
            + Add New
          </button>
        </div>
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
                      value={department} 
                      onChange={e => setDepartment(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
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
          <div className="flex items-center space-x-2">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff, vehicle, ID, phone..."
                className="w-full bg-white border border-gray-200 pl-9 pr-8 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-xs font-medium"
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

            <div className="relative w-36 shrink-0">
              <select 
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="appearance-none w-full bg-white text-gray-700 font-bold py-2.5 pl-3 pr-8 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 text-xs shadow-xs cursor-pointer"
              >
                <option value="All">All ({employees.length})</option>
                <option value="Staff">👤 Staff ({employees.filter(e => (e.category || 'Staff') === 'Staff').length})</option>
                <option value="Volunteer">🤝 Volunteer ({employees.filter(e => e.category === 'Volunteer').length})</option>
                <option value="Vehicle">🚚 Vehicle ({employees.filter(e => e.category === 'Vehicle').length})</option>
                <option value="Visitor">🏷️ Visitor ({employees.filter(e => e.category === 'Visitor').length})</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-3.5 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Filter Status Badge / Reset */}
          {(searchQuery.trim() !== "" || selectedCategoryFilter !== "All") && (
            <div className="flex items-center justify-between text-xs px-1 text-gray-500 animate-fade-in">
              <span>
                Found <b className="text-gray-800">{filteredEmployees.length}</b> {filteredEmployees.length === 1 ? 'result' : 'results'}
                {selectedCategoryFilter !== 'All' ? ` in ${selectedCategoryFilter}` : ''}
                {searchQuery ? ` for "${searchQuery}"` : ''}
              </span>
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSelectedCategoryFilter("All"); }}
                className="text-blue-600 font-bold hover:underline"
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
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-gray-800 text-sm sm:text-base truncate">{emp.name}</h3>
                    <span className="flex items-center text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md shrink-0">
                      {getCategoryIcon(emp.category)} <span className="ml-1">{emp.category || 'Staff'}</span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
                    {emp.empId} • {emp.category === 'Vehicle' ? emp.vehicle_plate : emp.department}
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
                    className="p-2 sm:px-3 sm:py-1.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs flex items-center space-x-1 transition-all active:scale-95 shadow-xs"
                    title={`Edit ${emp.name}`}
                    aria-label={`Edit ${emp.name}`}
                  >
                    <Pencil size={13} className="text-blue-600 shrink-0" />
                    <span className="hidden sm:inline">Edit</span>
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
                        value={editDepartment} 
                        onChange={e => setEditDepartment(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                        placeholder="e.g. Operations, Admin"
                      />
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

      {/* QR Code Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
            <button 
              onClick={() => setSelectedEmployee(null)}
              className="absolute top-4 right-4 p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 z-10"
            >
              <X size={20} />
            </button>
            
            <div className="p-8 pb-6 flex flex-col items-center">
              <div className={`w-full text-center py-2 mb-6 rounded-lg font-bold text-sm tracking-widest
                ${selectedEmployee.category === 'Vehicle' ? 'bg-amber-100 text-amber-700' : 
                  selectedEmployee.category === 'Visitor' ? 'bg-emerald-100 text-emerald-700' : 
                  selectedEmployee.category === 'Volunteer' ? 'bg-purple-100 text-purple-700' : 
                  selectedEmployee.category === 'Parcel' ? 'bg-purple-100 text-purple-700' : 
                  'bg-blue-100 text-blue-700'}`}>
                {selectedEmployee.category === 'Vehicle' ? 'VEHICLE PASS' : selectedEmployee.category === 'Visitor' ? 'VISITOR PASS' : selectedEmployee.category === 'Volunteer' ? 'VOLUNTEER PASS' : selectedEmployee.category === 'Parcel' ? 'PARCEL TRACKER' : 'STAFF PASS'}
              </div>

              <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100 mb-6 relative">
                {/* Hidden canvas used to generate the final image */}
                <div className="hidden">
                  <QRCodeCanvas 
                    id="qr-canvas"
                    value={JSON.stringify({ empId: selectedEmployee.empId })} 
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                {/* Visible QR Code for display */}
                <QRCodeCanvas 
                  value={JSON.stringify({ empId: selectedEmployee.empId })} 
                  size={180}
                  level="H"
                />
              </div>

              <h2 className="text-2xl font-bold text-gray-800 text-center">{selectedEmployee.name}</h2>
              <p className="text-gray-500 font-mono mt-1">{selectedEmployee.empId}</p>

              {selectedEmployee.group_members && (
                <div className="mt-3 bg-gray-50 p-3 rounded-xl w-full text-center border border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Group Members</span>
                  <span className="text-sm font-medium text-gray-700">{selectedEmployee.group_members}</span>
                </div>
              )}
              
              {selectedEmployee.document_url && (
                <a 
                  href={selectedEmployee.document_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="mt-4 text-sm text-blue-600 font-medium flex items-center bg-blue-50 px-4 py-2 rounded-lg"
                >
                  <FileText size={16} className="mr-2" /> View Attached Document
                </a>
              )}
            </div>

            <div className="bg-gray-50 p-4 border-t border-gray-100 px-6 space-y-2">
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
                    const qrCanvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
                    if (!qrCanvas) return;
                    const cardCanvas = generateCardCanvas(qrCanvas, selectedEmployee);
                    const fileName = `${selectedEmployee.name.replace(/\s+/g, '_')}_Pass.png`;

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
                  className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl flex items-center justify-center font-bold shadow-sm transition-colors text-sm active:scale-95"
                >
                  <Download size={18} className="mr-1" /> Download
                </button>
                <button 
                  onClick={async () => {
                    const qrCanvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
                    if (!qrCanvas) return;
                    const cardCanvas = generateCardCanvas(qrCanvas, selectedEmployee);
                    
                    cardCanvas.toBlob(async (blob) => {
                      if (!blob) return;
                      const file = new File([blob], `${selectedEmployee.name.replace(/\s+/g, '_')}_Pass.png`, { type: "image/png" });
                      
                      const useDirectWhatsApp = selectedEmployee.phone && selectedEmployee.phone.length > 5;
                      
                      if (useDirectWhatsApp) {
                        if (!navigator.onLine) {
                          alert("You must be online to generate and upload the cloud link for this pass.");
                          return;
                        }
                        try {
                          const fileName = `${selectedEmployee.empId}_${Date.now()}.png`;
                          const { error } = await supabase.storage.from('qr-passes').upload(fileName, file, { cacheControl: '3600', upsert: false });
                          if (error) {
                            alert("Failed to upload image. Did you create the 'qr-passes' public bucket?");
                            return;
                          }
                          const passPageUrl = `${window.location.origin}/pass/${fileName}`;
                          const cleanPhone = (selectedEmployee.phone || '').replace(/\D/g,'');
                          const msg = `Hello ${selectedEmployee.name},\n\nOpen the link to view your QR pass and download it:\n${passPageUrl}`;
                          const waUrl = `https://wa.me/${cleanPhone}?text=` + encodeURIComponent(msg);
                          window.open(waUrl, "_blank");
                        } catch (err) {
                          alert("An error occurred while uploading the pass.");
                        }
                      } else if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                          await navigator.share({
                            title: 'Attendance QR',
                            text: `Here is the Attendance QR Pass for ${selectedEmployee.name}.`,
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
                  className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white py-3 rounded-xl flex items-center justify-center font-bold shadow-md transition-colors text-sm"
                >
                  <MessageCircle size={18} className="mr-1" /> WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
