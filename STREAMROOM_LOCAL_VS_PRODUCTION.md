# StreamRoom Local vs Production Comparison

**Test date:** 2026-11-10
**Local frontend:** `http://127.0.0.1:5173`
**Local signaling backend:** `ws://localhost:10000/ws/signaling`
**Production frontend:** `https://streamroom-pearl.vercel.app`
**Production signaling backend:** `wss://steamroom-backend.onrender.com/ws/signaling`

## Executive summary

The local working tree and the deployed Vercel application are materially
different. The local frontend contains a newer minimal lobby, the current
cosmic/emerald visual treatment, audio settings, participant details,
connected-state improvements, and enhanced media error handling. Production
serves an older lobby and room implementation with richer explanatory copy but
without the local audio-settings surface.

The local two-browser test passed for room creation, joining, participant
discovery, connected state, participant-panel display, volume adjustment, and
camera-off UI state. Production room creation reached the room and displayed
“Waiting for camera and microphone”, but the browser environment denied media
permission and production did not reach a verified connected media state.
Production two-browser media behavior is therefore **NOT VERIFIED**, not
classified as broken.

The current remote `main` commit is `caed3f4` and matches the local `HEAD`.
However, the local working tree has substantial uncommitted changes, while
Vercel serves different asset hashes (`index-Dn0QZCqg.js` and
`index-CoRV1j9l.css`) from the current local build. The deployed commit could
not be verified from public deployment headers or repository metadata.

## Local environment

| Item | Observed value |
|---|---|
| Branch | `main` |
| `HEAD` | `caed3f4` |
| `origin/main` | `caed3f4fcf7a08a76a8ff1196e6e759dfb1866e5` |
| Uncommitted state | 22 modified/deleted tracked files plus the implementation plan and new components |
| Node/npm | Node `v22.19.0`, npm `10.9.3` |
| Java | Java 25 was used by Maven wrapper; project declares Java 21 |
| Maven | System `mvn` unavailable; `streamroom-backend/mvnw.cmd` works |
| Docker | Unavailable; no Docker-based test tier was possible |
| Vite | `5173`, configured in `vite.config.ts` |
| Spring Boot | `10000`, configured by `application.yml` |
| Frontend build | PASS, `npm run build`, exit code 0 |
| Frontend canonical test | PASS, `npm test`, exit code 0; this is typecheck only |
| Backend tests | PASS, `streamroom-backend/mvnw.cmd test`, exit code 0 |

Important uncommitted deployment-related changes include:

- `.env.example` and `src/config.ts`: local signaling default changed from
  port `8080` to `10000`.
- `application.yml`: local origins were added to the default allowed-origin
  list.
- `README.md`: local port and validation documentation updated.
- Large UI/WebRTC changes in `src/styles/app.css`, `src/components/`,
  `src/webrtc/RoomSession.ts`, and related files.

No uncommitted changes were reverted or altered during this comparison.

## Production environment

The production frontend returned HTTP 200 and Vercel headers identified a
cached deployment (`X-Vercel-Cache: HIT`). The public page referenced:

- `/assets/index-Dn0QZCqg.js`
- `/assets/index-CoRV1j9l.css`

The current local build produced different hashes:

- `dist/assets/index-Bl-uVBgh.js`
- `dist/assets/index-BvFtbe35.css`

The Vercel response did not expose a source commit SHA. The deployed commit is
therefore **UNKNOWN**.

The Render backend responded to an HTTP `HEAD` request on
`/ws/signaling` with `405 Method Not Allowed` and `Allow: GET`. This confirms
the host is reachable, but does not prove a successful WebSocket upgrade or
signaling behavior. The browser room test remained in the camera/microphone
startup state.

The production environment variable example in the repository uses
`wss://steamroom-backend.onrender.com/ws/signaling` (with `steamroom`), while
the repository and product name use `StreamRoom`. This hostname is the
configured target and was reachable, but the naming inconsistency should be
confirmed before deployment changes.

## Screenshot artifacts

Screenshots were captured at 1440x900 and 390x844:

- [Local desktop landing](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/local/desktop-landing.png)
- [Production desktop landing](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/production/desktop-landing.png)
- [Local mobile landing](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/local/mobile-landing.png)
- [Production mobile landing](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/production/mobile-landing.png)
- [Local room](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/local/desktop-room-starting.png)
- [Production room](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/production/desktop-room-starting.png)
- [Local connected room](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/local/desktop-room-final.png)
- [Local/production desktop composite](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/side-by-side/desktop-landing.png)
- [Local/production mobile composite](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/side-by-side/mobile-landing.png)
- [Local/production room composite](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/side-by-side/room-interface.png)

Additional local evidence:

- [Local audio and participant panel](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/local/desktop-audio-participants.png)
- [Local camera-off state](C:/Users/nikhil/OneDrive/Desktop/StreamRoom/comparison-screenshots/local/desktop-camera-off.png)

## Feature comparison

| Feature | Local | Production | Difference / evidence |
|---|---|---|---|
| Landing page | WORKING | WORKING | Both returned and rendered. Local says “Private rooms”, “Up to 6”, and “Share screens”; production has longer explanatory copy, “No accounts”, and “Rooms are temporary”. |
| Room creation | WORKING | PARTIALLY WORKING | Both generated a room code. Local reached a connected/usable room in the browser harness; production reached “Waiting for camera and microphone”. |
| Room joining | WORKING | PARTIALLY WORKING | Local second browser joined `DDFQAV`; production invite URL loaded and joined startup flow but did not reach verified media connection. |
| Invitation URL | WORKING | WORKING | Both recognized `?room=...` and prefilled the code. Local showed its invite notice; production showed the older invite notice. |
| Camera controls | WORKING | NOT VERIFIED | Local camera-off state changed the UI to “Camera off” and “Turn camera on”. Production controls remained disabled while waiting for media permission. |
| Microphone controls | WORKING | NOT VERIFIED | Local exposed “Mute microphone” after connection. No remote-audio verification was possible. |
| Screen sharing | PARTIALLY WORKING | NOT VERIFIED | Local surfaced an explicit `NotSupportedError: Not supported` in the browser harness; successful capture was not possible. |
| Volume settings | WORKING | NOT IMPLEMENTED | Local opened “Audio settings”, changed remote playback volume to 50%, and exposed sound-effects toggle. Production room snapshot had no audio-settings button. |
| Display names | PARTIALLY WORKING | NOT VERIFIED | Local rendered `Guest` in both participant views; custom non-default name was not exercised. Production did not reach connected participants. |
| Participant panel | WORKING | PARTIALLY WORKING | Local panel showed two participants, mic/camera state, invite link, and copy control. Production exposed a participant button but no connected panel was verified. |
| Background animation | WORKING | WORKING | Both rendered their respective animated dark visual backgrounds; no frame-by-frame performance claim was made. |
| Mobile layout | WORKING | WORKING | Both rendered at 390x844 without a fatal layout failure. Detailed touch/accessibility behavior remains unverified. |
| Six-participant capacity | NOT VERIFIED | NOT VERIFIED | No six-browser run was performed. |

Status labels reflect observations, not source presence.

## Functional test evidence

### Local two-browser flow

1. Browser A opened the local lobby and created room `DDFQAV`.
2. Browser B opened `?room=DDFQAV` and joined.
3. Both pages displayed two `Guest` participants and connected status.
4. Browser A opened the participant panel; it showed `Participants 2`,
   `Mic on · Camera on`, and the second connected participant.
5. Browser A opened audio settings and changed the slider from 100% to 50%.
6. Browser A disabled its camera; the local UI showed `Camera off` and
   `Mic on · Camera off`.
7. Browser A attempted screen sharing; the browser harness returned
   `NotSupportedError: Not supported`, and the UI displayed the error.

This verifies the local UI/state paths. Physical camera release, microphone
audio output, and human-audible remote media were not verified.

### Production flow

1. Production landing page loaded successfully.
2. Room creation generated codes such as `Z7Q7E8` and `JFZK95`.
3. The room displayed `Waiting for camera and microphone` and disabled media
   controls because the browser denied camera/microphone permission.
4. A production invite URL loaded and entered the same startup flow.
5. No production connected two-browser media state was observed.

This is insufficient to classify production WebRTC signaling or remote media
as broken. It is **NOT VERIFIED** under the available browser permission
environment.

## Security comparison

### Verified or source-supported controls

- Production frontend uses HTTPS and the documented production endpoint uses
  WSS.
- Backend source validates identifier syntax and checks that directed signaling
  is sent by the WebSocket session currently bound to that participant.
- Backend source rejects cross-room/cross-participant directed messages in the
  tested unit suite.
- Media is not handled or stored by the backend source; browser WebRTC carries
  media peer-to-peer.
- Browser permission denial is surfaced as a startup state rather than
  silently claiming a connected camera/microphone.

### Visible in source but not production-verified

- Exact production `STREAMROOM_ALLOWED_ORIGINS` value.
- Production WebSocket origin enforcement behavior.
- Production logging configuration and log retention.
- Production backend build/version and runtime configuration.
- Production TURN configuration.
- Successful WebSocket upgrade and signaling routing.

### Missing in both current architectures

- Persistent ownership and membership authorization.
- Secure invitation token issuance, expiry, revocation, and hashing.
- Room lockdown and server-enforced room access policy.
- Rate limiting for connection, JOIN, malformed messages, and failed access.
- Application-level E2EE and verified encryption-state reporting.
- Retention/deletion service and privacy dashboard.

Room codes remain identifiers, not sufficient cryptographic access controls.
WebRTC transport encryption must not be reported as application-level E2EE.

## Known bugs and limitations

1. Production is not demonstrably running the current uncommitted local
   implementation.
2. The deployed commit cannot be identified from public metadata.
3. Production browser validation is blocked by denied media permissions and
   therefore cannot establish remote media behavior.
4. The backend root endpoint returns 404 for GET and 405 for HEAD on the
   signaling path; this is expected for a WebSocket endpoint but is not a
   health check.
5. The repository has no frontend behavior-test suite; `npm test` only runs
   TypeScript typechecking.
6. Docker is unavailable, so no containerized infrastructure or production
   parity test was run.

## Deployment gaps

| Change or feature | Classification | Evidence |
|---|---|---|
| Local signaling port `10000` | Local only / unable to verify production | Uncommitted `.env.example`, `src/config.ts`, and README changes; production asset deployment does not expose its env value. |
| Local join/room-state UI | Local only | Local has connected two-browser state and current room controls; production served older copy and startup UI. |
| Audio volume popover | Local only | Local exposed audio settings and 50% slider; production room did not expose the control. |
| Participant details panel | Local only / production unverified | Local showed two participants and media state; production did not reach connected state. |
| Camera track release/reacquisition changes | Local only / unable to verify | Present in uncommitted `RoomSession.ts`; production runtime could not reach enabled media controls. |
| Screen-sharing error handling | Local only / production unverified | Local displayed `NotSupportedError`; production did not reach the control. |
| Cosmic background and visual changes | Different implementation | Local and production landing copy, layout, and styles visibly differ. |
| Responsive layout changes | Different implementation | Both rendered at 390x844, but their DOM/content structures differ. |
| Backend allowed-origin defaults | Local only / unable to verify production | Local uncommitted `application.yml` includes local origins; Render runtime value is unknown. |

## Recommended next actions

1. Do not deploy the whole uncommitted tree blindly. Review and commit the
   local frontend/backend changes as a coherent release candidate.
2. Verify the production build commit through Vercel project/deployment
   metadata before release.
3. Deploy to a preview environment first and repeat the two-browser flow with
   controlled camera/microphone permissions.
4. Add a real health/readiness endpoint separate from the WebSocket endpoint.
5. Confirm the Render hostname spelling and configured frontend signaling URL.
6. Add automated browser regression coverage for the local connected-room,
   audio-settings, participant-panel, camera-off, and invite flows.
7. Apply the Phase 0 gate in the existing 2.0 plan before persistent-room
   implementation.

## Runtime verdict

```text
environment:
  docker: UNAVAILABLE — docker command/daemon not available
  node: AVAILABLE — v22.19.0
  playwright: AVAILABLE — browser automation executed successfully
  infra-tier: FALLBACK(embedded/in-memory) — current backend has no database and Docker is unavailable
  browser-tier: PRIMARY(Playwright) — local and production pages were exercised
startup: PASS — Vite ready on 5173; Spring Boot started on 10000
integration: PASS — exit_code: 0, frontend typecheck/build and backend Maven tests passed
e2e: PARTIAL — exit_code: 0, local browser flows passed; production media connection unverified due permission denial
overall: NEEDS_SIGNOFF — deployment commit and production connected-media behavior remain unverified
```
