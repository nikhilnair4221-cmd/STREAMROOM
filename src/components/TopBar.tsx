import type { SessionStatus } from '../webrtc/RoomSession';
import { useCopy } from '../lib/clipboard';
import { CheckIcon, CopyIcon, LeaveIcon, LogoMark, UsersIcon } from './icons';

interface Props {
  roomId: string;
  status: SessionStatus;
  participantCount: number;
  panelOpen: boolean;
  onTogglePanel(): void;
  onLeave(): void;
}

export function statusPresentation(status: SessionStatus): { text: string; pill: string; dot: string } {
  switch (status) {
    case 'connected':
      return { text: 'Connected', pill: 'pill--ok', dot: 'dot--ok' };
    case 'reconnecting':
      return { text: 'Reconnecting', pill: 'pill--warn', dot: 'dot--warn dot--pulse' };
    case 'connecting':
      return { text: 'Connecting', pill: 'pill--warn', dot: 'dot--warn dot--pulse' };
    case 'starting':
      return { text: 'Starting', pill: '', dot: 'dot--pulse' };
    default:
      return { text: status, pill: '', dot: '' };
  }
}

export function TopBar({ roomId, status, participantCount, panelOpen, onTogglePanel, onLeave }: Props) {
  const { state, copy } = useCopy();
  const st = statusPresentation(status);

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
      </div>

      <div className="topbar__group">
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
