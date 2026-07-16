---
name: bluechat-project
description: Understand, develop, debug, and review the BlueChat Next.js application in this repository. Use for any BlueChat feature, bug, architecture question, UI change, messaging flow, WebRTC call or screen-sharing work, Supabase Realtime/Auth/Storage change, deployment preparation, or repository onboarding.
---

# BlueChat project

## Start every task

1. Read `references/architecture.md`.
2. Inspect `git status --short` and preserve unrelated user changes.
3. Before editing Next.js code, read the relevant guide under `node_modules/next/dist/docs/`; this project uses Next.js 16.2 and training knowledge may be stale.
4. For any Supabase work, invoke the repository `supabase` skill and verify current official docs.

## Work safely

- Keep browser-only media, WebRTC, IndexedDB, and crypto code in Client Components.
- Preserve end-to-end encryption for chat and call signaling.
- Require an explicit user gesture and visible UI state for camera, microphone, screen sharing, or remote-control requests.
- Never claim a browser can inject operating-system keyboard or pointer input. Full desktop control requires a separately installed native host with authenticated, revocable permissions.
- Prefer small extracted modules when extending the large `src/app/page.tsx`; avoid increasing its coupling unless the change is tightly scoped.
- Treat `NEXT_PUBLIC_*` values as public. TURN static credentials are deployable but visible to clients; prefer short-lived TURN credentials in production.

## WebRTC workflow

- Use Supabase Realtime only for signaling; media must stay peer-to-peer or use a TURN relay.
- Configure TURN for reliable connectivity across symmetric NAT/firewalls. STUN-only calls cannot be reliable on all networks.
- Use trickle ICE, cache expensive room-key derivation, clean up tracks/peer connections, and tolerate short `disconnected` transitions.
- Implement screen sharing with `getDisplayMedia()` and `RTCRtpSender.replaceTrack()`. Restore the camera track when sharing ends.
- Model RustDesk only at the architectural level: consent, authenticated sessions, direct-first transport, relay fallback, explicit permissions, and session teardown. Do not copy native-control assumptions into browser code.

## Verify

- Run `npm run lint` after code changes.
- Run `npm run build` before every commit or push, without exception.
- For media changes, report that two real devices/networks and HTTPS or localhost are required for final manual verification.

