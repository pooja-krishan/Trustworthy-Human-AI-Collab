/**
 * Full-plan LLM prompts + JSON schema (Google Gemini).
 *
 * The model infers intent, proposes tasks with time blocks, constraints, assumptions, and optional clarifications.
 */

import { SchemaType } from '@google/generative-ai'

const TASK_KINDS = ['meeting', 'deepwork', 'health', 'admin']

/** Keep in sync with `src/lib/constants.ts` MAX_TASK_DURATION_MIN */
const MAX_TASK_DURATION_MIN = 24 * 60

/** Response shape for structured output. */
export function fullPlanResponseSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: {
      clarificationsNeeded: {
        type: SchemaType.ARRAY,
        description:
          '0–3 short questions ONLY when critical information is missing to build a reasonable schedule. Empty array if the message is sufficient.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING, description: 'Stable id, e.g. q-meeting-time' },
            question: {
              type: SchemaType.STRING,
              description: 'One concise question (no preamble). Shown next to a text box in the UI.',
            },
          },
          required: ['id', 'question'],
        },
      },
      tasks: {
        type: SchemaType.ARRAY,
        description:
          '5–9 tasks for a planning week. Each task has a dayOffset (0=week start..6=week end), start time (minutes from midnight), and duration. Fields are editable in the UI.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING, description: 'Stable id, e.g. t-report, t-meeting' },
            label: {
              type: SchemaType.STRING,
              description:
                'Action + purpose label, e.g. "Draft sponsor email for Thursday launch". Avoid vague labels like "admin" or "work".',
            },
            dayOffset: {
              type: SchemaType.INTEGER,
              description: '0–6 where 0 is the selected week start day',
            },
            startMin: {
              type: SchemaType.INTEGER,
              description: 'Start time as minutes from midnight (0–1440), e.g. 9:00 AM = 540',
            },
            durationMin: {
              type: SchemaType.INTEGER,
              description: `Duration in minutes, 15–${MAX_TASK_DURATION_MIN} (full day max)`,
            },
            kind: {
              type: SchemaType.STRING,
              enum: TASK_KINDS,
              description: 'meeting=fixed sync; deepwork=focused solo; health=wellness; admin=light tasks',
            },
            pinned: {
              type: SchemaType.BOOLEAN,
              description: 'true if this block should be treated as immovable (e.g. fixed meeting)',
            },
          },
          required: ['id', 'label', 'dayOffset', 'startMin', 'durationMin', 'kind', 'pinned'],
        },
      },
      constraints: {
        type: SchemaType.ARRAY,
        description:
          '1–3 short scheduling rules inferred from the user message. Each label must be one concise line (under ~120 chars), user-facing, no JSON or internal field names.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING },
            label: { type: SchemaType.STRING },
            hard: { type: SchemaType.BOOLEAN, description: 'true = must not violate' },
            category: {
              type: SchemaType.STRING,
              enum: ['time', 'preference', 'resource', 'other'],
              description:
                'time = clock windows/deadlines; preference = style/energy; resource = people/tools/location; other',
            },
          },
          required: ['id', 'label', 'hard', 'category'],
        },
      },
      assumptions: {
        type: SchemaType.ARRAY,
        description:
          '2–5 scheduling-relevant assumptions in plain language.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING },
            text: { type: SchemaType.STRING },
          },
          required: ['id', 'text'],
        },
      },
    },
    required: ['clarificationsNeeded', 'tasks', 'constraints', 'assumptions'],
  }
}

/**
 */
export function buildFullPlanSystemInstruction() {
  return `You are the interpretation layer for a research prototype about AI-assisted day planning.

## Output
Return ONLY JSON (schema enforced). Fields: clarificationsNeeded[], tasks[], constraints[], assumptions[] — all for a **single calendar week**.

## Intent and tasks
- Infer the user's **intent** from the message (even if vague, messy, or very short) and split it into **tasks with concrete weekly time blocks**.
- Each task must include \`dayOffset\` (0..6), \`startMin\`, \`durationMin\`, \`kind\`, and \`pinned\` (true only for truly fixed commitments like a scheduled meeting).
- Unless the user clearly specifies weekdays/dates, schedule tasks on \`dayOffset: 0\` (the next available planning day) by default.
- Task labels must state the action and purpose (e.g., "Finalize draft deck for demo"), never generic labels like "admin", "misc", or "work".
- When the user names a **specific weekday or calendar date** for an event, set \`dayOffset\` to that day **even if** another task already uses that time. Do **not** silently move either event to a different day to avoid overlap—both stay on the day the user stated.
- **Avoid overlapping** blocks when the user did not fix a day/time; when they did fix both items on the same day and time, overlaps are OK—the UI shows them side by side.
- Use \`kind\` accurately: meeting vs deepwork vs health vs admin.

## clarificationsNeeded
- If the schedule can be built with reasonable defaults, return **[]**.
- Otherwise add up to **3** focused questions (each with id + question). Questions must be answerable in one short line in a text box.

## constraints
- 1–3 items: time windows, "no evening work", fixed appointments, etc.
- \`hard: true\` only for strict rules the user stated clearly; \`hard: false\` for preferences.
- Set \`category\`: time | preference | resource | other.

## assumptions
- Output **2 to 5** assumptions in total.
- Each line should reflect a **meaningful** scheduling interpretation: default **working hours** if unstated, **relaxation / wind-down** if hinted, recurring habit **daily vs weekly**, **time band** for exercise when vague, priorities when the user listed several, etc.
- Do **not** surface trivial calendar restatements (for example: mapping "tomorrow" to a calendar date, explaining dayOffset, ISO dates, or "Mar 29" style disambiguation). Those are handled internally and must not appear as assumptions.
- Each line: **one short crisp sentence** (about 18 words max), plain language, no bullet symbols.
- Do not mention JSON or research internals in user-facing text.

## Rules
- Ground everything in the user's message; do not invent unrelated commitments.
- If the message is vague, still output a coherent task list with conservative times and **2–5** assumptions (see assumptions section).
- Keep labels concise (under ~8 words each).`
}

export function buildFullPlanUserMessage(userPrompt, dateISO, localDateISO, localMin, context = {}) {
  const previousPrompts = Array.isArray(context.previousPrompts) ? context.previousPrompts.slice(-6) : []
  const currentTasks = Array.isArray(context.currentTasks) ? context.currentTasks : []
  const currentAssumptions = Array.isArray(context.currentAssumptions) ? context.currentAssumptions : []
  const clarificationAnswers =
    context.clarificationAnswers && typeof context.clarificationAnswers === 'object' ? context.clarificationAnswers : {}
  const contextSection =
    previousPrompts.length || currentTasks.length || currentAssumptions.length || Object.keys(clarificationAnswers).length
      ? `

In-session context (continue from this state, do not reset):
- Previous prompt turns:
${JSON.stringify(previousPrompts, null, 2)}
- Current tasks before this generation:
${JSON.stringify(currentTasks, null, 2)}
- Current assumptions before this generation:
${JSON.stringify(currentAssumptions, null, 2)}
- Clarification answers provided by user (keys starting with "reject-" mean the user rejected that assumption and supplied a correction—honor it in tasks/constraints):
${JSON.stringify(clarificationAnswers, null, 2)}
`
      : ''
  return `User message (natural language, weekly planning):

"""
${userPrompt.trim()}
"""

Selected date anchor (within study window): ${dateISO}
User local date: ${localDateISO}
User local time (minutes from midnight): ${localMin}
Interpret dayOffset relative to the Monday-based week containing this date:
- dayOffset 0 = Monday of anchor week
- dayOffset 1 = Tuesday
- ...
- dayOffset 6 = Sunday

If user specifies explicit dates (e.g., "March 12") or weekdays (Monday, Tuesday, …), map **each** mentioned event to the **matching** dayOffset for this anchor week—do not merge distinct events onto one day because of a time clash.
When no explicit day is provided, avoid scheduling in already-past time slots relative to the user's local date/time.
${contextSection}

Produce the JSON object now: infer intent, propose weekly tasks with dayOffset/start/duration, constraints, and assumptions.`
}

export function behaviorAssumptionsResponseSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: {
      assumptions: {
        type: SchemaType.ARRAY,
        description:
          'Exactly 3 assumptions inferred from how the user manually moved/edited events.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING },
            text: { type: SchemaType.STRING },
          },
          required: ['id', 'text'],
        },
      },
    },
    required: ['assumptions'],
  }
}

export function buildBehaviorAssumptionsSystemInstruction() {
  return `You update planner assumptions based on observed user scheduling behavior.

## Output
Return ONLY JSON with assumptions[].

## Task
- Infer what the user seems to prefer based on edited/moved task blocks.
- Return exactly 3 concise assumptions (behavioral and scheduling-focused).
- Each assumption must be plain language and actionable.
- Do NOT mention JSON, studies, or hidden conditions.
`
}

export function buildBehaviorAssumptionsUserMessage(userPrompt, dateISO, localDateISO, localMin, tasks, currentAssumptions) {
  return `Original user prompt:
"""
${userPrompt.trim()}
"""

Anchor date for this schedule week: ${dateISO}
User local date/time context: ${localDateISO} @ ${localMin} minutes

Current edited tasks:
${JSON.stringify(tasks, null, 2)}

Current non-seed assumptions:
${JSON.stringify(currentAssumptions, null, 2)}

Return JSON now with updated assumptions inferred from the edits.`
}

const CONSTRAINT_CATEGORIES = new Set(['time', 'preference', 'resource', 'other'])
const TASK_KINDS_SET = new Set(TASK_KINDS)
const GENERIC_TASK_LABEL = /^(admin|work|task|misc|stuff|to-?do|light admin)\b/i
const DAY_SIGNAL = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week|weekend|weekday|\d{1,2}[:/.-]\d{1,2})\b/i

/** Assumption count cap shown in UI. */
const MAX_ASSUMPTIONS = 5

function localISODateFromDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday 00:00 local for the week containing `dateISO` (matches client `startOfWeekISO`). */
function startOfWeekISOFromAnchor(dateISO) {
  const d = new Date(dateISO + 'T12:00:00')
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday)
  return localISODateFromDate(d)
}

/** Drop trivial calendar / internal phrasing; keep only scheduling-mental-model foils. */
function shouldSurfaceAssumptionFoil(text) {
  const t = String(text || '').trim()
  if (!t) return false
  const low = t.toLowerCase()
  if (/\bdayoffset\b|\biso\s*date\b|\bjson\b|schema/.test(low)) return false
  if (/\bmaps to\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(low)) return false
  if (/\b(tomorrow|today|tonight)\b.*\b(20\d{2}-\d{2}-\d{2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b)/.test(low)) {
    return false
  }
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(low) && t.length < 110) return false
  return true
}

/**
 * Sanitize LLM output for client use.
 */
export function mergeParsedPlan(parsed, userPrompt, conditionKind, context = {}) {
  const isPromptOnly = conditionKind === 'prompt-only'
  const promptHasDaySignal = DAY_SIGNAL.test(userPrompt)
  const localDateISO = typeof context.localDateISO === 'string' ? context.localDateISO : null
  const localMin = typeof context.localMin === 'number' ? context.localMin : null
  const dateISO = typeof context.dateISO === 'string' ? context.dateISO : null

  let clarificationsNeeded = []
  if (Array.isArray(parsed.clarificationsNeeded)) {
    clarificationsNeeded = parsed.clarificationsNeeded
      .filter((q) => q && typeof q.question === 'string' && q.question.trim())
      .map((q, i) => ({
        id: typeof q.id === 'string' && q.id ? q.id : `q-${i}`,
        question: String(q.question).trim().slice(0, 500),
      }))
      .slice(0, 3)
  }

  let tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
  tasks = tasks.map((t, i) => {
    const dayOffsetRaw = typeof t.dayOffset === 'number' ? t.dayOffset : 0
    const dayOffset = Math.max(0, Math.min(6, Math.round(dayOffsetRaw)))
    const startRaw = typeof t.startMin === 'number' ? t.startMin : 9 * 60
    const startMin = Math.max(0, Math.min(1439, Math.round(startRaw)))
    const durRaw = typeof t.durationMin === 'number' ? t.durationMin : 60
    const durationMin = Math.min(MAX_TASK_DURATION_MIN, Math.max(15, Math.round(durRaw)))
    const kind = TASK_KINDS_SET.has(t.kind) ? t.kind : 'admin'
    const labelRaw = typeof t.label === 'string' && t.label.trim() ? t.label.trim() : 'Task'
    const label = GENERIC_TASK_LABEL.test(labelRaw) ? `Complete ${labelRaw} item` : labelRaw
    return {
      id: typeof t.id === 'string' && t.id ? t.id : `t-${i}`,
      label,
      dayOffset,
      startMin,
      durationMin,
      kind,
      pinned: Boolean(t.pinned),
    }
  })
  if (!tasks.length) {
    throw new Error('LLM response did not include any tasks. Please refine prompt and retry.')
  }
  if (!promptHasDaySignal) {
    const hadSpread = tasks.some((t) => t.dayOffset !== 0)
    tasks = tasks.map((t) => ({ ...t, dayOffset: 0 }))
    if (hadSpread) {
      const hasDayClarification = clarificationsNeeded.some((q) => /\b(day|date|weekday|week)\b/i.test(q.question))
      if (!hasDayClarification && clarificationsNeeded.length < 3) {
        clarificationsNeeded.push({
          id: 'q-day-preference',
          question:
            'Should any tasks be placed on specific days later this week, or should all of them stay on the next available day?',
        })
      }
    }
  }

  // Start from local "today" within the anchor week: shift by min dayOffset (preserves spacing between days).
  if (localDateISO && dateISO) {
    const weekStartISO = startOfWeekISOFromAnchor(dateISO)
    const today = new Date(localDateISO + 'T12:00:00')
    const diffDays = Math.floor(
      (today.getTime() - new Date(weekStartISO + 'T12:00:00').getTime()) / 86400000,
    )
    const todayOffset = diffDays >= 0 && diffDays <= 6 ? diffDays : null
    if (todayOffset != null) {
      const lm = typeof localMin === 'number' ? localMin : 12 * 60
      const offsets = tasks.map((t) => Math.max(0, Math.min(6, Math.round(t.dayOffset ?? 0))))
      const minOff = Math.min(...offsets)
      const delta = minOff < todayOffset ? todayOffset - minOff : 0
      tasks = tasks.map((t) => {
        let d = Math.max(0, Math.min(6, Math.round(t.dayOffset ?? 0)))
        if (delta > 0) d = Math.min(6, d + delta)
        let s = t.startMin
        if (d === todayOffset && s < lm + 15) {
          if (lm <= 23 * 60) s = Math.min(23 * 60, Math.max(lm + 30, 8 * 60))
          else d = Math.min(6, d + 1)
        }
        return { ...t, dayOffset: d, startMin: s }
      })
    }
  }

  let constraints = Array.isArray(parsed.constraints) ? parsed.constraints : []
  constraints = constraints.map((c, i) => ({
    id: typeof c.id === 'string' && c.id ? c.id : `c-${i}`,
    label:
      typeof c.label === 'string' && c.label.trim()
        ? c.label.trim().slice(0, 200)
        : 'Constraint',
    hard: Boolean(c.hard),
    category: CONSTRAINT_CATEGORIES.has(c.category) ? c.category : 'other',
  }))

  const rawAssumptions = Array.isArray(parsed.assumptions) ? parsed.assumptions : []

  const assumptions = rawAssumptions
    .map((a, i) => ({
      id: typeof a.id === 'string' && a.id ? a.id : `a-${i}`,
      text: typeof a.text === 'string' && a.text.trim() ? a.text.trim().slice(0, 240) : 'Interpretation',
    }))
    .filter((a) => shouldSurfaceAssumptionFoil(a.text))
    .slice(0, MAX_ASSUMPTIONS)

  return {
    id: isPromptOnly ? 'scenario-1' : 'scenario-2',
    title: 'hidden',
    defaultPrompt: userPrompt,
    clarificationsNeeded,
    tasks,
    constraints,
    assumptions,
    llmFallback: false,
  }
}

export function mergeBehaviorAssumptions(parsed, existingAssumptions) {
  const incoming = Array.isArray(parsed?.assumptions) ? parsed.assumptions : []
  const incomingNormalized = incoming
    .map((a, i) => ({
      id: typeof a.id === 'string' && a.id ? a.id : `a-behavior-${i}`,
      text: typeof a.text === 'string' && a.text.trim() ? a.text.trim() : '',
    }))
    .filter((a) => a.text.length > 0)
    .slice(0, MAX_ASSUMPTIONS)

  const existingNormalized = (Array.isArray(existingAssumptions) ? existingAssumptions : [])
    .filter((a) => a && typeof a.text === 'string' && a.text.trim().length > 0)
    .map((a, i) => ({
      id: typeof a.id === 'string' && a.id ? a.id : `a-existing-${i}`,
      text: String(a.text).trim(),
    }))

  // Preserve existing mental model and append new behavioral cues without duplicating.
  const merged = [...existingNormalized]
  for (const candidate of incomingNormalized) {
    const dup = merged.some(
      (x) => x.id === candidate.id || x.text.toLowerCase() === candidate.text.toLowerCase(),
    )
    if (!dup) merged.push(candidate)
  }
  return merged.slice(0, MAX_ASSUMPTIONS)
}
