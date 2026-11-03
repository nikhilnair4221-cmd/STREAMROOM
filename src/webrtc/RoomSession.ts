import { SignalingClient } from '../signaling/SignalingClient';
import type {
  ErrorPayload,
  IcePayload,
  MessageType,
  SdpPayload,
  SignalingMessage,
} from '../types/signaling';

export type SessionStatus =
  | 'idle'
  | 'starting' // acquiring camera/mic
  | 'connecting' // opening WebSocket / waiting for JOIN ack
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'left';

export interface RemotePeerView {
  id: string;
  camera: MediaStream | null;
  screen: MediaStream | null;
  connectionState: RTCPeerConnectionState;
}

export interface SessionSnapshot {
  status: SessionStatus;
  error: string | null;
  peerId: string;
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  hasMic: boolean;
  hasCamera: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  sharing: boolean;
  peers: RemotePeerView[];
}

export interface SessionConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
}

interface PeerEntry {
  id: string;
  pc: RTCPeerConnection;
  /** Perfect-negotiation role: the polite side yields on offer collisions. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  tracksAdded: boolean;
  restartedIce: boolean;
  screenSender: RTCRtpSender | null;
  /** Current screen stream id announced by the remote peer. */
  screenStreamId: string | null;
  /** Every screen stream id the remote ever announced (to never mistake a stale one for a camera). */
  knownScreenIds: Set<string>;
  /** Candidates can arrive before the corresponding offer/answer. */
  pendingCandidates: RTCIceCandidateInit[];
  remoteStreams: Map<string, MediaStream>;
  /** Serialises async handling of incoming messages for this peer. */
  chain: Promise<void>;
}

/**
 * One user's membership of one room.
 *
 * - Media (camera, mic, screen) flows peer-to-peer over RTCPeerConnection.
 * - The WebSocket is used ONLY for JOIN / LEAVE / OFFER / ANSWER / ICE_CANDIDATE.
 * - Topology is a full mesh (fine for 2-6 users).
 * - Initial offers come from the newcomer (it receives the list of existing
 *   peers in the JOIN ack). Later renegotiation (screen share on/off, ICE
 *   restart) can come from either side and is made glare-safe with the
 *   "perfect negotiation" pattern.
 */
export class RoomSession {
  private peerId: string = crypto.randomUUID();
  private signaling: SignalingClient | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private readonly peers = new Map<string, PeerEntry>();
  private status: SessionStatus = 'idle';
  private error: string | null = null;

  constructor(
    private readonly roomId: string,
    private readonly cfg: SessionConfig,
    private readonly onChange: (snapshot: SessionSnapshot) => void,
  ) {}

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.status !== 'idle') return;
    this.setStatus('starting');

    try {
      this.localStream = await acquireLocalMedia();
    } catch (err) {
      this.fail(`Could not access camera/microphone: ${describe(err)}`);
      return;
    }
    if (this.hasLeft()) {
      // leave() was called while the permission prompt was open.
      this.stopLocalMedia();
      return;
    }

    this.setStatus('connecting');
    this.signaling = new SignalingClient(this.cfg.signalingUrl, {
      onOpen: () => this.onSignalingOpen(),
      onMessage: (m) => this.onSignalingMessage(m),
      onClose: (willReconnect) => this.onSignalingClose(willReconnect),
    });
    this.signaling.connect();
  }

  leave(): void {
    if (this.status === 'left') return;
    this.sendRaw('leave');
    this.status = 'left'; // set before closing so onClose is ignored
    this.signaling?.close();
    this.signaling = null;
    this.closeAllPeers();
    this.stopScreenTracks();
    this.stopLocalMedia();
  }

  toggleMic(): void {
    const tracks = this.localStream?.getAudioTracks() ?? [];
    const next = !tracks.some((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = next));
    this.emit();
  }

  toggleCamera(): void {
    const tracks = this.localStream?.getVideoTracks() ?? [];
    const next = !tracks.some((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = next));
    this.emit();
  }

  async startScreenShare(): Promise<void> {
    if (this.screenStream || this.status !== 'connected') return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.warn('[webrtc] getDisplayMedia not supported in this browser');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      console.info('[webrtc] screen share cancelled or denied:', describe(err));
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track || this.screenStream || this.hasLeft()) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    // Browser's own "Stop sharing" button ends the track.
    track.addEventListener('ended', () => this.stopScreenShare());

    // Must be set BEFORE addTrack: negotiationneeded reads it for the metadata.
    this.screenStream = stream;
    for (const entry of this.peers.values()) {
      if (entry.tracksAdded) entry.screenSender = entry.pc.addTrack(track, stream);
    }
    this.emit();
  }

  stopScreenShare(): void {
    if (!this.screenStream) return;
    for (const entry of this.peers.values()) {
      if (entry.screenSender) {
        try {
          entry.pc.removeTrack(entry.screenSender);
        } catch (err) {
          console.warn('[webrtc] removeTrack failed', err);
        }
        entry.screenSender = null;
      }
    }
    this.stopScreenTracks(); // clears this.screenStream before negotiationneeded fires
    this.emit();
  }

  // ------------------------------------------------------------------
  // Signaling events
  // ------------------------------------------------------------------

  private onSignalingOpen(): void {
    this.sendRaw('join');
  }

  private onSignalingClose(willReconnect: boolean): void {
    if (this.status === 'left' || this.status === 'error' || !willReconnect) return;
    // The server dropped us from the room and told everyone else we left, so
    // every old peer connection is dead weight. Rejoin from a clean slate
    // with a NEW peer id (avoids racing the server's cleanup of the old one).
    this.closeAllPeers();
    this.peerId = crypto.randomUUID();
    this.setStatus(this.status === 'connected' ? 'reconnecting' : 'connecting');
  }

  private onSignalingMessage(msg: SignalingMessage): void {
    if (this.status === 'left' || this.status === 'error') return;
    if (msg.roomId !== this.roomId) return;

    const normalizedType = String(msg.type ?? '').toLowerCase().replace(/_/g, '-');

    switch (normalizedType) {
      case 'join':
        if (msg.senderId === this.peerId) {
          // Ack for our own JOIN: payload lists peers already in the room.
          const existing = Array.isArray(msg.payload) ? (msg.payload as string[]) : [];
          this.setStatus('connected');
          for (const id of existing) this.createPeer(id, true);
        } else {
          // Someone else joined. Prepare for their offer; do NOT offer
          // ourselves (the newcomer is the designated initial offerer).
          this.createPeer(msg.senderId, false);
        }
        break;

      case 'leave':
        if (msg.senderId !== this.peerId) this.removePeer(msg.senderId);
        break;

      case 'offer':
      case 'answer': {
        const entry = this.peers.get(msg.senderId) ?? this.createPeer(msg.senderId, false);
        this.enqueue(entry, () => this.handleDescription(entry, msg as SignalingMessage<SdpPayload>));
        break;
      }

      case 'ice-candidate': {
        const entry = this.peers.get(msg.senderId);
        if (entry) this.enqueue(entry, () => this.handleCandidate(entry, msg as SignalingMessage<IcePayload>));
        break;
      }

      case 'error': {
        const reason = (msg.payload as ErrorPayload | undefined)?.reason ?? 'Unknown server error';
        console.warn('[signaling] server error:', reason);
        // "Room is full" is fatal for this join attempt; others are transient.
        if (reason === 'Room is full') this.fail(reason);
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Peer connections
  // ------------------------------------------------------------------

  private createPeer(remoteId: string, addTracksNow: boolean): PeerEntry {
    const existing = this.peers.get(remoteId);
    if (existing) {
      if (addTracksNow) this.addLocalTracks(existing);
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: this.cfg.iceServers });
    const entry: PeerEntry = {
      id: remoteId,
      pc,
      polite: this.peerId < remoteId,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      tracksAdded: false,
      restartedIce: false,
      screenSender: null,
      screenStreamId: null,
      knownScreenIds: new Set(),
      pendingCandidates: [],
      remoteStreams: new Map(),
      chain: Promise.resolve(),
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      this.send('ice-candidate', remoteId, { candidate: candidate.toJSON() } satisfies IcePayload);
    };

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.sendDescription(entry);
      } catch (err) {
        console.error('[webrtc] negotiation failed with', remoteId, err);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;
      entry.remoteStreams.set(stream.id, stream);
      stream.onremovetrack = () => {
        if (stream.getTracks().length === 0) entry.remoteStreams.delete(stream.id);
        this.emit();
      };
      this.emit();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.info(`[webrtc] peer ${remoteId.slice(0, 8)} -> ${state}`);
      if (state === 'connected') entry.restartedIce = false;
      if (state === 'failed' && !entry.restartedIce) {
        // One automatic ICE restart; triggers negotiationneeded.
        entry.restartedIce = true;
        pc.restartIce();
      }
      this.emit();
    };

    this.peers.set(remoteId, entry);
    if (addTracksNow) this.addLocalTracks(entry);
    this.emit();
    return entry;
  }

  private addLocalTracks(entry: PeerEntry): void {
    if (entry.tracksAdded) return;
    entry.tracksAdded = true;
    const stream = this.localStream;
    if (stream) {
      for (const track of stream.getTracks()) entry.pc.addTrack(track, stream);
    }
    const screen = this.screenStream;
    const screenTrack = screen?.getVideoTracks()[0];
    if (screen && screenTrack) entry.screenSender = entry.pc.addTrack(screenTrack, screen);
  }

  private removePeer(remoteId: string): void {
    const entry = this.peers.get(remoteId);
    if (!entry) return;
    this.peers.delete(remoteId);
    this.disposePeer(entry);
    this.emit();
  }

  private closeAllPeers(): void {
    for (const entry of this.peers.values()) this.disposePeer(entry);
    this.peers.clear();
    if (this.status !== 'left') this.emit();
  }

  private disposePeer(entry: PeerEntry): void {
    entry.pc.onicecandidate = null;
    entry.pc.onnegotiationneeded = null;
    entry.pc.ontrack = null;
    entry.pc.onconnectionstatechange = null;
    for (const s of entry.remoteStreams.values()) s.onremovetrack = null;
    entry.remoteStreams.clear();
    entry.pc.close();
  }

  // ------------------------------------------------------------------
  // Negotiation (perfect negotiation pattern)
  // ------------------------------------------------------------------

  private enqueue(entry: PeerEntry, task: () => Promise<void>): void {
    entry.chain = entry.chain.then(task).catch((err) => {
      console.error('[webrtc] handling message from', entry.id, 'failed:', err);
    });
  }

  private async handleDescription(entry: PeerEntry, msg: SignalingMessage<SdpPayload>): Promise<void> {
    const { pc } = entry;
    const payload = msg.payload;
    if (!payload?.description || pc.signalingState === 'closed') return;
    const description = payload.description;

    // Record metadata first: ontrack fires inside setRemoteDescription.
    entry.screenStreamId = payload.screenStreamId ?? null;
    if (entry.screenStreamId) entry.knownScreenIds.add(entry.screenStreamId);

    if (description.type === 'offer') {
      // Peers that were only "prepared" (JOIN broadcast) attach their media now,
      // so the offer's m-lines are answered sendrecv with our tracks.
      this.addLocalTracks(entry);
    }

    const readyForOffer =
      !entry.makingOffer && (pc.signalingState === 'stable' || entry.settingRemoteAnswer);
    const collision = description.type === 'offer' && !readyForOffer;
    entry.ignoreOffer = !entry.polite && collision;
    if (entry.ignoreOffer) {
      console.info('[webrtc] ignoring colliding offer from', entry.id.slice(0, 8));
      return;
    }

    entry.settingRemoteAnswer = description.type === 'answer';
    await pc.setRemoteDescription(description); // implicit rollback when polite
    entry.settingRemoteAnswer = false;
    for (const candidate of entry.pendingCandidates.splice(0)) {
      await pc.addIceCandidate(candidate);
    }

    if (description.type === 'offer') {
      await pc.setLocalDescription();
      this.sendDescription(entry);
    }
    this.emit();
  }

  private async handleCandidate(entry: PeerEntry, msg: SignalingMessage<IcePayload>): Promise<void> {
    const candidate = msg.payload?.candidate;
    if (!candidate || entry.pc.signalingState === 'closed') return;
    if (!entry.pc.remoteDescription) {
      entry.pendingCandidates.push(candidate);
      return;
    }
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch (err) {
      if (!entry.ignoreOffer) console.warn('[webrtc] addIceCandidate failed', err);
    }
  }

  private sendDescription(entry: PeerEntry): void {
    const d = entry.pc.localDescription;
    if (!d) return;
    const payload: SdpPayload = {
      description: { type: d.type, sdp: d.sdp },
      screenStreamId: this.screenStream?.id ?? null,
    };
    this.send(d.type === 'offer' ? 'offer' : 'answer', entry.id, payload);
  }

  // ------------------------------------------------------------------
  // Sending helpers
  // ------------------------------------------------------------------

  private send(type: MessageType, targetId: string, payload: unknown): void {
    this.signaling?.send({ type, roomId: this.roomId, senderId: this.peerId, targetId, payload });
  }

  private sendRaw(type: 'join' | 'leave' | 'JOIN' | 'LEAVE'): void {
    this.signaling?.send({ type, roomId: this.roomId, senderId: this.peerId });
  }

  // ------------------------------------------------------------------
  // State / cleanup
  // ------------------------------------------------------------------

  /** Status can change across awaits; this keeps TS from narrowing it away. */
  private hasLeft(): boolean {
    return this.status === 'left';
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    this.emit();
  }

  private fail(message: string): void {
    this.error = message;
    this.status = 'error';
    this.signaling?.close();
    this.signaling = null;
    this.closeAllPeers();
    this.stopScreenTracks();
    this.stopLocalMedia();
    this.emit();
  }

  private stopScreenTracks(): void {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
  }

  private stopLocalMedia(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  private emit(): void {
    if (this.status === 'left') return;
    this.onChange(this.buildSnapshot());
  }

  private buildSnapshot(): SessionSnapshot {
    const audio = this.localStream?.getAudioTracks() ?? [];
    const video = this.localStream?.getVideoTracks() ?? [];
    return {
      status: this.status,
      error: this.error,
      peerId: this.peerId,
      localCamera: this.localStream,
      localScreen: this.screenStream,
      hasMic: audio.length > 0,
      hasCamera: video.length > 0,
      micEnabled: audio.some((t) => t.enabled),
      cameraEnabled: video.some((t) => t.enabled),
      sharing: this.screenStream !== null,
      peers: [...this.peers.values()].map((e) => this.viewOf(e)),
    };
  }

  private viewOf(entry: PeerEntry): RemotePeerView {
    let camera: MediaStream | null = null;
    let screen: MediaStream | null = null;
    for (const [id, stream] of entry.remoteStreams) {
      if (stream.getTracks().length === 0) continue;
      if (id === entry.screenStreamId) screen = stream;
      else if (entry.knownScreenIds.has(id)) continue; // stale, stopped screen share
      else if (!camera) camera = stream;
    }
    return { id: entry.id, camera, screen, connectionState: entry.pc.connectionState };
  }
}

// ----------------------------------------------------------------------
// Module helpers
// ----------------------------------------------------------------------

/** Camera + mic, falling back to mic-only if there is no camera. */
async function acquireLocalMedia(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia is unavailable (use https or localhost)');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    console.warn('[webrtc] camera+mic failed, trying mic only:', describe(err));
    return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
