import React from "react";
import { IoCall } from "react-icons/io5";

export default function CallButton({ startedCalling, callFunction, stopCallFunction, isActive }) {
  return (
    <div className="mt-2 flex justify-center">
      {!startedCalling ? (
        <button onClick={callFunction} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-violet-700">
          <IoCall size={20}/> Ekran paylaş ve bağlan
        </button>
      ) : (
        <button onClick={stopCallFunction} className="rounded-xl bg-slate-800 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-900">
          {isActive ? "Bekle" : "Aramayı iptal et"}
        </button>
      )}
    </div>
  );
}
