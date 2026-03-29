/** Single-day planner: builds calendar blocks from scenario tasks. */

import type {
  AssumptionStatus,
  PlanResult,
  ScenarioConfig,
  ScenarioId,
  ScenarioTask,
  ScheduledBlock,
} from '../types/types'
import { MAX_TASK_DURATION_MIN } from '../lib/constants'
import { addDaysISO, localCalendarDateISO, startOfWeekISO, todayOffsetInAnchorWeek } from '../lib/dateRange'

export type AssumptionStateMap = Record<string, AssumptionStatus | undefined>

function sortBlocks(blocks: ScheduledBlock[]): ScheduledBlock[] {
  return [...blocks].sort((a, b) => a.startMin - b.startMin)
}

function tasksToBlocks(tasks: ScenarioTask[], dateISO: string): ScheduledBlock[] {
  const weekStartISO = startOfWeekISO(dateISO)
  return tasks.map((t) => {
    const start = Math.max(0, Math.min(1439, t.startMin ?? 9 * 60))
    const dur = Math.max(15, Math.min(MAX_TASK_DURATION_MIN, t.durationMin ?? 60))
    const end = Math.min(1440, start + dur)
    const dayOffset = Math.max(0, Math.min(6, Math.round(t.dayOffset ?? 0)))
    return {
      id: `blk-${t.id}`,
      dateISO: addDaysISO(weekStartISO, dayOffset),
      startMin: start,
      endMin: end,
      label: t.label,
      kind: t.kind ?? 'admin',
      pinned: t.pinned ?? false,
    }
  })
}

function detectOverlaps(blocks: ScheduledBlock[]): string[] {
  const out: string[] = []
  const byDate = new Map<string, ScheduledBlock[]>()
  for (const b of blocks) {
    if (!byDate.has(b.dateISO)) byDate.set(b.dateISO, [])
    byDate.get(b.dateISO)!.push(b)
  }
  for (const [dateISO, dayBlocks] of byDate.entries()) {
    const sorted = [...dayBlocks].sort((a, b) => a.startMin - b.startMin)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startMin < sorted[i].endMin) {
          out.push(`Conflict on ${dateISO}: "${sorted[i].label}" overlaps "${sorted[j].label}".`)
        }
      }
    }
  }
  return out
}

const WORKOUT_ASSUMPTION_HINT =
  /(workout|exercise|gym|run\b|jog|training|movement\s*\/\s*reset|physical\s*activity)/i

/** True when assumption text plausibly encodes a recurring / daily workout habit (used for auto blocks + cleanup). */
export function isWorkoutRoutineAssumptionText(text: string): boolean {
  if (!WORKOUT_ASSUMPTION_HINT.test(text)) return false
  return (
    /(daily|every\s*day|routine|regular|weekday|weekends?|each\s*day|all\s*week)/i.test(text) ||
    /\d{1,2}\s*(:\d{2})?\s*(am|pm)/i.test(text) ||
    /\b(5|6)\s*(pm|am|:)/i.test(text)
  )
}

/**
 * Collapse duplicate workout health blocks on the **same day** (same dayOffset+time+label).
 * Keys must include dayOffset — otherwise Mon–Sun slots at the same clock time share one key and
 * every matching block was removed, wiping the whole week after a routine assumption was rejected.
 */
function stripRecurringHealthWorkouts(tasks: ScenarioTask[], changes: string[]): ScenarioTask[] {
  const key = (t: ScenarioTask) =>
    `${Math.round(t.dayOffset ?? 0)}-${t.startMin}-${(t.label || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 48)}`
  const candidates = tasks.filter((t) => t.kind === 'health' && WORKOUT_ASSUMPTION_HINT.test(t.label))
  const counts = new Map<string, number>()
  for (const t of candidates) {
    const k = key(t)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const duplicateKeys = new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k))
  const seen = new Set<string>()
  const next = tasks.filter((t) => {
    if (t.kind !== 'health' || !WORKOUT_ASSUMPTION_HINT.test(t.label)) return true
    const k = key(t)
    if (!duplicateKeys.has(k)) return true
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (next.length !== tasks.length) {
    changes.push('Removed duplicate workout blocks on the same day after the workout assumption was marked incorrect.')
  }
  return next
}

/**
 * If any task sits on a day before "today" in the anchor week, shift all tasks forward by the same
 * delta so the earliest task lands on today — preserves spacing between days (avoids collapsing
 * every task onto one day).
 */
function shiftPastWeekDaysForward(tasks: ScenarioTask[], dateISO: string, changes: string[]): ScenarioTask[] {
  const todayOff = todayOffsetInAnchorWeek(dateISO, localCalendarDateISO())
  if (todayOff === null || tasks.length === 0) return tasks
  const normalized = tasks.map((t) => Math.max(0, Math.min(6, Math.round(t.dayOffset ?? 0))))
  const minOff = Math.min(...normalized)
  if (minOff >= todayOff) return tasks
  const delta = todayOff - minOff
  let mutated = false
  const next = tasks.map((t) => {
    const raw = Math.max(0, Math.min(6, Math.round(t.dayOffset ?? 0)))
    const d = Math.min(6, raw + delta)
    if (d !== raw) mutated = true
    return { ...t, dayOffset: d }
  })
  if (mutated) {
    changes.push(
      'Days before today in this week were shifted later so planning starts from today, keeping relative day spacing.',
    )
  }
  return next
}

/** Assumption states drive plan updates only when assumptions are marked incorrect. */
function applyAssumptionDrivenTaskAdjustments(
  scenario: ScenarioConfig,
  tasks: ScenarioTask[],
  states: AssumptionStateMap,
  changes: string[],
  _dateISO: string,
): ScenarioTask[] {
  let next = tasks.filter((t) => !t.id.startsWith('t-auto-workout-'))

  const incorrectWorkout = scenario.assumptions.some(
    (a) => states[a.id] === 'incorrect' && isWorkoutRoutineAssumptionText(a.text),
  )
  if (incorrectWorkout) {
    next = stripRecurringHealthWorkouts(next, changes)
  }

  return next
}

function buildDefaultPlan(
  scenario: ScenarioConfig,
  states: AssumptionStateMap,
  dateISO: string,
): PlanResult {
  const changes: string[] = []
  const baseTasks = scenario.tasks.map((t) => ({ ...t }))
  const adjustedTasks = applyAssumptionDrivenTaskAdjustments(scenario, baseTasks, states, changes, dateISO)
  const tasks = shiftPastWeekDaysForward(adjustedTasks.map((t) => ({ ...t })), dateISO, changes)

  const blocks = tasksToBlocks(tasks, dateISO)
  const conflicts = detectOverlaps(blocks)
  const scenarioPatch =
    JSON.stringify(tasks) !== JSON.stringify(scenario.tasks) ? { tasks } : undefined

  return {
    blocks: sortBlocks(blocks),
    conflicts,
    changeLog: changes,
    ...(scenarioPatch ? { scenarioPatch } : {}),
  }
}

export function buildPlan(
  _scenarioId: ScenarioId,
  scenario: ScenarioConfig,
  states: AssumptionStateMap,
  dateISO: string,
): PlanResult {
  return buildDefaultPlan(scenario, states, dateISO)
}
