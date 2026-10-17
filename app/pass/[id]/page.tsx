import { Metadata } from 'next';
import Image from 'next/image';
import DownloadButton from './DownloadButton';

type Props = {
  params: { id: string }
}

export async function generateMetadata(
  { params }: Props
): Promise<Metadata> {
  const imageUrl = `https://rcsjwdtatnqodekwqpur.supabase.co/storage/v1/object/public/qr-passes/${params.id}`;
  
  return {
    title: 'Your Attendance Pass',
    openGraph: {
      images: [imageUrl],
    },
  }
}

export default function PassPage({ params }: Props) {
  const imageUrl = `https://rcsjwdtatnqodekwqpur.supabase.co/storage/v1/object/public/qr-passes/${params.id}`;

  return (
    <div className="min-h-screen bg-[#F4F9FF] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden p-6 flex flex-col items-center">
        
        <h1 className="text-xl font-bold text-gray-800 mb-6 text-center">Your Attendance Pass</h1>
        
        <div className="relative w-full aspect-[3/4] max-w-[300px] mb-8 rounded-2xl overflow-hidden shadow-md border border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={imageUrl} 
            alt="QR Pass" 
            className="w-full h-full object-contain"
          />
        </div>

        <DownloadButton 
          imageUrl={imageUrl} 
          filename={`Attendance_Pass_${params.id}`} 
        />
        
        <p className="text-xs text-gray-400 mt-6 text-center">
          Save this image to your phone's photo gallery and scan it at the entrance.
        </p>
      </div>
    </div>
  );
}
