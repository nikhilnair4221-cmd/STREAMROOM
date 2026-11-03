package com.streamroom.signaling.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;


/**
 * The set of signaling message types exchanged over the WebSocket connection.
 *
 * Media (audio/video/screen share) never travels through these messages or
 * through the server at all - only the WebRTC negotiation data does.
 */
public enum MessageType {
    /** Sent by a client to join a room. Server responds with existing peers
     *  and broadcasts this same type (carrying the new peer's id) to others. */
    JOIN,

    /** Sent by a client when leaving voluntarily, or synthesized by the
     *  server when a session disconnects unexpectedly. */
    LEAVE,

    /** SDP offer, routed from one peer to a specific target peer. */
    OFFER,

    /** SDP answer, routed from one peer to a specific target peer. */
    ANSWER,

    /** ICE candidate, routed from one peer to a specific target peer. */
    ICE_CANDIDATE,

    /** Server -> client only. Used for room-full, malformed message, etc. */
    ERROR;

    @JsonCreator
    public static MessageType fromString(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toUpperCase().replace("-", "_");
        try {
            return MessageType.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @JsonValue
    public String toValue() {
        return name().toLowerCase().replace("_", "-");
    }
}

