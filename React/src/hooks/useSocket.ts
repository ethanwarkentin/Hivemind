import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

let sharedSocket: Socket | null = null;

export function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
  }
  return sharedSocket;
}

export function useSocket(): Socket {
  const socketRef = useRef<Socket>(getSocket());
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket.connected) {
      socket.connect();
    }
  }, []);
  return socketRef.current;
}
