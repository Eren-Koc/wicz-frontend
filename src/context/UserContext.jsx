import React, { createContext, useMemo, useState } from "react";

export const UserContext = createContext(null);

const uid = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
const currentUserId = `screen-${uid}`;

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState({
    id: currentUserId,
    name: "Eren",
    biography: "Ekran paylaşımı",
    photoURL: `https://i.pravatar.cc/100?u=${encodeURIComponent(currentUserId)}`,
    likes: { users: {}, count: 0 }
  });
  const [isMatched, setIsMatched] = useState(false);
  const [alert, setAlert] = useState(null);

  const value = useMemo(() => ({
    currentUser,
    setCurrentUser,
    room: "genel",
    currentSection: "screen",
    isMatched,
    setIsMatched,
    setAlert,
    getPartnerData: async (partnerUid) => ({
      id: partnerUid,
      name: "Görüşme Partneri",
      biography: "Ekran paylaşımı kullanıcısı",
      photoURL: `https://i.pravatar.cc/100?u=${encodeURIComponent(partnerUid)}`,
      socialMedia: null,
      likes: { users: {}, count: 0 }
    }),
    likeUser: async () => true
  }), [currentUser, isMatched]);

  return (
    <UserContext.Provider value={value}>
      {children}
      {alert && (
        <div className="fixed right-4 top-4 z-[999] max-w-sm rounded-xl bg-white p-4 shadow-xl">
          <div className="font-bold text-violet-600">{alert.title}</div>
          <div className="mt-1 text-sm text-slate-600">{alert.text}</div>
          <button className="mt-3 rounded-lg bg-violet-600 px-3 py-1 text-sm text-white" onClick={() => setAlert(null)}>Kapat</button>
        </div>
      )}
    </UserContext.Provider>
  );
}
