import { Metadata } from 'next';
import { supabase, Employee } from '@/lib/supabase';
import { 
  Briefcase, 
  Truck, 
  Check, 
  Clock, 
  Users, 
  Contact, 
  ShieldAlert, 
  XCircle,
  CalendarOff
} from 'lucide-react';
import RealtimeVerificationTimestamp from '@/components/RealtimeVerificationTimestamp';
import { formatIndianDateTime } from '@/lib/timeFormat';
import { getEmployeeExitDate, isEmployeeExited } from '@/lib/exitStatus';

type Props = {
  params: { id: string };
};

export const revalidate = 60;

async function fetchEmployee(id: string): Promise<Employee | null> {
  const decodedId = decodeURIComponent(id || '').trim();
  if (!decodedId) return null;

  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('empId', decodedId)
      .maybeSingle();

    if (error || !data) {
      const { data: fallbackData } = await supabase
        .from('employees')
        .select('*')
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
  const exitDate = getEmployeeExitDate(emp);

  if (!emp) {
    return {
      title: `Verification Failed | ${orgName}`,
      description: `Official personnel verification check for ID ${params.id}.`,
    };
  }

  if (exitDate) {
    return {
      title: `Inactive / Exited: ${emp.name} (${emp.empId}) | ${orgName}`,
      description: `Personnel status: Former employee (Exit Date: ${exitDate}) at ${orgName}. Status: Deactivated / Inactive.`,
    };
  }

  return {
    title: `Verified: ${emp.name} (${emp.empId}) | ${orgName}`,
    description: `Official identity verification for ${emp.name}, ${emp.department || 'Operations'} at ${orgName}. Status: Officially Verified.`,
    openGraph: {
      title: `Official Personnel Verification: ${emp.name}`,
      description: `${orgName} Authorized ${emp.category || 'Staff'} • ${emp.department || 'Operations'} • ID: ${emp.empId}`,
      siteName: `${orgName} Identity Portal`,
    },
  };
}

export default async function VerifyPage({ params }: Props) {
  const rawId = params.id;
  const decodedId = decodeURIComponent(rawId || '').trim();
  const emp = await fetchEmployee(decodedId);
  const exitDate = getEmployeeExitDate(emp);
  const isExited = !!exitDate;
  const cleanGroupMembers = emp?.group_members
    ?.split(',')
    .map(m => m.trim())
    .filter(m => m && !m.startsWith('__'))
    .join(', ');

  // Live real-time timestamp formatted in Indian Standard Time (IST)
  const verifiedTimeString = formatIndianDateTime(new Date());

  return (
    <div className="min-h-screen bg-[#fafcfb] flex flex-col items-center justify-start pb-8 sm:pb-12 font-sans antialiased text-slate-800 selection:bg-emerald-200">
      
      {/* Container aligned with mockup's mobile width */}
      <div className="w-full max-w-[430px] flex flex-col items-center relative overflow-hidden">
        
        {/* Scenic Farm Top Backdrop (leaves, sky, trees, logo, and side hedges) */}
        <div className="w-full select-none pointer-events-none relative z-0">
          <img
            src="/top_backdrop_280.jpg"
            alt="Peepal Farm • Helping Animals • Building Kindness"
            className="w-full h-auto block"
          />
        </div>

        {/* Verification Card (Overlaps backdrop by exact 18.5% to align with y=160) */}
        <div className="w-[88%] -mt-[18.5%] relative z-10 flex flex-col">
          <div className="w-full bg-white rounded-[26px] sm:rounded-[30px] shadow-[0_16px_40px_rgba(0,0,0,0.1),0_4px_16px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden flex flex-col">
            
            {emp ? (
              /* ================= VERIFIED STATE ================= */
              <>
                {/* Emerald Green Hero Arch Banner */}
                <div className="w-full select-none pointer-events-none overflow-hidden leading-none">
                  <img
                    src="/verify-header-verified.png"
                    alt="Officially Verified • Authenticated Personnel Credential"
                    className="w-full h-auto block object-cover"
                  />
                </div>

                {/* White Card Body */}
                <div className="px-5 sm:px-6 pt-1 pb-1 space-y-3.5 sm:space-y-4">
                  
                  {/* Category Pill */}
                  <div className="flex justify-center mt-2">
                    <div className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider ${
                      isExited ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-[#dcfce7] text-[#15803d]'
                    }`}>
                      <Users size={14} className="stroke-[2.5]" />
                      <span>{isExited ? `FORMER ${emp.category || 'STAFF'} • INACTIVE` : (emp.category || 'STAFF')}</span>
                    </div>
                  </div>

                  {/* Staff Name */}
                  <h1 className="text-3xl sm:text-[34px] font-black text-[#0f3d1e] text-center tracking-tight capitalize leading-none pt-1">
                    {emp.name}
                  </h1>

                  {/* Staff ID Pill */}
                  <div className="flex justify-center -mt-1 mb-2">
                    <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-[#eafaf1] border border-[#a7f3d0] text-[#14532d] font-mono font-bold text-sm">
                      <Contact size={16} className="text-[#15803d]" />
                      <span>ID: {emp.empId}</span>
                    </div>
                  </div>

                  {/* Details Cards */}
                  <div className="space-y-2.5 pt-1">
                    
                    {/* Exit Date Card (if exited) */}
                    {isExited && (
                      <div className="flex items-center p-3 rounded-[20px] bg-gradient-to-r from-red-50/90 to-[#fff5f5] border border-red-200 shadow-xs">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mr-3.5 shadow-xs">
                          <CalendarOff size={22} className="stroke-[2.2]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-red-700 block leading-tight">
                            Exit Date (Relieved)
                          </span>
                          <span className="text-base font-bold text-red-950 truncate block mt-0.5">
                            {exitDate}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Department / Role Card */}
                    <div className="flex items-center p-3 rounded-[20px] bg-gradient-to-r from-[#f0f4ff]/80 to-[#f9faff] border border-blue-100/60 shadow-xs">
                      <div className="w-12 h-12 rounded-2xl bg-[#eff6ff] border border-[#dbeafe] flex items-center justify-center text-[#1d63ed] shrink-0 mr-3.5 shadow-xs">
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

                    {/* Vehicle Plate Card (if applicable) */}
                    {emp.category === 'Vehicle' && emp.vehicle_plate && (
                      <div className="flex items-center p-3 rounded-[20px] bg-gradient-to-r from-[#fffbeb]/80 to-[#fffdf7] border border-amber-200/70 shadow-xs">
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
                    {cleanGroupMembers && (
                      <div className="p-3 rounded-[20px] bg-slate-50 border border-slate-200/80">
                        <span className="text-xs font-semibold text-slate-500 block mb-1">
                          Accompanying Group Members
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {cleanGroupMembers}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Official Digital Credential Valid / Inactive Box */}
                  {isExited ? (
                    <div className="p-3.5 rounded-[22px] bg-[#fef2f2] border border-[#fecaca] flex items-start space-x-3.5 shadow-xs">
                      <div className="w-10 h-10 rounded-full bg-[#dc2626] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                        <XCircle size={22} className="stroke-[2.5] text-white" />
                      </div>
                      <div className="h-10 w-[1.5px] bg-[#dc2626]/30 shrink-0 mt-0.5"></div>
                      <div className="text-xs text-[#991b1b] leading-relaxed flex-1">
                        <p className="font-bold text-sm text-[#7f1d1d]">
                          Credential Inactive • Former Personnel
                        </p>
                        <p className="text-[#991b1b] mt-0.5 leading-normal">
                          This individual is no longer an active representative of <strong className="font-bold text-[#7f1d1d]">Peepal Farm</strong> (Relieved / Exit Date: <strong className="font-bold text-[#7f1d1d]">{exitDate}</strong>). This credential is deactivated and cannot be used for attendance or facility access.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-[22px] bg-[#ecfdf5] border border-[#a7f3d0] flex items-start space-x-3.5 shadow-xs">
                      <div className="w-10 h-10 rounded-full bg-[#0a7e3b] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                        <Check size={22} className="stroke-[3.5] text-white" />
                      </div>
                      <div className="h-10 w-[1.5px] bg-[#0a7e3b]/30 shrink-0 mt-0.5"></div>
                      <div className="text-xs text-[#14532d] leading-relaxed flex-1">
                        <p className="font-bold text-sm text-[#0a4a25]">
                          Official Digital Credential Valid
                        </p>
                        <p className="text-[#166534] mt-0.5 leading-normal">
                          This individual is an authorized representative of <strong className="font-bold text-[#0a4a25]">Peepal Farm</strong>. The credential record is synchronized directly with our live registry.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Real-time Verification Timestamp (Synced in Live India Standard Time) */}
                  <RealtimeVerificationTimestamp initialTime={verifiedTimeString} />

                </div>

                {/* Card Footer Landscape (Trees & Brand from Mockup) */}
                <div className="w-full select-none pointer-events-none overflow-hidden leading-none mt-2">
                  <img
                    src="/exact_trees_footer.png"
                    alt="Peepal Farm • Helping Animals • Building Kindness"
                    className="w-full h-auto block object-cover"
                  />
                </div>
              </>
            ) : (
              /* ================= UNRECOGNIZED / FAILED STATE ================= */
              <>
                <div className="relative bg-gradient-to-b from-[#881337] via-[#710f2d] to-[#4c0519] pt-7 pb-3 px-5 text-center text-white flex flex-col items-center">
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

                <div className="w-full overflow-hidden leading-none bg-white -mt-[1px]">
                  <svg
                    viewBox="0 0 500 24"
                    className="w-full h-5 sm:h-6 fill-[#4c0519]"
                    preserveAspectRatio="none"
                  >
                    <path d="M0,0 Q250,24 500,0 L0,0 Z" />
                  </svg>
                </div>

                <div className="px-5 sm:px-6 pt-3 pb-3 space-y-4">
                  <div className="flex justify-center">
                    <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-mono font-bold text-sm">
                      <ShieldAlert size={16} className="text-rose-600" />
                      <span>ID: {decodedId || '(empty)'}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-[20px] bg-rose-50/90 border border-rose-200 text-left">
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

                  <RealtimeVerificationTimestamp initialTime={verifiedTimeString} prefix="Checked on" />

                  <div className="w-full select-none pointer-events-none overflow-hidden leading-none mt-2">
                    <img
                      src="/exact_trees_footer.png"
                      alt="Peepal Farm • Helping Animals • Building Kindness"
                      className="w-full h-auto block object-cover"
                    />
                  </div>
                </div>
              </>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
