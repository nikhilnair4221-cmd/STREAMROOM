# StreamRoom 2.0 Implementation Plan

## 1. Executive summary

StreamRoom is currently a focused six-person, browser-to-browser calling
application. The React/Vite frontend creates a `RoomSession` for each visit,
acquires local media, and uses a full-mesh of native `RTCPeerConnection`
instances. The Spring Boot backend is a signaling relay only: it keeps active
rooms and peers in memory, validates routing ownership for established
WebSocket sessions, and forwards JOIN, LEAVE, OFFER, ANSWER, and ICE messages.

The current implementation is a sound foundation for the product direction,
but it does not yet have a persistent room identity, owner, membership,
invitation, presence, activity, or retention model. A server restart destroys
all rooms. A room code is currently sufficient to attempt a join, and the
backend has no durable authorization decision behind it. The first evolution
should therefore be a modular monolith with PostgreSQL for durable metadata
and a separate in-memory/Redis-compatible presence and signaling layer. The
existing WebRTC full mesh and six-person limit should remain unchanged.

The recommended delivery order is:

1. Freeze a regression baseline and make the existing security boundary
   explicit.
2. Add durable rooms and anonymous/device identities without changing media
   negotiation.
3. Add server-enforced invitations, ownership, room locking, and rate limits.
4. Add presence and privacy controls.
5. Add themes and customisation.
6. Add activities one at a time behind an activity protocol.
7. Add the privacy dashboard and only then independently review and introduce
   application-level E2EE.

This plan is intentionally not an implementation. No source, dependency,
environment, database, or signaling behavior should be changed until the
open decisions in Section 14 are approved.

## 2. Existing architecture assessment

### 2.1 Verified architecture

| Area | Current implementation | Consequence for StreamRoom 2.0 |
|---|---|---|
| Frontend | React 18, TypeScript, Vite; `src/App.tsx` switches between `Lobby` and `RoomView`. | Preserve the current app shell and add route-level room/settings surfaces incrementally. |
| Room lifecycle | `src/hooks/useRoom.ts` owns one `RoomSession` and calls `leave()` on page hide/unmount. | Persistent room metadata must be separate from a transient call session. |
| Media | `src/webrtc/RoomSession.ts` acquires camera/microphone and manages camera, screen, ICE, renegotiation, reconnection, and peer state. | Do not mix activity or persistence state into `RoomSession`. |
| Transport | `src/signaling/SignalingClient.ts` and `RoomSession` use WebSocket for signaling only. | Keep media peer-to-peer and keep the signaling protocol versioned. |
| Topology | Full mesh, with `Room.MAX_PEERS = 6`. | Appropriate for the stated cap; no SFU is justified by this scope. |
| Backend | Spring Boot 3.3.4, Java 21, Spring WebSocket; no database starter or REST API is present. | Introduce application services and persistence before adding feature-specific handlers. |
| Active state | `RoomRegistry` stores `Room` instances in a `ConcurrentHashMap`; empty rooms are removed. | This is transient connection state, not a persistent room model. |
| Validation | `SignalingWebSocketHandler` validates identifier shape and verifies that a WebSocket session owns its current peer before directed signaling. | This is useful routing protection, but not room access control. |
| Configuration | `WebSocketConfig` reads `streamroom.allowed-origins`; local defaults include `*` as a code fallback and `application.yml` has explicit origins. | Production startup should fail closed on missing/unsafe origin configuration. |
| Tests | Backend unit tests cover join, routing, cleanup, invalid identifiers, impersonation, disconnects, and reconnect capacity. Frontend `npm test` is typecheck only. | Add browser and persistence/security tests before changing behavior. |

### 2.2 Current room and media lifecycle

1. `Lobby` accepts a client-entered or locally generated room code and a
   display name. It stores the display name in `localStorage`.
2. `App` calls `useRoom().join(roomId, displayName)`.
3. `RoomSession.start()` requests camera and microphone before opening the
   WebSocket.
4. A client-generated UUID becomes the participant ID.
5. The client sends JOIN. The server creates an in-memory room, admits up to
   six peers, and returns existing peer IDs and names.
6. New peers create full-mesh WebRTC connections. SDP and ICE are routed by
   the server; audio, video, and screen content do not pass through it.
7. Explicit LEAVE, page hide, WebSocket close, and transport errors clean up
   the peer. The server removes the room when its last active peer leaves.

Persistent room configuration must not be coupled to step 7. A durable room
must remain after its last active connection leaves, while the `RoomRegistry`
or a successor continues to represent only live signaling sessions.

## 3. Existing functionality inventory

### Confirmed functionality

- Create a random room code in `Lobby.startRoom()`.
- Join a normalized room code from the form or `?room=...` query parameter.
- Validate identifiers and display-name length on the client and again,
  partially, on the server.
- Camera and microphone acquisition, toggling, and cleanup.
- Screen sharing through `getDisplayMedia()` and renegotiation.
- Participant discovery and display names.
- Full-mesh peer connections for a maximum of six active peers.
- ICE candidate buffering and reconnect behavior in `RoomSession`.
- Join/leave notifications and room cleanup.
- Environment-driven STUN/TURN configuration.
- Explicit WebSocket origin configuration.
- Backend tests for signaling authorization and lifecycle behavior.

### Not present or not yet verified

- Durable rooms or room owners.
- Authentication, anonymous account/device identity, or membership records.
- Secure invitation tokens, expiry, revocation, or passwords.
- Backend REST/API layer for room management.
- Presence states, custom status, incognito presence, or stale-presence jobs.
- Persistent themes, participant avatars, or participant colors.
- Shared music, YouTube synchronization, games, polls, soundboard, or
  whiteboard.
- Application-level E2EE. WebRTC's transport encryption is not application
  E2EE.
- Server-side recording is not implemented, but there is no user-facing
  privacy dashboard or explicit retention disclosure.
- Automated frontend behavior tests or Playwright coverage.
- Cross-device TURN validation and six-person media-quality validation.

## 4. Technical debt and known limitations

1. **Room existence is ephemeral.** `RoomRegistry` deletes the last empty
   room, so a restart or final departure loses all room identity.
2. **Room codes are not access credentials.** `Lobby` treats a code as enough
   to join, and `handleJoin()` creates any syntactically valid room. This is
   incompatible with invite-only persistent rooms.
3. **Client identity is transient.** `RoomSession` generates a UUID per
   browser session. It cannot represent ownership or durable membership.
4. **No message size/schema limits are visible.** `SignalingMessage.payload`
   is generic `JsonNode`; SDP/ICE payloads should have explicit maximum sizes
   and type validation before public exposure.
5. **Display-name validation is inconsistent.** The client rejects angle
   brackets, while the server trims and truncates but does not apply the same
   policy. Rendering is currently React-safe, but all future activity text
   must remain escaped.
6. **Origin configuration can fail open.** `WebSocketConfig` has a `*`
   fallback even though deployment configuration is documented separately.
7. **No abuse controls are present.** There is no connection, JOIN, malformed
   message, or repeated failed-access rate limit.
8. **Logging includes identifiers.** INFO/DEBUG logs include room and peer
   identifiers. These are not media, but retention and correlation policy
   should be defined before public operation.
9. **Frontend test coverage is inadequate for regression protection.** The
   configured `npm test` runs TypeScript typechecking only.
10. **Persistence and signaling are not separated by an explicit service
    boundary.** Adding features directly to `SignalingWebSocketHandler` would
    create a large, authorization-sensitive handler.

## 5. Security audit

Severity reflects the current implementation and deployment assumptions, not
the proposed future design.

| Severity | Location | Finding and risk | Recommended remediation |
|---|---|---|---|
| **High** | `RoomRegistry.getOrCreateRoom()`; `SignalingWebSocketHandler.handleJoin()` | Any party that guesses or obtains a valid-format room code can create or join it. There is no owner, invitation, membership, password, lock, or backend access decision. | Persist room access policy and require a server-validated invitation/session credential before admitting a JOIN. Keep the six-peer check after authorization. |
| **High** | `WebSocketConfig` and `application.yml` | The Java configuration defaults `allowed-origins` to `*`. A deployment that omits configuration can accept cross-origin WebSocket handshakes. Origin checks are not a complete authorization mechanism. | Remove the permissive production default, validate origins at startup, and treat Origin as defense in depth alongside invitation authorization. |
| **Medium** | `SignalingWebSocketHandler.handleTextMessage()` and `SignalingMessage.payload` | JSON fields are checked for presence and identifier shape, but message size, payload shape, SDP size, ICE fields, and unexpected fields are not bounded. This enables resource exhaustion and makes protocol evolution unsafe. | Add WebSocket message-size limits, per-message schemas, payload caps, protocol versions, and rate limits. Reject malformed payloads explicitly. |
| **Medium** | `handleJoin()` and client-supplied `senderId` | The server binds a sender ID to a session after JOIN, which blocks post-join impersonation, but the initial identity is entirely client-selected and not tied to an authenticated or invitation-bound identity. | Issue a server-side participant/session identity after access validation and bind it to the invitation/member record. |
| **Medium** | `normalizeDisplayName()` and future activity payloads | Server-side display-name normalization does not match the client's angle-bracket check. React currently escapes text, but future HTML-capable rendering could turn inconsistent validation into XSS. | Treat all user content as text, validate length/control characters server-side, and never inject activity content with `innerHTML`. Add XSS regression tests. |
| **Medium** | `SignalingWebSocketHandler` | There is no rate limit on connection attempts, JOIN attempts, malformed messages, or directed signaling. A public endpoint can be abused for resource exhaustion or room enumeration. | Add IP/device-aware throttling, bounded concurrent connections, failed-join backoff, and observability without logging sensitive payloads. |
| **Low** | `application.yml` logging and handler logs | Room IDs, peer IDs, and connection lifecycle details are logged. This can create unnecessary operational metadata and facilitate correlation. | Define structured log fields, retention, access control, and redaction. Avoid logging SDP, ICE credentials, invitation tokens, or status messages. |
| **Low** | `src/config.ts` and deployment configuration | STUN/TURN values are exposed to the browser by design; TURN credentials are therefore bearer credentials with limited scope and lifetime, not secrets suitable for long-term static use. | Use short-lived, scoped TURN credentials in production and document that browser-delivered ICE configuration is observable. |
| **Informational** | `RoomSession` and WebRTC | Browser WebRTC uses DTLS-SRTP, but this is not proof of application-level E2EE against a trusted signaling/server infrastructure or compromised endpoints. | Do not label the UI “End-to-End Encrypted” until an independently reviewed encoded-transform/key-management design is active and verified. |

### Security boundaries that should be preserved

- The server must never accept client claims of room ownership, membership,
  encryption state, recording state, or participant status as authoritative.
- Signaling authorization must be checked before forwarding OFFER, ANSWER, or
  ICE messages.
- Media must remain peer-to-peer and no audio/video storage should be added to
  PostgreSQL.
- Invitation tokens must be random, single-purpose or explicitly scoped,
  hashed at rest, shown only in controlled responses, and revocable.
- External screen recording cannot be prevented by browser code. Product
  language must distinguish no server recording, no built-in recording, and
  recording by an external device.

## 6. Proposed architecture

Use a modular Spring Boot monolith and a modular React client. Modules should
have explicit service boundaries without introducing microservices.

### 6.1 Backend boundaries

```text
HTTP API
  Room Management -> Room repository, settings, owner policy
  Access Control  -> invitation/password/member validation
  Presence        -> current sessions, heartbeat, expiry
  Activity        -> versioned activity state and authorization
  Privacy         -> retention and privacy-status projection

WebSocket adapter
  Signaling       -> transient RoomRegistry / live peer sessions
  Presence events -> Presence service
  Activity events -> Activity service

Persistence
  PostgreSQL      -> durable metadata and activity snapshots
  Redis (optional)-> distributed presence/rate limits only
```

Recommended packages under
`streamroom-backend/src/main/java/com/streamroom/signaling/`:

- `room`: `RoomController`, `RoomService`, room DTOs, repository interfaces.
- `access`: invitation issuance/validation/revocation, password verification,
  membership policy, rate limiting decisions.
- `presence`: heartbeat, status transitions, stale-session cleanup.
- `activity`: activity registry, per-activity authorization, event/version
  handling.
- `privacy`: retention policy and privacy-status projections.
- `signaling`: the existing WebSocket adapter and transient peer registry.
- `persistence`: JPA/JDBC entities and migrations, kept behind repositories.
- `security`: token hashing, secure random generation, authentication filters.

`SignalingWebSocketHandler` should become an adapter that delegates admission,
authorization, and activity/presence operations to services. It should not
contain database transactions or feature-specific business rules.

### 6.2 Frontend boundaries

Keep the current `App`, `Lobby`, `RoomView`, and `RoomSession` responsibilities
and add:

- `src/room/`: durable room API client, room settings, access state.
- `src/presence/`: status model, heartbeat, incognito behavior.
- `src/activities/`: activity registry, common activity shell, versioned state
  synchronization; one component/module per activity.
- `src/atmosphere/`: theme metadata, animated background, ambient audio opt-in.
- `src/privacy/`: privacy dashboard and one-tap media controls.
- `src/api/`: typed HTTP client and response/error handling.
- `src/types/`: shared domain and protocol types, separated from WebRTC types.

`RoomSession` should continue to own only local media, peer connections,
signaling connection state, and media-derived status. A room controller or
React context can compose it with presence, activities, atmosphere, and
privacy state.

## 7. Database schema proposal

PostgreSQL is appropriate for durable room metadata, ownership, invitations,
settings, and activity snapshots. Do not store media, SDP, ICE candidates,
recordings, or screen content in PostgreSQL.

### Core tables

```text
identities
  id UUID primary key
  kind anonymous|device
  created_at, last_seen_at
  revoked_at nullable

rooms
  id UUID primary key
  public_code_hash or opaque slug
  owner_identity_id nullable
  name nullable
  locked boolean not null
  deleted_at nullable
  created_at, updated_at

room_memberships
  room_id, identity_id
  role owner|member
  display_name_override nullable
  incognito_default boolean
  created_at, last_joined_at, revoked_at
  primary key (room_id, identity_id)

invitations
  id UUID primary key
  room_id
  token_hash unique
  created_by_identity_id
  expires_at nullable
  revoked_at nullable
  max_uses nullable
  uses
  created_at

room_settings
  room_id primary key
  theme_key
  ambient_audio_enabled
  retention_days
  password_hash nullable
  updated_at

activity_snapshots
  id UUID primary key
  room_id
  activity_type
  state_json
  version bigint
  expires_at nullable
  updated_by_identity_id
  updated_at
```

Temporary `live_sessions` data should be held in memory for a single
instance, or Redis when horizontal scaling is required:

```text
live_sessions
  session_id
  room_id
  identity_id
  participant_id
  status
  last_heartbeat_at
  expires_at
```

For the first deployment, anonymous/device identities are preferable to
requiring email accounts. A signed, revocable device credential can support
room ownership while avoiding unnecessary personal data. This decision still
requires approval, especially for ownership recovery across devices.

Use migrations, foreign keys, unique constraints, indexes on room and expiry
columns, and soft deletion only where it supports the configured retention
policy. A scheduled cleanup job should permanently remove expired invitations,
temporary activity snapshots, stale sessions, and deleted-room metadata
according to the approved retention policy.

## 8. Privacy and threat model

### Assets

- Room membership and invitation capability.
- Participant identity/status metadata.
- Camera, microphone, and screen content while in use.
- Activity state and private room customization.
- Invitation tokens and optional room password verifiers.

### Threats

- Guessing or enumerating room identifiers.
- Replaying, leaking, or brute-forcing invitation tokens.
- Unauthorized signaling into an active room.
- A malicious participant attempting to impersonate another participant.
- XSS through names, prompts, whiteboard labels, or activity content.
- Resource exhaustion through WebSocket connections/messages.
- Token or metadata leakage through logs, URLs, browser history, or analytics.
- Stale presence incorrectly exposing that someone is online.
- Misleading claims about recording or encryption.
- Endpoint compromise or external recording, which browser code cannot fully
  prevent.

### Required controls

- Use high-entropy opaque room IDs and separate invitation tokens.
- Hash invitation tokens at rest; compare using constant-time-safe mechanisms.
- Expire and revoke invitations; do not put reusable bearer tokens in logs.
- Enforce membership and room lock state server-side before JOIN and every
  non-signaling room operation.
- Rate limit by source and identity, with bounded payloads and connection
  counts.
- Escape all user text and use strict Content Security Policy where feasible.
- Provide accurate privacy state from server/client facts, not marketing
  labels.
- Keep media server-free by default and document endpoint limitations.

### Application-level E2EE assessment

E2EE should be a separate security project, not an ordinary activity feature.
The design must specify authenticated participant identity, key generation,
join-time distribution, late-arrival handling, member removal and rekeying,
rotation, replay protection, browser compatibility, and failure behavior.
WebRTC Encoded Transform support should be capability-detected and tested
against the supported browser matrix. A room must show “application E2EE
active” only after the actual transform and key state are verified.

The six-person full mesh makes per-peer key distribution feasible, but it does
not remove endpoint trust, compromise, or identity-authentication problems.
Require an independent security review and interoperability test before
enabling this by default.

## 9. Implementation roadmap

### Phase 0 — Audit and regression baseline

- **Objective:** Freeze current behavior and establish measurable security and
  media baselines.
- **Dependencies:** None.
- **Frontend:** Add Playwright coverage for lobby, join failure, media-control
  state, leave/rejoin, and invite-query handling; no product behavior change.
- **Backend:** Expand tests for malformed messages, payload limits, origin
  policy, six-peer admission, reconnect races, and directed-message ownership.
- **Database:** None.
- **Security:** Document current WebRTC encryption accurately; remove no
  existing behavior yet.
- **Likely files:** `src/App.tsx`, `src/components/Lobby.tsx`,
  `src/hooks/useRoom.ts`, `src/webrtc/RoomSession.ts`, backend handler/tests,
  and test configuration.
- **Tests/completion:** Existing typecheck, build, Maven tests, browser smoke
  tests, and documented two-device/TURN manual gaps all pass.
- **Risks:** Existing dirty worktree changes may make baseline comparison
  difficult; capture the baseline without reverting user changes.
- **Complexity:** Medium.

### Phase 1 — Database foundation and persistent rooms

- **Objective:** Create durable room identity/configuration while preserving
  transient signaling rooms.
- **Dependencies:** Phase 0; approval of anonymous/device identity model.
- **Frontend:** Add typed room-create/load API and durable room links; retain
  current join path during migration.
- **Backend:** Add room service/controller, repositories, migrations, room
  ownership metadata, and a mapping from durable room to live `RoomRegistry`.
- **Database:** `identities`, `rooms`, `room_memberships`, `room_settings`.
- **Security:** Opaque identifiers, ownership checks, soft deletion, and no
  client-authoritative owner fields.
- **Tests/completion:** A room and theme/settings survive backend restart;
  active WebRTC signaling still behaves exactly as before; room deletion is
  owner-only.
- **Risks:** Mixing durable and active room lifecycles; migration rollback.
- **Complexity:** High.

### Phase 2 — Secure access, ownership, and invitations

- **Objective:** Replace code-only admission with server-enforced invite access.
- **Dependencies:** Phase 1.
- **Frontend:** Invite creation/revocation UI, invitation-aware lobby, room
  lock state, optional password prompt, and clear denial errors.
- **Backend:** Invitation service, hashed random tokens, expiry/revocation,
  membership authorization, password verification, lock enforcement, and
  rate limiting.
- **Database:** `invitations`, membership revocation fields, access policy
  fields.
- **Security:** Protect against token replay, enumeration, brute force, and
  unauthorized signaling.
- **Tests/completion:** Expired/revoked/invalid invitations fail; locked rooms
  reject newcomers but keep current peers; owner operations are enforced
  independently of the frontend.
- **Risks:** Token leakage via URLs and browser history; define whether links
  are single-use or reusable.
- **Complexity:** High.

### Phase 3 — Presence and drop-in functionality

- **Objective:** Add accurate, privacy-preserving presence.
- **Dependencies:** Phase 2.
- **Frontend:** Online/offline/away/in-room states, custom status, incognito
  toggle, private entry, and camera-off entry.
- **Backend:** Heartbeats, disconnect handling, stale-session expiry,
  presence authorization, and event fan-out.
- **Database:** Durable preferences only; transient presence in memory first,
  Redis when multiple instances are deployed.
- **Security:** Do not expose incognito participants; expire stale records and
  minimize metadata.
- **Tests/completion:** Heartbeat expiry, browser close, network loss, away
  transitions, and incognito visibility are deterministic.
- **Risks:** Presence race conditions and false “online” states.
- **Complexity:** Medium-high.

### Phase 4 — Privacy controls and retention

- **Objective:** Make privacy controls and deletion behavior explicit.
- **Dependencies:** Phases 1–3.
- **Frontend:** One-tap stop for camera/mic/screen, privacy disclosures,
  retention settings for owners, and deletion confirmation.
- **Backend:** Retention policy service, scheduled cleanup, room/member/
  invitation deletion, and audit-safe operational events.
- **Database:** Retention fields and expiry indexes; no media tables.
- **Security:** Verify deletion scope and prevent claims that external
  recording is blocked.
- **Tests/completion:** Persistent settings survive an empty room; temporary
  activity and expired invitations are deleted; room deletion removes all
  associated metadata according to policy.
- **Risks:** Irreversible deletion and legal/operational retention needs.
- **Complexity:** Medium-high.

### Phase 5 — Atmosphere and customisation

- **Objective:** Add cohesive, persistent living-room appearance.
- **Dependencies:** Phase 1 and approved theme asset/license review.
- **Frontend:** Deep Space, Rainy Night, Cozy Apartment, Cyberpunk City, and
  Forest at Night themes; respect the existing dark emerald/cosmic identity;
  opt-in ambient audio and reduced-motion behavior.
- **Backend:** Validate theme keys and persist room settings.
- **Database:** Existing `room_settings`; participant color/avatar preferences
  only if approved.
- **Security:** Treat asset URLs and custom labels as untrusted input; avoid
  third-party tracking in ambient media.
- **Tests/completion:** Theme persistence, fallback, reduced motion, audio
  opt-in, and accessibility checks pass.
- **Risks:** Asset size/performance and visual drift from the current product.
- **Complexity:** Medium.

### Phase 6 — Shared music queue

- **Objective:** Deliver the first independent shared activity.
- **Dependencies:** Phase 2 access control, Phase 3 presence, Phase 4
  retention policy.
- **Frontend:** Queue view, participant attribution, playback controls,
  late-join state hydration, and local-device playback handling.
- **Backend:** Activity authorization, versioned queue events, conflict
  resolution, and expiry.
- **Database:** Activity snapshot metadata/state; no copyrighted media storage.
- **Security:** Validate URLs/provider identifiers and rate limit edits.
- **Tests/completion:** Concurrent add/remove/reorder, playback convergence,
  reconnect, and late join behavior pass.
- **Risks:** Browser autoplay restrictions and provider licensing.
- **Complexity:** Medium-high.

### Phase 7 — YouTube Watch Together

- **Objective:** Synchronize shared video intent without proxying media.
- **Dependencies:** Phase 6 activity protocol.
- **Frontend:** Video ID validation, play/pause/seek state, drift correction,
  late-join hydration, and provider error handling.
- **Backend:** Versioned playback commands and moderator/participant policy.
- **Database:** Current video metadata and playback snapshot with expiry.
- **Security:** Reject arbitrary embed URLs and enforce YouTube allowlisting;
  do not claim control over external recording or ads.
- **Tests/completion:** Simultaneous commands, reconnect, late join, invalid
  IDs, and autoplay-denied browsers behave predictably.
- **Risks:** YouTube API/embed policy, autoplay, and clock drift.
- **Complexity:** High.

### Phase 8 — Mini-games and quick social activities

- **Objective:** Add modular chess, trivia, word, drawing prompts, polls, and
  would-you-rather activities.
- **Dependencies:** Common activity protocol and access rules.
- **Frontend:** Separate activity modules under `src/activities/`, each with
  schema, reducer, view, and lifecycle.
- **Backend:** Activity registry, per-game validation, turn/version handling,
  expiration, and authorization.
- **Database:** Activity snapshots and minimal results only where explicitly
  retained.
- **Security:** Server-validate moves, answers, and participant permissions;
  avoid arbitrary code or HTML in prompts.
- **Tests/completion:** Each activity can be created, joined, synchronized,
  reset, expired, and recovered independently.
- **Risks:** Scope expansion; ship one or two activities before the full set.
- **Complexity:** High and variable.

### Phase 9 — Privacy dashboard and application-level E2EE

- **Objective:** Expose truthful privacy state and, only if approved, add
  reviewed application-level E2EE.
- **Dependencies:** Stable access identity model, browser capability matrix,
  independent cryptographic design and review.
- **Frontend:** Dashboard for camera/mic/screen status, room access, recording
  status, retention, and verified encryption state.
- **Backend:** Key-session signaling only as designed; never persist plaintext
  keys or media; add capability and session-state telemetry without secrets.
- **Database:** No media or plaintext key storage.
- **Security:** Threat model, key rotation/revocation, late arrivals, removed
  members, downgrade handling, and independent review are mandatory.
- **Tests/completion:** Encryption indicator is unavailable unless transforms
  and key state are verified; multi-browser interoperability and removal/rekey
  tests pass; review findings are resolved.
- **Risks:** Cryptographic design and browser support; do not ship a
  superficial scheme.
- **Complexity:** Very high.

### Phase 10 — Whiteboard, soundboard, and polish

- **Objective:** Complete collaborative social tooling after the protocol is
  proven.
- **Dependencies:** Activity protocol, retention, abuse controls, and Phase 9
  decisions.
- **Frontend:** CRDT or operation-based whiteboard, shared sound triggers,
  volume controls, accessibility, and performance polish.
- **Backend:** Bounded drawing operations, reset/version handling, sound
  allowlist, and expiry.
- **Database:** Optional short-lived snapshots; no uploaded media by default.
- **Security:** Validate operation counts and sound identifiers; prevent
  untrusted uploads and abuse.
- **Tests/completion:** Concurrent drawing, reset, reconnect, sound rate
  limits, accessibility, and six-person performance pass.
- **Risks:** Bandwidth, state growth, and moderation/asset licensing.
- **Complexity:** High.

## 10. Testing strategy

### Unit and component tests

- Validate room IDs, invitation states, display names, theme keys, activity
  schemas, and retention calculations.
- Test `RoomSession` media state transitions with mocked media tracks and
  peer connections.
- Test presence reducers, heartbeat expiry, incognito filtering, and activity
  reducers with concurrent event orderings.
- Test backend token hashing, expiry, revocation, membership roles, lock
  policy, rate-limit decisions, and cleanup jobs.

### Backend integration tests

- Use a real test application context and PostgreSQL test database/migrations
  for room creation, restart recovery, ownership, invitations, deletion, and
  retention.
- Exercise WebSocket JOIN only after access validation and verify directed
  signaling cannot cross rooms or memberships.
- Test six-peer admission, reconnect replacement, stale session cleanup,
  malformed/oversized frames, origin policy, and rate limits.

### Browser and Playwright tests

- Lobby create/join, invite query handling, invalid code, denied access,
  room lock, private entry, camera/mic/screen controls, leave/rejoin,
  reconnect, and privacy dashboard truthfulness.
- Theme persistence and reduced motion.
- Music/watch-together late join and reconnect.
- Activity authorization and synchronization with two or more browser
  contexts.
- Keep browser media permission fixtures deterministic; mark real-device
  media tests separately.

### Security tests

- Token entropy/replay/expiry/revocation and URL/log redaction.
- XSS payloads in display names, statuses, prompts, whiteboard metadata, and
  activity labels.
- Origin, CSWSH, unauthorized signaling, cross-room targeting, room
  enumeration, brute force, rate limiting, and payload-size tests.
- Dependency audit as part of CI; do not treat a clean dependency audit as a
  substitute for application security review.

### Manual and cross-device tests

- Two physical devices on genuinely different networks with production-like
  TURN credentials.
- Three through six participants with camera, microphone, screen share,
  reconnect, CPU, bandwidth, and audible echo assessment.
- Browser matrix for media permissions, autoplay, screen capture, reduced
  motion, and Encoded Transform capability.
- External recording limitation and privacy disclosure review.

## 11. Deployment considerations

- Use managed PostgreSQL with encrypted connections, migrations, backups, and
  a documented deletion/restore policy.
- Keep WebSocket signaling stateless at the application layer where possible;
  use sticky sessions or shared Redis presence/rate-limit state if scaling
  beyond one instance.
- Configure exact HTTPS frontend origins; fail startup for wildcard origins in
  production.
- Use secure, HttpOnly, SameSite-appropriate cookies or short-lived device
  credentials; do not place durable secrets in localStorage.
- Use short-lived TURN credentials and rotate deployment secrets.
- Add metrics for active peers, join denials, rate-limit events, signaling
  errors, presence expiry, activity versions, and WebRTC quality without
  collecting media or raw SDP/ICE unnecessarily.
- Set CSP, secure headers, WebSocket origin policy, request/frame size limits,
  and bounded thread/executor resources.
- Review all theme/activity assets and third-party embeds for licensing,
  privacy, and supply-chain risk.

## 12. Estimated complexity summary

| Phase | Estimate | Main uncertainty |
|---|---:|---|
| 0. Baseline | Medium | Existing uncommitted changes and browser-test setup |
| 1. Persistence | High | Identity/ownership recovery and migration strategy |
| 2. Access control | High | Invitation semantics, password policy, rate limiting |
| 3. Presence | Medium-high | Stale-session and multi-instance behavior |
| 4. Privacy/retention | Medium-high | Deletion guarantees and policy approval |
| 5. Atmosphere | Medium | Assets, performance, accessibility |
| 6. Music queue | Medium-high | Playback/autoplay and licensing |
| 7. Watch together | High | Provider policy and clock/autoplay behavior |
| 8. Activities | High | Number of games and authoritative state complexity |
| 9. E2EE/dashboard | Very high | Cryptographic review and browser support |
| 10. Whiteboard/soundboard | High | State growth, abuse controls, and assets |

These are relative engineering estimates, not calendar promises. Phase 9
should not be scheduled as ordinary feature work until its design review is
approved.

## 13. Open technical decisions

Approval is required before implementation begins on the affected phase.

1. **Identity model:** anonymous device credential, optional account, or both?
   How can an owner recover a room on another device?
2. **Invitation semantics:** reusable expiring links, single-use links, or
   both? Should an invite be bound to a member/device?
3. **Room identifier policy:** opaque UUID-like room IDs, short public codes
   backed by a secret invite, or a two-part room/link design?
4. **Persistence deployment:** PostgreSQL only for the first release, and when
   should Redis be introduced for multi-instance presence/rate limits?
5. **Room ownership:** can ownership be transferred, and what happens when an
   anonymous owner loses their device credential?
6. **Password policy:** optional room password, invitation-only without
   passwords, or both? Choose a password hashing and reset policy.
7. **Presence privacy:** which statuses are visible to whom, and what does
   incognito hide from room members versus the owner?
8. **Activity permissions:** can everyone control playback and activities, or
   can owners/moderators restrict controls?
9. **Retention:** default and maximum retention for activity state, statuses,
   invitations, and deleted rooms.
10. **Theme/audio assets:** first-party assets only, and is ambient audio
    enabled by explicit user opt-in?
11. **E2EE scope:** whether to pursue application-level E2EE now, which
    browsers are supported, and who performs the independent security review.
12. **Testing gate:** which browser/device matrix and TURN environment are
    required before production rollout?

## 14. Recommended approval gate

Approve Phase 0 first and do not begin Phase 1 until the following are
accepted:

- The existing room/signaling behavior is captured by automated regression
  tests.
- The anonymous/device identity and ownership recovery model is selected.
- Invitation URL/token semantics and retention defaults are specified.
- Production origin, rate-limit, logging, and deletion requirements are
  agreed.
- E2EE is explicitly treated as a later security-reviewed milestone rather
  than implied by existing WebRTC transport encryption.
