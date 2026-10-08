import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  HiOutlineDesktopComputer,
  HiOutlineVolumeUp,
  HiOutlineUsers,
  HiOutlineClipboard,
  HiOutlineCheck,
  HiOutlineArrowLeft,
  HiOutlinePlay,
  HiOutlineLogout,
  HiOutlineExclamationCircle,
  HiOutlineLink
} from "react-icons/hi";
import { MdStopScreenShare } from "react-icons/md";
import { FiRadio } from "react-icons/fi";
import "./styles.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5008";
const socket = io(SOCKET_URL, { autoConnect: false, transports: ["websocket", "polling"] });

function makeUid() {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}

function App() {
  const [page, setPage] = useState("home");
  const [roomCode, setRoomCode] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewerCount, setViewerCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [joined, setJoined] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const hostPeersRef = useRef(new Map());
  const hostIceQueuesRef = useRef(new Map());
  const viewerPeerRef = useRef(null);
  const viewerIceQueueRef = useRef([]);
  const roleRef = useRef(null);
  const activeCodeRef = useRef("");
  const uidRef = useRef(`screen-${makeUid()}`);
  const [needsSoundClick, setNeedsSoundClick] = useState(false);

  const cleanupPeer = (peer) => {
    if (!peer) return;
    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.onconnectionstatechange = null;
    peer.close();
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setIsSharing(false);
    setAudioAvailable(false);
  };

  const closeAllPeers = () => {
    hostPeersRef.current.forEach((peer) => cleanupPeer(peer));
    hostPeersRef.current.clear();
    hostIceQueuesRef.current.clear();
    cleanupPeer(viewerPeerRef.current);
    viewerPeerRef.current = null;
    viewerIceQueueRef.current = [];
  };

  const resetConnection = () => {
    closeAllPeers();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause?.();
      remoteVideoRef.current.srcObject = null;
    }
    setNeedsSoundClick(false);
  };

  const leaveEverything = () => {
    socket.emit("leave-room");
    resetConnection();
    stopLocalStream();
    setActiveCode("");
    activeCodeRef.current = "";
    setViewerCount(0);
    setJoined(false);
    roleRef.current = null;
    if (socket.connected) socket.disconnect();
    setPage("home");
  };

  const startScreenCapture = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Bu tarayıcı ekran paylaşımını desteklemiyor.");
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60, max: 60 }
      },
      audio: true
    });
localStreamRef.current = stream;
    
    setIsSharing(true);
    setAudioAvailable(stream.getAudioTracks().length > 0);

   if (localVideoRef.current) {
  localVideoRef.current.srcObject = stream;
  localVideoRef.current.muted = true;
  localVideoRef.current.playsInline = true;

  try {
    await localVideoRef.current.play();
  } catch (err) {
    console.log("Local preview play hatası:", err);
  }
}
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        socket.emit("stop-sharing");
        leaveEverything();
      };
    }

    return stream;
  };

  const createHostPeer = async (viewerId) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const old = hostPeersRef.current.get(viewerId);
    if (old) cleanupPeer(old);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: viewerId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        if (hostPeersRef.current.get(viewerId) === pc) {
          hostPeersRef.current.delete(viewerId);
        }
      }
    };

    hostPeersRef.current.set(viewerId, pc);
    hostIceQueuesRef.current.set(viewerId, []);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { to: viewerId, sdp: offer });
  };

  const createRoom = async () => {
    setError("");
    setNotice("");
    try {
      await startScreenCapture();
    } catch (err) {
      if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
        setError(err?.message || "Ekran paylaşımı başlatılamadı.");
      }
      return;
    }

    roleRef.current = "host";
    setPage("host");

    if (!socket.connected) socket.connect();
    socket.emit("create-room", { uid: uidRef.current }, (result) => {
      if (!result?.ok) {
        setError(result?.error || "Oda oluşturulamadı.");
        stopLocalStream();
        roleRef.current = null;
        setPage("home");
        return;
      }
      setActiveCode(result.code);
      activeCodeRef.current = result.code;
      setJoined(true);
    });
  };

  const joinRoom = () => {
    const code = roomCode.trim().toUpperCase();
    setError("");
    setNotice("");
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("6 haneli yayın kodunu gir.");
      return;
    }

    roleRef.current = "viewer";
    if (!socket.connected) socket.connect();
    socket.emit("join-room", { code, uid: uidRef.current }, (result) => {
      if (!result?.ok) {
        setError(result?.error || "Yayına katılınamadı.");
        roleRef.current = null;
        return;
      }
      setActiveCode(code);
      activeCodeRef.current = code;
      setPage("viewer");
      setJoined(true);
    });
  };

  const copyCode = async () => {
    if (!activeCode) return;
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice("Kodu elle kopyalayabilirsin: " + activeCode);
    }
  };

  const enableSound = () => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.muted = false;
    remoteVideoRef.current.volume = 1;
    remoteVideoRef.current.play().then(() => setNeedsSoundClick(false)).catch(() => {});
  };

  useEffect(() => {
    const onRoomCreated = ({ code }) => {
      setActiveCode(code);
      activeCodeRef.current = code;
    };

    const onViewerJoined = async ({ viewerId, viewerCount: count }) => {
      setViewerCount(count || 0);
      if (roleRef.current === "host") await createHostPeer(viewerId);
    };

    const onViewerLeft = ({ viewerId }) => {
      const peer = hostPeersRef.current.get(viewerId);
      cleanupPeer(peer);
      hostPeersRef.current.delete(viewerId);
      setViewerCount((count) => Math.max(0, count - 1));
    };

    const onRoomJoined = ({ viewerCount: count }) => {
      setViewerCount(count || 0);
    };

    const onOffer = async ({ from, sdp }) => {
      if (roleRef.current !== "viewer") return;
      cleanupPeer(viewerPeerRef.current);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      viewerPeerRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit("ice-candidate", { to: from, candidate: event.candidate });
      };

      pc.ontrack = (event) => {
        let stream = event.streams?.[0];
        if (!stream) {
          stream = remoteVideoRef.current?.srcObject instanceof MediaStream
            ? remoteVideoRef.current.srcObject
            : new MediaStream();
          if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
        }

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.muted = false;
          remoteVideoRef.current.volume = 1;
          remoteVideoRef.current.play().then(() => setNeedsSoundClick(false)).catch(() => setNeedsSoundClick(true));
        }
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.connectionState)) setNotice("Yayın bağlantısı kapandı.");
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const candidate of viewerIceQueueRef.current.splice(0)) {
          await pc.addIceCandidate(candidate);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: from, sdp: answer });
      } catch (err) {
        console.error("Viewer answer error:", err);
        setError("Yayın bağlantısı kurulamadı.");
      }
    };

    const onAnswer = async ({ from, sdp }) => {
      const pc = hostPeersRef.current.get(from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const queue = hostIceQueuesRef.current.get(from) || [];
        for (const candidate of queue.splice(0)) {
          await pc.addIceCandidate(candidate);
        }
      } catch (err) {
        console.error("Host answer error:", err);
      }
    };

    const onIceCandidate = async ({ from, candidate }) => {
      if (!candidate) return;
      const rtcCandidate = new RTCIceCandidate(candidate);
      try {
        if (roleRef.current === "host") {
          const pc = hostPeersRef.current.get(from);
          if (!pc) return;
          if (pc.remoteDescription) {
            await pc.addIceCandidate(rtcCandidate);
          } else {
            const queue = hostIceQueuesRef.current.get(from) || [];
            queue.push(rtcCandidate);
            hostIceQueuesRef.current.set(from, queue);
          }
        } else if (roleRef.current === "viewer") {
          if (viewerPeerRef.current?.remoteDescription) {
            await viewerPeerRef.current.addIceCandidate(rtcCandidate);
          } else {
            viewerIceQueueRef.current.push(rtcCandidate);
          }
        }
      } catch (err) {
        console.warn("ICE candidate error:", err);
      }
    };

    const onStreamEnded = () => {
      if (roleRef.current === "viewer") {
        resetConnection();
        setNotice("Yayın sahibi ekran paylaşımını durdurdu.");
      }
    };

    const onHostLeft = () => {
      if (roleRef.current === "viewer") {
        resetConnection();
        setJoined(false);
        setNotice("Yayın sona erdi.");
      }
    };

    socket.on("room-created", onRoomCreated);
    socket.on("viewer-joined", onViewerJoined);
    socket.on("viewer-left", onViewerLeft);
    socket.on("room-joined", onRoomJoined);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onIceCandidate);
    socket.on("stream-ended", onStreamEnded);
    socket.on("host-left", onHostLeft);

    return () => {
      socket.off("room-created", onRoomCreated);
      socket.off("viewer-joined", onViewerJoined);
      socket.off("viewer-left", onViewerLeft);
      socket.off("room-joined", onRoomJoined);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onIceCandidate);
      socket.off("stream-ended", onStreamEnded);
      socket.off("host-left", onHostLeft);
      closeAllPeers();
      stopLocalStream();
      if (socket.connected) socket.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      socket.emit("leave-room");
      closeAllPeers();
      stopLocalStream();
    };
  }, []);

  if (page === "host") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <div className="brand"><span className="brand-mark"><FiRadio /></span><span>Görüşelim</span></div>
          <div className="live-pill"><span className="live-dot" /> CANLI YAYIN</div>
          <button className="ghost-btn" onClick={leaveEverything}><HiOutlineLogout /> Yayını Bitir</button>
        </div>

        <main className="stage host-stage">
          <div className="stage-header">
            <div>
              <div className="eyebrow"><span className="live-dot" /> EKRANIN PAYLAŞILIYOR</div>
              <h1>Yayın kontrol merkezi</h1>
              <p>Kodu arkadaşlarınla paylaş, aynı anda birden fazla kişi ekranını izleyebilir.</p>
            </div>
            <div className="viewer-count"><HiOutlineUsers /><strong>{viewerCount}</strong><span>izleyici</span></div>
          </div>

          <div className="host-layout">
            <section className="screen-card host-screen-card">
              <video ref={localVideoRef} autoPlay muted playsInline className="screen-video" />
              <div className="screen-overlay top-left"><span className="live-badge"><span className="live-dot" /> LIVE</span></div>
              <div className="screen-overlay bottom-bar">
                <div className="source-info"><HiOutlineDesktopComputer /><span>Ekran paylaşımı</span>{audioAvailable && <><span className="divider" /><HiOutlineVolumeUp /><span>Ses dahil</span></>}</div>
                <button className="stop-btn" onClick={leaveEverything}><MdStopScreenShare /> Paylaşımı bitir</button>
              </div>
            </section>

            <aside className="control-card">
              <div className="control-icon"><HiOutlineLink /></div>
              <span className="label">YAYIN KODUN</span>
              <div className="room-code">{activeCode}</div>
              <button className="copy-btn" onClick={copyCode}>{copied ? <HiOutlineCheck /> : <HiOutlineClipboard />} {copied ? "Kopyalandı" : "Kodu Kopyala"}</button>
              <div className="hint-box"><HiOutlineExclamationCircle /><span>İzleyicilerin bu kodu girerek doğrudan yayına katılabilir.</span></div>
              <div className="stat-row"><div><HiOutlineUsers /><span>İzleyici</span></div><strong>{viewerCount}</strong></div>
              <div className={`audio-status ${audioAvailable ? "ok" : "warn"}`}><HiOutlineVolumeUp /><span>{audioAvailable ? "Yayın sesi aktif" : "Ses paylaşılmadı"}</span></div>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  if (page === "viewer") {
    return (
      <div className="viewer-shell">
        <video ref={remoteVideoRef} autoPlay playsInline className="viewer-video" />
        <div className="viewer-gradient" />
        <header className="viewer-topbar">
          <div className="brand light"><span className="brand-mark"><FiRadio /></span> Görüşelim</div>
          <div className="viewer-live"><span className="live-dot" /> CANLI <span className="code-small">#{activeCode}</span></div>
          <button className="viewer-exit" onClick={leaveEverything}><HiOutlineArrowLeft /> Çık</button>
        </header>
        {needsSoundClick && <button className="sound-unlock" onClick={enableSound}><HiOutlineVolumeUp /> Sesi Aç</button>}
        <div className="viewer-bottom">
          <div><span className="watching-dot" /> Canlı ekran paylaşımı</div>
          <div className="viewer-count dark"><HiOutlineUsers /> {viewerCount} izleyici</div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-shell">
      <div className="home-card">
        <div className="hero-icon"><HiOutlineDesktopComputer /></div>
        <div className="eyebrow">GÖRÜŞELİM · EKRAN PAYLAŞIMI</div>
        <h1>Ekranını paylaş.<br /><span>Herkes izlesin.</span></h1>
        <p className="hero-copy">Tek bir kod oluştur, arkadaşlarına gönder. İsteyen herkes kodu girerek canlı ekranına katılabilir.</p>

        <div className="home-actions">
          <button className="primary-btn" onClick={createRoom}><HiOutlinePlay /> Yayın Başlat</button>
          <div className="or"><span /> veya <span /></div>
          <div className="join-box">
            <div className="input-wrap"><HiOutlineLink /><input maxLength={6} value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} onKeyDown={(e) => e.key === "Enter" && joinRoom()} placeholder="Yayın kodu" /></div>
            <button className="join-btn" onClick={joinRoom}>Katıl</button>
          </div>
        </div>

        {error && <div className="error-box"><HiOutlineExclamationCircle /> {error}</div>}
        {notice && <div className="notice-box">{notice}</div>}

        <div className="feature-row">
          <div><HiOutlineDesktopComputer /><span>Ekran</span></div>
          <div><HiOutlineVolumeUp /><span>Sistem sesi</span></div>
          <div><HiOutlineUsers /><span>Çoklu izleyici</span></div>
        </div>
        <div className="home-note">Chrome / Edge kullanman önerilir. Ses için paylaşım penceresinde <b>ses paylaşımı</b> seçeneğini aç.</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
