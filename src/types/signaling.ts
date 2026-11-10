/**
 * Wire format of the Spring Boot signaling server.
 * Mirrors backend: model/MessageType.java and model/SignalingMessage.java.
 *
 * The Spring Boot backend serializes MessageType using @JsonValue as lowercase-hyphenated:
 *   JOIN          -> "join"
 *   LEAVE         -> "leave"
 *   OFFER         -> "offer"
 *   ANSWER        -> "answer"
 *   ICE_CANDIDATE -> "ice-candidate"
 *   ERROR         -> "error"
 *
 * It accepts both upper/lower forms via @JsonCreator fromString().
 * We support both on the wire for maximum compatibility.
 */
export type MessageType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'error'
  | 'JOIN'
  | 'LEAVE'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'ERROR';

export interface SignalingMessage<P = unknown> {
  type: MessageType;
  roomId: string;
  senderId: string;
  /** Required for OFFER/ANSWER/ICE_CANDIDATE; absent for JOIN/LEAVE. */
  targetId?: string;
  payload?: P;
  /** Present on JOIN messages; ignored by older signaling servers. */
  displayName?: string;
  peerNames?: Record<string, string>;
}

export interface JoinPeer {
  id: string;
  displayName: string;
}

/**
 * OFFER / ANSWER payload. The server forwards `payload` untouched, so we
 * piggyback screen-share metadata here instead of inventing a new message
 * type (the backend rejects types outside its enum).
 */
export interface SdpPayload {
  description: RTCSessionDescriptionInit;
  /** Id of the sender's screen-share MediaStream, or null if not sharing. */
  screenStreamId: string | null;
}

export interface IcePayload {
  candidate: RTCIceCandidateInit;
}

export interface ErrorPayload {
  reason: string;
}
