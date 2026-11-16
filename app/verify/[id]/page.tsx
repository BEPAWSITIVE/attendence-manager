import { Metadata } from 'next';
import { supabase, Employee } from '@/lib/supabase';
import { 
  ShieldCheck, 
  Briefcase, 
  Calendar, 
  Truck, 
  Check, 
  Clock, 
  Users, 
  Contact, 
  ShieldAlert, 
  XCircle,
  ExternalLink 
} from 'lucide-react';
import Link from 'next/link';

type Props = {
  params: { id: string };
};

export const revalidate = 60; // Revalidate at most every 60 seconds

async function fetchEmployee(id: string): Promise<Employee | null> {
  const decodedId = decodeURIComponent(id || '').trim();
  if (!decodedId) return null;

  try {
    const { data, error } = await supabase
      .from('employees')
      .select('empId, name, department, phone, createdAt, category, vehicle_plate, document_url, group_members')
      .eq('empId', decodedId)
      .maybeSingle();

    if (error || !data) {
      // Fallback: Case-insensitive lookup
      const { data: fallbackData } = await supabase
        .from('employees')
        .select('empId, name, department, phone, createdAt, category, vehicle_plate, document_url, group_members')
        .ilike('empId', decodedId)
        .maybeSingle();
      return fallbackData || null;
    }
    return data;
  } catch (err) {
    console.error('Error fetching employee verification:', err);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const emp = await fetchEmployee(params.id);
  const orgName = "Peepal Farm";

  if (!emp) {
    return {
      title: `Verification Failed | ${orgName}`,
      description: `Official personnel verification check for ID ${params.id}.`,
    };
  }

  return {
    title: `Verified: ${emp.name} (${emp.empId}) | ${orgName}`,
    description: `Official identity verification for ${emp.name}, ${emp.department} at ${orgName}. Status: Officially Verified.`,
    openGraph: {
      title: `Official Personnel Verification: ${emp.name}`,
      description: `${orgName} Authorized ${emp.category || 'Staff'} • ${emp.department} • ID: ${emp.empId}`,
      siteName: `${orgName} Identity Portal`,
    },
  };
}

export default async function VerifyPage({ params }: Props) {
  const rawId = params.id;
  const decodedId = decodeURIComponent(rawId || '').trim();
  const emp = await fetchEmployee(decodedId);

  // Exact live real-time timestamp formatted: "16 Nov 2026 at 07:32 am"
  const now = new Date();
  const day = now.getDate();
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const year = now.getFullYear();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = hours.toString().padStart(2, '0');
  const verifiedTimeString = `${day} ${month} ${year} at ${formattedHours}:${minutes} ${ampm}`;

  // Format creation / membership date: "Nov 2026"
  let joinDateString = 'Active Personnel';
  if (emp?.createdAt) {
    try {
      const d = new Date(emp.createdAt);
      joinDateString = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch (e) {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eaf4ea] via-[#e2f0e4] to-[#cbe5cd] relative overflow-x-hidden flex flex-col items-center justify-start py-8 px-4 sm:px-6 font-sans antialiased selection:bg-emerald-200 selection:text-emerald-900">
      
      {/* Top Left Scenic Hanging Foliage */}
      <img
        src="/leaves-top-left.png"
        alt=""
        className="absolute top-0 left-0 w-36 sm:w-48 pointer-events-none select-none z-0 mix-blend-multiply opacity-85"
      />

      <div className="relative z-10 w-full max-w-[430px] flex flex-col items-center">
        
        {/* Top Header Branding Lockup */}
        <div className="flex items-center justify-center space-x-3.5 mb-5 select-none">
          <img
            src="/peepal-farm-logo.png"
            alt="Peepal Farm Logo"
            className="w-[52px] h-[52px] rounded-full object-contain shrink-0 shadow-xs bg-white"
          />
          <div className="h-9 w-[1.5px] bg-[#14532d]/25"></div>
          <div className="flex flex-col">
            <span className="text-[23px] font-black tracking-tight text-[#0f3d1e] leading-tight">
              Peepal Farm
            </span>
            <span className="text-[11.5px] font-medium text-slate-600 tracking-normal mt-0.5">
              Helping Animals • Building Kindness
            </span>
          </div>
        </div>

        {/* Verification Card */}
        <div className="w-full bg-white rounded-[32px] shadow-[0_20px_50px_rgba(15,70,30,0.12),0_4px_16px_rgba(0,0,0,0.06)] border border-emerald-900/10 overflow-hidden flex flex-col">
          
          {emp ? (
            /* ================= VERIFIED PERSONNEL STATE ================= */
            <>
              {/* Emerald Green Hero Banner */}
              <div className="relative bg-gradient-to-b from-[#06532d] via-[#044624] to-[#01331a] pt-7 pb-3 px-5 text-center text-white flex flex-col items-center">
                
                {/* Radiating Sparkle Badge */}
                <div className="relative flex items-center justify-center mb-3">
                  {/* Radiating Mint Sparkle Rays */}
                  <svg
                    className="absolute -inset-2.5 w-[92px] h-[92px] pointer-events-none"
                    viewBox="0 0 100 100"
                    fill="none"
                  >
                    {/* Top-left angled tick */}
                    <line x1="20" y1="34" x2="28" y2="39" stroke="#86efac" strokeWidth="3" strokeLinecap="round" />
                    {/* Top-left upright tick */}
                    <line x1="33" y1="18" x2="38" y2="26" stroke="#86efac" strokeWidth="3" strokeLinecap="round" />
                    {/* Top-right upright tick */}
                    <line x1="67" y1="18" x2="62" y2="26" stroke="#86efac" strokeWidth="3" strokeLinecap="round" />
                    {/* Top-right angled tick */}
                    <line x1="80" y1="34" x2="72" y2="39" stroke="#86efac" strokeWidth="3" strokeLinecap="round" />
                  </svg>

                  {/* White / Mint Circle Badge */}
                  <div className="w-[70px] h-[70px] rounded-full bg-[#eafaf1] border-2 border-[#a7f3d0] shadow-md flex items-center justify-center text-[#15803d]">
                    <ShieldCheck size={38} className="stroke-[2.2] text-[#15803d]" />
                  </div>
                </div>

                {/* Banner Titles */}
                <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-white uppercase drop-shadow-xs">
                  Officially Verified
                </h1>

                <div className="flex items-center justify-center w-full max-w-[320px] mt-1.5 space-x-2.5">
                  <div className="h-[1px] bg-white/35 flex-1"></div>
                  <span className="text-[12px] font-medium text-emerald-100 tracking-wide">
                    Authenticated Personnel Credential
                  </span>
                  <div className="h-[1px] bg-white/35 flex-1"></div>
                </div>
              </div>

              {/* Arch Curve: Deep Green Banner curving downward into White Card */}
              <div className="w-full overflow-hidden leading-none bg-white -mt-[1px]">
                <svg
                  viewBox="0 0 500 24"
                  className="w-full h-5 sm:h-6 fill-[#01331a]"
                  preserveAspectRatio="none"
                >
                  <path d="M0,0 Q250,24 500,0 L0,0 Z" />
                </svg>
              </div>

              {/* White Card Body */}
              <div className="px-5 sm:px-6 pt-2 pb-3 space-y-4">
                
                {/* Category Pill */}
                <div className="flex justify-center">
                  <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#dcfce7] text-[#15803d] font-bold text-xs uppercase tracking-wider">
                    <Users size={14} className="stroke-[2.5]" />
                    <span>{emp.category || 'STAFF'}</span>
                  </div>
                </div>

                {/* Staff Name */}
                <h2 className="text-3xl sm:text-[34px] font-black text-[#0f172a] text-center tracking-tight capitalize">
                  {emp.name}
                </h2>

                {/* Staff ID Pill */}
                <div className="flex justify-center -mt-1 mb-2">
                  <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-[#eafaf1] border border-[#a7f3d0] text-[#14532d] font-mono font-bold text-sm">
                    <Contact size={16} className="text-[#15803d]" />
                    <span>ID: {emp.empId}</span>
                  </div>
                </div>

                {/* Verified Details Cards */}
                <div className="space-y-2.5 pt-1">
                  
                  {/* Department / Role Card */}
                  <div className="flex items-center p-3.5 rounded-2xl bg-gradient-to-r from-[#f0f6ff]/70 to-[#f8faff] border border-blue-100/60 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-[#eff6ff] border border-[#dbeafe] flex items-center justify-center text-[#2563eb] shrink-0 mr-3.5 shadow-xs">
                      <Briefcase size={22} className="stroke-[2.2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-500 block leading-tight">
                        Department / Role
                      </span>
                      <span className="text-base font-bold text-slate-900 truncate block mt-0.5">
                        {emp.department || 'General Operations'}
                      </span>
                    </div>
                  </div>

                  {/* Member Since Card */}
                  <div className="flex items-center p-3.5 rounded-2xl bg-gradient-to-r from-[#faf5ff]/70 to-[#fdfcff] border border-purple-100/60 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-[#faf5ff] border border-[#f3e8ff] flex items-center justify-center text-[#9333ea] shrink-0 mr-3.5 shadow-xs">
                      <Calendar size={22} className="stroke-[2.2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-500 block leading-tight">
                        Member Since
                      </span>
                      <span className="text-base font-bold text-slate-900 truncate block mt-0.5">
                        {joinDateString}
                      </span>
                    </div>
                  </div>

                  {/* Vehicle Plate Card (if applicable) */}
                  {emp.category === 'Vehicle' && emp.vehicle_plate && (
                    <div className="flex items-center p-3.5 rounded-2xl bg-gradient-to-r from-[#fffbeb]/70 to-[#fffdf7] border border-amber-200/70 shadow-xs">
                      <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] border border-[#fde68a] flex items-center justify-center text-[#d97706] shrink-0 mr-3.5 shadow-xs">
                        <Truck size={22} className="stroke-[2.2]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-amber-700 block leading-tight">
                          Registered Vehicle Plate
                        </span>
                        <span className="text-base font-mono font-bold text-amber-950 truncate block mt-0.5">
                          {emp.vehicle_plate}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Group Members (if applicable) */}
                  {emp.group_members && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-xs font-semibold text-slate-500 block mb-1">
                        Accompanying Group Members
                      </span>
                      <span className="text-sm font-bold text-slate-800">
                        {emp.group_members}
                      </span>
                    </div>
                  )}
                </div>

                {/* Official Digital Credential Valid Card */}
                <div className="p-3.5 rounded-2xl bg-[#ecfdf5] border border-[#a7f3d0] flex items-start space-x-3.5 shadow-xs">
                  <div className="w-10 h-10 rounded-full bg-[#15803d] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                    <Check size={22} className="stroke-[3.5] text-white" />
                  </div>
                  <div className="h-10 w-[1.5px] bg-[#15803d]/30 shrink-0 mt-0.5"></div>
                  <div className="text-xs text-[#14532d] leading-relaxed flex-1">
                    <p className="font-bold text-sm text-[#14532d]">
                      Official Digital Credential Valid
                    </p>
                    <p className="text-[#166534] mt-0.5 leading-normal">
                      This individual is an authorized representative of <strong className="font-bold text-[#14532d]">Peepal Farm</strong>. The credential record is synchronized directly with our live registry.
                    </p>
                  </div>
                </div>

                {/* Real-time Verification Timestamp */}
                <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-500 font-medium pt-1">
                  <Clock size={14} className="text-slate-400 stroke-[2]" />
                  <span>Verified in real-time on {verifiedTimeString}</span>
                </div>

                {/* Footer Brand Divider */}
                <div className="pt-2 text-center">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="h-[1px] bg-slate-300 w-10 sm:w-14"></div>
                    <span className="text-xs font-bold text-[#14532d] tracking-wide">
                      Peepal Farm
                    </span>
                    <div className="h-[1px] bg-slate-300 w-10 sm:w-14"></div>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Helping Animals • Building Kindness
                  </p>
                </div>

                {/* Rolling Green Hills & Trees Footer Graphic */}
                <div className="w-full mt-2 -mb-3 overflow-hidden pointer-events-none select-none">
                  <img
                    src="/farm-trees-clean.png"
                    alt="Peepal Farm"
                    className="w-full h-auto object-cover object-bottom"
                  />
                </div>

              </div>
            </>
          ) : (
            /* ================= UNRECOGNIZED / FAILED STATE ================= */
            <>
              {/* Crimson / Red Hero Banner */}
              <div className="relative bg-gradient-to-b from-[#881337] via-[#710f2d] to-[#4c0519] pt-7 pb-3 px-5 text-center text-white flex flex-col items-center">
                
                {/* Radiating Rose Sparkle Badge */}
                <div className="relative flex items-center justify-center mb-3">
                  <svg
                    className="absolute -inset-2.5 w-[92px] h-[92px] pointer-events-none"
                    viewBox="0 0 100 100"
                    fill="none"
                  >
                    <line x1="20" y1="34" x2="28" y2="39" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" />
                    <line x1="33" y1="18" x2="38" y2="26" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" />
                    <line x1="67" y1="18" x2="62" y2="26" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" />
                    <line x1="80" y1="34" x2="72" y2="39" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" />
                  </svg>

                  <div className="w-[70px] h-[70px] rounded-full bg-[#fff1f2] border-2 border-[#fecdd3] shadow-md flex items-center justify-center text-[#e11d48]">
                    <XCircle size={40} className="stroke-[2.2] text-[#e11d48]" />
                  </div>
                </div>

                <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-white uppercase drop-shadow-xs">
                  Verification Failed
                </h1>

                <div className="flex items-center justify-center w-full max-w-[320px] mt-1.5 space-x-2.5">
                  <div className="h-[1px] bg-white/35 flex-1"></div>
                  <span className="text-[12px] font-medium text-rose-100 tracking-wide">
                    Unrecognized Personnel Identifier
                  </span>
                  <div className="h-[1px] bg-white/35 flex-1"></div>
                </div>
              </div>

              {/* Arch Curve: Crimson Banner curving into White Card */}
              <div className="w-full overflow-hidden leading-none bg-white -mt-[1px]">
                <svg
                  viewBox="0 0 500 24"
                  className="w-full h-5 sm:h-6 fill-[#4c0519]"
                  preserveAspectRatio="none"
                >
                  <path d="M0,0 Q250,24 500,0 L0,0 Z" />
                </svg>
              </div>

              {/* Card Body */}
              <div className="px-5 sm:px-6 pt-3 pb-3 space-y-4">
                
                {/* ID Pill */}
                <div className="flex justify-center">
                  <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-mono font-bold text-sm">
                    <ShieldAlert size={16} className="text-rose-600" />
                    <span>ID: {decodedId || '(empty)'}</span>
                  </div>
                </div>

                {/* Alert Box */}
                <div className="p-4 rounded-2xl bg-rose-50/90 border border-rose-200 text-left">
                  <p className="font-bold text-sm text-rose-950">
                    Record Not Found in Official Registry
                  </p>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    No active staff member or registered entity was found matching identifier <strong className="font-mono font-bold text-rose-950">{decodedId || 'none'}</strong>.
                  </p>
                  <p className="text-xs text-rose-700 mt-2">
                    Please ensure the QR code was scanned correctly from an authorized badge or contact the organization administrator.
                  </p>
                </div>

                {/* Timestamp */}
                <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-500 font-medium pt-1">
                  <Clock size={14} className="text-slate-400 stroke-[2]" />
                  <span>Checked on {verifiedTimeString}</span>
                </div>

                {/* Footer Brand Divider */}
                <div className="pt-2 text-center">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="h-[1px] bg-slate-300 w-10 sm:w-14"></div>
                    <span className="text-xs font-bold text-[#14532d] tracking-wide">
                      Peepal Farm
                    </span>
                    <div className="h-[1px] bg-slate-300 w-10 sm:w-14"></div>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Helping Animals • Building Kindness
                  </p>
                </div>

                {/* Rolling Green Hills & Trees Footer Graphic */}
                <div className="w-full mt-2 -mb-3 overflow-hidden pointer-events-none select-none">
                  <img
                    src="/farm-trees-clean.png"
                    alt="Peepal Farm"
                    className="w-full h-auto object-cover object-bottom"
                  />
                </div>

              </div>
            </>
          )}

        </div>

        {/* Return to Attendance Manager Link */}
        <div className="mt-5 text-center">
          <Link 
            href="/" 
            className="text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors"
          >
            ← Return to Attendance Manager
          </Link>
        </div>

      </div>
    </div>
  );
}
