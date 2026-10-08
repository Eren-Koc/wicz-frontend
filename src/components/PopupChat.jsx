import React, { useState } from "react";

export default function PopupChat({ chatClose, setChatClose, messages = [], handleSendMessage }) {
  const [text, setText] = useState("");
  if (!chatClose) return null;
  const send = () => { if (!text.trim()) return; handleSendMessage(text.trim()); setText(""); };
  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[360px] w-[320px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-violet-600 px-4 py-3 font-semibold text-white">
        Sohbet <button onClick={() => setChatClose(false)}>×</button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m, i) => <div key={i} className="rounded-lg bg-slate-100 p-2 text-sm">{m.message}</div>)}
      </div>
      <div className="flex gap-2 border-t p-2">
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} className="min-w-0 flex-1 rounded-lg border px-2 py-2" placeholder="Mesaj..."/>
        <button onClick={send} className="rounded-lg bg-violet-600 px-3 text-white">Gönder</button>
      </div>
    </div>
  );
}
