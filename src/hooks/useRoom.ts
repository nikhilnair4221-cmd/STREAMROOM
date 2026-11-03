import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config';
import { RoomSession, type SessionSnapshot } from '../webrtc/RoomSession';

/** Bridges the framework-agnostic RoomSession into React state. */
export function useRoom() {
  const sessionRef = useRef<RoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);

  const join = useCallback((roomId: string) => {
    sessionRef.current?.leave();
    const session = new RoomSession(
      roomId,
      { signalingUrl: config.signalingUrl, iceServers: config.iceServers },
      setSnapshot,
    );
    sessionRef.current = session;
    void session.start();
  }, []);

  const leave = useCallback(() => {
    sessionRef.current?.leave();
    sessionRef.current = null;
    setSnapshot(null);
  }, []);

  // Closing/navigating away: tell the server we left (it also handles a raw
  // socket close, this just makes the departure immediate and explicit).
  useEffect(() => {
    const onPageHide = () => sessionRef.current?.leave();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      sessionRef.current?.leave();
      sessionRef.current = null;
    };
  }, []);

  return {
    snapshot,
    join,
    leave,
    toggleMic: () => sessionRef.current?.toggleMic(),
    toggleCamera: () => sessionRef.current?.toggleCamera(),
    startScreenShare: () => void sessionRef.current?.startScreenShare(),
    stopScreenShare: () => sessionRef.current?.stopScreenShare(),
  };
}
