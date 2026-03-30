/**
 * Local API: LLM merge + persist session JSON + screen recording to ./data/sessions/
 * Set GEMINI_API_KEY in .env.server (project root; see .env.server.example)
 *
 * Full-plan LLM: see `server/llmPrompt.js`.
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.server') })

import cors from 'cors'
import express from 'express'
import fs from 'fs'
import multer from 'multer'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import {
  behaviorAssumptionsResponseSchema,
  buildBehaviorAssumptionsSystemInstruction,
  buildBehaviorAssumptionsUserMessage,
  buildFullPlanSystemInstruction,
  buildFullPlanUserMessage,
  fullPlanResponseSchema,
  mergeBehaviorAssumptions,
  mergeParsedPlan,
} from './llmPrompt.js'

const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data', 'sessions')
const ORDER_COUNTER_FILE = path.join(DATA, 'order-counter.json')

fs.mkdirSync(DATA, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DATA),
    filename: (_req, file, cb) => {
      const id = `rec-${Date.now()}.webm`
      cb(null, id)
    },
  }),
  limits: { fileSize: 800 * 1024 * 1024 },
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '4mb' }))

const geminiApiKey = process.env.GEMINI_API_KEY?.trim()
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const supabaseUrl = process.env.SUPABASE_URL?.trim()
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const supabaseBucket = (process.env.SUPABASE_STORAGE_BUCKET || 'sessions').trim()
const requireSupabase = String(process.env.REQUIRE_SUPABASE || '').toLowerCase() === 'true'
const supabase = supabaseUrl && supabaseSecret
  ? createClient(supabaseUrl, supabaseSecret, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

/** Gemini sometimes wraps JSON in markdown fences. */
function extractJsonText(text) {
  const t = text.trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m)
  if (fence) return fence[1].trim()
  return t
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** True when 429 is due to free-tier daily caps — waiting won't help until quota resets or billing is on. */
function isDailyQuota429(message) {
  const m = String(message)
  return m.includes('GenerateRequestsPerDay') || m.includes('PerDayPerProjectPerModel')
}

function parseRetryAfterMs(message) {
  const m = String(message).match(/Please retry in ([\d.]+)\s*s/i)
  if (m) {
    const sec = parseFloat(m[1])
    if (Number.isFinite(sec)) return Math.min(120_000, Math.max(500, Math.ceil(sec * 1000)))
  }
  return 15_000
}

/**
 * Retries on RPM-style 429s using Retry-After-style hints from the error body.
 * Does not retry when the error indicates a daily free-tier cap (enable billing or switch model / wait).
 */
async function generateContentWith429Retry(model, content) {
  const maxAttempts = Math.max(1, Math.min(8, Number.parseInt(process.env.GEMINI_429_MAX_RETRIES || '4', 10) || 4))
  let lastErr
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await model.generateContent(content)
    } catch (e) {
      lastErr = e
      const msg = String(e?.message || e)
      const is429 = msg.includes('429') || msg.includes('Too Many Requests')
      if (!is429) throw e
      if (isDailyQuota429(msg)) throw e
      if (attempt === maxAttempts - 1) throw e
      const waitMs = parseRetryAfterMs(msg)
      console.warn(`[Gemini] 429 rate limit (attempt ${attempt + 1}/${maxAttempts}), retry in ${waitMs}ms`)
      await sleep(waitMs)
    }
  }
  throw lastErr
}

async function llmScenario(userPrompt, conditionKind, dateISO, localDateISO, localMin, context = {}) {
  if (!genAI) {
    throw new Error('LLM is required but GEMINI_API_KEY is missing.')
  }

  try {
    const model = genAI.getGenerativeModel({
      model: geminiModelName,
      systemInstruction: buildFullPlanSystemInstruction(),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: fullPlanResponseSchema(),
      },
    })

    const result = await generateContentWith429Retry(
      model,
      buildFullPlanUserMessage(userPrompt, dateISO, localDateISO, localMin, context),
    )
    const rawText = result.response.text()
    if (!rawText) throw new Error('Empty Gemini response')
    const parsed = JSON.parse(extractJsonText(rawText))
    const scenario = mergeParsedPlan(parsed, userPrompt, conditionKind, {
      dateISO,
      localDateISO,
      localMin,
    })
    return { scenario, model: geminiModelName, raw: parsed, llmMode: 'full' }
  } catch (e) {
    console.warn('[parse-plan] Gemini failed:', e)
    throw new Error(String(e?.message || e))
  }
}

async function llmBehaviorAssumptions(userPrompt, conditionKind, dateISO, localDateISO, localMin, tasks, currentAssumptions) {
  if (!genAI) {
    throw new Error('LLM is required but GEMINI_API_KEY is missing.')
  }
  const model = genAI.getGenerativeModel({
    model: geminiModelName,
    systemInstruction: buildBehaviorAssumptionsSystemInstruction(),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: behaviorAssumptionsResponseSchema(),
    },
  })
  const result = await generateContentWith429Retry(
    model,
    buildBehaviorAssumptionsUserMessage(
      String(userPrompt || ''),
      dateISO,
      localDateISO,
      localMin,
      tasks || [],
      currentAssumptions || [],
    ),
  )
  const rawText = result.response.text()
  if (!rawText) throw new Error('Empty Gemini response')
  const parsed = JSON.parse(extractJsonText(rawText))
  const assumptions = mergeBehaviorAssumptions(parsed, currentAssumptions || [])
  return { assumptions, model: geminiModelName, raw: parsed }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasLlm: Boolean(genAI),
    geminiModel: geminiApiKey ? geminiModelName : null,
    hasSupabase: Boolean(supabase),
    requireSupabase,
    dataDir: DATA,
  })
})

function readOrderCounter() {
  try {
    const raw = fs.readFileSync(ORDER_COUNTER_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Number.isFinite(parsed?.nextSequence) ? Math.max(0, Math.floor(parsed.nextSequence)) : 0
  } catch {
    return 0
  }
}

function writeOrderCounter(nextSequence) {
  fs.writeFileSync(ORDER_COUNTER_FILE, JSON.stringify({ nextSequence }, null, 2), 'utf8')
}

/** Serialize order allocation so concurrent POSTs cannot read the same counter (single Node process). */
let sessionOrderMutex = Promise.resolve()

app.post('/api/session-order', (_req, res) => {
  sessionOrderMutex = sessionOrderMutex
    .then(() => {
      const sequenceNumber = readOrderCounter()
      writeOrderCounter(sequenceNumber + 1)
      res.json({ sequenceNumber })
    })
    .catch((e) => {
      console.error(e)
      if (!res.headersSent) {
        res.status(500).json({ error: String(e?.message || e) })
      }
    })
})

app.post('/api/parse-plan', async (req, res) => {
  try {
    const { userPrompt, conditionKind, dateISO, localDateISO, localMin, context } = req.body || {}
    if (!userPrompt || !conditionKind || !dateISO || !localDateISO || typeof localMin !== 'number') {
      return res.status(400).json({ error: 'userPrompt, conditionKind, dateISO, localDateISO and localMin required' })
    }
    if (!['prompt-only', 'mental-model-explicit'].includes(conditionKind)) {
      return res.status(400).json({ error: 'invalid conditionKind' })
    }
    const result = await llmScenario(
      String(userPrompt),
      conditionKind,
      String(dateISO),
      String(localDateISO),
      Number(localMin),
      context && typeof context === 'object' ? context : {},
    )
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.post('/api/recalibrate-assumptions', async (req, res) => {
  try {
    const { userPrompt, conditionKind, dateISO, localDateISO, localMin, tasks, currentAssumptions } = req.body || {}
    if (
      !conditionKind ||
      !dateISO ||
      !localDateISO ||
      typeof localMin !== 'number' ||
      !Array.isArray(tasks) ||
      !Array.isArray(currentAssumptions)
    ) {
      return res
        .status(400)
        .json({ error: 'conditionKind, dateISO, localDateISO, localMin, tasks, currentAssumptions required' })
    }
    if (!['prompt-only', 'mental-model-explicit'].includes(conditionKind)) {
      return res.status(400).json({ error: 'invalid conditionKind' })
    }
    const result = await llmBehaviorAssumptions(
      String(userPrompt || ''),
      conditionKind,
      String(dateISO),
      String(localDateISO),
      Number(localMin),
      tasks,
      currentAssumptions,
    )
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.post('/api/session', upload.any(), async (req, res) => {
  try {
    if (requireSupabase && !supabase) {
      return res.status(503).json({
        error:
          'Cloud persistence required but Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.',
      })
    }
    const meta = req.body.meta ? JSON.parse(req.body.meta) : {}
    const participantId = meta.participantId || 'unknown'
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const recFile = req.files?.find((f) => f.fieldname === 'recording')
    let recordingPath = null

    let supabaseWarning = null
    if (supabase) {
      try {
        if (recFile) {
          recordingPath = `${participantId}/${stamp}-${recFile.filename}`
          const fileBuffer = fs.readFileSync(recFile.path)
          const uploadRes = await supabase.storage.from(supabaseBucket).upload(recordingPath, fileBuffer, {
            contentType: recFile.mimetype || 'video/webm',
            upsert: false,
          })
          if (uploadRes.error) {
            throw new Error(`Supabase recording upload failed: ${uploadRes.error.message}`)
          }
          try {
            fs.unlinkSync(recFile.path)
          } catch {
            /* ignore temp file cleanup errors */
          }
        }

        const insertRes = await supabase
          .from('sessions')
          .insert({
            participant_id: participantId,
            sequence_number: Number.isFinite(meta.sequenceNumber) ? Number(meta.sequenceNumber) : null,
            task1: meta.task1 ?? null,
            task2: meta.task2 ?? null,
            questionnaire_after_task1: meta.questionnaireAfterTask1 ?? null,
            questionnaire_after_task2: meta.questionnaireAfterTask2 ?? null,
            final_comparison: meta.finalComparison ?? null,
            events: meta.events ?? null,
            recording_path: recordingPath,
            recording_bytes: recFile?.size ?? meta.screenRecordingBytes ?? null,
          })
          .select('id')
          .single()

        if (insertRes.error) {
          throw new Error(`Supabase session insert failed: ${insertRes.error.message}`)
        }

        return res.json({ ok: true, savedRowId: insertRes.data?.id ?? null, recording: recordingPath })
      } catch (supabaseErr) {
        console.error('[session] Supabase write failed, falling back to local:', supabaseErr)
        const msg = supabaseErr instanceof Error ? supabaseErr.message : String(supabaseErr)
        supabaseWarning = msg.slice(0, 220)
        if (requireSupabase) {
          return res.status(502).json({
            error:
              'Cloud persistence failed while REQUIRE_SUPABASE=true. Session was not accepted to avoid local-only saves.',
            detail: supabaseWarning,
          })
        }
      }
    }

    // Local fallback (no Supabase configured)
    const base = path.join(DATA, `${participantId}_${stamp}`)
    fs.writeFileSync(`${base}.json`, JSON.stringify(meta, null, 2), 'utf8')
    let recordingFilename = null
    if (recFile) {
      recordingFilename = recFile.filename
      if (recFile.path !== path.join(DATA, recordingFilename)) {
        fs.renameSync(recFile.path, path.join(DATA, recordingFilename))
      }
    }
    res.json({ ok: true, savedJson: `${base}.json`, recording: recordingFilename, supabaseWarning })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: String(e?.message || e) })
  }
})

// Serve built frontend (Render / production). In local API-only runs without build output,
// these routes are skipped and only /api/* remains active.
const DIST = path.join(ROOT, 'dist')
const DIST_INDEX = path.join(DIST, 'index.html')
if (fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(DIST_INDEX)
  })
}

const PORT = Number(process.env.PORT || 8787)
const server = app.listen(PORT, () => {
  console.log(`Session API http://localhost:${PORT}  →  saving to ${DATA}`)
  if (fs.existsSync(DIST_INDEX)) {
    console.log(`Static app enabled from ${DIST}`)
  }
})
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${PORT} is already in use (another process is listening).\n` +
        `  Try: npm run dev:free-port   then   npm run dev\n` +
        `  Or: lsof -i :${PORT}   then   kill <PID>\n` +
        `  Frontend only: npm run dev:client`,
    )
    process.exit(1)
  }
  throw err
})
