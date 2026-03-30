import { useCallback, useMemo, useRef, useState } from 'react'
import { AppLayout } from './components/AppLayout'
import { AssumptionsPanel } from './components/AssumptionsPanel'
import { InputBar } from './components/InputBar'
import { RecentChangesPanel } from './components/RecentChangesPanel'
import { TasksConstraintsPanel } from './components/TasksConstraintsPanel'
import { ConflictsPanel } from './components/ConflictsPanel'
import { WeekCalendarPanel } from './components/WeekCalendarPanel'
import { uploadSession, parsePlan, recalibrateAssumptions, requestSessionOrder } from './lib/api'
import { defaultStudyDateISO, studyYearBounds } from './lib/dateRange'
import {
  conditionForTaskIndex,
  orderByArmIndex,
  orderBySequence,
  type CounterbalancedOrder,
} from './lib/latinSquare'
import { newParticipantId } from './lib/participantId'
import { applyPromptScheduleRefinements } from './lib/scheduleRefinements'
import { createLogEvent, downloadLogsJson } from './logging/logging'
import { buildPlan, isWorkoutRoutineAssumptionText, type AssumptionStateMap } from './planner/planner'
import { CompleteScreen } from './screens/CompleteScreen'
import { FinalComparisonScreen } from './screens/FinalComparisonScreen'
import { QuizScreen } from './screens/QuizScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { AssumptionRejectModal } from './components/AssumptionRejectModal'
import { CombinedPlanningBrief } from './components/ScenarioBriefCard'
import { PARTICIPANT_SCENARIO_BRIEF, TASK_VARIANT_BRIEF } from './content/participantScenarios'
import type { LikertKey, ScenarioQuestionnaireValues } from './components/questionnaireItems'
import type {
  ClarificationItem,
  ConditionKind,
  LogEvent,
  PlanResult,
  ScenarioConfig,
  ScenarioId,
  ScenarioTask,
} from './types/types'
import './App.css'

type TaskIx = 1 | 2
type FinalComparisonValues = {
  betterInteraction: 'prompt-only' | 'mental-model-explicit' | 'tie' | ''
  promptOnlyRating: number | null
  mentalModelRating: number | null
  explanation: string
}

const MAX_UI_ACTIVITY = 10

function appendUiChanges(prev: string[], lines: string[]): string[] {
  const merged = [...prev]
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (merged[merged.length - 1] !== t) merged.push(t)
  }
  return merged.slice(-MAX_UI_ACTIVITY)
}

interface TaskBundle {
  inputText: string
  promptHistory: string[]
  dateISO: string
  scenario: ScenarioConfig | null
  assumptionStates: AssumptionStateMap
  lastPlan: PlanResult | null
  /** Visible UI updates only (not conflicts, not raw user intent). */
  recentUiChanges: string[]
  clarificationAnswers: Record<string, string>
  /** Non-seed assumptions hidden from the panel (UI only; still in scenario for logs). */
  dismissedAssumptionIds: string[]
  llmModel: string | null
  rawLlm: unknown
}

/**
 * Follow-up parses often use new task ids; union-by-id left stale LLM blocks visible until another prompt.
 * Incoming LLM tasks replace prior LLM tasks; only user-created rows are kept when not superseded.
 */
function mergeTasksPreservingEdits(previousTasks: ScenarioTask[], incomingTasks: ScenarioTask[]): ScenarioTask[] {
  const incomingIds = new Set(incomingTasks.map((t) => t.id))
  const userKept = previousTasks.filter((t) => t.id.startsWith('t-user-') && !incomingIds.has(t.id))
  return [...incomingTasks, ...userKept]
}

const CLAR_AFTER_WORKOUT_REJECT = 'q-after-workout-reject'

function injectWorkoutRejectClarification(sc: ScenarioConfig, assumptionId: string): ScenarioConfig {
  const a = sc.assumptions.find((x) => x.id === assumptionId)
  if (!a || !isWorkoutRoutineAssumptionText(a.text)) return sc
  const existing = sc.clarificationsNeeded ?? []
  if (existing.some((q) => q.id === CLAR_AFTER_WORKOUT_REJECT)) return sc
  const injected = {
    id: CLAR_AFTER_WORKOUT_REJECT,
    question:
      'Should any workouts stay on the calendar? If yes, which days and what time window?',
  }
  // Prepend so a full prior list (4) does not push this question past .slice(0, 4).
  return {
    ...sc,
    clarificationsNeeded: [injected, ...existing.filter((q) => q.id !== CLAR_AFTER_WORKOUT_REJECT)].slice(
      0,
      4,
    ),
  }
}

/** Latest parse first, then prior rows; cap at 5 assumptions. */
function mergeAssumptionsAppendOnly(
  previous: ScenarioConfig['assumptions'],
  incoming: ScenarioConfig['assumptions'],
): ScenarioConfig['assumptions'] {
  const incomingRows = incoming
  const previousRows = previous

  const merged: ScenarioConfig['assumptions'] = []
  const pushDeduped = (a: (typeof incomingRows)[number]) => {
    if (merged.some((x) => x.id === a.id || x.text.toLowerCase() === a.text.toLowerCase())) return
    merged.push(a)
  }
  for (const a of incomingRows) pushDeduped(a)
  for (const a of previousRows) pushDeduped(a)

  return merged.slice(0, 5)
}

/**
 * Union clarifications; **incoming first** so the latest parse wins on id collisions.
 * Drops rows already answered.
 */
function mergeClarificationsNeeded(
  previous: ScenarioConfig | null,
  incoming: ScenarioConfig,
  answers: Record<string, string>,
): ClarificationItem[] {
  const byId = new Map<string, ClarificationItem>()
  for (const q of incoming.clarificationsNeeded ?? []) {
    if ((answers[q.id] ?? '').trim()) continue
    byId.set(q.id, q)
  }
  for (const q of previous?.clarificationsNeeded ?? []) {
    if ((answers[q.id] ?? '').trim()) continue
    if (!byId.has(q.id)) byId.set(q.id, q)
  }
  return [...byId.values()].slice(0, 4)
}

function pruneDismissedAssumptions(dismissed: string[], assumptions: ScenarioConfig['assumptions']): string[] {
  const ids = new Set(assumptions.map((a) => a.id))
  return dismissed.filter((id) => ids.has(id))
}

function emptyTask(): TaskBundle {
  return {
    inputText: '',
    promptHistory: [],
    dateISO: defaultStudyDateISO(),
    scenario: null,
    assumptionStates: {},
    lastPlan: null,
    recentUiChanges: [],
    clarificationAnswers: {},
    dismissedAssumptionIds: [],
    llmModel: null,
    rawLlm: null,
  }
}

/** Keep only statuses for assumptions still in the scenario; default missing ids to unreviewed. */
function assumptionStatesForScenario(
  scenario: ScenarioConfig,
  prior: AssumptionStateMap,
  override?: AssumptionStateMap,
): AssumptionStateMap {
  const base = override ?? prior
  const out: AssumptionStateMap = {}
  for (const a of scenario.assumptions) {
    out[a.id] = base[a.id] ?? 'unreviewed'
  }
  return out
}

type Phase = 'welcome' | 'task1' | 'q1' | 'task2' | 'q2' | 'qFinal' | 'complete'

export default function App() {
  const participantId = useMemo(() => newParticipantId(), [])
  const [latinOrder, setLatinOrder] = useState<CounterbalancedOrder | null>(null)
  const [sequenceNumber, setSequenceNumber] = useState<number | null>(null)

  const [phase, setPhase] = useState<Phase>('welcome')
  const [tb, setTb] = useState<{ 1: TaskBundle; 2: TaskBundle }>({ 1: emptyTask(), 2: emptyTask() })
  const [q1, setQ1] = useState<ScenarioQuestionnaireValues>({ ratings: {}, details: {} })
  const [q2, setQ2] = useState<ScenarioQuestionnaireValues>({ ratings: {}, details: {} })
  const [qFinal, setQFinal] = useState<FinalComparisonValues>({
    betterInteraction: '',
    promptOnlyRating: null,
    mentalModelRating: null,
    explanation: '',
  })
  const [events, setEvents] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [recentViewedLogged, setRecentViewedLogged] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ assumptionId: string; text: string } | null>(null)
  const orderSourceRef = useRef<'url' | 'server'>('server')
  const planGenerateInFlight = useRef(false)

  const taskStartMs = useRef<Record<TaskIx, number | null>>({ 1: null, 2: null })
  const taskStartIso = useRef<Record<TaskIx, string | null>>({ 1: null, 2: null })
  const taskEndIso = useRef<Record<TaskIx, string | null>>({ 1: null, 2: null })

  const prevSig = useRef<Record<TaskIx, string>>({ 1: '', 2: '' })
  /** Incremented on each calendar-driven assumption recalibration; stale responses are dropped. */
  const recalibrateGen = useRef<Record<TaskIx, number>>({ 1: 0, 2: 0 })

  const appendEvents = useCallback((next: LogEvent[]) => {
    setEvents((e) => [...e, ...next])
  }, [])

  const log = useCallback(
    (
      scenarioId: ScenarioId | null,
      eventType: LogEvent['eventType'],
      metadata: Record<string, unknown> = {},
      taskIndex?: TaskIx,
    ) => {
      const conditionKind: ConditionKind | undefined =
        taskIndex != null && latinOrder ? conditionForTaskIndex(latinOrder, taskIndex) : undefined
      appendEvents([
        createLogEvent(scenarioId, eventType, {
          ...metadata,
          participantId,
          ...(conditionKind != null ? { conditionKind, planningTaskIndex: taskIndex } : {}),
        }),
      ])
    },
    [appendEvents, latinOrder, participantId],
  )

  const currentTaskIndex = (): TaskIx | null => {
    if (phase === 'task1') return 1
    if (phase === 'task2') return 2
    return null
  }

  const handleGenerate = async (
    opts?: {
      clarificationAnswers?: Record<string, string>
      /** When set (e.g. after assumption reject), merge uses this instead of stale bundle.scenario. */
      previousScenarioForMerge?: ScenarioConfig | null
      assumptionStatesForPlan?: AssumptionStateMap
    },
  ) => {
    const ti = currentTaskIndex()
    if (!ti) return
    const bundle = tb[ti]
    if (!latinOrder) {
      setGenError('Session order is not ready yet. Please try again.')
      return
    }
    const cond = conditionForTaskIndex(latinOrder, ti)
    const rawInput = bundle.inputText.trim()
    const mergedClarificationAnswers = { ...bundle.clarificationAnswers, ...opts?.clarificationAnswers }
    const hasNewClarifications = Object.keys(opts?.clarificationAnswers ?? {}).length > 0
    const canRunWithoutTypedLine =
      hasNewClarifications && bundle.promptHistory.length > 0 && Boolean(bundle.scenario || opts?.previousScenarioForMerge)

    if (!rawInput && !canRunWithoutTypedLine) {
      setGenError('Please enter instructions first.')
      return
    }

    if (planGenerateInFlight.current) return
    setGenError(null)
    setLoading(true)
    planGenerateInFlight.current = true
    try {
      const previousScenario = opts?.previousScenarioForMerge ?? bundle.scenario
      const turnsForModel = rawInput
        ? [...bundle.promptHistory, rawInput].filter(Boolean)
        : bundle.promptHistory.filter(Boolean)
      const messageForModel = turnsForModel.join('\n\n---\n')
      const refineKey = rawInput || bundle.promptHistory[bundle.promptHistory.length - 1] || ''

      const { scenario, model, raw } = await parsePlan(messageForModel, cond, bundle.dateISO, {
        previousPrompts: bundle.promptHistory,
        currentTasks: previousScenario?.tasks ?? [],
        currentAssumptions: previousScenario?.assumptions ?? [],
        clarificationAnswers: mergedClarificationAnswers,
      })

      const refinedIncoming = applyPromptScheduleRefinements(refineKey, scenario.tasks)
      const mergedScenario: ScenarioConfig = previousScenario
        ? {
            ...scenario,
            tasks: mergeTasksPreservingEdits(previousScenario.tasks, refinedIncoming),
            assumptions: mergeAssumptionsAppendOnly(previousScenario.assumptions, scenario.assumptions),
          }
        : { ...scenario, tasks: refinedIncoming }

      const states: AssumptionStateMap = assumptionStatesForScenario(
        mergedScenario,
        bundle.assumptionStates,
        opts?.assumptionStatesForPlan,
      )

      const planResult = buildPlan(mergedScenario.id, mergedScenario, states, bundle.dateISO)
      const baseAfterPlan: ScenarioConfig = planResult.scenarioPatch?.tasks
        ? { ...mergedScenario, tasks: planResult.scenarioPatch.tasks }
        : mergedScenario
      const mergedClarifications = mergeClarificationsNeeded(
        previousScenario,
        mergedScenario,
        mergedClarificationAnswers,
      )
      const scenarioAfterPlan: ScenarioConfig = {
        ...baseAfterPlan,
        clarificationsNeeded: mergedClarifications,
      }

      const uiAfterGenerate: string[] = []
      if (hasNewClarifications) uiAfterGenerate.push('Schedule refreshed after clarification submit.')
      else if (previousScenario) uiAfterGenerate.push('Schedule view refreshed from your prompt.')
      else uiAfterGenerate.push('Initial schedule view rendered.')

      const sig = JSON.stringify({ blocks: planResult.blocks, conflicts: planResult.conflicts })
      const planChanged = sig !== prevSig.current[ti]
      prevSig.current[ti] = sig
      const uiLines = [...uiAfterGenerate, ...planResult.changeLog]

      setTb((t) => ({
        ...t,
        [ti]: {
          ...t[ti],
          scenario: scenarioAfterPlan,
          promptHistory: rawInput ? [...t[ti].promptHistory, rawInput].slice(-12) : t[ti].promptHistory,
          inputText: '',
          assumptionStates: states,
          clarificationAnswers: mergedClarificationAnswers,
          dismissedAssumptionIds: pruneDismissedAssumptions(
            t[ti].dismissedAssumptionIds,
            scenarioAfterPlan.assumptions,
          ),
          llmModel: model,
          rawLlm: raw,
          recentUiChanges: appendUiChanges(previousScenario ? t[ti].recentUiChanges : [], uiLines),
          lastPlan: planResult,
        },
      }))

      log(mergedScenario.id, 'input_submitted', { textLength: messageForModel.length }, ti)
      if (planChanged) {
        log(mergedScenario.id, 'plan_updated', { blockCount: planResult.blocks.length }, ti)
      }
      for (const c of planResult.conflicts) {
        log(mergedScenario.id, 'conflict_surfaced', { message: c }, ti)
      }
      log(mergedScenario.id, 'plan_generated', { blockIds: planResult.blocks.map((b) => b.id) }, ti)
      log(mergedScenario.id, 'assumptions_viewed', { assumptionIds: mergedScenario.assumptions.map((a) => a.id) }, ti)
    } catch (e) {
      setGenError(String((e as Error).message))
    } finally {
      planGenerateInFlight.current = false
      setLoading(false)
    }
  }

  const handleTaskChange = (taskId: string, patch: Partial<ScenarioTask>) => {
    const ti = currentTaskIndex()
    if (!ti) return
    setTb((t) => {
      const sc = t[ti].scenario
      if (!sc) return t
      const next = { ...sc, tasks: sc.tasks.map((x) => (x.id === taskId ? { ...x, ...patch } : x)) }
      const result = buildPlan(next.id, next, t[ti].assumptionStates, t[ti].dateISO)
      const scenarioMerged: ScenarioConfig = result.scenarioPatch?.tasks
        ? { ...next, tasks: result.scenarioPatch.tasks }
        : next
      const sig = JSON.stringify({ blocks: result.blocks, conflicts: result.conflicts })
      const planChanged = sig !== prevSig.current[ti]
      prevSig.current[ti] = sig
      const uiLines = [...(planChanged ? ['Calendar blocks updated.'] : []), ...result.changeLog]
      if (planChanged) {
        log(next.id, 'plan_updated', { blockCount: result.blocks.length }, ti)
      }
      for (const c of result.conflicts) {
        log(next.id, 'conflict_surfaced', { message: c }, ti)
      }
      return {
        ...t,
        [ti]: {
          ...t[ti],
          scenario: scenarioMerged,
          recentUiChanges: appendUiChanges(t[ti].recentUiChanges, uiLines),
          lastPlan: result,
        },
      }
    })
  }

  const handleClarificationCommit = (id: string, value: string) => {
    const ti = currentTaskIndex()
    if (!ti || !latinOrder) return
    const trimmed = value.trim()
    if (!trimmed) return
    const prev = (tb[ti].clarificationAnswers[id] ?? '').trim()
    if (prev === trimmed) return
    if (planGenerateInFlight.current) return
    let nextAnswers: Record<string, string> = {}
    setTb((t) => {
      const sc = t[ti].scenario
      if (!sc) return t
      nextAnswers = { ...t[ti].clarificationAnswers, [id]: trimmed }
      return {
        ...t,
        [ti]: {
          ...t[ti],
          clarificationAnswers: nextAnswers,
        },
      }
    })
    void handleGenerate({ clarificationAnswers: nextAnswers })
  }

  const handleDismissAssumption = (assumptionId: string) => {
    const ti = currentTaskIndex()
    if (!ti || !tb[ti].scenario) return
    const sc = tb[ti].scenario
    log(sc.id, 'assumption_dismissed', { assumptionId }, ti)
    setTb((t) => ({
      ...t,
      [ti]: {
        ...t[ti],
        dismissedAssumptionIds: [...new Set([...t[ti].dismissedAssumptionIds, assumptionId])],
      },
    }))
  }

  const runRecalibrateAfterCalendarChange = (
    ti: TaskIx,
    projectedTasks: ScenarioTask[],
    currentAssumptions: ScenarioConfig['assumptions'],
  ) => {
    if (!latinOrder) return
    recalibrateGen.current[ti] += 1
    const gen = recalibrateGen.current[ti]
    const promptThread =
      tb[ti].inputText.trim() ||
      tb[ti].promptHistory.filter(Boolean).join('\n\n---\n') ||
      ''
    const cond = conditionForTaskIndex(latinOrder, ti)
    void recalibrateAssumptions(promptThread, cond, tb[ti].dateISO, projectedTasks, currentAssumptions)
      .then(({ assumptions }) => {
        if (recalibrateGen.current[ti] !== gen) return
        setTb((t) => {
          const sc = t[ti].scenario
          if (!sc) return t
          const same =
            JSON.stringify(assumptions.map((a) => a.text)) ===
            JSON.stringify(sc.assumptions.map((a) => a.text))
          return {
            ...t,
            [ti]: {
              ...t[ti],
              scenario: { ...sc, assumptions },
              recentUiChanges: same
                ? t[ti].recentUiChanges
                : appendUiChanges(t[ti].recentUiChanges, ['Assumption list updated after a calendar change.']),
            },
          }
        })
      })
      .catch(() => {
        /* keep local edits even if recalibration fails */
      })
  }

  const handleAddTask = (dayOffset = 0, startMin = 9 * 60) => {
    const ti = currentTaskIndex()
    if (!ti || !latinOrder) return
    const sc = tb[ti].scenario
    if (!sc) return
    const newTask: ScenarioTask = {
      id: `t-user-${Date.now()}`,
      label: 'New event',
      dayOffset: Math.max(0, Math.min(6, Math.round(dayOffset))),
      startMin: Math.max(0, Math.min(1439, Math.round(startMin))),
      durationMin: 60,
      kind: 'admin',
      pinned: false,
    }
    const next: ScenarioConfig = { ...sc, tasks: [...sc.tasks, newTask] }
    const preResult = buildPlan(next.id, next, tb[ti].assumptionStates, tb[ti].dateISO)
    const preMerged: ScenarioConfig = preResult.scenarioPatch?.tasks
      ? { ...next, tasks: preResult.scenarioPatch.tasks }
      : next

    setTb((t) => {
      const sc2 = t[ti].scenario
      if (!sc2) return t
      const nextInner: ScenarioConfig = { ...sc2, tasks: [...sc2.tasks, newTask] }
      const result = buildPlan(nextInner.id, nextInner, t[ti].assumptionStates, t[ti].dateISO)
      const scenarioMerged: ScenarioConfig = result.scenarioPatch?.tasks
        ? { ...nextInner, tasks: result.scenarioPatch.tasks }
        : nextInner
      const uiLines = ['New event added on calendar.', ...result.changeLog]
      const sig = JSON.stringify({ blocks: result.blocks, conflicts: result.conflicts })
      const planChanged = sig !== prevSig.current[ti]
      prevSig.current[ti] = sig
      if (planChanged) {
        log(nextInner.id, 'plan_updated', { blockCount: result.blocks.length }, ti)
      }
      for (const c of result.conflicts) {
        log(nextInner.id, 'conflict_surfaced', { message: c }, ti)
      }
      return {
        ...t,
        [ti]: {
          ...t[ti],
          scenario: scenarioMerged,
          recentUiChanges: appendUiChanges(t[ti].recentUiChanges, uiLines),
          lastPlan: result,
        },
      }
    })

    runRecalibrateAfterCalendarChange(ti, preMerged.tasks, sc.assumptions)
  }

  const submitAssumptionReject = (correction: string) => {
    if (!rejectModal) return
    const ti = currentTaskIndex()
    if (!ti || !tb[ti].scenario || !latinOrder) return
    const assumptionId = rejectModal.assumptionId
    setRejectModal(null)
    const sc = tb[ti].scenario
    const sid = sc.id
    const prev = tb[ti].assumptionStates[assumptionId] ?? 'unreviewed'
    const meta: Record<string, unknown> = {
      assumptionId,
      previousStatus: prev,
      newStatus: 'incorrect',
    }
    log(sid, 'assumption_marked_incorrect', meta, ti)

    const nextStates: AssumptionStateMap = { ...tb[ti].assumptionStates, [assumptionId]: 'incorrect' }
    const clarKey = `reject-${assumptionId}`
    const nextAnswers = { ...tb[ti].clarificationAnswers, [clarKey]: correction }
    const scForMerge = injectWorkoutRejectClarification(sc, assumptionId)

    void handleGenerate({
      clarificationAnswers: nextAnswers,
      previousScenarioForMerge: scForMerge,
      assumptionStatesForPlan: nextStates,
    })
  }

  const handleMark = (assumptionId: string, status: 'correct' | 'incorrect') => {
    const ti = currentTaskIndex()
    if (!ti || !tb[ti].scenario || !latinOrder) return
    const sc = tb[ti].scenario

    if (status === 'incorrect') {
      const a = sc.assumptions.find((x) => x.id === assumptionId)
      if (a) setRejectModal({ assumptionId, text: a.text })
      return
    }

    const sid = sc.id
    const prev = tb[ti].assumptionStates[assumptionId] ?? 'unreviewed'

    const meta: Record<string, unknown> = {
      assumptionId,
      previousStatus: prev,
      newStatus: status,
    }

    log(sid, 'assumption_marked_correct', meta, ti)

    const nextStates: AssumptionStateMap = { ...tb[ti].assumptionStates, [assumptionId]: status }
    /** Correct marks are feedback only — they do not replan, recalibrate, or change the calendar. */
    setTb((t) => ({
      ...t,
      [ti]: {
        ...t[ti],
        assumptionStates: nextStates,
      },
    }))
  }

  const handleRecentView = () => {
    const ti = currentTaskIndex()
    if (recentViewedLogged || !ti || !tb[ti].scenario) return
    setRecentViewedLogged(true)
    log(tb[ti].scenario!.id, 'recent_changes_viewed', {}, ti)
  }

  const handleCalendarBlockEdit = (
    blockId: string,
    patch: { label?: string; dayOffset?: number; startMin?: number; durationMin?: number },
  ) => {
    const ti = currentTaskIndex()
    if (!ti || !latinOrder) return
    const sc = tb[ti].scenario
    if (!sc) return
    const taskId = blockId.startsWith('blk-') ? blockId.slice(4) : blockId
    handleTaskChange(taskId, patch)
    const projectedTasks = sc.tasks.map((x) => (x.id === taskId ? { ...x, ...patch } : x))
    runRecalibrateAfterCalendarChange(ti, projectedTasks, sc.assumptions)
  }

  const handleCalendarCreate = (dayOffset: number, startMin: number) => {
    handleAddTask(dayOffset, startMin)
  }

  const handleCalendarDelete = (blockId: string) => {
    const ti = currentTaskIndex()
    if (!ti || !latinOrder) return
    const taskId = blockId.startsWith('blk-') ? blockId.slice(4) : blockId
    const sc = tb[ti].scenario
    if (!sc) return
    const next: ScenarioConfig = {
      ...sc,
      tasks: sc.tasks.filter((x) => x.id !== taskId),
    }
    const preResult = buildPlan(next.id, next, tb[ti].assumptionStates, tb[ti].dateISO)
    const preMerged: ScenarioConfig = preResult.scenarioPatch?.tasks
      ? { ...next, tasks: preResult.scenarioPatch.tasks }
      : next

    setTb((t) => {
      const sc2 = t[ti].scenario
      if (!sc2) return t
      const nextInner: ScenarioConfig = {
        ...sc2,
        tasks: sc2.tasks.filter((x) => x.id !== taskId),
      }
      const result = buildPlan(nextInner.id, nextInner, t[ti].assumptionStates, t[ti].dateISO)
      const scenarioMerged: ScenarioConfig = result.scenarioPatch?.tasks
        ? { ...nextInner, tasks: result.scenarioPatch.tasks }
        : nextInner
      const uiLines = ['Event removed from calendar.', ...result.changeLog]
      const sig = JSON.stringify({ blocks: result.blocks, conflicts: result.conflicts })
      const planChanged = sig !== prevSig.current[ti]
      prevSig.current[ti] = sig
      if (planChanged) {
        log(nextInner.id, 'plan_updated', { blockCount: result.blocks.length }, ti)
      }
      for (const c of result.conflicts) {
        log(nextInner.id, 'conflict_surfaced', { message: c }, ti)
      }
      return {
        ...t,
        [ti]: {
          ...t[ti],
          scenario: scenarioMerged,
          recentUiChanges: appendUiChanges(t[ti].recentUiChanges, uiLines),
          lastPlan: result,
        },
      }
    })

    runRecalibrateAfterCalendarChange(ti, preMerged.tasks, sc.assumptions)
  }

  const finishTask = () => {
    const ti = currentTaskIndex()
    if (!ti || !tb[ti].scenario || !latinOrder) return
    const endIso = new Date().toISOString()
    taskEndIso.current[ti] = endIso
    const elapsedMs = taskStartMs.current[ti] ? Date.now() - taskStartMs.current[ti]! : null
    log(
      tb[ti].scenario.id,
      'scenario_completed',
      {
        elapsedMs,
        taskStartISO: taskStartIso.current[ti],
        taskEndISO: endIso,
        conditionKind: conditionForTaskIndex(latinOrder, ti),
        taskVariant: latinOrder[ti - 1].taskVariant,
      },
      ti,
    )
    if (ti === 1) setPhase('q1')
    else setPhase('q2')
  }

  const beginAfterTutorial = async () => {
    setOrderError(null)
    let assignedOrder: CounterbalancedOrder
    try {
      const params = new URLSearchParams(window.location.search)
      const armRaw = params.get('arm')
      if (armRaw !== null && armRaw !== '') {
        const idx = Number.parseInt(armRaw, 10)
        const fixed = orderByArmIndex(idx)
        if (fixed) {
          orderSourceRef.current = 'url'
          setSequenceNumber(idx)
          assignedOrder = fixed
          setLatinOrder(assignedOrder)
        } else {
          const { sequenceNumber: seq } = await requestSessionOrder()
          orderSourceRef.current = 'server'
          setSequenceNumber(seq)
          assignedOrder = orderBySequence(seq)
          setLatinOrder(assignedOrder)
        }
      } else {
        const { sequenceNumber: seq } = await requestSessionOrder()
        orderSourceRef.current = 'server'
        setSequenceNumber(seq)
        assignedOrder = orderBySequence(seq)
        setLatinOrder(assignedOrder)
      }
    } catch (e) {
      setOrderError(String((e as Error).message))
      return
    }
    taskStartMs.current[1] = Date.now()
    taskStartIso.current[1] = new Date().toISOString()
    log(null, 'task_started', {
      planningTaskIndex: 1,
      conditionKind: assignedOrder[0].conditionKind,
      taskVariant: assignedOrder[0].taskVariant,
    })
    setPhase('task1')
  }

  const buildSessionPayload = () => {
    const meta = {
      participantId,
      latinSquareOrder: latinOrder,
      latinSquareOrderSource: orderSourceRef.current,
      sequenceNumber,
      exportedAt: new Date().toISOString(),
      task1: {
        conditionKind: latinOrder?.[0]?.conditionKind ?? null,
        taskVariant: latinOrder?.[0]?.taskVariant ?? null,
        hiddenScenarioId: tb[1].scenario?.id ?? null,
        dateISO: tb[1].dateISO,
        promptHistory: tb[1].promptHistory,
        recentUiChanges: tb[1].recentUiChanges,
        llmModel: tb[1].llmModel,
        rawLlm: tb[1].rawLlm,
        scenarioSnapshot: tb[1].scenario,
        clarificationAnswers: tb[1].clarificationAnswers,
        dismissedAssumptionIds: tb[1].dismissedAssumptionIds,
        taskStartISO: taskStartIso.current[1],
        taskEndISO: taskEndIso.current[1],
        taskElapsedMs:
          taskStartMs.current[1] && taskEndIso.current[1]
            ? new Date(taskEndIso.current[1]).getTime() - taskStartMs.current[1]
            : null,
      },
      task2: {
        conditionKind: latinOrder?.[1]?.conditionKind ?? null,
        taskVariant: latinOrder?.[1]?.taskVariant ?? null,
        hiddenScenarioId: tb[2].scenario?.id ?? null,
        dateISO: tb[2].dateISO,
        promptHistory: tb[2].promptHistory,
        recentUiChanges: tb[2].recentUiChanges,
        llmModel: tb[2].llmModel,
        rawLlm: tb[2].rawLlm,
        scenarioSnapshot: tb[2].scenario,
        clarificationAnswers: tb[2].clarificationAnswers,
        dismissedAssumptionIds: tb[2].dismissedAssumptionIds,
        taskStartISO: taskStartIso.current[2],
        taskEndISO: taskEndIso.current[2],
        taskElapsedMs:
          taskStartMs.current[2] && taskEndIso.current[2]
            ? new Date(taskEndIso.current[2]).getTime() - taskStartMs.current[2]
            : null,
      },
      questionnaireAfterTask1: q1,
      questionnaireAfterTask2: q2,
      finalComparison: qFinal,
      events,
      screenRecordingBytes: 0,
    }
    return meta
  }

  const handleFinalSave = async () => {
    if (sessionSaved) return
    setUploading(true)
    setUploadError(null)
    const meta = buildSessionPayload()
    try {
      await uploadSession(meta, null)
      setSessionSaved(true)
    } catch (e) {
      setUploadError(String((e as Error).message))
      downloadLogsJson({ ...meta, recordingNote: 'Upload failed; local backup' }, `backup-${participantId}.json`)
    } finally {
      setUploading(false)
    }
  }

  const { min, max } = studyYearBounds()
  const ti = currentTaskIndex()
  const bundle = ti ? tb[ti] : null

  if (phase === 'welcome') {
    return <WelcomeScreen participantId={participantId} onBeginSession={() => void beginAfterTutorial()} />
  }
  if (phase === 'q1') {
    return (
      <QuizScreen
        afterTask={1}
        values={q1}
        onDetailChange={(k: LikertKey, v) => {
          setQ1((x) => ({ ...x, details: { ...x.details, [k]: v } }))
          log(null, 'questionnaire_detail_answered', { afterTask: 1, key: k, textLength: v.length })
        }}
        onChange={(k: LikertKey, v) => {
          setQ1((x) => ({ ...x, ratings: { ...x.ratings, [k]: v } }))
          log(null, 'questionnaire_likert_answered', { afterTask: 1, key: k, value: v })
        }}
        onContinue={() => {
          if (!latinOrder) return
          log(null, 'session_phase', { phase: 'task2' })
          taskStartMs.current[2] = Date.now()
          taskStartIso.current[2] = new Date().toISOString()
          log(null, 'task_started', {
            planningTaskIndex: 2,
            conditionKind: latinOrder[1].conditionKind,
            taskVariant: latinOrder[1].taskVariant,
          })
          setPhase('task2')
          setRecentViewedLogged(false)
        }}
      />
    )
  }
  if (phase === 'q2') {
    return (
      <QuizScreen
        afterTask={2}
        values={q2}
        onDetailChange={(k: LikertKey, v) => {
          setQ2((x) => ({ ...x, details: { ...x.details, [k]: v } }))
          log(null, 'questionnaire_detail_answered', { afterTask: 2, key: k, textLength: v.length })
        }}
        onChange={(k: LikertKey, v) => {
          setQ2((x) => ({ ...x, ratings: { ...x.ratings, [k]: v } }))
          log(null, 'questionnaire_likert_answered', { afterTask: 2, key: k, value: v })
        }}
        onContinue={() => setPhase('qFinal')}
      />
    )
  }
  if (phase === 'qFinal') {
    return (
      <FinalComparisonScreen
        values={qFinal}
        onChange={setQFinal}
        onContinue={() => {
          log(null, 'questionnaire_likert_answered', {
            afterTask: 'final',
            key: 'promptOnlyRating',
            value: qFinal.promptOnlyRating,
          })
          log(null, 'questionnaire_likert_answered', {
            afterTask: 'final',
            key: 'mentalModelRating',
            value: qFinal.mentalModelRating,
          })
          log(null, 'questionnaire_detail_answered', {
            afterTask: 'final',
            key: 'betterInteraction',
            value: qFinal.betterInteraction,
            textLength: qFinal.explanation.length,
          })
          setPhase('complete')
        }}
      />
    )
  }
  if (phase === 'complete') {
    return (
      <CompleteScreen
        participantId={participantId}
        uploading={uploading}
        uploadError={uploadError}
        saved={sessionSaved}
        onFinish={() => void handleFinalSave()}
      />
    )
  }

  const taskShort = phase === 'task1' ? 'T1' : 'T2'
  const currentCondition = ti && latinOrder ? conditionForTaskIndex(latinOrder, ti) : null
  const currentTaskVariant = ti && latinOrder ? latinOrder[ti - 1].taskVariant : null
  const brief = currentCondition ? PARTICIPANT_SCENARIO_BRIEF[currentCondition] : null
  const taskBrief = currentTaskVariant ? TASK_VARIANT_BRIEF[currentTaskVariant] : null
  const promptOnlyMode = currentCondition === 'prompt-only'

  if (!latinOrder) {
    return (
      <div className="screen screen--center">
        <h1 className="screen__title">Preparing session…</h1>
        <p className="screen__text">{orderError ?? 'Assigning counterbalanced order.'}</p>
        <button type="button" className="btn btn--accent" onClick={() => void beginAfterTutorial()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
    <AppLayout
      header={
        <>
          <div className="session-bar session-bar--compact">
            <span className="session-bar__task">{taskShort}</span>
            <span className="session-bar__mono">{participantId.slice(0, 8)}…</span>
          </div>
          {brief && taskBrief && ti && (
            <div className="workspace-header-stack">
              <CombinedPlanningBrief scenario={brief} task={taskBrief} />
              <InputBar
                value={bundle?.inputText ?? ''}
                onChange={(v) => ti && setTb((t) => ({ ...t, [ti]: { ...t[ti], inputText: v } }))}
                onGenerate={() => void handleGenerate()}
                disabled={loading || !ti}
              />
            </div>
          )}
          {genError && <p className="banner-error">{genError}</p>}
        </>
      }
      leftTop={
        promptOnlyMode ? (
          <section className="side-section side-section--compact" aria-label="Prompt-only task">
            <p className="clarifications-block__hint">
              Prompt-only: refine the schedule using the input bar and calendar.
            </p>
          </section>
        ) : (
          <AssumptionsPanel
            scenario={bundle?.scenario ?? null}
            states={bundle?.assumptionStates ?? {}}
            onMark={handleMark}
            dismissedAssumptionIds={bundle?.dismissedAssumptionIds ?? []}
            onDismiss={handleDismissAssumption}
          />
        )
      }
      leftBottom={
        promptOnlyMode ? null : (
          <TasksConstraintsPanel
            scenario={bundle?.scenario ?? null}
            clarificationAnswers={bundle?.clarificationAnswers ?? {}}
            onClarificationCommit={handleClarificationCommit}
          />
        )
      }
      center={
        <div className="center-stack">
          {bundle?.dateISO && ti && (
            <WeekCalendarPanel
              dateISO={bundle.dateISO}
              dateMin={min}
              dateMax={max}
              onDateISOChange={(iso) =>
                setTb((t) => ({
                  ...t,
                  [ti]: { ...t[ti], dateISO: iso },
                }))
              }
              blocks={bundle.lastPlan?.blocks ?? []}
              onBlockEdit={handleCalendarBlockEdit}
              onCreateEvent={handleCalendarCreate}
              onDeleteEvent={handleCalendarDelete}
            />
          )}
        </div>
      }
      right={
        promptOnlyMode ? null : (
          <>
            <ConflictsPanel conflicts={bundle?.lastPlan?.conflicts ?? []} />
            <RecentChangesPanel lines={bundle?.recentUiChanges ?? []} onView={handleRecentView} />
          </>
        )
      }
      footer={
        <div className="task-footer">
          <button type="button" className="btn btn--accent" onClick={finishTask} disabled={!bundle?.scenario}>
            Continue to questionnaire
          </button>
          {!bundle?.scenario && (
            <span className="task-footer__hint">Generate a plan before continuing.</span>
          )}
        </div>
      }
    />
    {rejectModal && (
      <AssumptionRejectModal
        assumptionText={rejectModal.text}
        onCancel={() => setRejectModal(null)}
        onSubmit={(correction) => submitAssumptionReject(correction)}
      />
    )}
    </>
  )
}
