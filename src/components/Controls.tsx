import type { ReactNode } from 'react';
import { LeaveIcon, MicIcon, MicOffIcon, ScreenIcon, VideoIcon, VideoOffIcon } from './icons';

interface Props {
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasMic: boolean;
  hasCamera: boolean;
  sharing: boolean;
  /** null = can share; otherwise the reason it is unavailable (shown as tooltip). */
  shareBlockedReason: string | null;
  onToggleMic(): void;
  onToggleCamera(): void;
  onToggleShare(): void;
  onLeave(): void;
}

interface ControlProps {
  tip: string;
  label: string;
  icon: ReactNode;
  variant?: 'off' | 'active' | 'danger';
  pressed?: boolean;
  disabled?: boolean;
  onClick(): void;
  testId: string;
}

function Control({ tip, label, icon, variant, pressed, disabled, onClick, testId }: ControlProps) {
  const cls = ['btn', variant ? `btn--${variant}` : ''].filter(Boolean).join(' ');
  return (
    <span className="tip" data-tip={tip}>
      <button
        className={cls}
        data-testid={testId}
        aria-label={tip}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
      >
        {icon}
        <span className="btn__label">{label}</span>
      </button>
    </span>
  );
}

export function Controls(p: Props) {
  return (
    <nav className="controls" aria-label="Call controls">
      <Control
        testId="toggle-mic"
        tip={!p.hasMic ? 'No microphone available' : p.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
        label={p.micEnabled ? 'Mute' : 'Unmute'}
        icon={p.micEnabled ? <MicIcon /> : <MicOffIcon />}
        variant={p.hasMic && !p.micEnabled ? 'off' : undefined}
        pressed={!p.micEnabled}
        disabled={!p.hasMic}
        onClick={p.onToggleMic}
      />
      <Control
        testId="toggle-camera"
        tip={!p.hasCamera ? 'No camera available' : p.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        label={p.cameraEnabled ? 'Stop video' : 'Start video'}
        icon={p.cameraEnabled ? <VideoIcon /> : <VideoOffIcon />}
        variant={p.hasCamera && !p.cameraEnabled ? 'off' : undefined}
        pressed={!p.cameraEnabled}
        disabled={!p.hasCamera}
        onClick={p.onToggleCamera}
      />
      <Control
        testId="toggle-share"
        tip={p.sharing ? 'Stop sharing your screen' : (p.shareBlockedReason ?? 'Share your screen')}
        label={p.sharing ? 'Stop sharing' : 'Share screen'}
        icon={<ScreenIcon />}
        variant={p.sharing ? 'active' : undefined}
        pressed={p.sharing}
        disabled={!p.sharing && p.shareBlockedReason !== null}
        onClick={p.onToggleShare}
      />
      <span className="controls__rule" aria-hidden="true" />
      <Control testId="leave" tip="Leave room" label="Leave" icon={<LeaveIcon />} variant="danger" onClick={p.onLeave} />
    </nav>
  );
}
