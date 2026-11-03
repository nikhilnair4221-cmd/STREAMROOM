import { useState, type FormEvent } from 'react';
import { AlertIcon, LogoMark } from './icons';
import { generateRoomCode, normalizeRoomCode, validateRoomCode, type FriendlyError } from '../lib/room';

interface Props {
  initialRoom: string;
  /** True when the room code came from an invite link. */
  invited: boolean;
  /** A failed join attempt, shown inline instead of replacing the page. */
  error: FriendlyError | null;
  onJoin(roomId: string): void;
}

export function Lobby({ initialRoom, invited, error, onJoin }: Props) {
  const [code, setCode] = useState(initialRoom);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateRoomCode(code);
    if (problem) {
      setFieldError(problem);
      return;
    }
    onJoin(normalizeRoomCode(code));
  };

  return (
    <main className="lobby">
      <section className="lobby__intro">
        <div className="lobby__brand-row">
          <span className="wordmark">
            <LogoMark size={18} />
            StreamRoom
          </span>
          <span className="lobby__eyebrow">Private rooms · up to 6 friends</span>
        </div>

        <div className="lobby__copy">
          <div className="lobby__signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1 className="lobby__title">
            Private rooms.
            <br />
            <em>Real conversations.</em>
          </h1>
          <p className="lobby__lede">
            A calm, private space for your friends to talk, share screens, and spend time together. No accounts,
            installs, or noise.
          </p>
          <div className="lobby__proof">
            <span className="lobby__proof-dot" />
            End-to-end peer connections
          </div>
        </div>

        <ul className="lobby__facts">
          <li>
            <strong>No accounts</strong>
            Share a code or a link, that's it.
          </li>
          <li>
            <strong>Up to 6 people</strong>
            Built for small groups.
          </li>
          <li>
            <strong>Rooms are temporary</strong>
            A room disappears when the last person leaves.
          </li>
        </ul>
      </section>

      <section className="lobby__panel" aria-label="Enter a room">
        <div className="lobby__panel-heading">
          <span className="lobby__panel-kicker">Your room is ready when you are</span>
          <h2>Start somewhere<br />comfortable.</h2>
        </div>
        {error && (
          <div className="notice notice--danger" role="alert" data-testid="join-error">
            <AlertIcon size={16} />
            <div>
              <div className="notice__title">{error.title}</div>
              <div className="notice__detail">{error.detail}</div>
            </div>
          </div>
        )}

        {invited && !error && (
          <div className="notice notice--info" data-testid="invite-notice">
            <div>
              You've been invited to room <code>{normalizeRoomCode(initialRoom)}</code>. Check the code below and join.
            </div>
          </div>
        )}

        <div>
          <h2 className="lobby__section-title">Start a new room</h2>
          <p className="lobby__section-hint">We'll generate a code and take you straight in.</p>
          <button
            type="button"
            className="btn btn--primary lobby__action"
            data-testid="create"
            onClick={() => onJoin(generateRoomCode())}
          >
            Create room
          </button>
        </div>

        <div className="lobby__or" aria-hidden="true">
          or
        </div>

        <form onSubmit={submit} noValidate>
          <h2 className="lobby__section-title" id="join-title">
            Join with a code
          </h2>
          <label className="field__label" htmlFor="room" style={{ marginTop: 14 }}>
            Room code
          </label>
          <input
            id="room"
            data-testid="room-input"
            className="field__input"
            value={code}
            maxLength={32}
            placeholder="K7M2QX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'room-error' : undefined}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setFieldError(null);
            }}
          />
          {fieldError && (
            <p className="field__error" id="room-error" role="alert" data-testid="field-error">
              {fieldError}
            </p>
          )}
          <button type="submit" className="btn lobby__action" data-testid="join">
            Join room
          </button>
        </form>

        <p className="lobby__footnote">Your browser will ask for camera and microphone access when you enter a room.</p>
      </section>
    </main>
  );
}
