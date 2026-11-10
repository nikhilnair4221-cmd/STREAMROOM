import { useState, type FormEvent } from 'react';
import { AlertIcon, LinkIcon, LogoMark, VideoIcon } from './icons';
import { generateRoomCode, normalizeRoomCode, validateRoomCode, type FriendlyError } from '../lib/room';
import { CosmicBackground } from './CosmicBackground';

interface Props {
  initialRoom: string;
  /** True when the room code came from an invite link. */
  invited: boolean;
  /** A failed join attempt, shown inline instead of replacing the page. */
  error: FriendlyError | null;
  onJoin(roomId: string, displayName: string): void;
}

const NAME_KEY = 'streamroom.displayName';
const DEFAULT_NAME = 'Guest';

export function Lobby({ initialRoom, invited, error, onJoin }: Props) {
  const [code, setCode] = useState(initialRoom);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateRoomCode(code);
    if (problem) {
      setFieldError(problem);
      return;
    }
    const displayName = name.trim() || DEFAULT_NAME;
    if (/[<>]/.test(displayName)) {
      setNameError('Your name cannot contain angle brackets.');
      return;
    }
    if (displayName.length > 20) {
      setNameError('Your name must be 20 characters or fewer.');
      return;
    }
    if (!displayName) {
      setNameError('Enter your name.');
      return;
    }
    localStorage.setItem(NAME_KEY, displayName);
    onJoin(normalizeRoomCode(code), displayName);
  };

  const startRoom = () => {
    const displayName = name.trim() || DEFAULT_NAME;
    if (/[<>]/.test(displayName)) {
      setNameError('Your name cannot contain angle brackets.');
      return;
    }
    if (displayName.length > 20) {
      setNameError('Your name must be 20 characters or fewer.');
      return;
    }
    localStorage.setItem(NAME_KEY, displayName);
    onJoin(generateRoomCode(), displayName);
  };

  return (
    <main className="lobby">
      <CosmicBackground />
      <section className="lobby__intro">
        <div className="lobby__brand-row">
          <span className="wordmark">
            <LogoMark size={18} />
            STREAMROOM
          </span>
        </div>

        <div className="lobby__copy">
          <h1 className="lobby__title">Your corner of the internet.</h1>
          <p className="lobby__lede">Watch something. Play something. Stay awhile.</p>
        </div>
      </section>

      <section className="lobby__panel" aria-label="Enter a room">
        <div className="lobby__panel-heading">
          <span className="lobby__panel-kicker">StreamRoom</span>
          <h2>Find your people.</h2>
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
          <button
            type="button"
            className="btn btn--primary lobby__action"
            data-testid="create"
            onClick={startRoom}
          >
            <VideoIcon size={18} /> Create a room
          </button>
        </div>

        <div className="lobby__or" aria-hidden="true">
          or
        </div>

        <form onSubmit={submit} noValidate>
          <label className="field__label" htmlFor="display-name">Your name</label>
          <input
            id="display-name"
            data-testid="display-name"
            className="field__input"
            value={name}
            placeholder="Your name"
            autoComplete="name"
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
          {nameError && <p className="field__error" role="alert" data-testid="name-error">{nameError}</p>}
          <h2 className="lobby__section-title" id="join-title"><LinkIcon size={16} /> Join a room</h2>
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
            <LinkIcon size={18} /> Join a room
          </button>
        </form>
      </section>
    </main>
  );
}
