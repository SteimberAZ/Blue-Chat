# BlueChat architecture

## Core files

- `src/app/page.tsx`: client-side application containing auth, contacts, encrypted local chat, Supabase Realtime channels, attachments, presence, administration, and WebRTC calls.
- `src/app/globals.css`: Tailwind v4 theme and application surfaces.
- `src/app/layout.tsx`: metadata, fonts, viewport, and root document language.
- `src/lib/supabase.ts` and `src/utils/supabase/client.ts`: browser Supabase clients.
- `src/app/api/notify/route.ts`: notification email endpoint.
- `supabase_setup.sql` and `supabase_realtime_setup.sql`: local setup references; inspect before assuming they are deployed.

## Data and transport

- Supabase Auth supplies the browser session.
- `employees`, friend-request/session tables, `offline_messages`, and Storage support application data.
- `chat_messages` is the persistent encrypted archive used for multi-device history. The client loads recent pages into `localforage`, which remains the fast local cache.
- `offline_messages` remains a temporary delivery queue during the first migration stage; Realtime Broadcast moves encrypted messages and signaling between online peers.
- Room IDs are deterministic sorted user IDs. Legacy payloads use the room-derived AES-GCM v1 key. New messages and call signals use v2 ECDH P-256 + HKDF when both peers have a published public identity key; the private JWK remains only in the device's `localforage` storage. The client keeps v1 decryption for migration compatibility.
- `user_identity_keys` stores only public JWK values and is protected by RLS: authenticated users can read peer public keys, but can insert/update only their own key. Apply `supabase_identity_keys_setup.sql` before expecting v2 encryption.
- Per-contact Realtime channels carry chat events, presence, acknowledgements, reactions, deletes, and `call_signal` events.
- `call_logs` stores one private row per user and call. Terminal call states are recorded with RLS, while the call initiator writes an encrypted `call_log` message into the conversation so both devices see the event without duplicating it.

## Calls

- WebRTC is established in the browser with offer/answer and trickle ICE sent over encrypted Supabase Broadcast.
- Call signals carry a per-call ID. Realtime acknowledgements confirm server receipt, and outgoing offers retry briefly so a contact that is still subscribing does not miss the call.
- STUN attempts direct connectivity. Optional `NEXT_PUBLIC_WEBRTC_TURN_URL`, `NEXT_PUBLIC_WEBRTC_TURN_USERNAME`, and `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL` provide relay fallback.
- Video screen sharing replaces the outgoing camera track; it does not grant desktop control.
- Stage 2A establishes per-device identity keys and conversation key derivation. Secure device linking/recovery, key verification/rotation UX, and encrypted private attachments remain follow-up stages; do not export the local private JWK as part of the current device transfer flow.
- Production-grade RustDesk-like control needs a native agent, an authenticated rendezvous/relay service, granular consent, auditability, and emergency revocation. Keep that as a separate product/security project.

## Known constraints

- `src/app/page.tsx` is large and uses many `any` types; refactor incrementally.
- Browser media requires a secure context (HTTPS or localhost) and user permission.
- Validate calls on at least two devices and preferably two different networks; a single-browser test cannot validate NAT traversal.
