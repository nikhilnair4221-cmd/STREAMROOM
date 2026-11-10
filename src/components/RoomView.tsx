import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useCopy } from '../lib/clipboard';
import { buildInviteLink, guestName } from '../lib/room';
import type { RemotePeerView, SessionSnapshot } from '../webrtc/RoomSession';
import { Controls } from './Controls';
import { AlertIcon, CheckIcon, CopyIcon, ScreenIcon } from './icons';
import { LoadingIndicator } from './LoadingIndicator';
import { ParticipantsPanel } from './ParticipantsPanel';
import { TopBar } from './TopBar';
import { AvatarPlaceholder, VideoTile } from './VideoTile';
import { CosmicBackground } from './CosmicBackground';

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
  const peerNames = useRef(new Map<string, string>());
  const soundContext = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('streamroom.soundEffects') !== 'off');
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('streamroom.playbackVolume') ?? '1'));
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
    s.peers.forEach((peer) => peerNames.current.set(peer.id, peer.name));
    const previous = knownPeers.current;
    knownPeers.current = current;
    if (!previous || s.status === 'starting' || s.status === 'connecting' || s.status === 'reconnecting') return;

    const events: RoomToast[] = [];
    for (const id of current) {
      if (!previous.has(id)) {
        const peer = s.peers.find((candidate) => candidate.id === id);
        events.push({ id: `${id}:join:${Date.now()}`, kind: 'join', name: peer?.name || guestName(id) });
      }
    }
    for (const id of previous) {
      if (!current.has(id)) events.push({ id: `${id}:leave:${Date.now()}`, kind: 'leave', name: peerNames.current.get(id) || guestName(id) });
    }
    if (events.length === 0) return;

    if (soundEnabled) {
      try {
        const context = soundContext.current ?? new AudioContext();
        soundContext.current = context;
        void context.resume().then(() => playParticipantTone(context, events.some((event) => event.kind === 'join'))).catch(() => undefined);
      } catch {
        // Audio support is optional and must never affect room state.
      }
    }

    setToasts((existing) => [...existing, ...events].slice(-4));
    const timer = window.setTimeout(() => {
      setToasts((existing) => existing.filter((toast) => !events.some((event) => event.id === toast.id)));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [s.peers, s.status, soundEnabled]);

  useEffect(() => () => {
    void soundContext.current?.close();
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('streamroom.soundEffects', next ? 'on' : 'off');
    if (next) {
      try {
        const context = soundContext.current ?? new AudioContext();
        soundContext.current = context;
        void context.resume().catch(() => undefined);
      } catch {
        // Audio support is optional and must never affect room state.
      }
    }
  };

  const participantCount = s.peers.length + 1;
  const degraded = s.status === 'connecting' || s.status === 'reconnecting';
  const canShareApi = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const shareBlockedReason = !canShareApi
    ? "Screen sharing isn't supported by this browser. Try a supported desktop browser."
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
      name={s.displayName}
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
      volume={0}
    />
  );

  const remoteCameraTile = (p: RemotePeerView, small: boolean) => (
    <VideoTile
      key={`${p.id}-camera`}
      testId={`tile-remote-camera-${p.id}`}
      stream={p.camera}
      name={p.name}
      connection={p.connectionState}
      volume={volume}
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
        name={p.name}
        connection={p.connectionState}
        volume={volume}
        feature={isFeature}
        onSelect={isFeature ? undefined : () => setPinned(entry.key)}
        selectLabel={`Show ${p.name}'s screen in the main view`}
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
        name={s.displayName}
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
          <LoadingIndicator label="Preparing your space" detail="Allow microphone or camera access to share media with your friends." />
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
      <CosmicBackground intensity="quiet" />
      <TopBar
        roomId={roomId}
        status={s.status}
        participantCount={participantCount}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onLeave={onLeave}
        quality={s.quality}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        volume={volume}
        onVolumeChange={(next) => {
          setVolume(next);
          localStorage.setItem('streamroom.playbackVolume', String(next));
        }}
      />

      {degraded && (
        <div className="banner" role="status" data-testid="banner">
          <AlertIcon size={16} />
          {s.status === 'reconnecting'
            ? 'Connection to the server was lost. Reconnecting — your call will resume automatically.'
            : 'Connecting to the room…'}
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

      {s.screenShareError && (
        <div className="screen-error" role="alert" data-testid="screen-share-error">
          {s.screenShareError}
        </div>
      )}
      {!canShareApi && (
        <div className="screen-error" role="status" data-testid="screen-share-unsupported">
          Screen sharing isn't supported by this browser. Try a supported desktop browser.
        </div>
      )}

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

function playParticipantTone(context: AudioContext, joined: boolean): void {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(joined ? 0.045 : 0.025, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  gain.connect(context.destination);
  [joined ? 520 : 430, joined ? 720 : 300].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now + index * 0.07);
    oscillator.stop(now + 0.13 + index * 0.07);
  });
}
