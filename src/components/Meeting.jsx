import React, { useContext, useEffect, useRef, useState } from 'react'
import { IoClose, IoHeart } from "react-icons/io5";
import { TbPlayerTrackNextFilled } from "react-icons/tb";
import { IoChatboxEllipses } from "react-icons/io5";
import PopupChat from './PopupChat';
import { socket } from '../../socket';
import { UserContext } from '../context/UserContext';
import { FaMicrophoneAlt } from "react-icons/fa";
import CallButton from './CallButton';
import { FaInstagram, FaTwitter, FaYoutube, FaLinkedin } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { FiGlobe } from "react-icons/fi";
import { HiOutlineBellAlert } from "react-icons/hi2";
import { MdOutlineReportProblem } from "react-icons/md";
import ReportUser from './ReportUser';
import { FaPhoneSlash } from "react-icons/fa6";

const Meeting = ({roomsUsersCount,setRoomsUsersCount,style,currentQuestion,setCurrentQuestion}) => {
  const [matchedPartner, setMatchedPartner] = useState(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const partnerIDRef = useRef(null);
  const partnerUIDRef = useRef(null);
  const RoomIDRef = useRef(null);
  const myVideo = useRef();
  const remoteVideo = useRef(null);
  const [messages,setMessages] = useState([]);
  const [startedCalling,setStartedCalling] = useState(false);
  const [partnerData,setPartnerData] = useState(null);
  const [partnerSocailLink,setPartnerSocailLink] = useState(null);
  const {currentUser,setCurrentUser,room,getPartnerData,likeUser,currentSection,isMatched,setIsMatched,setAlert} = useContext(UserContext);
  const [chatClose,setChatClose] = useState(false);
  const [searchQueue,setSearchQueue] = useState(true);
  const [showHeart, setShowHeart] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [isNewMessageNoticed,setIsNewMessageNoticed] = useState(false);
  const [reportUserVisibilty,setReportUserVisibilty] = useState(false);
  const currentSectionRef = useRef(currentSection);
  const reportUserButtonRef = useRef(null);
  const skipTimeoutRef = useRef(null);
  const currentUserIdRef = useRef(null);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);

  useEffect(() => {
    if(currentUser) currentUserIdRef.current = currentUser.id;
  },[currentUser]);

  const playRingSound = () => {};
  const stopRingSound = () => {};

  const handleReportUser = () => {
    if(partnerData) setReportUserVisibilty(true);
  };

  // Ekran + seçilen sistem/sekme sesi. Mikrofon kesinlikle alınmaz.
  const startLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setAlert?.({title:"Desteklenmiyor", text:"Bu tarayıcı ekran paylaşımını desteklemiyor.", type:"error"});
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      });

      localStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleLeaveRoom(true, true);
        };
      }

      if (myVideo.current) {
        myVideo.current.srcObject = stream;
        myVideo.current.muted = true;
        myVideo.current.play().catch(() => {});
      }

      if (!stream.getAudioTracks().length) {
        console.warn("Ekran paylaşımı ses parçası içermiyor. Paylaşım penceresinde sekme/sistem sesini seçin.");
      }

      return stream;
    } catch (err) {
      console.error("Ekran paylaşımı başlatılamadı:", err);
      if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
        setAlert?.({title:"Ekran paylaşımı başlatılamadı", text:err?.message || "Bilinmeyen hata.", type:"error"});
      }
      return null;
    }
  };

  const createPeerConnection = async (stream = localStreamRef.current) => {
    if (pcRef.current && pcRef.current.connectionState !== "closed") {
      return pcRef.current;
    }

    if (!stream) return null;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    if (myVideo.current) {
      myVideo.current.srcObject = stream;
      myVideo.current.muted = true;
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && partnerIDRef.current) {
        socket.emit("ice-candidate", {
          to: partnerIDRef.current,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      if (!remoteVideo.current) return;

      let remoteStream = event.streams?.[0];
      if (!remoteStream) {
        remoteStream = remoteVideo.current.srcObject instanceof MediaStream
          ? remoteVideo.current.srcObject
          : new MediaStream();
        if (!remoteStream.getTracks().includes(event.track)) {
          remoteStream.addTrack(event.track);
        }
      }

      remoteVideo.current.srcObject = remoteStream;
      remoteVideo.current.muted = false;
      remoteVideo.current.volume = 1;
      remoteVideo.current.play().catch(err => {
        console.warn("Remote medya otomatik oynatılamadı:", err);
      });
    };

    pc.onconnectionstatechange = () => {
      console.log("WebRTC connection:", pc.connectionState);
    };

    pcRef.current = pc;
    return pc;
  };

  const resetPeerConnection = async (leaving = true, stopScreen = true) => {
    if(leaving){
      setSearchQueue(true);
      setStartedCalling(false);
    } else {
      setSearchQueue(false);
      setStartedCalling(true);
    }

    if (remoteVideo.current) {
      remoteVideo.current.pause?.();
      remoteVideo.current.srcObject = null;
    }

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (stopScreen && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
      });
      localStreamRef.current = null;
      if (myVideo.current) myVideo.current.srcObject = null;
    } else if (localStreamRef.current && myVideo.current) {
      myVideo.current.srcObject = localStreamRef.current;
    }

    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
      skipTimeoutRef.current = null;
    }

    setIsNewMessageNoticed(false);
    setMessages([]);
    partnerIDRef.current = null;
    partnerUIDRef.current = null;
    RoomIDRef.current = null;
    setMatchedPartner(null);
    setPartnerData(null);
    setPartnerSocailLink(null);
    setChatClose(false);
    setIsMatched(false);
  };

  const handleLikeUser = () => {
    if (liking) return;
    if(partnerUIDRef.current && isliked === undefined){
      setLiking(true);
      likeUser(partnerUIDRef.current,currentUser.id)
        .then((result)=>{
          if(result){
            setPartnerData(prev => ({
              ...prev,
              likes: {
                users: {...prev.likes?.users, [currentUser.id]: true},
                count: (prev.likes?.count || 0) + 1
              }
            }));
            socket.emit("liked", {likedFrom:currentUser.id, to:partnerIDRef.current});
          }
        })
        .finally(() => setLiking(false));
    }
  };

  const handleSkipUser = () => {
    handleLeaveRoom(false, false);
    playRingSound();
    skipTimeoutRef.current = setTimeout(() => {
      handleJoinQueue();
    }, 3000);
  };

  const handleSendMessage = (message) => {
    if(message){
      socket.emit("sendMessage", {
        RoomId:RoomIDRef.current,
        message,
        senderID: socket.id
      });
    }
  };

  const partnerSocialMedia = (data) => {
    if (!data?.socialMedia) return null;
    const url = data.socialMedia;
    const clean = url.replace(/(^\w+:|^)\/\//, "").replace(/^www\./, "");
    const domain = clean.split("/")[0];
    let platform = "website";
    let Icon = FiGlobe;
    if (domain.includes("instagram")) { platform = "instagram"; Icon = FaInstagram; }
    else if (domain.includes("twitter") || domain.includes("x.com")) { platform = "twitter"; Icon = FaTwitter; }
    else if (domain.includes("tiktok")) { platform = "tiktok"; Icon = FaTiktok; }
    else if (domain.includes("youtube")) { platform = "youtube"; Icon = FaYoutube; }
    else if (domain.includes("linkedin")) { platform = "linkedin"; Icon = FaLinkedin; }
    const urlName = domain.replace(/\.[a-z]{2,3}$/, "");
    return {url, urlName, platform, Icon};
  };

  const handleLeaveRoom = async (data = true, stopScreen = true) => {
    socket.emit("leave-call");
    await resetPeerConnection(data, stopScreen);
  };

  const StopCalling = () => {
    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
      skipTimeoutRef.current = null;
    } else {
      socket.emit("leaveQueue");
    }
    stopRingSound();
    setStartedCalling(false);
  };

  // İlk ekran paylaşımı kullanıcı tıklaması sırasında başlatılır.
  const handleJoinQueue = async () => {
    if (!currentUserIdRef.current || !room) return;

    if (!localStreamRef.current) {
      const stream = await startLocalStream();
      if (!stream) return;
    }

    const pc = await createPeerConnection(localStreamRef.current);
    if (!pc) return;

    setStartedCalling(true);
    playRingSound();

    if (!socket.connected) socket.connect();

    socket.emit("joinQueue", {
      uid: currentUserIdRef.current,
      type: currentSectionRef.current,
      room: room.replace(/\s/g, "_")
    });
  };

  const createOffer = async (partnerId) => {
    try {
      if (!pcRef.current) return;
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      socket.emit("offer", {to: partnerId, sdp: offer});
    } catch (err) {
      console.error("Offer creation error:", err);
    }
  };

  const answerOffer = async (partnerId, receivedOffer) => {
    try {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(receivedOffer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit("answer", {to: partnerId, sdp: answer});
    } catch (err) {
      console.error("Answer creation error:", err);
    }
  };

  useEffect(() => {
    const onMatched = async ({ partnerId, partnerUid, roomId, isCaller }) => {
      partnerIDRef.current = partnerId;
      partnerUIDRef.current = partnerUid;
      RoomIDRef.current = roomId;

      const data = await getPartnerData(partnerUid);
      setPartnerData(data);
      setIsMatched(true);
      setPartnerSocailLink(partnerSocialMedia(data));
      stopRingSound();
      setSearchQueue(false);

      if (!isCaller) createOffer(partnerId);
    };

    const onOffer = ({ from, sdp }) => answerOffer(from, sdp);

    const onAnswer = async ({ sdp }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error("Answer set error:", err);
      }
    };

    const onIceCandidate = async ({ candidate }) => {
      if (!candidate || !pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("ICE candidate error:", err);
      }
    };

    const onReceiveMessage = (data) => {
      setMessages(prev => [...prev, data]);
      if(data.senderID !== socket.id) setIsNewMessageNoticed(true);
    };

    const onPartnerLeft = async () => {
      try {
        // Ekranı kapatmadan yeni partner için yeni PeerConnection kur.
        await resetPeerConnection(false, false);
        await handleJoinQueue();
      } catch (e) {
        console.error(e);
      }
    };

    const onLiked = (data) => {
      setCurrentUser(prev => ({
        ...prev,
        likes: {
          users: {...prev.likes?.users, [data.likedFrom]: true},
          count: (prev.likes?.count || 0) + 1
        }
      }));
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 1500);
    };

    const onSessionEnd = async () => {
      await resetPeerConnection(true, true);
      setAlert({title:"Dikkat !", text:"Görüşme süresi 10 dakikayı aştı.", type:"info"});
    };

    socket.on("matched", onMatched);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onIceCandidate);
    socket.on("receiveMessage", onReceiveMessage);
    socket.on("partner-left", onPartnerLeft);
    socket.on("liked", onLiked);
    socket.on("sessionEnd", onSessionEnd);

    return () => {
      socket.off("matched", onMatched);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onIceCandidate);
      socket.off("receiveMessage", onReceiveMessage);
      socket.off("partner-left", onPartnerLeft);
      socket.off("liked", onLiked);
      socket.off("sessionEnd", onSessionEnd);
      socket.emit("leave-call");
      resetPeerConnection(true, true);
    };
  }, []);

  // Oda/mod değiştiğinde mevcut görüşmeyi bitir ve ekran paylaşımını kapat.
  useEffect(() => {
    const changeMode = async () => {
      if (!currentSectionRef.current) currentSectionRef.current = currentSection;
      if (currentSectionRef.current !== currentSection) {
        currentSectionRef.current = currentSection;
        await handleLeaveRoom(true, true);
      }
    };
    changeMode();
  }, [currentSection, room]);

  const isliked = partnerData?.likes?.users?.[currentUser?.id];
  const isActive = partnerIDRef.current != null && !!partnerData;

  return (
    <div style={style} className='w-full flex flex-col justify-center items-center px-2 min-[900px]:gap-4 m-auto'>
      <div className='items-stretch max-[900px]:items-center max-[900px]:flex-col flex min-[900px]:gap-4 justify-center w-full'>
        <div id='local' className='flex flex-col max-w-[600px] max-[900px]:w-full w-1/2 max-[900px]:max-w-[450px] h-fit gap-2 '>
          {currentUser ? <>
            <div className='flex w-fit py-2 px-1 card w-full gap-2 login-btn justify-between rounded-lg shadow card-blur items-center'>
              <div className='flex max-[900px]:w-full w-fit justify-center gap-2 items-center'>
                <img src={currentUser.photoURL} className='w-[32px] h-[32px] object-center object-cover cursor-pointer rounded-full' alt="" />
                <div className='min-[900px]:flex-col max-[900px]:w-full max-[900px]:justify-between max-[900px]:items-center flex'>
                  <span className='text-[var(--primary)] font-bold'>Siz</span>
                  <span className='text-sm'>{currentUser.biography}</span>
                </div>
              </div>
            </div>
          </> : <div className='w-[32px] h-[32px] skeleton rounded-full'></div>}
          <div className='relative w-full h-fit'>
            <video id='localVideo' className='w-full h-fit min-[900px]:aspect-square max-[900px]:max-h-[250px] object-center object-contain video-bg rounded-lg' ref={myVideo} autoPlay playsInline muted />
            {showHeart && <div className="big-heart">❤️</div>}
            {currentSectionRef.current === "voice" && <div className='w-full h-full bg-[var(--primary)]/15 text-[var(--primary)]/15 absolute top-0 left-0 rounded-lg flex justify-center items-center'>
              <FaMicrophoneAlt className='w-1/2 min-[700px]:h-auto h-[90px] rotate-[10deg]'/>
            </div>}
          </div>
        </div>

        <div id='remote' className='flex justify-center flex-col w-1/2 max-w-[600px] max-[900px]:flex-col-reverse max-[900px]:max-w-[450px] max-[900px]:mt-2 max-[900px]:w-full gap-2'>
          <div style={{ display: !isActive ? "none" : "flex" }} className='w-fit py-2 px-1 card w-full gap-2 justify-between rounded-lg shadow card-blur items-center'>
            <div className='flex w-fit gap-2 justify-center w-fit items-center'>
              {partnerData && <img src={partnerData.photoURL ? partnerData.photoURL : null} className='w-[32px] h-[32px] object-center object-cover rounded-full' alt="" />}
              <div className='flex-col flex'>
                {partnerData && <span className='text-[var(--primary)] font-bold'>{partnerData.name ? partnerData.name : null}</span>}
                <span className='text-slate-400 text-sm'>{partnerData ? partnerData.biography : null}</span>
              </div>
            </div>
            <div className='flex gap-2 w-fit justify-center items-center'>
              <div className='flex w-fit bg-[var(--primary)]/15 text-[var(--primary)] rounded-xl p-1 gap-2'>
                <IoHeart size={22}/>
                {partnerData ? <span>{partnerData.likes.count}</span> : <div className='w-[30px] py-2 bg-[#222222] rounded-md skeleton'></div>}
              </div>
              <div ref={reportUserButtonRef} onClick={() => setReportUserVisibilty(true)} className='flex w-fit cursor-pointer bg-[var(--primary)]/15 text-[var(--primary)] rounded-xl p-1 gap-2'><MdOutlineReportProblem size={22}/></div>
              {partnerSocailLink ? <a target='_blank' rel='noreferrer' href={partnerSocailLink.url} className='bg-[var(--primary)]/15 text-[var(--primary)] flex justify-center items-center p-1 gap-2 rounded-xl'><partnerSocailLink.Icon size={22}/></a> : null}
            </div>
          </div>

          <div style={{ display: !isActive ? "none" : "flex" }} className='w-full relative group max-[900px]:flex-col-reverse'>
            <div className='relative w-full h-fit'>
              <video onLoadedMetadata={() => setVideoReady(true)} id='remoteVideo' className='w-full h-fit max-[900px]:max-h-[250px] min-[900px]:aspect-square object-center object-contain video-bg rounded-lg' ref={remoteVideo} autoPlay playsInline />
              {currentSectionRef.current === "voice" && <div className='w-full h-full bg-[var(--primary)]/15 text-[var(--primary)]/15 absolute top-0 left-0 rounded-lg flex justify-center items-center'>
                <FaMicrophoneAlt className='w-1/2 min-[700px]:h-auto h-[90px] rotate-[-10deg]'/>
              </div>}
            </div>
            <div className='min-[900px]:absolute text-sm min-[900px]:-translate-x-1/2 max-[900px]:mb-3 bottom-[5px] left-1/2 px-4 py-2 max-[900px]:px-2 max-[900px]:py-1 max-[900px]:p-0 max-[900px]:gap-4 rounded-xl min-[900px]:shadow min-[900px]:card-blur z-40 min-[900px]:bg-white flex gap-8 justify-center items-center w-fit max-[900px]:w-full'>
              <div onClick={() => {setIsNewMessageNoticed(false); setChatClose(!chatClose);}} className='flex w-fit max-[900px]:h-[42px] cursor-pointer text-gray-400 flex-1 max-[900px]:p-1 max-[900px]:px-2 max-[900px]:rounded-full max-[900px]:bg-[#FEFCFD] max-[900px]:shadow max-[900px]:gap-2 max-[900px]:justify-center max-[900px]:items-center'>
                {partnerIDRef.current ? <div className='cursor-pointer relative bg-white text-[var(--primary)] rounded-full'>
                  {isNewMessageNoticed && <div className='bg-white shadow card-blur p-1 font-bold text-sm absolute top-[-5px] left-[-12px] rounded-full'><HiOutlineBellAlert size={16}/></div>}
                  {!chatClose ? <IoChatboxEllipses size={26}/> : <IoClose size={26}/>} 
                </div> : null}
              </div>
              <div onClick={handleLikeUser} className='flex w-fit max-[900px]:h-[42px] cursor-pointer text-gray-400 flex-1 max-[900px]:p-1 max-[900px]:px-2 max-[900px]:rounded-full max-[900px]:bg-[#FEFCFD] max-[900px]:shadow max-[900px]:gap-2 max-[900px]:justify-center max-[900px]:items-center'>
                <IoHeart className={`text-[var(--border)] ${isliked && "bg-[var(--primary)]/15 rounded-full p-1 text-[var(--primary)]"} cursor-pointer`} size={isliked ? 34 : 30}/>
              </div>
              <div onClick={handleSkipUser} className='flex w-fit max-[900px]:h-[42px] cursor-pointer text-gray-400 flex-1 max-[900px]:p-1 max-[900px]:px-2 max-[900px]:rounded-full max-[900px]:bg-[#FEFCFD] max-[900px]:shadow max-[900px]:gap-2 max-[900px]:justify-center max-[900px]:items-center'>
                <TbPlayerTrackNextFilled className='text-[var(--primary)] cursor-pointer' size={30}/>
              </div>
              <div onClick={() => handleLeaveRoom()} className='flex w-fit max-[900px]:h-[42px] cursor-pointer text-gray-400 flex-1 max-[900px]:p-1 max-[900px]:px-2 max-[900px]:rounded-full max-[900px]:bg-[#FEFCFD] max-[900px]:shadow max-[900px]:gap-2 max-[900px]:justify-center max-[900px]:items-center'>
                <FaPhoneSlash className='text-[var(--primary)] cursor-pointer' size={26}/>
              </div>
            </div>
          </div>
          <CallButton key={"callbutton-meeting"} from={"call"} isActive={isActive} startedCalling={startedCalling} callFunction={handleJoinQueue} stopCallFunction={StopCalling} />
        </div>
        <PopupChat chatClose={chatClose} setChatClose={setChatClose} partnerData={partnerData} handleSendMessage={handleSendMessage} messages={messages}/>
      </div>
      <ReportUser visibility={reportUserVisibilty} buttonRef={reportUserButtonRef} setVisibility={setReportUserVisibilty} ticketCreater={currentUser?.id} reportedUser={partnerUIDRef.current}/>
    </div>
  )
}

export default Meeting
