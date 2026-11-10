import { useEffect, useMemo, useState } from 'react';
import { Lobby } from './components/Lobby';
import { RoomView } from './components/RoomView';
import { LoadingIndicator } from './components/LoadingIndicator';
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

  const handleJoin = (id: string, displayName: string) => {
    setRoomId(id);
    room.join(id, displayName);
  };
  const handleLeave = () => {
    room.leave();
    setRoomId(null);
  };

  if (booting) {
    return (
      <main className="app-loader" aria-label="Loading StreamRoom">
        <LoadingIndicator label="Initializing StreamRoom" detail="Preparing your space" />
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
