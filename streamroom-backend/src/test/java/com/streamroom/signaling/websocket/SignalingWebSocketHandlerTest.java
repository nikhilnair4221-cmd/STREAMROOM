package com.streamroom.signaling.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamroom.signaling.model.MessageType;
import com.streamroom.signaling.model.SignalingMessage;
import com.streamroom.signaling.room.RoomRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SignalingWebSocketHandlerTest {

    private RoomRegistry roomRegistry;
    private ObjectMapper objectMapper;
    private SignalingWebSocketHandler handler;

    @BeforeEach
    void setUp() {
        roomRegistry = new RoomRegistry();
        objectMapper = new ObjectMapper();
        handler = new SignalingWebSocketHandler(roomRegistry, objectMapper);
    }

    @Test
    void testJoinAndDirectedOffer() throws Exception {
        WebSocketSession sessionA = mock(WebSocketSession.class);
        when(sessionA.getId()).thenReturn("sess-A");
        when(sessionA.isOpen()).thenReturn(true);

        WebSocketSession sessionB = mock(WebSocketSession.class);
        when(sessionB.getId()).thenReturn("sess-B");
        when(sessionB.isOpen()).thenReturn(true);

        // Peer A joins
        SignalingMessage joinA = new SignalingMessage(MessageType.JOIN, "room-1", "peerA", null, null);
        handler.handleTextMessage(sessionA, new TextMessage(objectMapper.writeValueAsString(joinA)));

        assertEquals(1, roomRegistry.getRoom("room-1").getPeers().size());

        // Peer B joins
        SignalingMessage joinB = new SignalingMessage(MessageType.JOIN, "room-1", "peerB", null, null);
        handler.handleTextMessage(sessionB, new TextMessage(objectMapper.writeValueAsString(joinB)));

        assertEquals(2, roomRegistry.getRoom("room-1").getPeers().size());

        // Verify sessionA received broadcast about peerB joining
        ArgumentCaptor<TextMessage> captorA = ArgumentCaptor.forClass(TextMessage.class);
        verify(sessionA, atLeastOnce()).sendMessage(captorA.capture());
        String lastMessageToA = captorA.getValue().getPayload();
        SignalingMessage broadcastMsg = objectMapper.readValue(lastMessageToA, SignalingMessage.class);
        assertEquals(MessageType.JOIN, broadcastMsg.getType());
        assertEquals("peerB", broadcastMsg.getSenderId());

        // Peer B sends OFFER targeted to Peer A
        SignalingMessage offer = new SignalingMessage(
                MessageType.OFFER, "room-1", "peerB", "peerA",
                objectMapper.readTree("{\"sdp\":\"fake-sdp\"}"));
        handler.handleTextMessage(sessionB, new TextMessage(objectMapper.writeValueAsString(offer)));

        // Verify sessionA received the OFFER
        verify(sessionA, atLeast(2)).sendMessage(captorA.capture());
        SignalingMessage receivedOffer = objectMapper.readValue(captorA.getValue().getPayload(), SignalingMessage.class);
        assertEquals(MessageType.OFFER, receivedOffer.getType());
        assertEquals("peerB", receivedOffer.getSenderId());
        assertEquals("peerA", receivedOffer.getTargetId());
    }

    @Test
    void testDisconnectCleansUpRoom() {
        WebSocketSession sessionA = mock(WebSocketSession.class);
        when(sessionA.getId()).thenReturn("sess-A");
        when(sessionA.isOpen()).thenReturn(true);

        SignalingMessage joinA = new SignalingMessage(MessageType.JOIN, "room-cleanup", "peerA", null, null);
        assertDoesNotThrow(() ->
                handler.handleTextMessage(sessionA, new TextMessage(objectMapper.writeValueAsString(joinA))));

        assertEquals(1, roomRegistry.activeRoomCount());

        // Session closes
        handler.afterConnectionClosed(sessionA, org.springframework.web.socket.CloseStatus.NORMAL);

        // Room should be removed since it's empty
        assertNull(roomRegistry.getRoom("room-cleanup"));
        assertEquals(0, roomRegistry.activeRoomCount());
    }

    @Test
    void rejectsDirectedMessageFromUnjoinedSession() throws Exception {
        WebSocketSession joined = session("joined");
        WebSocketSession unjoined = session("unjoined");
        join(joined, "room-auth", "peerA");

        SignalingMessage offer = new SignalingMessage(
                MessageType.OFFER, "room-auth", "peerB", "peerA",
                objectMapper.readTree("{\"sdp\":\"fake\"}"));
        handler.handleTextMessage(unjoined, new TextMessage(objectMapper.writeValueAsString(offer)));

        verify(joined, times(1)).sendMessage(any(TextMessage.class));
        verify(unjoined, atLeastOnce()).sendMessage(any(TextMessage.class));
    }

    @Test
    void rejectsImpersonationAndCrossRoomTargeting() throws Exception {
        WebSocketSession sessionA = session("sess-A");
        WebSocketSession sessionB = session("sess-B");
        join(sessionA, "room-auth", "peerA");
        join(sessionB, "other-room", "peerB");
        clearInvocations(sessionA);

        SignalingMessage impersonation = new SignalingMessage(
                MessageType.OFFER, "other-room", "peerA", "peerA",
                objectMapper.readTree("{\"sdp\":\"fake\"}"));
        handler.handleTextMessage(sessionB, new TextMessage(objectMapper.writeValueAsString(impersonation)));

        verify(sessionA, never()).sendMessage(any(TextMessage.class));
        verify(sessionB, atLeastOnce()).sendMessage(any(TextMessage.class));
    }

    @Test
    void rejectsInvalidIdentifiers() throws Exception {
        WebSocketSession session = session("sess-invalid");
        SignalingMessage join = new SignalingMessage(
                MessageType.JOIN, "room with spaces", "peer", null, null);

        handler.handleTextMessage(session, new TextMessage(objectMapper.writeValueAsString(join)));

        assertNull(roomRegistry.getRoom("room with spaces"));
        verify(session).sendMessage(any(TextMessage.class));
    }

    @Test
    void disconnectedSessionCannotContinueSignaling() throws Exception {
        WebSocketSession sessionA = session("sess-A");
        WebSocketSession sessionB = session("sess-B");
        join(sessionA, "room-disconnected", "peerA");
        join(sessionB, "room-disconnected", "peerB");
        clearInvocations(sessionA);
        when(sessionB.isOpen()).thenReturn(false);

        SignalingMessage offer = new SignalingMessage(
                MessageType.OFFER, "room-disconnected", "peerB", "peerA",
                objectMapper.readTree("{\"sdp\":\"fake\"}"));
        handler.handleTextMessage(sessionB, new TextMessage(objectMapper.writeValueAsString(offer)));

        verify(sessionA, never()).sendMessage(any(TextMessage.class));
    }

    @Test
    void reconnectingPeerDoesNotConsumeCapacity() throws Exception {
        for (int i = 1; i <= 6; i++) {
            join(session("sess-" + i), "room-reconnect", "peer" + i);
        }

        WebSocketSession replacement = session("sess-replacement");
        join(replacement, "room-reconnect", "peer1");

        assertEquals(6, roomRegistry.getRoom("room-reconnect").getPeers().size());
        assertEquals("sess-replacement",
                roomRegistry.getRoom("room-reconnect").getPeer("peer1").getSession().getId());
    }

    private void join(WebSocketSession session, String roomId, String peerId) throws Exception {
        SignalingMessage join = new SignalingMessage(MessageType.JOIN, roomId, peerId, null, null);
        handler.handleTextMessage(session, new TextMessage(objectMapper.writeValueAsString(join)));
    }

    private WebSocketSession session(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
