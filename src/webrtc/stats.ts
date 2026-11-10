export interface WebRtcStats {
  timestamp: number;
  roundTripTimeMs: number | null;
  jitterMs: number | null;
  packetsLost: number;
  packetsReceived: number;
  packetsSent: number;
  bytesReceived: number;
  bytesSent: number;
  framesPerSecond: number | null;
  framesDropped: number;
  frameWidth: number | null;
  frameHeight: number | null;
  bitrateReceivedKbps: number | null;
  bitrateSentKbps: number | null;
  availableOutgoingBitrateKbps: number | null;
  packetLossRate: number | null;
}

interface NumericStats {
  timestamp: number;
  packetsLost: number;
  packetsReceived: number;
  packetsSent: number;
  bytesReceived: number;
  bytesSent: number;
}

export async function collectWebRtcStats(
  peerConnection: RTCPeerConnection,
  previous?: WebRtcStats,
): Promise<WebRtcStats> {
  const report = await peerConnection.getStats();
  const current: WebRtcStats = {
    timestamp: Date.now(),
    roundTripTimeMs: null,
    jitterMs: null,
    packetsLost: 0,
    packetsReceived: 0,
    packetsSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
    framesPerSecond: null,
    framesDropped: 0,
    frameWidth: null,
    frameHeight: null,
    bitrateReceivedKbps: null,
    bitrateSentKbps: null,
    availableOutgoingBitrateKbps: null,
    packetLossRate: null,
  };

  report.forEach((stat) => {
    if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && typeof stat.currentRoundTripTime === 'number') {
      current.roundTripTimeMs = stat.currentRoundTripTime * 1000;
      if (typeof stat.availableOutgoingBitrate === 'number') {
        current.availableOutgoingBitrateKbps = stat.availableOutgoingBitrate / 1000;
      }
    }
    if ((stat.type === 'inbound-rtp' || stat.type === 'remote-inbound-rtp') && typeof stat.jitter === 'number') {
      current.jitterMs = stat.jitter * 1000;
    }
    if (stat.type === 'inbound-rtp') {
      current.packetsLost += stat.packetsLost ?? 0;
      current.packetsReceived += stat.packetsReceived ?? 0;
      current.bytesReceived += stat.bytesReceived ?? 0;
      current.framesPerSecond = stat.framesPerSecond ?? current.framesPerSecond;
      current.framesDropped += stat.framesDropped ?? 0;
      current.frameWidth = stat.frameWidth ?? current.frameWidth;
      current.frameHeight = stat.frameHeight ?? current.frameHeight;
    }
    if (stat.type === 'outbound-rtp') {
      current.packetsSent += stat.packetsSent ?? 0;
      current.bytesSent += stat.bytesSent ?? 0;
      current.framesPerSecond = stat.framesPerSecond ?? current.framesPerSecond;
      current.frameWidth = stat.frameWidth ?? current.frameWidth;
      current.frameHeight = stat.frameHeight ?? current.frameHeight;
    }
  });

  if (previous) {
    const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;
    if (elapsedSeconds > 0) {
      current.bitrateReceivedKbps = ((current.bytesReceived - previous.bytesReceived) * 8) / elapsedSeconds / 1000;
      current.bitrateSentKbps = ((current.bytesSent - previous.bytesSent) * 8) / elapsedSeconds / 1000;
      const receivedDelta = current.packetsReceived - previous.packetsReceived;
      const lostDelta = current.packetsLost - previous.packetsLost;
      const packets = receivedDelta + lostDelta;
      current.packetLossRate = packets > 0 ? Math.max(0, lostDelta) / packets : null;
    }
  }
  return current;
}

export function summarizeWebRtcStats(stats: WebRtcStats): NumericStats {
  return {
    timestamp: stats.timestamp,
    packetsLost: stats.packetsLost,
    packetsReceived: stats.packetsReceived,
    packetsSent: stats.packetsSent,
    bytesReceived: stats.bytesReceived,
    bytesSent: stats.bytesSent,
  };
}
