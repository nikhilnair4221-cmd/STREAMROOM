package com.streamroom.signaling;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class StreamRoomApplicationTests {

    @Test
    void contextLoads() {
        // If the Spring context (WebSocketConfig, SignalingWebSocketHandler,
        // RoomRegistry, etc.) fails to wire up, this test fails.
    }
}
