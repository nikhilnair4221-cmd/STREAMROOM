import { useCopy } from '../lib/clipboard';
import { guestName, shortId } from '../lib/room';
import type { SessionSnapshot } from '../webrtc/RoomSession';
import { CheckIcon, CloseIcon, CopyIcon } from './icons';

interface Props {
  snapshot: SessionSnapshot;
  inviteLink: string;
  onClose(): void;
}

const CONNECTION_TEXT: Record<RTCPeerConnectionState, string> = {
  new: 'Connecting',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Connection unstable',
  failed: 'Connection failed',
  closed: 'Closed',
};

const dotFor = (s: RTCPeerConnectionState) =>
  s === 'connected' ? 'dot--ok' : s === 'failed' || s === 'closed' ? 'dot--bad' : 'dot--warn';

export function ParticipantsPanel({ snapshot: s, inviteLink, onClose }: Props) {
  const { state, copy } = useCopy();
  const count = s.peers.length + 1;

  return (
    <aside className="panel" aria-label="Participants" data-testid="panel">
      <div className="panel__head">
        <h2 className="panel__title">
          Participants<span className="panel__count">{count}</span>
        </h2>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={onClose} aria-label="Close participants panel">
          <CloseIcon size={16} />
        </button>
      </div>

      <ul className="panel__list">
        <li className="person" data-testid="person-self">
          <div className="person__avatar">YOU</div>
          <div className="person__main">
            <div className="person__name">You</div>
            <div className="person__sub">
              {s.hasMic ? (s.micEnabled ? 'Mic on' : 'Mic off') : 'No mic'} ·{' '}
              {s.hasCamera ? (s.cameraEnabled ? 'Camera on' : 'Camera off') : 'No camera'}
            </div>
          </div>
          {s.sharing && <span className="tag">Sharing</span>}
        </li>

        {s.peers.map((p) => (
          <li className="person" key={p.id} data-testid={`person-${p.id}`}>
            <div className="person__avatar">{shortId(p.id).slice(0, 2)}</div>
            <div className="person__main">
              <div className="person__name">{guestName(p.id)}</div>
              <div className="person__sub">
                <span className={`dot ${dotFor(p.connectionState)}`} />
                {CONNECTION_TEXT[p.connectionState]}
              </div>
            </div>
            {p.screen && <span className="tag">Sharing</span>}
          </li>
        ))}
      </ul>

      <div className="panel__invite">
        <label className="field__label" htmlFor="invite-link">
          Invite link
        </label>
        <div className="invite-row">
          <input id="invite-link" readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn--sm" onClick={() => void copy(inviteLink)} data-testid="copy-invite">
            {state === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}
          </button>
        </div>
        <p className="invite-note">Anyone with the link can join while the room has space (up to 6).</p>
      </div>
    </aside>
  );
}
