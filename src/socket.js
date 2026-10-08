import { io } from "socket.io-client";

const url = import.meta.env.VITE_SOCKET_URL || "http://localhost:5008";
export const socket = io(url, {
  autoConnect: false,
  transports: ["websocket", "polling"]
});
