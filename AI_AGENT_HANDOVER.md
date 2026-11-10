# StreamRoom AI Agent Handover

## 1. Project overview

StreamRoom is a small-group, browser-based communication room for friends and
small communities. The product direction is a private, lightweight “Living
Room”: a calm place to drop in, watch or play something together, and stay
connected without requiring a heavyweight social platform.

The current product supports temporary rooms with a maximum of six active
participants. The approved homepage copy is:

> Your corner of the internet.

> Watch something. Play something. Stay awhile.

The current implementation is a focused calling foundation, not yet the full
Living Room product. Persistent rooms, accounts, activities, privacy controls,
and application-level E2EE are not implemented.

## 2. Current technology stack

- React 18 with TypeScript.
- Vite frontend tooling.
- CSS in [`src/styles/app.css`](./src/styles/app.css); there is no component
  styling framework.
- Java 21 target with Spring Boot 3.3.4.
- Spring WebSocket signaling server.
- Native browser WebRTC for audio, camera video, and screen sharing.
- In-memory backend room and participant registry; no database or persistence
  layer is currently configured.
- Vercel hosts the frontend and Render hosts the backend in the current
  deployment architecture.

## 3. Current architecture

`src/App.tsx` switches between the lobby and active room. `useRoom` creates one
framework-independent `RoomSession` per joined room and cleans it up on leave,
page hide, and unmount.

`RoomSession` requests local media, creates a participant UUID, opens the
WebSocket, and maintains a full mesh of `RTCPeerConnection` instances. Media
travels directly between browsers; the backend only relays signaling. The
session supports ICE candidate buffering, reconnect behavior, perfect
negotiation, camera track replacement, screen-share renegotiation, and cleanup.

The backend `SignalingWebSocketHandler` validates message identifiers, admits
participants to an in-memory `Room`, binds each WebSocket session to its room
and peer identity, and routes JOIN, LEAVE, OFFER, ANSWER, and
ICE_CANDIDATE messages. `RoomRegistry` removes an empty room. This is transient
live-call state, not a durable room model.

`RoomView` composes the active stage, video tiles, controls, participant panel,
audio settings, invite link, join/leave notifications, and the cosmic
background. The homepage retains the cosmic animation, while active-room
surfaces are intentionally dark neutral with restrained emerald accents.

## 4. Important files

| File | Responsibility |
|---|---|
| [`src/App.tsx`](./src/App.tsx) | App shell; chooses lobby or room and handles join/leave. |
| [`src/hooks/useRoom.ts`](./src/hooks/useRoom.ts) | React bridge around one `RoomSession`. |
| [`src/webrtc/RoomSession.ts`](./src/webrtc/RoomSession.ts) | Media acquisition, peer connections, negotiation, ICE, camera, screen sharing, reconnect, cleanup. |
| [`src/webrtc/stats.ts`](./src/webrtc/stats.ts) | WebRTC connection-quality statistics. |
| [`src/signaling/SignalingClient.ts`](./src/signaling/SignalingClient.ts) | JSON WebSocket transport with reconnect backoff. |
| [`src/types/signaling.ts`](./src/types/signaling.ts) | Frontend signaling message and payload types. |
| [`src/components/Lobby.tsx`](./src/components/Lobby.tsx) | Homepage copy, room creation, room joining, display-name validation. |
| [`src/components/RoomView.tsx`](./src/components/RoomView.tsx) | Active-room composition, media tiles, panel, audio settings, invite link, toasts. |
| [`src/components/TopBar.tsx`](./src/components/TopBar.tsx) | Room code, audio settings, participant toggle, leave action. |
| [`src/components/Controls.tsx`](./src/components/Controls.tsx) | Microphone, camera, screen-share, and leave controls. |
| [`src/components/VideoTile.tsx`](./src/components/VideoTile.tsx) | Local/remote camera and screen tiles, placeholders, connection state. |
| [`src/components/ParticipantsPanel.tsx`](./src/components/ParticipantsPanel.tsx) | Participant list, media state, invite-link copy. |
| [`src/components/CosmicBackground.tsx`](./src/components/CosmicBackground.tsx) | Existing canvas/WebGL cosmic background animation. |
| [`src/components/LoadingIndicator.tsx`](./src/components/LoadingIndicator.tsx) | Loading and media-preparation state. |
| [`src/styles/app.css`](./src/styles/app.css) | Global tokens, lobby, room, responsive layout, and final visual overrides. |
| [`src/config.ts`](./src/config.ts) | Environment-driven signaling and ICE configuration. |
| [`streamroom-backend/src/main/java/com/streamroom/signaling/websocket/SignalingWebSocketHandler.java`](./streamroom-backend/src/main/java/com/streamroom/signaling/websocket/SignalingWebSocketHandler.java) | WebSocket message validation, room admission, routing, and cleanup. |
| [`streamroom-backend/src/main/java/com/streamroom/signaling/room/Room.java`](./streamroom-backend/src/main/java/com/streamroom/signaling/room/Room.java) | In-memory room with the six-peer limit. |
| [`streamroom-backend/src/main/java/com/streamroom/signaling/room/RoomRegistry.java`](./streamroom-backend/src/main/java/com/streamroom/signaling/room/RoomRegistry.java) | In-memory room lookup and empty-room cleanup. |
| [`streamroom-backend/src/main/java/com/streamroom/signaling/room/Peer.java`](./streamroom-backend/src/main/java/com/streamroom/signaling/room/Peer.java) | Backend participant/session state. |
| [`streamroom-backend/src/main/java/com/streamroom/signaling/model/SignalingMessage.java`](./streamroom-backend/src/main/java/com/streamroom/signaling/model/SignalingMessage.java) | Signaling message model. |
| [`streamroom-backend/src/main/java/com/streamroom/signaling/config/WebSocketConfig.java`](./streamroom-backend/src/main/java/com/streamroom/signaling/config/WebSocketConfig.java) | WebSocket endpoint and allowed-origin configuration. |
| [`streamroom-backend/src/test/`](./streamroom-backend/src/test/) | Backend signaling, routing, lifecycle, and model tests. |

## 5. Existing functionality and verification status

### Implemented

- Random room-code creation and normalized room-code joining.
- Invite URLs using `?room=...`.
- Display names stored locally and sent through JOIN.
- Participant discovery and participant count.
- Camera and microphone acquisition, toggling, and cleanup.
- Camera-off track release and camera reacquisition.
- Screen sharing through `getDisplayMedia()` with renegotiation and explicit
  unsupported/cancelled error states.
- Remote playback volume and local sound-effects toggle, persisted in
  `localStorage`.
- Participant panel and invite-link copy.
- Leave, reconnect, and rejoin behavior.
- Responsive desktop and mobile lobby/room layouts.
- Cosmic background animation with reduced motion support.

### Evidence boundaries

- Automated frontend validation: `npm test` is currently TypeScript
  type-checking only; it is not browser behavior coverage.
- Automated backend validation: `streamroom-backend/mvnw.cmd test`.
- Local browser smoke tests have verified room creation, joining, participant
  discovery, panel/audio controls, camera-off UI, and mobile overflow fixes.
- Physical camera, microphone, and screen capture quality are environment
  dependent. Do not claim hardware verification unless performed on the target
  device/browser.
- Cross-network TURN behavior and reliable six-person media quality remain
  unverified.

## 6. Design system

The visual language is minimal, dark, atmospheric, premium but approachable,
and cosmic. The homepage uses near-black/charcoal surfaces with restrained
emerald accents and the existing cosmic animation. The active room is more
neutral and subdued so video and participants remain primary.

Current design tokens are defined near the beginning of
[`src/styles/app.css`](./src/styles/app.css). Use the existing `--bg`,
`--surface-*`, `--text-*`, `--border-*`, `--accent-*`, and radius tokens rather
than introducing ad-hoc colors.

Homepage hierarchy:

1. `STREAMROOM` wordmark with logo mark.
2. Largest text: “Your corner of the internet.”
3. Supporting text: “Watch something. Play something. Stay awhile.”
4. Room creation/joining panel.

Desktop uses a two-column layout. Mobile stacks the atmospheric intro and room
panel, uses touch-sized controls, and presents the participant panel as a
bottom sheet. Avoid large green surfaces, neon effects, excessive glows,
generic dashboard styling, or typography that makes the supporting line look
like the hero.

The cosmic animation must be preserved. Respect `prefers-reduced-motion`.

## 7. Backend and signaling architecture

The WebSocket endpoint is `/ws/signaling`. Local clients connect to
`ws://localhost:10000/ws/signaling`; production uses the configured secure
WebSocket URL.

Message types are `JOIN`, `LEAVE`, `OFFER`, `ANSWER`, `ICE_CANDIDATE`, and
`ERROR`. JOIN is broadcast/acknowledged for room membership. OFFER, ANSWER,
and ICE_CANDIDATE are directed to a target peer. SDP and ICE payloads are
relayed; media is never sent through Spring.

Participant IDs are client-generated UUIDs. Room IDs and peer IDs are
validated against an alphanumeric/underscore/hyphen identifier pattern.
`Room.MAX_PEERS` is six. The registry is concurrent in-memory state and removes
rooms when their final live peer leaves.

Backend configuration is in
[`streamroom-backend/src/main/resources/application.yml`](./streamroom-backend/src/main/resources/application.yml).
The allowed origins are configured with `STREAMROOM_ALLOWED_ORIGINS`.

## 8. Environment and deployment

- Local frontend: [http://localhost:5173](http://localhost:5173)
- Local backend: [http://localhost:10000](http://localhost:10000)
- Production frontend: [https://streamroom-pearl.vercel.app](https://streamroom-pearl.vercel.app)
- Production backend: [https://steamroom-backend.onrender.com](https://steamroom-backend.onrender.com)
- Production WebSocket: `wss://steamroom-backend.onrender.com/ws/signaling`
- Current branch: `main`

Frontend environment variable names:

- `VITE_SIGNALING_URL`
- `VITE_STUN_URLS`
- `VITE_TURN_URLS`
- `VITE_TURN_USERNAME`
- `VITE_TURN_CREDENTIAL`

Backend environment variable names:

- `PORT`
- `STREAMROOM_ALLOWED_ORIGINS`

Never put actual credentials in `.env`, source, screenshots, logs, or this
document. `.env.example` contains names and safe local defaults only.

Run locally:

```powershell
npm install
npm run dev
cd streamroom-backend
.\mvnw.cmd spring-boot:run
```

Validate/build:

```powershell
npm test
npm run typecheck
npm run build
cd streamroom-backend
.\mvnw.cmd test
```

Vercel builds the frontend. Render runs the Spring Boot backend using the
backend Dockerfile and port configuration. Confirm the branch, environment
variables, deployment commit, and health/WebSocket behavior before any
deployment. Do not deploy without explicit approval.

## 9. Current known issues and limitations

- Production and local bundles previously differed; the deployed Vercel commit
  was not publicly verifiable during the local/production comparison.
- Rooms are ephemeral and have no durable owner, membership, invitation token,
  lock, or persistence model.
- A syntactically valid room code is currently sufficient to attempt joining;
  room codes are not authorization credentials.
- There is no authentication or abuse/rate-limit layer.
- No TURN server is configured by default. STUN/TURN are environment driven,
  but real cross-network TURN validation has not been completed.
- Screen sharing depends on browser and operating-system display-capture
  support and cannot be verified in every headless/browser environment.
- Mobile browsers may restrict camera, microphone, autoplay, screen sharing,
  viewport behavior, or background WebSocket activity.
- WebSocket origin checks are not room authorization.
- Signaling payloads and display-name policy need stronger server-side schema
  and size limits before public expansion.
- Backend logs include room/peer identifiers; retention and privacy policy are
  not yet defined.
- No database, persistent rooms, presence, activities, privacy dashboard,
  recording system, or application-level E2EE exists.
- WebRTC transport encryption is not application-level E2EE. Never label the
  current app as E2EE.

## 10. StreamRoom 2.0 roadmap

The existing implementation plan and review are the source of truth for
sequencing. The long-term Living Room roadmap includes:

### Living Room

- Persistent rooms and drop-in presence.
- Room themes and custom identities.
- Shared music queue and YouTube Watch Together.
- Mini-games, polls, soundboard, and whiteboard.

### Privacy

- Private rooms and secure invitation links.
- No recording by default with truthful UI.
- Privacy dashboard and automatic data deletion.
- One-Tap Privacy, Incognito Presence, Private Entry, and Room Lockdown.
- Application-level E2EE only after key-authentication, browser compatibility,
  downgrade behavior, and independent security review are designed.

None of these roadmap features should be described as implemented until the
backend, UI, tests, and operational behavior actually exist.

## 11. Architecture constraints

- Preserve React, TypeScript, Vite, Spring Boot, and the current WebSocket/WebRTC
  boundary.
- Keep signaling separate from media transport.
- Keep the six-person full-mesh limit unless a separately approved architecture
  decision changes it.
- Do not replace the current media architecture with an SFU for roadmap work.
- Do not rewrite working `RoomSession` logic without a demonstrated defect and
  regression coverage.
- Do not introduce unnecessary microservices.
- Do not expose secrets or commit deployment credentials.
- Do not claim E2EE without a real, reviewed implementation.
- Do not deploy to Vercel or Render without explicit approval.
- Preserve existing uncommitted work after inspecting it; never reset or clean
  the repository to make a task easier.

## 12. Next recommended tasks

1. Keep the current homepage and active-room visual system stable; add browser
   regression coverage for the key room journeys.
2. Freeze a baseline for signaling, media lifecycle, participant panel, audio
   settings, responsive layouts, and mobile overflow.
3. Define anonymous/device identity and secure room access before persistence.
4. Add durable room metadata and server-enforced invitations/room locking while
   keeping live signaling state separate.
5. Add presence and privacy controls, including private/camera-off entry and
   truthful privacy status.
6. Add themes and custom identities.
7. Add one activity protocol, then implement activities incrementally.
8. Research and independently review application-level E2EE before
   implementation.

## 13. Instructions for the next AI agent

1. Read this file first.
2. Read [`README.md`](./README.md).
3. Read [`STREAMROOM_2_IMPLEMENTATION_PLAN.md`](./STREAMROOM_2_IMPLEMENTATION_PLAN.md).
4. Read [`STREAMROOM_2_PLAN_REVIEW.md`](./STREAMROOM_2_PLAN_REVIEW.md).
5. Read [`STREAMROOM_LOCAL_VS_PRODUCTION.md`](./STREAMROOM_LOCAL_VS_PRODUCTION.md).
6. Run `git status` and inspect the full diff before changing anything.
7. Preserve existing uncommitted work and do not reset or clean the repository.
8. Verify the actual source, tests, configuration, and deployment state rather
   than trusting this document blindly.
9. Run the smallest relevant tests before and after each change, then run the
   broader validation required by the task.
10. Never expose or commit secrets.
11. Never deploy without explicit approval.
12. Update this handover whenever architecture, behavior, deployment, or known
    limitations materially change.
