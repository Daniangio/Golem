# Getting Started with Firebase (Golem's Journey)

This doc gets you from **“I have the repo”** → **“I can run locally and deploy to Firebase Hosting”**.

## 1) Create and configure a Firebase project (once)
In Firebase Console → create a project.

Enable:
- **Firestore Database** (Native mode)
- **Authentication → Sign-in method → Email/Password**
- **Hosting**

Notes:
- Firestore “location/region” is chosen once (pick the closest region).
- Cloud Functions are **not** required for the current v0 (bots logic will come later).

## 2) Install Firebase CLI (once)
```bash
npm i -g firebase-tools
firebase login
```

## 3) Link this repo to your Firebase project
From repo root:
```bash
firebase use --add
```
This updates `.firebaserc`.

## 4) Add your Firebase Web App config to `app/.env.local`
In Firebase Console:
Project settings → General → Your apps → **Web app** → Config

If you **don’t** see “Your apps”, you likely haven’t registered a Web App yet:
- Firebase Console → your project (e.g. `golem-journey`) → ⚙️ Project settings → General
- Scroll to **Your apps** → click **Add app** → choose **Web (</>)**

Copy values into `app/.env.local`:
```bash
cp app/.env.example app/.env.local
```

Important: `app/.env.local` must contain **only** `VITE_...=...` lines.
Do **not** paste the JavaScript “SDK snippet” (the one starting with `const firebaseConfig = { ... }`) into `.env.local`.

## 5) Local development with Firebase Emulators (recommended)
You need **Java** installed for the Emulator Suite.

In one terminal (repo root):
```bash
npm run emu
```

In another terminal:
```bash
npm run dev
```

Open:
- App: http://localhost:5173
- Emulator UI: http://localhost:4000

If you want the app to use emulators, keep:
```bash
VITE_USE_EMULATORS=true
```
in `app/.env.local`.

If you are developing via a remote VM/dev-container (port forwarding), this repo proxies emulator traffic through the Vite dev server, so the browser does not need direct access to emulator ports (19099/8080).

Note: when `VITE_USE_EMULATORS=true`, run the app via `npm run dev` (Vite). If you instead open the Hosting Emulator URL (typically `http://127.0.0.1:5000`), emulator proxying is not active.

## 6) Deploy to Firebase Hosting
Build the web app:
```bash
npm run build
```

Deploy:
```bash
firebase deploy
```

Your app will be available at:
- https://<project>.web.app
- https://<project>.firebaseapp.com

## Data model (v0)
Firestore collections:
- `users/{uid}`: basic profile data (display name, email)
- `games/{gameId}`: lobby/game room state (3 players + bots placeholders)

## What’s implemented vs. pending
Implemented (v0):
- Lobby listing + room creation
- Join room (3 players) + fill seats with bots placeholders
- Private rooms + invite by UID
- Start game + choose one of the first 3 Level 1 locations
- Assign parts for the chosen location
- Profile page + game history list

Pending:
- Full gameplay loop (decks, pulses, reservoir swap, damage/heat logic)
- Bot behavior via Cloud Functions (may require Blaze plan for deployment)

## Troubleshooting
### `accounts:lookup` returns 400 in the browser console
If you see a request like:
`/identitytoolkit.googleapis.com/v1/accounts:lookup ... 400 (Bad Request)`

Click the request in DevTools → Network → Response. Common cases:
- `MISSING_ID_TOKEN`: the request body was empty (usually harmless, can happen during sign-out / auth state changes).
- `INVALID_ID_TOKEN` / `TOKEN_EXPIRED`: you restarted emulators or changed project/aliases and the local auth session is stale.

Fix:
- Sign out in the app and sign in again, or clear site data for `localhost:5173`.

### Emulator UI shows WebSocket errors (9465) / empty Auth users list
If you see browser console errors like:
`WebSocket connection to 'ws://127.0.0.1:9465/requests' failed`

This usually means the **browser cannot reach the emulator ports** (common with remote/dev-container setups).

Fix:
- Prefer opening Emulator UI via **local forwarded ports** (not a remote URL).
- Forward these ports from the machine running emulators to your browser machine:
  - `4000` (Emulator UI)
  - `19099` (Auth emulator)
  - `8080` (Firestore emulator)
  - `9465` (Firestore request WebSocket used by the UI)

Important:
- Emulator users do **not** appear in the real Firebase Console. They only appear in Emulator UI (`http://localhost:4000/auth`).
