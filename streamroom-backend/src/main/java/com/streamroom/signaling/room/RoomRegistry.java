package com.streamroom.signaling.room;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Holds every currently-active room in memory. A room is created lazily the
 * first time a peer joins it, and removed once its last peer leaves.
 *
 * This is intentionally simple (no persistence, no distributed state) -
 * that's explicitly out of scope until PostgreSQL/Redis are introduced later.
 */
@Component
public class RoomRegistry {

    private static final Logger log = LoggerFactory.getLogger(RoomRegistry.class);

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    public Room getOrCreateRoom(String roomId) {
        return rooms.computeIfAbsent(roomId, id -> {
            log.info("Creating room '{}'", id);
            return new Room(id);
        });
    }

    public Room getRoom(String roomId) {
        return rooms.get(roomId);
    }

    /** Removes the room if it exists and has no peers left in it. */
    public void removeRoomIfEmpty(String roomId) {
        rooms.computeIfPresent(roomId, (id, room) -> {
            if (room.isEmpty()) {
                log.info("Removing empty room '{}'", id);
                return null; // removes the mapping
            }
            return room;
        });
    }

    public int activeRoomCount() {
        return rooms.size();
    }
}
