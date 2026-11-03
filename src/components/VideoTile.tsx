import { useEffect, useRef, type ReactNode } from 'react';
import { PersonIcon, ScreenIcon } from './icons';

interface Props {
  stream: MediaStream | null;
  name: string;
  kind?: 'camera' | 'screen';
  /** Mute playback (always true for your own tiles to avoid echo). */
  muted?: boolean;
  /** Mirror horizontally (self-view camera only). */
  mirrored?: boolean;
  /** WebRTC state for remote tiles; omitted for your own. */
  connection?: RTCPeerConnectionState;
  /** Shown over the video area (e.g. camera off, still connecting). */
  placeholder?: ReactNode;
  feature?: boolean;
  small?: boolean;
  /** Makes the whole tile a button, e.g. to bring a screen into the main view. */
  onSelect?: () => void;
  selectLabel?: string;
  testId?: string;
}

const CONNECTION_TEXT: Record<RTCPeerConnectionState, string> = {
  new: 'Connecting',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Connection unstable',
  failed: 'Connection failed',
  closed: 'Closed',
};

function connectionDot(state: RTCPeerConnectionState): string {
  if (state === 'connected') return 'dot--ok';
  if (state === 'failed' || state === 'closed') return 'dot--bad';
  return 'dot--warn dot--pulse';
}

export function VideoTile({
  stream,
  name,
  kind = 'camera',
  muted = false,
  mirrored = false,
  connection,
  placeholder,
  feature = false,
  small = false,
  onSelect,
  selectLabel,
  testId,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);

  const classes = [
    'tile',
    kind === 'screen' ? 'tile--screen' : '',
    mirrored ? 'tile--mirrored' : '',
    feature ? 'tile--feature' : '',
    small ? 'tile--small' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const connected = connection === 'connected';

  return (
    <div className={classes} data-testid={testId}>
      <video ref={ref} autoPlay playsInline muted={muted} />

      {placeholder && <div className="tile__placeholder">{placeholder}</div>}

      <div className="tile__label">
        {kind === 'screen' && <ScreenIcon size={13} />}
        <span>{kind === 'screen' ? `${name} · screen` : name}</span>
      </div>

      {connection && (
        <div
          className={`tile__conn ${connected ? 'tile__conn--dotonly' : ''}`}
          role="status"
          aria-label={CONNECTION_TEXT[connection]}
          title={CONNECTION_TEXT[connection]}
          data-connection={connection}
        >
          <span className={`dot ${connectionDot(connection)}`} />
          {!connected && <span>{CONNECTION_TEXT[connection]}</span>}
        </div>
      )}

      {onSelect && <button className="tile__select" onClick={onSelect} aria-label={selectLabel ?? `Show ${name} in main view`} />}
    </div>
  );
}

/** Shared placeholder content: a quiet avatar and one line of text. */
export function AvatarPlaceholder({ text }: { text: string }) {
  return (
    <>
      <div className="tile__avatar">
        <PersonIcon size={22} />
      </div>
      <span>{text}</span>
    </>
  );
}
