"use client";
import { useState, useEffect } from "react";
import { supabase, Parcel } from "@/lib/supabase";
import { localdb } from "@/lib/localdb";
import { X, Package, Search, Camera, Clock, CheckCircle2 } from "lucide-react";

export default function ParcelsTab({ role = "guard", initialAiData, onAiDataConsumed }: { role?: "admin" | "guard", initialAiData?: any, onAiDataConsumed?: () => void }) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Form States
  const [companyName, setCompanyName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [orderId, setOrderId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  // Pickup Modal
  const [pickupModal, setPickupModal] = useState<Parcel | null>(null);
  const [pickerName, setPickerName] = useState("");

  useEffect(() => {
    fetchParcels();
    
    const channel = supabase
      .channel('parcels_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parcels' },
        () => fetchParcels()
      )
      .subscribe();

    const interval = setInterval(() => {
      if (navigator.onLine) fetchParcels();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  
  useEffect(() => {
    if (initialAiData) {
      setCompanyName(initialAiData.company_name || "");
      setOrderId(initialAiData.order_id || "");
      setBarcode(initialAiData.barcode || "");
      setRecipientName(initialAiData.recipient_name || "");
      
      if (initialAiData.capturedImage) {
        fetch(initialAiData.capturedImage)
          .then(res => res.arrayBuffer())
          .then(buf => {
            const file = new File([buf], "parcel_capture.jpg", { type: "image/jpeg" });
            setDocumentFile(file);
          }).catch(err => console.error("Error creating file from parcel capture", err));
      } else {
        setDocumentFile(null);
      }

      setShowForm(true);
      if (onAiDataConsumed) onAiDataConsumed();
    }
  }, [initialAiData]);

  async function fetchParcels() {
    let allParcels: Parcel[] = [];
    if (navigator.onLine) {
      const { data, error } = await supabase.from('parcels').select('*').order('received_at', { ascending: false });
      if (!error && data) {
        allParcels = data;
        localStorage.setItem('cached_parcels', JSON.stringify(data));
      }
    } else {
      const cached = localStorage.getItem('cached_parcels');
      if (cached) allParcels = JSON.parse(cached);
    }
    
    const queuedParcels = await localdb.parcelQueue.toArray();
    const merged = [...queuedParcels, ...allParcels].reduce((acc: Parcel[], curr: any) => {
      const current = curr as Parcel;
      const idx = acc.findIndex((item: Parcel) => item.id === current.id);
      if (idx === -1) {
        acc.push(current);
      } else if (queuedParcels.find((q: any) => (q as Parcel).id === current.id)) {
        acc[idx] = current;
      }
      return acc;
    }, [] as Parcel[]);
    
    merged.sort((a: Parcel, b: Parcel) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    setParcels(merged);
    setLoading(false);
  }

  const handleOpenForm = () => {
    setCompanyName("");
    setRecipientName("");
    setOrderId("");
    setBarcode("");
    setDocumentFile(null);
    setShowForm(true);
  };

  const handleReceiveParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName) return;
    
    setIsUploading(true);
    let photo_url = "";
    const parcelId = crypto.randomUUID();
    
    if (documentFile) {
      if (!navigator.onLine) {
        alert("You must be online to upload parcel photos.");
        setIsUploading(false);
        return;
      }
      try {
        const fileExt = documentFile.name.split('.').pop() || 'jpg';
        const fileName = `${parcelId}_${Date.now()}.${fileExt}`.replace(/\s+/g, '_');
        const { error } = await supabase.storage.from('parcels').upload(fileName, documentFile, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('parcels').getPublicUrl(fileName);
        photo_url = publicUrl;
      } catch (err: any) {
        alert("Upload failed. Error: " + err.message);
        setIsUploading(false);
        return;
      }
    }
    
    const newParcel: Parcel = {
      id: parcelId,
      company_name: companyName,
      recipient_name: recipientName,
      order_id: orderId || undefined,
      barcode: barcode || undefined,
      photo_url: photo_url || undefined,
      received_at: new Date().toISOString(),
      status: 'At Gate'
    };
    
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('parcels').insert([newParcel]);
        if (error) {
          // Graceful fallback if order_id column is not yet created in Supabase
          if (error.message?.includes('order_id')) {
            const fallback: any = { ...newParcel };
            delete fallback.order_id;
            if (!fallback.barcode && orderId) {
              fallback.barcode = orderId;
            }
            const res2 = await supabase.from('parcels').insert([fallback]);
            if (res2.error) throw res2.error;
          } else {
            throw error;
          }
        }
      } catch (err: any) {
        alert("Error adding parcel: " + err.message);
        setIsUploading(false);
        return;
      }
    } else {
      await localdb.parcelQueue.put(newParcel);
    }
    
    setIsUploading(false);
    setShowForm(false);
    fetchParcels();
  };

  const handlePickupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupModal || !pickerName) return;

    const updatedParcel: Parcel = {
      ...pickupModal,
      status: 'Picked Up',
      picked_up_by: pickerName,
      picked_up_at: new Date().toISOString()
    };

    if (navigator.onLine) {
      await supabase.from('parcels').update(updatedParcel).eq('id', updatedParcel.id);
    } else {
      await localdb.parcelQueue.put(updatedParcel);
    }

    setPickupModal(null);
    setPickerName("");
    fetchParcels();
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const activeParcels = parcels.filter(p => p.status === 'At Gate');
  const pastParcels = parcels.filter(p => p.status === 'Picked Up');

  return (
    <div className="p-4 pb-24 max-w-md mx-auto space-y-6">
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Parcels</h2>
          <p className="text-xs text-gray-500 font-medium">Gate Deliveries</p>
        </div>
        <button 
          onClick={handleOpenForm}
          className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center shadow-md shadow-purple-200 active:scale-95 transition-transform"
        >
          + Receive Parcel
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-5 rounded-3xl shadow-xl border border-gray-100 animate-fade-in relative">
          <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-50 p-1.5 rounded-full">
            <X size={18} />
          </button>
          
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-2.5 rounded-xl text-purple-600">
              <Package size={20} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Receive New Parcel</h3>
          </div>
          
          <form onSubmit={handleReceiveParcel} className="space-y-4">
            
            <div className="flex space-x-3">
              <div className="w-1/2">
                <label className="block text-xs font-bold text-gray-500 mb-1">Company *</label>
                <input 
                  type="text" 
                  value={companyName} 
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Amazon, Flipkart..."
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="w-1/2">
                <label className="block text-xs font-bold text-gray-500 mb-1">For Whom</label>
                <input 
                  type="text" 
                  value={recipientName} 
                  onChange={e => setRecipientName(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <div className="w-1/2">
                <label className="block text-xs font-bold text-gray-500 mb-1">Order ID</label>
                <input 
                  type="text" 
                  value={orderId} 
                  onChange={e => setOrderId(e.target.value)}
                  placeholder="e.g. 402-1234567..."
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs uppercase"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-xs font-bold text-gray-500 mb-1">Barcode / Tracking #</label>
                <input 
                  type="text" 
                  value={barcode} 
                  onChange={e => setBarcode(e.target.value)}
                  placeholder="Scan or type barcode"
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Photo of Parcel (Optional)</label>
              <div className="relative w-full bg-purple-50 border-2 border-dashed border-purple-200 p-4 rounded-xl text-center hover:bg-purple-100 transition-colors">
                <input 
                  type="file" 
                  accept="image/*"
                  capture="environment"
                  onChange={e => e.target.files && setDocumentFile(e.target.files[0])}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="text-purple-600 font-bold flex flex-col items-center justify-center w-full">
                  {documentFile ? (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <img src={URL.createObjectURL(documentFile)} alt="Preview" className="w-full max-h-32 object-contain rounded-lg border-2 border-purple-300 shadow-sm" />
                      <div className="flex items-center text-green-600">
                        <CheckCircle2 size={16} className="mr-1" />
                        <span className="text-xs font-bold">Photo Captured!</span>
                      </div>
                      <span className="text-xs text-gray-500 max-w-full truncate px-4 font-medium">{documentFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <Camera size={28} className="mb-1" />
                      <span className="text-sm">Tap to Snap Photo</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isUploading}
              className="w-full bg-purple-600 text-white py-3.5 rounded-xl font-bold shadow-md shadow-purple-200 disabled:opacity-50 mt-2"
            >
              {isUploading ? "Receiving..." : "Receive Parcel"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading parcels...</div>
      ) : (
        <div className="space-y-6">
          
          {/* AWAITING PICKUP SECTION */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Clock size={16} className="text-orange-500" />
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Awaiting Pickup ({activeParcels.length})</h3>
            </div>
            
            {activeParcels.length === 0 ? (
              <div className="text-center py-6 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200 text-sm">
                No parcels at the gate.
              </div>
            ) : (
              <div className="space-y-3">
                {activeParcels.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setPickupModal(p)}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 hover:border-purple-300 cursor-pointer transition-colors relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                      AT GATE
                    </div>
                    
                    <div className="flex justify-between items-start pr-12">
                      <div>
                        <h4 className="font-bold text-gray-800 text-lg">{p.recipient_name || "Unspecified"}</h4>
                        <p className="text-purple-600 font-bold text-xs uppercase tracking-wider">{p.company_name}</p>
                      </div>
                    </div>
                    
                    <div className="mt-3 bg-gray-50 rounded-lg p-2 text-xs text-gray-500 flex justify-between items-center">
                      <span>Rec: {formatTime(p.received_at)}</span>
                      <div className="flex items-center space-x-1.5 font-mono text-[11px]">
                        {p.order_id && <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold" title="Order ID">Ord: {p.order_id}</span>}
                        {p.barcode && <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200">{p.barcode}</span>}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-center text-xs font-bold text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Tap to authorize pickup &rarr;
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PAST PARCELS SECTION */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <CheckCircle2 size={16} className="text-green-500" />
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Recently Picked Up</h3>
            </div>
            
            <div className="space-y-3">
              {pastParcels.slice(0, 10).map(p => (
                <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 opacity-75">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-700">{p.recipient_name || "Unspecified"}</h4>
                      <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">{p.company_name}</p>
                    </div>
                    {p.photo_url && (
                      <a href={p.photo_url} target="_blank" rel="noreferrer" className="bg-gray-100 text-gray-500 p-1.5 rounded-lg hover:text-blue-500">
                        <Camera size={16} />
                      </a>
                    )}
                  </div>
                  
                  <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-2.5">
                    <p className="text-xs text-green-800 font-medium">
                      Picked up by <span className="font-bold">{p.picked_up_by}</span>
                    </p>
                    <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider mt-0.5">
                      {p.picked_up_at && formatTime(p.picked_up_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      )}

      {/* Pickup Modal */}
      {pickupModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="bg-purple-600 p-6 text-white text-center">
              <Package size={40} className="mx-auto mb-2 opacity-90" />
              <h3 className="text-xl font-bold">{pickupModal.recipient_name || "Unspecified"}</h3>
              <p className="opacity-80 text-sm font-bold tracking-widest uppercase mt-1">{pickupModal.company_name}</p>
              {pickupModal.order_id && (
                <p className="text-xs bg-purple-700/60 inline-block px-2.5 py-1 rounded-lg mt-2 font-mono">Order ID: {pickupModal.order_id}</p>
              )}
            </div>
            
            <form onSubmit={handlePickupSubmit} className="p-6 space-y-4">
              <div className="bg-purple-50 text-purple-800 p-3 rounded-xl text-sm font-bold text-center mb-2">
                Authorize Parcel Pickup
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Name of Person Taking Parcel *</label>
                <input 
                  type="text" 
                  value={pickerName}
                  onChange={e => setPickerName(e.target.value)}
                  placeholder="e.g. Rahul from IT"
                  className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  required
                  autoFocus
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setPickupModal(null); setPickerName(""); }}
                  className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold shadow-md"
                >
                  Confirm Pickup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
