import { SignalingClient } from '../signaling/SignalingClient';
import type {
  ErrorPayload,
  IcePayload,
  JoinPeer,
  MessageType,
  SdpPayload,
  SignalingMessage,
} from '../types/signaling';
import { collectWebRtcStats, type WebRtcStats } from './stats';

export type SessionStatus =
  | 'idle'
  | 'starting' // acquiring camera/mic
  | 'connecting' // opening WebSocket / waiting for JOIN ack
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'left';
export type ConnectionQuality = 'good' | 'unstable' | 'poor';

export interface RemotePeerView {
  id: string;
  name: string;
  camera: MediaStream | null;
  screen: MediaStream | null;
  connectionState: RTCPeerConnectionState;
}

export interface SessionSnapshot {
  status: SessionStatus;
  error: string | null;
  peerId: string;
  displayName: string;
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  hasMic: boolean;
  hasCamera: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  sharing: boolean;
  peers: RemotePeerView[];
  quality: ConnectionQuality;
  screenShareError: string | null;
}

export interface SessionConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
}

interface PeerEntry {
  id: string;
  displayName: string;
  pc: RTCPeerConnection;
  /** Perfect-negotiation role: the polite side yields on offer collisions. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  tracksAdded: boolean;
  restartedIce: boolean;
  screenSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  /** Current screen stream id announced by the remote peer. */
  screenStreamId: string | null;
  /** Every screen stream id the remote ever announced (to never mistake a stale one for a camera). */
  knownScreenIds: Set<string>;
  /** Candidates can arrive before the corresponding offer/answer. */
  pendingCandidates: RTCIceCandidateInit[];
  remoteStreams: Map<string, MediaStream>;
  /** Serialises async handling of incoming messages for this peer. */
  chain: Promise<void>;
  previousStats: WebRtcStats | undefined;
  quality: ConnectionQuality;
  qualityCandidate: ConnectionQuality;
  qualityCandidateCount: number;
  qualityTimer: ReturnType<typeof setTimeout> | null;
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
  private screenShareError: string | null = null;
  private joinTimeout: ReturnType<typeof setTimeout> | null = null;
  private cameraAvailable = false;

  constructor(
    private readonly roomId: string,
    private readonly displayName: string,
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
      this.cameraAvailable = this.localStream.getVideoTracks().length > 0;
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
    this.armJoinTimeout();
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
    this.clearJoinTimeout();
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

  async toggleCamera(): Promise<void> {
    const activeTrack = this.localStream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;
    if (activeTrack) {
      this.stopCameraTracks();
      this.emit();
      return;
    }

    if (this.status !== 'connected' && this.status !== 'reconnecting') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'Could not enable camera: camera access is unavailable on this page.';
      this.emit();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track || this.hasLeft()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      track.addEventListener('ended', () => {
        if (this.localStream?.getVideoTracks().includes(track)) {
          this.localStream.removeTrack(track);
          this.emit();
        }
      });
      if (!this.localStream) this.localStream = stream;
      else {
        this.localStream.getVideoTracks().forEach((oldTrack) => {
          this.localStream?.removeTrack(oldTrack);
          oldTrack.stop();
        });
        this.localStream.addTrack(track);
      }
      this.cameraAvailable = true;
      for (const entry of this.peers.values()) this.addOrReplaceVideoTrack(entry, track);
    } catch (err) {
      this.error = `Could not enable camera: ${describe(err)}`;
      console.warn('[webrtc] enabling camera failed:', describe(err));
    }
    this.emit();
  }

  async startScreenShare(): Promise<void> {
    this.screenShareError = null;
    if (this.screenStream || this.status !== 'connected') return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.screenShareError = "Screen sharing isn't supported by this browser. Try a supported desktop browser.";
      this.emit();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      if (describe(err).includes('NotAllowedError')) {
        this.screenShareError = 'Screen sharing was cancelled or blocked. Allow capture access and try again.';
      } else {
        this.screenShareError = `Screen sharing could not start: ${describe(err)}`;
      }
      console.info('[webrtc] screen share failed:', describe(err));
      this.emit();
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
    this.screenShareError = null;
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
    this.armJoinTimeout();
  }

  private onSignalingMessage(msg: SignalingMessage): void {
    if (this.status === 'left' || this.status === 'error') return;
    if (msg.roomId !== this.roomId) return;

    const normalizedType = String(msg.type ?? '').toLowerCase().replace(/_/g, '-');

    switch (normalizedType) {
      case 'join':
        if (msg.senderId === this.peerId) {
          // Ack for our own JOIN: payload lists peers already in the room.
          const existing: unknown[] = Array.isArray(msg.payload) ? msg.payload : [];
          this.setStatus('connected');
          this.clearJoinTimeout();
          for (const peer of existing) {
            const details = typeof peer === 'string'
              ? { id: peer, displayName: msg.peerNames?.[peer] ?? '' }
              : peer as JoinPeer;
            this.createPeer(details.id, true, details.displayName);
          }
        } else {
          // Someone else joined. Prepare for their offer; do NOT offer
          // ourselves (the newcomer is the designated initial offerer).
          this.createPeer(msg.senderId, false, msg.displayName);
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
        this.fail(reason);
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Peer connections
  // ------------------------------------------------------------------

  private createPeer(remoteId: string, addTracksNow: boolean, displayName = ''): PeerEntry {
    const existing = this.peers.get(remoteId);
    if (existing) {
      if (displayName) existing.displayName = displayName;
      if (addTracksNow) this.addLocalTracks(existing);
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: this.cfg.iceServers });
    const entry: PeerEntry = {
      id: remoteId,
      displayName: displayName || `Guest ${remoteId.slice(0, 4).toUpperCase()}`,
      pc,
      polite: this.peerId < remoteId,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      tracksAdded: false,
      restartedIce: false,
      screenSender: null,
      videoSender: null,
      screenStreamId: null,
      knownScreenIds: new Set(),
      pendingCandidates: [],
      remoteStreams: new Map(),
      chain: Promise.resolve(),
      previousStats: undefined,
      quality: 'good',
      qualityCandidate: 'good',
      qualityCandidateCount: 0,
      qualityTimer: null,
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
    this.startStatsPolling(entry);
    this.emit();
    return entry;
  }

  private addLocalTracks(entry: PeerEntry): void {
    if (entry.tracksAdded) return;
    entry.tracksAdded = true;
    const stream = this.localStream;
    if (stream) {
      for (const track of stream.getTracks()) {
        const sender = entry.pc.addTrack(track, stream);
        if (track.kind === 'video') entry.videoSender = sender;
      }
    }

    const screen = this.screenStream;
    const screenTrack = screen?.getVideoTracks()[0];
    if (screen && screenTrack) entry.screenSender = entry.pc.addTrack(screenTrack, screen);
  }

  private addOrReplaceVideoTrack(entry: PeerEntry, track: MediaStreamTrack): void {
    if (!entry.tracksAdded) {
      this.addLocalTracks(entry);
      return;
    }
    if (entry.videoSender) {
      void entry.videoSender.replaceTrack(track).catch((err) => console.warn('[webrtc] video replace failed', err));
      return;
    }
    entry.videoSender = entry.pc.addTrack(track, this.localStream ?? new MediaStream([track]));
  }

  private stopCameraTracks(): void {
    const tracks = this.localStream?.getVideoTracks() ?? [];
    for (const track of tracks) {
      this.localStream?.removeTrack(track);
      track.stop();
    }
    for (const entry of this.peers.values()) {
      if (!entry.videoSender) continue;
      void entry.videoSender.replaceTrack(null).catch((err) => console.warn('[webrtc] camera detach failed', err));
    }
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
    if (entry.qualityTimer) clearTimeout(entry.qualityTimer);
    entry.pc.close();
  }

  private startStatsPolling(entry: PeerEntry): void {
    const poll = async () => {
      if (!this.peers.has(entry.id) || entry.pc.connectionState === 'closed') return;
      try {
        const stats = await collectWebRtcStats(entry.pc, entry.previousStats);
        entry.previousStats = stats;
        const nextQuality = qualityFor(stats);
        if (nextQuality === entry.quality) {
          entry.qualityCandidate = nextQuality;
          entry.qualityCandidateCount = 0;
        } else if (nextQuality === entry.qualityCandidate) {
          entry.qualityCandidateCount += 1;
          const requiredSamples = nextQuality === 'good' ? 3 : 2;
          if (entry.qualityCandidateCount >= requiredSamples) {
            entry.quality = nextQuality;
            entry.qualityCandidateCount = 0;
          }
        } else {
          entry.qualityCandidate = nextQuality;
          entry.qualityCandidateCount = 1;
        }
        this.applyVideoBudget(entry, entry.quality);
        this.emit();
      } catch (err) {
        console.warn('[webrtc] stats collection failed', err);
      }
      entry.qualityTimer = setTimeout(poll, 3000);
    };
    entry.qualityTimer = setTimeout(poll, 3000);
  }

  private applyVideoBudget(entry: PeerEntry, quality: ConnectionQuality): void {
    const sender = entry.videoSender;
    if (!sender || !('getParameters' in sender) || !('setParameters' in sender)) return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) return;
    const budget = quality === 'poor' ? { maxBitrate: 350_000, maxFramerate: 15 } : quality === 'unstable' ? { maxBitrate: 700_000, maxFramerate: 20 } : { maxBitrate: 1_200_000, maxFramerate: 30 };
    const changed = parameters.encodings.some((encoding) => encoding.maxBitrate !== budget.maxBitrate || encoding.maxFramerate !== budget.maxFramerate);
    if (!changed) return;
    parameters.encodings = parameters.encodings.map((encoding) => ({ ...encoding, ...budget }));
    void sender.setParameters(parameters).catch((err) => console.warn('[webrtc] video quality update failed', err));
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
    this.signaling?.send({ type, roomId: this.roomId, senderId: this.peerId, ...(type.toLowerCase() === 'join' ? { displayName: this.displayName } : {}) });
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
    this.clearJoinTimeout();
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
      displayName: this.displayName,
      localCamera: this.localStream,
      localScreen: this.screenStream,
      hasMic: audio.length > 0,
      hasCamera: this.cameraAvailable,
      micEnabled: audio.some((t) => t.enabled && t.readyState === 'live'),
      cameraEnabled: video.some((t) => t.enabled && t.readyState === 'live'),
      sharing: this.screenStream !== null,
      peers: [...this.peers.values()].map((e) => this.viewOf(e)),
      quality: this.overallQuality(),
      screenShareError: this.screenShareError,
    };
  }

  private overallQuality(): ConnectionQuality {
    if ([...this.peers.values()].some((entry) => entry.quality === 'poor')) return 'poor';
    if ([...this.peers.values()].some((entry) => entry.quality === 'unstable')) return 'unstable';
    return 'good';
  }

  private armJoinTimeout(): void {
    this.clearJoinTimeout();
    this.joinTimeout = setTimeout(() => {
      if (this.status === 'starting' || this.status === 'connecting' || this.status === 'reconnecting') {
        this.fail('The room could not be reached. Check your connection and try again.');
      }
    }, 20_000);
  }

  private clearJoinTimeout(): void {
    if (this.joinTimeout) clearTimeout(this.joinTimeout);
    this.joinTimeout = null;
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
    return { id: entry.id, name: entry.displayName, camera, screen, connectionState: entry.pc.connectionState };
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
    console.warn('[webrtc] camera+mic failed, trying microphone only:', describe(err));
    try {
      return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    } catch (audioErr) {
      console.warn('[webrtc] microphone-only media failed, trying camera only:', describe(audioErr));
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        throw err;
      }
    }
  }
}

function qualityFor(stats: WebRtcStats): ConnectionQuality {
  const poor = (stats.roundTripTimeMs !== null && stats.roundTripTimeMs > 450)
    || (stats.packetLossRate !== null && stats.packetLossRate > 0.1)
    || (stats.jitterMs !== null && stats.jitterMs > 40);
  if (poor) return 'poor';
  const unstable = (stats.roundTripTimeMs !== null && stats.roundTripTimeMs > 220)
    || (stats.packetLossRate !== null && stats.packetLossRate > 0.03)
    || (stats.jitterMs !== null && stats.jitterMs > 20);
  return unstable ? 'unstable' : 'good';
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
