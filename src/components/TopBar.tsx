import type { ConnectionQuality, SessionStatus } from '../webrtc/RoomSession';
import { useCopy } from '../lib/clipboard';
import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon, LeaveIcon, LogoMark, SoundIcon, SoundOffIcon, UsersIcon } from './icons';

interface Props {
  roomId: string;
  status: SessionStatus;
  participantCount: number;
  panelOpen: boolean;
  onTogglePanel(): void;
  onLeave(): void;
  quality: ConnectionQuality;
  soundEnabled: boolean;
  onToggleSound(): void;
  volume: number;
  onVolumeChange(value: number): void;
}

export function statusPresentation(status: SessionStatus): { text: string; pill: string; dot: string } {
  switch (status) {
    case 'connected':
      return { text: 'Connected', pill: 'pill--ok', dot: 'dot--ok' };
    case 'reconnecting':
      return { text: 'Reconnecting', pill: 'pill--warn', dot: 'dot--warn dot--pulse' };
    case 'connecting':
      return { text: 'Joining room', pill: 'pill--warn', dot: 'dot--warn dot--pulse' };
    case 'starting':
      return { text: 'Initializing', pill: '', dot: 'dot--pulse' };
    default:
      return { text: status, pill: '', dot: '' };
  }
}

export function TopBar({ roomId, status, participantCount, panelOpen, onTogglePanel, onLeave, quality, soundEnabled, onToggleSound, volume, onVolumeChange }: Props) {
  const { state, copy } = useCopy();
  const [audioOpen, setAudioOpen] = useState(false);
  const audioRef = useRef<HTMLDivElement>(null);
  const st = statusPresentation(status);

  useEffect(() => {
    if (!audioOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!audioRef.current?.contains(event.target as Node)) setAudioOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [audioOpen]);

  const copyTip = state === 'copied' ? 'Room code copied' : state === 'failed' ? 'Copy failed' : 'Copy room code';

  return (
    <header className="topbar">
      <div className="topbar__group">
        <span className="wordmark">
          <LogoMark size={18} />
          StreamRoom
        </span>
        <span className="topbar__rule" aria-hidden="true" />
        <span className="tip tip--below" data-tip={copyTip}>
          <button
            className={`codechip ${state === 'copied' ? 'codechip--done' : ''}`}
            onClick={() => void copy(roomId)}
            aria-label={`Room code ${roomId}. ${copyTip}`}
            data-testid="room-code"
          >
            {roomId}
            {state === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </span>
        <span className="meta" data-testid="participant-count">
          <UsersIcon size={15} />
          {participantCount} in room
        </span>
        <span className={`pill ${st.pill}`} role="status" data-testid="status">
          <span className={`dot ${st.dot}`} />
          {st.text}
        </span>
        <span className={`pill pill--quality pill--${quality}`} role="status" data-testid="quality">
          <span className={`dot ${quality === 'good' ? 'dot--ok' : quality === 'unstable' ? 'dot--warn' : 'dot--bad'}`} />
          {quality === 'good' ? 'Good connection' : quality === 'unstable' ? 'Unstable connection' : 'Poor connection'}
        </span>
      </div>

      <div className="topbar__group">
        <div className="topbar__audio" ref={audioRef}>
          <button
            className={`btn btn--sm btn--icon ${audioOpen || volume > 0 ? 'btn--active' : ''}`}
            onClick={() => setAudioOpen((open) => !open)}
            aria-label="Open audio settings"
            aria-expanded={audioOpen}
            data-testid="toggle-volume"
          >
            {volume > 0 ? <SoundIcon size={15} /> : <SoundOffIcon size={15} />}
          </button>
          {audioOpen && (
            <div className="audio-popover" role="dialog" aria-label="Audio settings">
              <label htmlFor="playback-volume">Remote playback volume</label>
              <div className="audio-popover__row">
                <input
                  id="playback-volume"
                  data-testid="playback-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(event) => onVolumeChange(Number(event.target.value))}
                />
                <output htmlFor="playback-volume">{Math.round(volume * 100)}%</output>
              </div>
              <button className="audio-popover__effects" onClick={onToggleSound} aria-pressed={soundEnabled} data-testid="toggle-sound">
                {soundEnabled ? 'Sound effects on' : 'Sound effects off'}
              </button>
              <small>Controls remote video and screen audio in this room.</small>
            </div>
          )}
        </div>
        <span className="tip tip--below tip--end" data-tip={panelOpen ? 'Hide participants' : 'Show participants'}>
          <button
            className={`btn btn--sm ${panelOpen ? 'btn--active' : ''}`}
            onClick={onTogglePanel}
            aria-pressed={panelOpen}
            aria-label={panelOpen ? 'Hide participants' : 'Show participants'}
            data-testid="toggle-panel"
          >
            <UsersIcon size={15} />
            Participants
          </button>
        </span>
        <span className="tip tip--below tip--end" data-tip="Leave room">
          <button className="btn btn--sm btn--ghost" onClick={onLeave} aria-label="Leave room" data-testid="leave-top">
            <LeaveIcon size={15} />
            Leave
          </button>
        </span>
      </div>
    </header>
  );
}
