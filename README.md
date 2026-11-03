# StreamRoom

StreamRoom is a private, lightweight communication room for small groups. Users can join a temporary room, communicate with camera and microphone, and share their screen with up to six participants.

## Features

- Private rooms with generated or invited room codes
- Native WebRTC audio and video
- Screen sharing when supported by the browser
- Full-mesh connections for up to six participants
- Spring Boot WebSocket signaling
- Microphone, camera, screen-share, and leave controls
- Reconnection and ICE candidate buffering
- Optional environment-driven TURN configuration
- Responsive landing page and calling interface

## Architecture

```text
React + TypeScript + Vite
        │
        ├── WebRTC media: audio, video, screen sharing
        │
        └── WebSocket signaling
                │
        Spring Boot signaling server
        in-memory rooms and participants
```

The backend handles signaling only. Media travels directly between browsers through native WebRTC peer connections.

## Requirements

- Node.js 18 or newer
- npm
- Java 21 or newer
- Maven
- A modern browser with camera and microphone support

## Installation

Install frontend dependencies:

```bash
npm install
```

## Configuration

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Available variables:

| Variable | Description |
|---|---|
| `VITE_SIGNALING_URL` | WebSocket signaling endpoint |
| `VITE_STUN_URLS` | Comma-separated STUN server URLs |
| `VITE_TURN_URLS` | Optional comma-separated TURN server URLs |
| `VITE_TURN_USERNAME` | Optional TURN username |
| `VITE_TURN_CREDENTIAL` | Optional TURN credential |

TURN credentials should be supplied through deployment secrets and must not be committed.

## Running locally

Start the backend from `streamroom-backend`:

```bash
cd streamroom-backend
mvn spring-boot:run
```

The signaling server listens at:

```text
ws://localhost:8080/ws/signaling
```

In a second terminal, start the frontend from the project root:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run test` | Run the configured frontend validation command |
| `npm run build` | Typecheck and create a production build |
| `npm run preview` | Preview the production build |
| `mvn test` | Run backend tests |
| `mvn spring-boot:run` | Start the signaling server |

## Browser permissions

When entering a room, allow camera and microphone access. Screen sharing requires a browser and operating-system environment that supports `navigator.mediaDevices.getDisplayMedia()`.

For production deployments, configure a TURN server for users behind restrictive NAT or firewall environments.

## Validation status

Verified:

- Frontend typecheck and production build
- Backend Maven tests
- Live WebSocket JOIN, LEAVE, signaling routing, and room capacity
- Two-browser camera/video communication
- Microphone and camera track toggles
- Participant leave and rejoin

Remaining environment-dependent validation:

- Human-audible audio quality and echo assessment
- Screen sharing in a browser with display-capture support
- Reliable three-, four-, and six-participant media sessions
- Cross-network validation with TURN

See [runtime-validation-report.md](./runtime-validation-report.md) for the detailed evidence and known limitations.

## Project structure

```text
src/
  components/       Landing page, room UI, controls, participant views
  hooks/            React integration for room sessions
  signaling/        WebSocket signaling client
  webrtc/           Full-mesh WebRTC session and diagnostics
  config.ts         Environment-driven signaling and ICE configuration
streamroom-backend/
  src/main/         Spring Boot signaling server
  src/test/         Signaling authorization and room-management tests
legacy-root-frontend/
  Archived pre-consolidation frontend
```

## License

This project does not currently declare a license.
