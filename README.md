# Golem
Golem's Journey — Firebase prototype.

- Web app: `app/` (Vite + React + Firebase)
- Firebase config: `firebase.json`, `firebase/`
- Reference example: `Example_firebase/` (TetraChess skeleton)

## Quick start (local dev, recommended)
Prereqs: Node.js (LTS), Java (for Firebase emulators), Firebase CLI.

```bash
npm install
cp app/.env.example app/.env.local
npm run emu
```

In another terminal:
```bash
npm run dev
```

Open: http://localhost:5173

## Setup / deploy
See `docs/GETTING_STARTED_FIREBASE.md`.
