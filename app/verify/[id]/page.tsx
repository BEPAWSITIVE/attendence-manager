import { Metadata } from 'next';
import { supabase, Employee } from '@/lib/supabase';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Building2, 
  User, 
  Calendar, 
  Phone, 
  Truck, 
  FileCheck, 
  ExternalLink,
  ShieldAlert,
  Clock
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
      // Try case-insensitive lookup
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
  const now = new Date();
  const verifiedTimeString = now.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) + ' at ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Format creation date
  let joinDateString = 'Registered Personnel';
  if (emp?.createdAt) {
    try {
      const d = new Date(emp.createdAt);
      joinDateString = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    } catch (e) {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50/30 to-emerald-50/20 py-8 px-4 flex flex-col items-center justify-center font-sans antialiased">
      <div className="max-w-md w-full">
        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          
          {/* Header Banner */}
          <div className={`p-6 text-center text-white relative ${
            emp ? 'bg-gradient-to-r from-emerald-600 to-teal-700' : 'bg-gradient-to-r from-rose-600 to-red-700'
          }`}>
            <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] opacity-10"></div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs text-xs font-bold tracking-wide uppercase mb-3">
                <ShieldCheck size={14} className="text-white" />
                <span>Peepal Farm Identity System</span>
              </div>

              {emp ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white text-emerald-600 shadow-lg flex items-center justify-center mb-3">
                    <CheckCircle2 size={40} className="stroke-[2.5]" />
                  </div>
                  <h1 className="text-xl font-black tracking-tight uppercase">Officially Verified</h1>
                  <p className="text-xs text-emerald-100 font-medium mt-1">
                    Authenticated Personnel Credential
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white text-rose-600 shadow-lg flex items-center justify-center mb-3">
                    <XCircle size={40} className="stroke-[2.5]" />
                  </div>
                  <h1 className="text-xl font-black tracking-tight uppercase">Verification Failed</h1>
                  <p className="text-xs text-rose-100 font-medium mt-1">
                    Record not found in the personnel registry
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Body Content */}
          {emp ? (
            <div className="p-6 space-y-6">
              
              {/* Profile Overview */}
              <div className="text-center pb-5 border-b border-slate-100">
                <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 bg-slate-100 text-slate-700 border border-slate-200">
                  {emp.category || 'Staff Member'}
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {emp.name}
                </h2>
                <div className="inline-flex items-center space-x-2 mt-1">
                  <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                    ID: {emp.empId}
                  </span>
                </div>
              </div>

              {/* Verified Details Grid */}
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mr-3">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Department / Role</span>
                    <span className="text-sm font-bold text-slate-800">{emp.department || 'General Operations'}</span>
                  </div>
                </div>

                <div className="flex items-center p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mr-3">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Member Since</span>
                    <span className="text-sm font-bold text-slate-800">{joinDateString}</span>
                  </div>
                </div>

                {emp.category === 'Vehicle' && emp.vehicle_plate && (
                  <div className="flex items-center p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mr-3">
                      <Truck size={20} />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block">Registered Vehicle Plate</span>
                      <span className="text-sm font-mono font-bold text-amber-900">{emp.vehicle_plate}</span>
                    </div>
                  </div>
                )}

                {emp.group_members && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Accompanying Group Members</span>
                    <span className="text-sm font-semibold text-slate-700">{emp.group_members}</span>
                  </div>
                )}
              </div>

              {/* Status Certificate Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-start space-x-3">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <p className="font-bold">Official Digital Credential Valid</p>
                  <p className="text-emerald-800 mt-0.5">
                    This individual is an authorized representative of <strong>Peepal Farm</strong>. The credential record is synchronized directly with our live registry.
                  </p>
                </div>
              </div>

              {/* Timestamp of verification */}
              <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                <Clock size={13} />
                <span>Verified in real-time on {verifiedTimeString}</span>
              </div>

            </div>
          ) : (
            <div className="p-6 space-y-6 text-center">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-left">
                <div className="flex items-start space-x-3">
                  <ShieldAlert size={22} className="text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 leading-relaxed">
                    <p className="font-bold text-sm">Unrecognized Identifier</p>
                    <p className="text-rose-800 mt-1">
                      No active personnel record was found matching ID: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-rose-200">{decodedId || '(empty)'}</span>.
                    </p>
                    <p className="text-rose-700 mt-2">
                      If you believe this is an error, please ensure the QR code was not damaged or altered, or contact the organization administrator.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                <span>Check performed on {verifiedTimeString}</span>
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="bg-slate-50 p-4 border-t border-slate-100 text-center">
            <p className="text-xs font-semibold text-slate-600">Peepal Farm / Be Pawsitive</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Helping Animals • Building Kindness
            </p>
            <a 
              href="https://peepalfarm.org" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center text-xs font-bold text-emerald-600 hover:text-emerald-700 mt-2 transition-colors"
            >
              <span>Visit peepalfarm.org</span>
              <ExternalLink size={12} className="ml-1" />
            </a>
          </div>

        </div>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <Link 
            href="/" 
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Return to Attendance Manager
          </Link>
        </div>
      </div>
    </div>
  );
}
