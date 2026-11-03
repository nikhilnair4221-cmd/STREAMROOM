package com.streamroom.signaling.room;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class RoomTest {

    @Test
    void testRoomCapacityLimit() {
        Room room = new Room("test-room");
        assertFalse(room.isFull());
        assertTrue(room.isEmpty());

        for (int i = 1; i <= Room.MAX_PEERS; i++) {
            WebSocketSession session = mock(WebSocketSession.class);
            Peer peer = new Peer("peer" + i, "test-room", session);
            assertTrue(room.addPeer(peer), "Should allow adding up to MAX_PEERS");
        }

        assertTrue(room.isFull());
        assertEquals(Room.MAX_PEERS, room.getPeers().size());

        // 7th peer should be rejected
        WebSocketSession session7 = mock(WebSocketSession.class);
        Peer peer7 = new Peer("peer7", "test-room", session7);
        assertFalse(room.addPeer(peer7), "7th peer should be rejected");

        // Reconnecting existing peer should be allowed even when full
        WebSocketSession session1New = mock(WebSocketSession.class);
        Peer peer1Reconnected = new Peer("peer1", "test-room", session1New);
        assertTrue(room.addPeer(peer1Reconnected), "Reconnecting peer with existing ID should be allowed");
        assertEquals(session1New, room.getPeer("peer1").getSession());
    }

    @Test
    void testGetOtherPeers() {
        Room room = new Room("test-room");
        WebSocketSession sessionA = mock(WebSocketSession.class);
        WebSocketSession sessionB = mock(WebSocketSession.class);

        room.addPeer(new Peer("peerA", "test-room", sessionA));
        room.addPeer(new Peer("peerB", "test-room", sessionB));

        assertEquals(1, room.getOtherPeers("peerA").size());
        assertEquals("peerB", room.getOtherPeers("peerA").iterator().next().getPeerId());
    }
}
