const env = import.meta.env;

const stunUrls = (env.VITE_STUN_URLS ?? 'stun:stun.l.google.com:19302')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const turnUrls = (env.VITE_TURN_URLS ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);
const turnUsername = env.VITE_TURN_USERNAME?.trim();
const turnCredential = env.VITE_TURN_CREDENTIAL?.trim();

export const config = {
  signalingUrl: env.VITE_SIGNALING_URL ?? 'ws://localhost:8080/ws/signaling',
  // TURN is optional for local development; credentials must come from deployment
  // environment variables and are never committed to source control.
  iceServers: [
    ...(stunUrls.length > 0 ? [{ urls: stunUrls }] : []),
    ...(turnUrls.length > 0 && turnUsername && turnCredential
      ? [{ urls: turnUrls, username: turnUsername, credential: turnCredential }]
      : []),
  ] as RTCIceServer[],
};
