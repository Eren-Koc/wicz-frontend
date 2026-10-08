import React from "react";
export default function ReportUser({ visibility, setVisibility }) {
  if (!visibility) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"><div className="w-[min(92vw,380px)] rounded-2xl bg-white p-5 shadow-2xl"><h2 className="font-bold text-lg">Kullanıcı bildir</h2><p className="mt-2 text-sm text-slate-500">Bu demo sürümünde bildirim formu devre dışıdır.</p><button onClick={()=>setVisibility(false)} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-white">Kapat</button></div></div>;
}
