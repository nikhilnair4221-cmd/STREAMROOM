package com.streamroom.signaling.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Wire format for every signaling message, in both directions.
 *
 * Fields are intentionally generic:
 *  - roomId / senderId / targetId identify participants and routing.
 *  - payload carries type-specific data (SDP for OFFER/ANSWER, ICE
 *    candidate fields for ICE_CANDIDATE, a peer-id array for JOIN).
 *
 * targetId is null for JOIN/LEAVE (those are broadcast to the room) and
 * required for OFFER/ANSWER/ICE_CANDIDATE (those are point-to-point).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SignalingMessage {

    private MessageType type;
    private String roomId;
    private String senderId;
    private String targetId;
    private JsonNode payload;
    private String displayName;
    private JsonNode peerNames;

    public SignalingMessage() {
        // required by Jackson for deserialization
    }

    public SignalingMessage(MessageType type, String roomId, String senderId, String targetId, JsonNode payload) {
        this.type = type;
        this.roomId = roomId;
        this.senderId = senderId;
        this.targetId = targetId;
        this.payload = payload;
    }

    public MessageType getType() {
        return type;
    }

    public void setType(MessageType type) {
        this.type = type;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getSenderId() {
        return senderId;
    }

    public void setSenderId(String senderId) {
        this.senderId = senderId;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String targetId) {
        this.targetId = targetId;
    }

    public JsonNode getPayload() {
        return payload;
    }

    public void setPayload(JsonNode payload) {
        this.payload = payload;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public JsonNode getPeerNames() {
        return peerNames;
    }

    public void setPeerNames(JsonNode peerNames) {
        this.peerNames = peerNames;
    }

    @Override
    public String toString() {
        return "SignalingMessage{" +
                "type=" + type +
                ", roomId='" + roomId + '\'' +
                ", senderId='" + senderId + '\'' +
                ", targetId='" + targetId + '\'' +
                '}';
    }
}
