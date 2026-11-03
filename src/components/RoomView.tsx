import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useCopy } from '../lib/clipboard';
import { buildInviteLink, guestName } from '../lib/room';
import type { RemotePeerView, SessionSnapshot } from '../webrtc/RoomSession';
import { Controls } from './Controls';
import { AlertIcon, CheckIcon, CopyIcon, ScreenIcon } from './icons';
import { ParticipantsPanel } from './ParticipantsPanel';
import { TopBar } from './TopBar';
import { AvatarPlaceholder, VideoTile } from './VideoTile';

interface Props {
  roomId: string;
  snapshot: SessionSnapshot;
  onToggleMic(): void;
  onToggleCamera(): void;
  onStartShare(): void;
  onStopShare(): void;
  onLeave(): void;
}

interface ScreenEntry {
  key: string;
  owner: 'local' | 'remote';
  peer?: RemotePeerView;
}

interface RoomToast {
  id: string;
  kind: 'join' | 'leave';
  name: string;
}

/** Columns for the balanced grid: 1, 2, 2, 2, 3, 3 participants. */
const columnsFor = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : 3);

export function RoomView({ roomId, snapshot: s, onToggleMic, onToggleCamera, onStartShare, onStopShare, onLeave }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RoomToast[]>([]);
  const knownPeers = useRef<Set<string> | null>(null);
  const invite = useCopy();
  const inviteLink = useMemo(() => buildInviteLink(roomId), [roomId]);

  useEffect(() => {
    const previous = document.title;
    document.title = `Room ${roomId} · StreamRoom`;
    return () => {
      document.title = previous;
    };
  }, [roomId]);

  useEffect(() => {
    const current = new Set(s.peers.map((peer) => peer.id));
    const previous = knownPeers.current;
    knownPeers.current = current;
    if (!previous || s.status === 'starting' || s.status === 'connecting' || s.status === 'reconnecting') return;

    const events: RoomToast[] = [];
    for (const id of current) {
      if (!previous.has(id)) events.push({ id: `${id}:join:${Date.now()}`, kind: 'join', name: guestName(id) });
    }
    for (const id of previous) {
      if (!current.has(id)) events.push({ id: `${id}:leave:${Date.now()}`, kind: 'leave', name: guestName(id) });
    }
    if (events.length === 0) return;

    setToasts((existing) => [...existing, ...events].slice(-4));
    const timer = window.setTimeout(() => {
      setToasts((existing) => existing.filter((toast) => !events.some((event) => event.id === toast.id)));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [s.peers, s.status]);

  const participantCount = s.peers.length + 1;
  const degraded = s.status === 'connecting' || s.status === 'reconnecting';
  const canShareApi = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const shareBlockedReason = !canShareApi
    ? "Screen sharing isn't supported in this browser"
    : s.status !== 'connected'
      ? 'Available once you are connected'
      : null;

  // ---- Shared screens: remote ones first, your own last --------------------
  const screens: ScreenEntry[] = [
    ...s.peers.filter((p) => p.screen).map((p): ScreenEntry => ({ key: `screen:${p.id}`, owner: 'remote', peer: p })),
    ...(s.localScreen ? [{ key: 'screen:local', owner: 'local' } as ScreenEntry] : []),
  ];
  const featured = screens.find((e) => e.key === pinned) ?? screens[0] ?? null;

  // ---- Tiles ----------------------------------------------------------------
  const localCameraTile = (small: boolean) => (
    <VideoTile
      key="local-camera"
      testId="tile-local-camera"
      stream={s.localCamera}
      name="You"
      muted
      mirrored
      small={small}
      placeholder={
        !s.hasCamera ? (
          <AvatarPlaceholder text="No camera" />
        ) : !s.cameraEnabled ? (
          <AvatarPlaceholder text="Camera off" />
        ) : undefined
      }
    />
  );

  const remoteCameraTile = (p: RemotePeerView, small: boolean) => (
    <VideoTile
      key={`${p.id}-camera`}
      testId={`tile-remote-camera-${p.id}`}
      stream={p.camera}
      name={guestName(p.id)}
      connection={p.connectionState}
      small={small}
      placeholder={p.camera ? undefined : <AvatarPlaceholder text="Connecting…" />}
    />
  );

  const remoteScreenTile = (entry: ScreenEntry, isFeature: boolean) => {
    const p = entry.peer!;
    return (
      <VideoTile
        key={entry.key}
        testId={`tile-remote-screen-${p.id}`}
        kind="screen"
        stream={p.screen}
        name={guestName(p.id)}
        connection={p.connectionState}
        feature={isFeature}
        onSelect={isFeature ? undefined : () => setPinned(entry.key)}
        selectLabel={`Show ${guestName(p.id)}'s screen in the main view`}
      />
    );
  };

  const localShareNotice = (isFeature: boolean): ReactNode =>
    isFeature ? (
      <div className="sharing" data-testid="tile-local-screen" key="screen:local">
        <div className="sharing__icon">
          <ScreenIcon size={22} />
        </div>
        <div className="sharing__title">You're sharing your screen</div>
        <div className="sharing__detail">Everyone in the room can see it.</div>
        <button className="btn" onClick={onStopShare}>
          Stop sharing
        </button>
      </div>
    ) : (
      <VideoTile
        key="screen:local"
        testId="tile-local-screen"
        kind="screen"
        stream={null}
        name="You"
        small
        onSelect={() => setPinned('screen:local')}
        selectLabel="Show your sharing status in the main view"
        placeholder={<span>You're sharing</span>}
      />
    );

  // ---- Stage ----------------------------------------------------------------
  let stage: ReactNode;
  if (s.status === 'starting') {
    stage = (
      <div className="stage stage--grid">
        <div className="stage__empty" role="status">
          <strong>Waiting for camera and microphone</strong>
          <span>Allow access in your browser to enter the room.</span>
        </div>
      </div>
    );
  } else if (featured) {
    const strip: ReactNode[] = [
      localCameraTile(true),
      ...s.peers.map((p) => remoteCameraTile(p, true)),
      ...screens.filter((e) => e.key !== featured.key).map((e) => (e.owner === 'remote' ? remoteScreenTile(e, false) : localShareNotice(false))),
    ];
    stage = (
      <div className="stage stage--screen" data-testid="stage-screen">
        <div className="stage__feature">{featured.owner === 'remote' ? remoteScreenTile(featured, true) : localShareNotice(true)}</div>
        <div className="stage__strip">{strip}</div>
      </div>
    );
  } else {
    const cols = columnsFor(participantCount);
    const rows = Math.ceil(participantCount / cols);
    const style = { '--cols': cols, '--rows': rows } as CSSProperties;
    stage = (
      <div className="stage stage--grid" data-testid="stage-grid">
        <div className="grid" style={style}>
          {localCameraTile(false)}
          {s.peers.map((p) => remoteCameraTile(p, false))}
        </div>
        {s.peers.length === 0 && s.status === 'connected' && (
          <div className="stage__hint">
            You're the only one here
            <button className="btn btn--sm" onClick={() => void invite.copy(inviteLink)} data-testid="hint-copy">
              {invite.state === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {invite.state === 'copied' ? 'Link copied' : 'Copy invite link'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`room ${degraded ? 'room--banner' : ''}`}>
      <TopBar
        roomId={roomId}
        status={s.status}
        participantCount={participantCount}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onLeave={onLeave}
      />

      {degraded && (
        <div className="banner" role="status" data-testid="banner">
          <AlertIcon size={16} />
          {s.status === 'reconnecting'
            ? 'Connection to the server was lost. Reconnecting — your call will resume automatically.'
            : 'Connecting to the signaling server…'}
        </div>
      )}

      <div className="room__body">
        {stage}
        {panelOpen && <ParticipantsPanel snapshot={s} inviteLink={inviteLink} onClose={() => setPanelOpen(false)} />}
      </div>

      <div className="room__toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div className={`room-toast room-toast--${toast.kind}`} key={toast.id}>
            <span className="room-toast__mark">{toast.kind === 'join' ? '↗' : '↙'}</span>
            <span>
              <strong>{toast.name}</strong> {toast.kind === 'join' ? 'joined the room' : 'left the room'}
            </span>
          </div>
        ))}
      </div>

      <Controls
        micEnabled={s.micEnabled}
        cameraEnabled={s.cameraEnabled}
        hasMic={s.hasMic}
        hasCamera={s.hasCamera}
        sharing={s.sharing}
        shareBlockedReason={shareBlockedReason}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onToggleShare={s.sharing ? onStopShare : onStartShare}
        onLeave={onLeave}
      />
    </div>
  );
}
