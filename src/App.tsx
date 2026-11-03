import { useEffect, useMemo, useState } from 'react';
import { Lobby } from './components/Lobby';
import { RoomView } from './components/RoomView';
import { LogoMark } from './components/icons';
import { useRoom } from './hooks/useRoom';
import { friendlyError, normalizeRoomCode } from './lib/room';

export default function App() {
  const room = useRoom();
  const [booting, setBooting] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const { snapshot } = room;

  const invitedRoom = useMemo(() => normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? ''), []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setBooting(false));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleJoin = (id: string) => {
    setRoomId(id);
    room.join(id);
  };
  const handleLeave = () => {
    room.leave();
    setRoomId(null);
  };

  if (booting) {
    return (
      <main className="app-loader" aria-label="Loading StreamRoom">
        <div className="app-loader__mark">
          <LogoMark size={24} />
        </div>
        <strong>StreamRoom</strong>
        <span>Preparing your private room</span>
      </main>
    );
  }

  // Lobby is shown before joining, and again (with the reason) if joining fails.
  if (!roomId || !snapshot || snapshot.status === 'error') {
    const error = snapshot?.status === 'error' ? friendlyError(snapshot.error) : null;
    return <Lobby initialRoom={roomId ?? invitedRoom} invited={!roomId && invitedRoom !== ''} error={error} onJoin={handleJoin} />;
  }

  return (
    <RoomView
      roomId={roomId}
      snapshot={snapshot}
      onToggleMic={room.toggleMic}
      onToggleCamera={room.toggleCamera}
      onStartShare={room.startScreenShare}
      onStopShare={room.stopScreenShare}
      onLeave={handleLeave}
    />
  );
}
