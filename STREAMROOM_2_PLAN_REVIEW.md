# StreamRoom 2.0 Implementation Plan Review

**Reviewed:** 2026-11-10
**Plan reviewed:** [STREAMROOM_2_IMPLEMENTATION_PLAN.md](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/STREAMROOM_2_IMPLEMENTATION_PLAN.md)

## Executive assessment

The implementation plan is directionally strong and correctly avoids rewriting
the functioning React/WebRTC/Spring signaling foundation. It accurately
identifies that the current `RoomRegistry` is transient, that room codes are
not access authorization, and that WebRTC DTLS-SRTP must not be advertised as
application-level E2EE.

The plan is safe as an architecture document, but it should be tightened
before implementation. It under-specifies preservation of current UI/media
behavior, especially the local audio-settings surface, participant panel,
cosmic background animation, camera-off entry, and media permission fallback.
It also places some user-visible privacy controls too late: one-tap privacy,
private entry, and truthful privacy status should be delivered before the
activity modules, not after them.

The plan should remain unchanged until the owner approves the revised ordering
and decisions in this review.

## What the repository currently proves

- `src/App.tsx` composes `Lobby`, `RoomView`, and `useRoom`.
- `src/hooks/useRoom.ts` owns one transient `RoomSession` and performs page
  hide/unmount cleanup.
- `src/webrtc/RoomSession.ts` owns browser media, peer connections,
  renegotiation, ICE buffering, reconnect behavior, camera toggling, and
  screen sharing.
- `SignalingWebSocketHandler` validates identifier shape and binds directed
  signaling to the current WebSocket session.
- `RoomRegistry` and `Room` are in-memory and remove a room after the last peer
  leaves.
- The backend has no persistence, REST room-management API, invitation model,
  membership model, presence service, or activity protocol.
- Existing backend tests cover signaling routing, impersonation, cleanup,
  reconnect capacity, and invalid identifiers.
- The current frontend canonical test is `npm test`, which only invokes
  `tsc --noEmit`.

The current local working tree also contains uncommitted UI and WebRTC
changes. The deployed Vercel application serves a different bundle and older
lobby/room surfaces, so the plan should treat deployment parity as a Phase 0
release concern.

## Requirement coverage review

| Area | Assessment | Required adjustment |
|---|---|---|
| Persistent rooms | Covered well | Define migration compatibility for existing room-code links and owner recovery. |
| Drop-in presence | Covered | Specify heartbeat cadence, away detection, privacy visibility, and stale-session semantics. |
| Themes/atmosphere | Covered | Explicitly preserve the current cosmic background, reduced-motion behavior, and ambient-audio opt-in. |
| Personal identities | Partially covered | Select anonymous device identity versus optional account before Phase 1; define temporary room identity and cross-device recovery. |
| Music queue | Covered | Add browser autoplay and provider/licensing constraints to acceptance criteria. |
| Watch Together | Covered | Define provider allowlist, clock/drift policy, and late-join state authority. |
| Mini-games | Covered | Limit first release to one or two server-authoritative activities; avoid planning all games as one delivery. |
| Polls/prompts | Covered indirectly | Add explicit activity schema, expiration, and result-retention requirements. |
| Soundboard | Covered late | Define first-party asset allowlist and participant rate limits. |
| Whiteboard | Covered late | Choose operation log/CRDT approach and enforce bounded state growth. |
| Secure invitations | Covered well | Add token leakage controls for URLs, browser history, referrers, and logs. |
| No recording | Covered conceptually | Add product copy and automated assertions that no recording indicator is shown unless a real recorder exists. |
| Application E2EE | Correctly postponed | Add downgrade/failure behavior, browser matrix, key authentication, and independent review gate. |
| Privacy dashboard | Covered too late | A truthful basic dashboard should precede activities; E2EE-specific status remains later. |
| Automatic deletion | Covered | Define deletion job observability and hard-delete versus soft-delete boundaries. |
| One-tap privacy | Mentioned in requirements but not explicit enough in roadmap | Move to the first privacy-control milestone before activities. |
| Private entry/camera-off entry | Not explicit enough | Add as a Phase 2/3 media admission requirement; `RoomSession.start()` currently requests camera/mic before signaling. |
| Incognito presence | Covered | Define exactly which observers cannot see the participant. |
| Room lockdown | Covered | Enforce in the backend before JOIN; existing `RoomRegistry` cannot implement it alone. |
| Existing audio controls | Under-specified | Preserve and test remote playback volume and sound-effects controls before feature work. |
| Existing visual identity | Under-specified | Treat `CosmicBackground` and dark emerald/cosmic styling as compatibility requirements. |
| Six-person full mesh | Covered | Add explicit six-peer CPU/bandwidth regression criteria and no-SFU constraint. |

## Incorrect or risky assumptions to avoid

1. **A room code is not an invitation.** The current `handleJoin()` creates
   any syntactically valid room. The migration must not preserve this behavior
   for new persistent rooms while accidentally breaking old links.
2. **The current browser startup path is media-first.** `RoomSession.start()`
   acquires camera/microphone before opening signaling. Private entry and
   camera-off entry require a deliberate media acquisition policy change, not
   only a lobby checkbox.
3. **A successful build is not frontend test coverage.** The current `npm test`
   is typecheck-only. Phase 0 must add browser tests before claiming behavior
   parity.
4. **Origin restriction is authorization.** `setAllowedOrigins()` helps
   prevent cross-site WebSocket use but does not prove room membership.
5. **Application E2EE is not a privacy-dashboard label.** The plan correctly
   warns about this, but the implementation must make the unverified state
   impossible to present as “end-to-end encrypted”.
6. **Persistence does not mean persistent live connections.** PostgreSQL room
   rows and transient `RoomRegistry` peer sessions must remain separate.
7. **Production is not currently known to match local.** The current Vercel
   bundle has different asset hashes and older observed UI. Deployment
   comparison belongs in the regression gate.

## Architectural risks

### High

- Introducing persistence and access control directly into
  `SignalingWebSocketHandler` would create a large authorization-sensitive
  handler and make WebSocket behavior difficult to test.
- Anonymous ownership without a recovery model can strand rooms or encourage
  unsafe storage of bearer credentials.
- Activity state can become an unbounded, conflict-prone event stream if
  versioning, expiry, and payload limits are not designed first.
- E2EE can create a false sense of safety if participant authentication and
  key rotation are incomplete.

### Medium

- A PostgreSQL-only first release is acceptable for durable metadata, but
  multi-instance presence and rate limiting will need shared state or an
  explicit single-instance deployment constraint.
- Persistent room URLs may expose room identity through browser history and
  referrers unless invitation tokens and URL-clearing behavior are designed.
- Full mesh remains appropriate for six participants, but each activity and
  theme must not increase media connection complexity.

### Low

- Theme assets and ambient audio can create performance/licensing issues.
- Retention policies can become difficult to explain if persistent settings,
  temporary activity, and invitations share a table or deletion lifecycle.

## Unnecessary complexity to remove

- Do not add a user-account system before the anonymous/device identity
  decision proves it is needed.
- Do not introduce Redis before there is a multi-instance deployment need.
- Do not create microservices for room, presence, access, and activities.
- Do not add an SFU; the six-person full mesh is an explicit product
  constraint.
- Do not store media, SDP, ICE, whiteboard recordings, or sound media in
  PostgreSQL.
- Do not build every activity before the common activity protocol is tested
  with one simple module.

## Recommended revised implementation order

### Phase 0 — Baseline and deployment parity

1. Preserve the current uncommitted worktree and identify the intended release
   commit.
2. Add Playwright tests for lobby, room create/join, invite URL, connected
   state, participant panel, audio settings, camera-off state, leave/rejoin,
   and expected screen-share failure handling.
3. Run local frontend build/typecheck and backend Maven tests.
4. Deploy a preview from the exact candidate commit and repeat the same
   browser checks.
5. Add a backend health endpoint separate from `/ws/signaling`.

**Exit:** local and preview behavior are explainable and deployment commit is
known.

### Phase 1 — Identity, durable rooms, and compatibility adapter

1. Select anonymous/device identity and ownership recovery.
2. Add migrations for identities, rooms, memberships, and settings.
3. Keep `RoomRegistry` as transient live state.
4. Add a compatibility path for old code-only rooms with an explicit expiry
   or migration policy.

**Exit:** room/settings survive restart without changing peer negotiation.

### Phase 2 — Access control and secure invitations

1. Add random hashed invitation tokens, expiry, revocation, and optional
   password verification.
2. Enforce owner/member/lock decisions before JOIN and before room operations.
3. Add rate limits, payload limits, and production-safe origin configuration.
4. Bind the server-issued participant session to the authorized identity.

**Exit:** guessing a room code alone cannot join a persistent room.

### Phase 3 — Media privacy admission and truthful privacy status

1. Add private entry and camera-off entry by changing the media acquisition
   policy in `RoomSession`.
2. Add one-tap stop for camera, microphone, and screen share.
3. Add a basic privacy dashboard showing actual local media tracks,
   signaling/access state, and “recording not active” only when that is true.
4. Add retention controls and cleanup for invitations/temporary activity.

**Exit:** users can enter without camera/mic, stop all outgoing media
   immediately, and see no misleading encryption/recording claim.

### Phase 4 — Presence and room lockdown

1. Add heartbeat, away detection, stale expiry, incognito filtering, and
   in-room status.
2. Add owner-controlled lockdown and participant removal.
3. Keep presence data separate from durable room configuration.

**Exit:** presence is accurate enough for drop-in behavior and privacy
controls are enforced server-side.

### Phase 5 — Atmosphere and room customization

1. Persist the five initial themes and ambient-audio opt-in.
2. Preserve dark emerald/cosmic identity and `CosmicBackground`.
3. Add reduced-motion/accessibility and asset licensing checks.

**Exit:** theme state survives empty-room visits and does not affect WebRTC.

### Phase 6 — Common activity protocol plus music queue

1. Establish versioned activity envelopes, authorization, state hydration,
   conflict resolution, expiry, and bounded payloads.
2. Implement music queue first.
3. Test reconnect and late-join state before adding another activity.

**Exit:** one activity is independently testable and recoverable.

### Phase 7 — Watch Together

Add YouTube only after the activity protocol handles play/pause/seek,
late-arrival hydration, drift, provider validation, and autoplay failures.

### Phase 8 — One or two games and quick activities

Start with a small server-authoritative game or poll. Defer chess, trivia,
word games, drawing, and prompts as separate milestones rather than one batch.

### Phase 9 — Application-level E2EE

Keep the plan's independent security review requirement. Add only after
identity, membership, late arrivals, removal/rekeying, browser capability
testing, and downgrade behavior are specified.

### Phase 10 — Whiteboard, soundboard, and polish

Deliver after activity abuse controls, bounded state, licensing, and
performance testing are proven.

## Dependencies

```text
Phase 0
  -> Phase 1 identity + persistent rooms
  -> Phase 2 invitations/access control
  -> Phase 3 private entry + one-tap privacy + retention
  -> Phase 4 presence + lockdown
  -> Phase 5 themes
  -> Phase 6 activity protocol + music
       -> Phase 7 Watch Together
       -> Phase 8 games/quick activities
       -> Phase 10 whiteboard/soundboard
Phase 1-4 + independent crypto review
  -> Phase 9 E2EE/privacy verification
```

Phase 5 can proceed in parallel with late Phase 4 implementation if the room
settings API and access controls are already stable. Activities should not
precede server-side membership authorization and retention rules.

## Testing recommendations

The original plan's testing direction is correct but should make these
acceptance criteria explicit:

- Existing WebRTC negotiation, ICE buffering, reconnect, track replacement,
  camera-off, screen-share stop, and six-peer capacity remain unchanged.
- Browser tests use two independent contexts for local and preview; no
  production claim is made from source inspection alone.
- Media permission denied, camera-only, microphone-only, and no-media private
  entry are separate scenarios.
- Audio settings verify the remote media element volume, not only the slider
  label.
- Presence tests simulate heartbeat loss and confirm expiry.
- Invitation tests verify expiry, revocation, replay, URL/log redaction, and
  room lockdown.
- Activity tests verify authorization, event ordering, reconnect, late join,
  expiry, and bounded payloads.
- E2EE tests verify capability detection, actual transform/key state, member
  removal/rekeying, late arrival, and truthful dashboard status.

Docker was unavailable during this review, so PostgreSQL/Testcontainers parity
was not exercised. The current backend has no database, so this is not a
blocker for the present audit; it becomes a Phase 1 prerequisite.

## Decisions requiring approval

1. Anonymous device credential only, optional accounts, or both.
2. Ownership recovery when an anonymous owner loses the device credential.
3. Reusable versus single-use invitation links and whether links bind to a
   member/device.
4. Compatibility and expiry policy for current code-only links.
5. Whether room passwords are needed in addition to invitations.
6. Exact visibility rules for incognito presence.
7. Default/max retention for invitations, statuses, activity state, and
   deleted rooms.
8. Whether all participants may control activities or only owners/moderators.
9. Browser support and independent reviewer for application-level E2EE.
10. Required preview/device/TURN gate before production release.

## Final recommendation

Approve Phase 0 only. Do not begin persistent-room implementation until the
identity/recovery, invitation semantics, compatibility-link policy, retention
defaults, and deployment parity gate are approved. Preserve the current
WebRTC full mesh and media lifecycle; add new capabilities around it through
typed services and adapters rather than rewriting `RoomSession` or the
signaling protocol.
