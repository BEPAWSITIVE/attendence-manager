'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatIndianDateTime } from '@/lib/timeFormat';

export default function RealtimeVerificationTimestamp({ 
  initialTime, 
  prefix = "Verified in real-time on" 
}: { 
  initialTime: string;
  prefix?: string;
}) {
  const [timeString, setTimeString] = useState(initialTime);

  useEffect(() => {
    // Sync with the device's live time on load
    setTimeString(formatIndianDateTime(new Date()));
  }, []);

  return (
    <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-500 font-medium pt-1 pb-1">
      <Clock size={14} className="text-slate-400 stroke-[2]" />
      <span>{prefix} {timeString}</span>
    </div>
  );
}
