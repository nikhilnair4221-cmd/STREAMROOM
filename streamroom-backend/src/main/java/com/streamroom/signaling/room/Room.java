package com.streamroom.signaling.room;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * An in-memory room. Holds the set of currently connected peers and enforces
 * the target room size (2-6 users, per the product spec). Nothing here is
 * persisted - if the server restarts, all rooms are gone.
 */
public class Room {

    public static final int MAX_PEERS = 6;

    private final String roomId;
    private final Map<String, Peer> peers = new ConcurrentHashMap<>();

    public Room(String roomId) {
        this.roomId = roomId;
    }

    public String getRoomId() {
        return roomId;
    }

    public boolean isFull() {
        return peers.size() >= MAX_PEERS;
    }

    public boolean isEmpty() {
        return peers.isEmpty();
    }

    /** Returns false (and adds nothing) if the room is already full and this is a new peer. */
    public boolean addPeer(Peer peer) {
        if (!peers.containsKey(peer.getPeerId()) && isFull()) {
            return false;
        }
        peers.put(peer.getPeerId(), peer);
        return true;
    }

    public void removePeer(String peerId) {
        peers.remove(peerId);
    }

    public Peer getPeer(String peerId) {
        return peers.get(peerId);
    }

    public Collection<Peer> getPeers() {
        return peers.values();
    }

    /** Ids of every peer currently in the room. */
    public List<String> getPeerIds() {
        return List.copyOf(peers.keySet());
    }

    public Collection<Peer> getOtherPeers(String excludePeerId) {
        return Collections.unmodifiableList(
                peers.values().stream()
                        .filter(p -> !p.getPeerId().equals(excludePeerId))
                        .toList()
        );
    }
}
