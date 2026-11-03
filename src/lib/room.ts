/** Small, UI-only helpers around room codes and identity labels. */

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Returns a human-readable problem, or null when the code is acceptable. */
export function validateRoomCode(raw: string): string | null {
  const code = normalizeRoomCode(raw);
  if (!code) return 'Enter a room code to join.';
  if (code.length < 4) return 'Room codes are at least 4 characters.';
  if (code.length > 32) return 'Room codes are at most 32 characters.';
  if (!/^[A-Z0-9-]+$/.test(code)) return 'Use only letters, numbers and hyphens.';
  return null;
}

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function buildInviteLink(roomId: string): string {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
}

/** Peers have no profile yet, so identify them by a short slice of their id. */
export const shortId = (id: string): string => id.slice(0, 4).toUpperCase();
export const guestName = (id: string): string => `Guest ${shortId(id)}`;

export interface FriendlyError {
  title: string;
  detail: string;
}

/** Turns engine/server error strings into something actionable. */
export function friendlyError(raw: string | null): FriendlyError {
  const text = raw ?? '';
  if (text.includes('Room is full')) {
    return { title: 'This room is full', detail: 'Rooms hold up to 6 people. Ask someone to leave, or start a new room.' };
  }
  if (/NotAllowedError|Permission|denied/i.test(text)) {
    return {
      title: 'Camera and microphone access is blocked',
      detail: "Allow access for this site from the address bar or your browser's site settings, then try again.",
    };
  }
  if (/NotFoundError|DevicesNotFound/i.test(text)) {
    return { title: 'No microphone found', detail: 'Connect a microphone (a camera is optional) and try again.' };
  }
  if (/NotReadableError|TrackStartError/i.test(text)) {
    return {
      title: 'Your camera or microphone is busy',
      detail: 'Another application may be using it. Close it and try again.',
    };
  }
  if (/getUserMedia is unavailable/i.test(text)) {
    return { title: 'Camera access needs a secure page', detail: 'Open StreamRoom over https:// or http://localhost.' };
  }
  return { title: "Couldn't join the room", detail: text || 'Something went wrong. Try again.' };
}
