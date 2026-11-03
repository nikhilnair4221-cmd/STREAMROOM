package com.streamroom.signaling.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SignalingMessageTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void testSerializationProducesLowercaseTypes() throws Exception {
        SignalingMessage message = new SignalingMessage(
                MessageType.ICE_CANDIDATE, "room1", "peerA", "peerB", null);

        String json = objectMapper.writeValueAsString(message);
        assertTrue(json.contains("\"type\":\"ice-candidate\""), "Serialized JSON should have kebab-case type");
    }

    @Test
    void testDeserializationAcceptsUppercaseAndLowercase() throws Exception {
        String json1 = "{\"type\":\"OFFER\",\"roomId\":\"r1\",\"senderId\":\"p1\",\"targetId\":\"p2\"}";
        SignalingMessage msg1 = objectMapper.readValue(json1, SignalingMessage.class);
        assertEquals(MessageType.OFFER, msg1.getType());

        String json2 = "{\"type\":\"offer\",\"roomId\":\"r1\",\"senderId\":\"p1\",\"targetId\":\"p2\"}";
        SignalingMessage msg2 = objectMapper.readValue(json2, SignalingMessage.class);
        assertEquals(MessageType.OFFER, msg2.getType());

        String json3 = "{\"type\":\"ice-candidate\",\"roomId\":\"r1\",\"senderId\":\"p1\",\"targetId\":\"p2\"}";
        SignalingMessage msg3 = objectMapper.readValue(json3, SignalingMessage.class);
        assertEquals(MessageType.ICE_CANDIDATE, msg3.getType());

        String json4 = "{\"type\":\"ICE_CANDIDATE\",\"roomId\":\"r1\",\"senderId\":\"p1\",\"targetId\":\"p2\"}";
        SignalingMessage msg4 = objectMapper.readValue(json4, SignalingMessage.class);
        assertEquals(MessageType.ICE_CANDIDATE, msg4.getType());
    }
}
