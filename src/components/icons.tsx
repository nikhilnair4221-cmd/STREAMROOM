import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
}

function Svg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
    <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
  </Svg>
);
export const MicOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 9.34V6a3 3 0 0 0-5.94-.6M9 9v3a3 3 0 0 0 5.12 2.12" />
    <path d="M19 11a7 7 0 0 1-.9 3.4M5 11a7 7 0 0 0 11.1 5.7M12 18v3M3 3l18 18" />
  </Svg>
);
export const VideoIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="12" height="12" rx="2" />
    <path d="M15 10.5l6-3.5v10l-6-3.5" />
  </Svg>
);
export const VideoOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 10.5l6-3.5v10l-6-3.5M10 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2M15 9.5V8a2 2 0 0 0-2-2" />
    <path d="M3 3l18 18" />
  </Svg>
);
export const ScreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Svg>
);
export const SoundIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4h3l4 3V7l-4 3H4z" />
    <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" />
  </Svg>
);
export const SoundOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4h3l4 3V7l-4 3H4zM16 10l5 5M21 10l-5 5" />
  </Svg>
);
export const LeaveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
);
export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" />
    <path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 7 20l1.15-1.15" />
  </Svg>
);
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
  </Svg>
);
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.46 15 1.7 1.7 0 0 0 6.9 14H6.7v-2.4h.2a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-1.7.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 12.73 5.8V5h2.4v.8a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.96 12h.2v2.4h-.2A1.7 1.7 0 0 0 19.4 15z" />
  </Svg>
);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </Svg>
);
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

/** Small wordmark glyph: a screen with a play notch. Not decorative art. */
export function LogoMark({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.5" y="4.5" width="19" height="15" rx="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 9.2v5.6l4.6-2.8-4.6-2.8z" fill="currentColor" />
    </svg>
  );
}
