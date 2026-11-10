package com.streamroom.signaling.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.streamroom.signaling.model.MessageType;
import com.streamroom.signaling.model.SignalingMessage;
import com.streamroom.signaling.room.Peer;
import com.streamroom.signaling.room.Room;
import com.streamroom.signaling.room.RoomRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Routes signaling messages between peers in the same room.
 *
 * This handler never inspects or forwards media - only JOIN/LEAVE/OFFER/
 * ANSWER/ICE_CANDIDATE JSON messages pass through it. Actual audio, video
 * and screen-share data flows directly between browsers over WebRTC.
 */
@Component
public class SignalingWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingWebSocketHandler.class);
    private static final Pattern IDENTIFIER_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,63}");

    private final RoomRegistry roomRegistry;
    private final ObjectMapper objectMapper;

    // Tracks which room/peer a given WebSocket session belongs to, so we can
    // clean up correctly on disconnect (tab close, network drop, etc.)
    // without the client having to send an explicit LEAVE first.
    private final Map<String, SessionContext> sessionContexts = new ConcurrentHashMap<>();

    public SignalingWebSocketHandler(RoomRegistry roomRegistry, ObjectMapper objectMapper) {
        this.roomRegistry = roomRegistry;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("WebSocket connection established: session={}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage textMessage) {
        SignalingMessage message;
        try {
            message = objectMapper.readValue(textMessage.getPayload(), SignalingMessage.class);
        } catch (IOException e) {
            log.warn("Malformed signaling message from session={}: {}", session.getId(), e.getMessage());
            sendError(session, null, "Malformed message");
            return;
        }

        if (message.getType() == null || message.getRoomId() == null || message.getSenderId() == null) {
            log.warn("Rejecting message missing required fields: {}", message);
            sendError(session, message.getRoomId(), "type, roomId and senderId are required");
            return;
        }
        if (!isValidIdentifier(message.getRoomId()) || !isValidIdentifier(message.getSenderId())
                || (message.getTargetId() != null && !isValidIdentifier(message.getTargetId()))) {
            sendError(session, message.getRoomId(), "Invalid room or participant identifier");
            return;
        }

        log.debug("Received {} from session={}", message, session.getId());

        switch (message.getType()) {
            case JOIN -> handleJoin(session, message);
            case LEAVE -> handleLeave(session, message);
            case OFFER, ANSWER, ICE_CANDIDATE -> handleDirectedMessage(session, message);
            case ERROR -> log.warn("Received unexpected ERROR message from client: {}", message);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        log.info("WebSocket connection closed: session={} status={}", session.getId(), status);
        cleanupSession(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error on session={}: {}", session.getId(), exception.getMessage());
        cleanupSession(session.getId());
        try {
            if (session.isOpen()) {
                session.close(CloseStatus.SERVER_ERROR);
            }
        } catch (IOException e) {
            log.warn("Failed to close session={} after transport error", session.getId());
        }
    }

    // ---------------------------------------------------------------------
    // JOIN
    // ---------------------------------------------------------------------

    private void handleJoin(WebSocketSession session, SignalingMessage message) {
        SessionContext currentContext = sessionContexts.get(session.getId());
        if (currentContext != null
                && (!currentContext.roomId().equals(message.getRoomId())
                || !currentContext.peerId().equals(message.getSenderId()))) {
            sendError(session, message.getRoomId(), "Session is already joined to another participant");
            return;
        }

        Room room = roomRegistry.getOrCreateRoom(message.getRoomId());
        Peer existingPeer = room.getPeer(message.getSenderId());
        if (existingPeer != null && existingPeer.getSession().getId().equals(session.getId())) {
            sendError(session, message.getRoomId(), "Participant has already joined");
            return;
        }
        if (existingPeer == null && room.isFull()) {
            log.info("Rejecting join: room '{}' is full ({} peers)", room.getRoomId(), Room.MAX_PEERS);
            sendError(session, message.getRoomId(), "Room is full");
            return;
        }
        if (existingPeer != null && !existingPeer.getSession().getId().equals(session.getId())) {
            log.info("Peer '{}' reconnected with new session={}; closing old session={}",
                    message.getSenderId(), session.getId(), existingPeer.getSession().getId());
            try {
                if (existingPeer.getSession().isOpen()) {
                    existingPeer.getSession().close(CloseStatus.NORMAL);
                }
            } catch (IOException e) {
                log.debug("Error closing old session for peer '{}'", message.getSenderId(), e);
            }
        }

        String displayName = normalizeDisplayName(message.getDisplayName(), message.getSenderId());
        Peer peer = new Peer(message.getSenderId(), message.getRoomId(), session, displayName);
        boolean added = room.addPeer(peer);
        if (!added) {
            sendError(session, message.getRoomId(), "Room is full");
            return;
        }

        sessionContexts.put(session.getId(), new SessionContext(message.getRoomId(), message.getSenderId()));
        log.info("Peer '{}' joined room '{}' ({} peer(s) now present)",
                peer.getPeerId(), room.getRoomId(), room.getPeers().size());

        // Tell the newly-joined peer who is already in the room, so it can
        // create RTCPeerConnections and start sending offers to each of them.
        ArrayNode existingPeerIds = objectMapper.createArrayNode();
        var peerNames = objectMapper.createObjectNode();
        room.getOtherPeers(peer.getPeerId()).forEach(p -> {
            existingPeerIds.add(p.getPeerId());
            peerNames.put(p.getPeerId(), p.getDisplayName());
        });

        SignalingMessage joinAck = new SignalingMessage(
                MessageType.JOIN, room.getRoomId(), peer.getPeerId(), null, existingPeerIds);
        joinAck.setPeerNames(peerNames);
        sendTo(session, joinAck);

        // Tell everyone already in the room that a new peer has arrived, so
        // they can prepare to receive an offer from it.
        SignalingMessage joinBroadcast = new SignalingMessage(
                MessageType.JOIN, room.getRoomId(), peer.getPeerId(), null, null);
        joinBroadcast.setDisplayName(peer.getDisplayName());
        broadcastToOthers(room, peer.getPeerId(), joinBroadcast);
    }

    // ---------------------------------------------------------------------
    // LEAVE (explicit)
    // ---------------------------------------------------------------------

    private void handleLeave(WebSocketSession session, SignalingMessage message) {
        if (!ownsCurrentMembership(session, message)) {
            sendError(session, message.getRoomId(), "Session is not joined as this participant");
            return;
        }
        removePeerAndNotify(message.getRoomId(), message.getSenderId(), session.getId());
        sessionContexts.remove(session.getId());
    }

    // ---------------------------------------------------------------------
    // OFFER / ANSWER / ICE_CANDIDATE - direct routing to one target peer
    // ---------------------------------------------------------------------

    private void handleDirectedMessage(WebSocketSession session, SignalingMessage message) {
        if (message.getTargetId() == null) {
            sendError(session, message.getRoomId(), message.getType() + " requires a targetId");
            return;
        }

        if (!ownsCurrentMembership(session, message)) {
            sendError(session, message.getRoomId(), "Session is not joined as this participant");
            return;
        }

        Room room = roomRegistry.getRoom(message.getRoomId());
        if (room == null) {
            sendError(session, message.getRoomId(), "Room does not exist");
            return;
        }

        Peer target = room.getPeer(message.getTargetId());
        if (target == null) {
            log.info("Dropping {} for unknown/departed target '{}' in room '{}'",
                    message.getType(), message.getTargetId(), room.getRoomId());
            sendError(session, message.getRoomId(), "Target peer not found");
            return;
        }

        sendTo(target.getSession(), message);
    }

    private boolean ownsCurrentMembership(WebSocketSession session, SignalingMessage message) {
        SessionContext context = sessionContexts.get(session.getId());
        if (context == null
                || !context.roomId().equals(message.getRoomId())
                || !context.peerId().equals(message.getSenderId())) {
            return false;
        }

        Room room = roomRegistry.getRoom(context.roomId());
        Peer peer = room == null ? null : room.getPeer(context.peerId());
        return peer != null
                && peer.getSession().getId().equals(session.getId())
                && session.isOpen();
    }

    private boolean isValidIdentifier(String value) {
        return IDENTIFIER_PATTERN.matcher(value).matches();
    }

    private String normalizeDisplayName(String raw, String peerId) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            return "Guest " + peerId.substring(0, Math.min(4, peerId.length())).toUpperCase();
        }
        return value.length() > 20 ? value.substring(0, 20) : value;
    }

    // ---------------------------------------------------------------------
    // Disconnect cleanup (tab close, network drop, WS close without LEAVE)
    // ---------------------------------------------------------------------

    private void cleanupSession(String sessionId) {
        SessionContext context = sessionContexts.remove(sessionId);
        if (context != null) {
            removePeerAndNotify(context.roomId(), context.peerId(), sessionId);
        }
    }

    private void removePeerAndNotify(String roomId, String peerId, String sessionId) {
        Room room = roomRegistry.getRoom(roomId);
        if (room == null) {
            return;
        }

        Peer currentPeer = room.getPeer(peerId);
        // Only remove if this closed session is the current active session for the peer
        if (currentPeer != null && currentPeer.getSession().getId().equals(sessionId)) {
            room.removePeer(peerId);
            log.info("Peer '{}' left room '{}' ({} peer(s) remaining)", peerId, roomId, room.getPeers().size());

            SignalingMessage leaveBroadcast = new SignalingMessage(
                    MessageType.LEAVE, roomId, peerId, null, null);
            broadcastToOthers(room, peerId, leaveBroadcast);

            roomRegistry.removeRoomIfEmpty(roomId);
        }
    }

    // ---------------------------------------------------------------------
    // Send helpers
    // ---------------------------------------------------------------------

    private void broadcastToOthers(Room room, String excludePeerId, SignalingMessage message) {
        room.getOtherPeers(excludePeerId).forEach(p -> sendTo(p.getSession(), message));
    }

    private void sendTo(WebSocketSession session, SignalingMessage message) {
        if (session == null || !session.isOpen()) {
            return;
        }
        try {
            String text = objectMapper.writeValueAsString(message);
            // Synchronize on the session to prevent concurrent frame encoding errors in Tomcat
            synchronized (session) {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(text));
                }
            }
        } catch (IOException e) {
            log.warn("Failed to send message to session={}: {}", session.getId(), e.getMessage());
        }
    }

    private void sendError(WebSocketSession session, String roomId, String reason) {
        var errorNode = objectMapper.createObjectNode();
        errorNode.put("reason", reason);
        SignalingMessage error = new SignalingMessage(MessageType.ERROR, roomId, "server", null, errorNode);
        sendTo(session, error);
    }

    private record SessionContext(String roomId, String peerId) {
    }
}
