# Trustworthy Human–AI Collaboration — Planning study prototype

Single-day planning interface with **hidden experimental conditions**, **Latin-square order** (two tasks), **LLM-assisted** assumption text (with **deterministic seed** merged on the server), **screen recording**, **voice input**, and **automatic session export** to local disk when the API is running.

## Run (full stack: Vite + API)

```bash
npm install
cp .env.server.example .env.server
# Add GEMINI_API_KEY to .env.server (Google AI Studio); without it, the server uses deterministic fallback text.

npm run dev
```

- Frontend: `http://localhost:5173` (proxies `/api` → `http://localhost:8787`)
- API: saves JSON + optional WebM to **`data/sessions/`** (created automatically)

### Scripts

| Command        | Purpose                          |
|----------------|----------------------------------|
| `npm run dev`  | Vite + Express API (recommended) |
| `npm run dev:client` | Vite only (no save/LLM)    |
| `npm run server`   | API only                   |
| `npm run build`    | Production client bundle   |

## What participants see

1. Welcome + **participant ID** (UUID, for linking logs and recording).
2. Interface tutorial (no scenario labels).
3. **Screen recording** starts (browser permission) before Planning task 1.
4. **Planning task 1** / **Planning task 2** only — order is randomized (`prompt-only` vs `mental-model-explicit`).
5. Post-task questionnaire after each task.
6. Optional open-ended feedback; **Save session** uploads JSON (+ recording) to the API.

Condition names and planner scenario ids (`scenario-1` / `scenario-2`) appear **only** in exported JSON, not in the UI.

## Research implementation notes

- **Latin square (2×2):** order is either `[incorrect, correct]` or `[correct, incorrect]`, chosen at session start.
- **Participant-facing stories:** edit `src/content/participantScenarios.ts` (titles, bullets, suggested prompts). These are shown before each task; they are **not** the hidden condition labels (those stay in exported JSON only).
- **LLM (Gemini):** prompts and schema live in **`server/llmPrompt.js`**. The model generates **tasks, constraints, and assumptions** as JSON; the **seed-target** row is then **re-injected** from `server/seeds.json` so the manipulation stays controlled. If Gemini fails or there is no key, the API uses the template in `server/index.mjs` (`fallbackScenario`).
- **API key:** `GEMINI_API_KEY` in `.env.server`. Default model `gemini-2.0-flash` (override `GEMINI_MODEL`).
- **Screen recording:** `MediaRecorder` WebM; optional upload with the session payload.
- **Calendar:** one day per task; date picker limited to **March 1 – April 30** (current year).

## Editing seeds / planner

| File | Role |
|------|------|
| `server/seeds.json` | Target assumption text for incorrect vs correct conditions |
| `src/planner/planner.ts` | Deterministic single-day schedule after assumptions change |

## Deploying “my storage” in production

The included API writes under **`data/sessions/`**. On a host (Docker, VM, etc.), mount persistent storage at that path or change `server/index.mjs` to upload to S3/GCS using your credentials.

## Tech

React 19, TypeScript, Vite, Express, Google Gemini API, local-only participant state unless the session is saved via the API.
