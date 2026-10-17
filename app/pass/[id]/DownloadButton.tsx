'use client';

import { useState } from 'react';

export default function DownloadButton({ imageUrl, filename }: { imageUrl: string; filename: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (err) {
      // Fallback
      window.open(imageUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button 
      onClick={handleDownload}
      disabled={downloading}
      className="w-full max-w-[300px] bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-4 px-6 rounded-xl text-center shadow-lg transition-all flex items-center justify-center disabled:opacity-75"
    >
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {downloading ? 'Downloading...' : 'Download to Phone'}
    </button>
  );
}
