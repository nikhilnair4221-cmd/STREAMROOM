package com.streamroom.signaling.room;

import org.springframework.web.socket.WebSocketSession;

/**
 * A single connected participant: their client-provided id, the room
 * they're in, and the live WebSocket session used to reach them.
 */
public class Peer {

    private final String peerId;
    private final String roomId;
    private final WebSocketSession session;
    private final String displayName;

    public Peer(String peerId, String roomId, WebSocketSession session, String displayName) {
        this.peerId = peerId;
        this.roomId = roomId;
        this.session = session;
        this.displayName = displayName;
    }

    public Peer(String peerId, String roomId, WebSocketSession session) {
        this(peerId, roomId, session, "Guest " + peerId.substring(0, Math.min(4, peerId.length())).toUpperCase());
    }

    public String getPeerId() {
        return peerId;
    }

    public String getRoomId() {
        return roomId;
    }

    public WebSocketSession getSession() {
        return session;
    }

    public String getDisplayName() {
        return displayName;
    }
}
