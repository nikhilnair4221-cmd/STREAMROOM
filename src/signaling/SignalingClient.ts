import type { SignalingMessage } from '../types/signaling';

export interface SignalingHandlers {
  onOpen(): void;
  onMessage(message: SignalingMessage): void;
  /** `willReconnect` is true when the client will retry on its own. */
  onClose(willReconnect: boolean): void;
}

/**
 * Thin WebSocket wrapper with automatic reconnect (exponential backoff).
 * It only moves JSON signaling messages - never media.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: SignalingHandlers,
  ) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  send(message: SignalingMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[signaling] dropped message, socket not open:', message.type);
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.ws?.close();
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onOpen();
    };

    ws.onmessage = (event) => {
      try {
        this.handlers.onMessage(JSON.parse(event.data as string) as SignalingMessage);
      } catch (err) {
        console.warn('[signaling] unparseable message', err);
      }
    };

    ws.onerror = () => {
      // A close event always follows; reconnect logic lives there.
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      const willReconnect = !this.stopped;
      this.handlers.onClose(willReconnect);
      if (willReconnect) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.attempt, 10_000);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.open();
    }, delay);
  }
}
