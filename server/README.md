# Session API (`server/`)

- **`index.mjs`** — Express routes and fallback templates if Gemini fails or no API key.
- **`llmPrompt.js`** — **Edit this file** to change the full-plan LLM: system prompt, user message, JSON schema, and merge logic. The **seed-target** assumption is always re-applied from `seeds.json` after the model responds.
- **`seeds.json`** — Authoritative text and `seedTargetKind` for the experimental target assumption.
