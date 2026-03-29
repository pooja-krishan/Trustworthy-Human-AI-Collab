/** Domain types — single-day planning; experimental condition is logged, not shown in UI. */

export type BlockKind = 'meeting' | 'deepwork' | 'health' | 'admin'

/** Minutes from midnight. */
export interface ScheduledBlock {
  id: string
  /** Calendar day for the one-day view (YYYY-MM-DD). */
  dateISO: string
  startMin: number
  endMin: number
  label: string
  kind: BlockKind
  pinned?: boolean
}

export type AssumptionStatus = 'unreviewed' | 'correct' | 'incorrect'

export interface ScenarioAssumption {
  id: string
  text: string
}

export interface ScenarioTask {
  id: string
  label: string
  /** Day offset from selected week start (0=week start, 6=week end). */
  dayOffset?: number
  /** Minutes from midnight (0–1439). */
  startMin: number
  durationMin: number
  kind: BlockKind
  /** Immovable commitment (e.g. fixed meeting). */
  pinned?: boolean
}

export type ConstraintCategory = 'time' | 'preference' | 'resource' | 'other'

export interface ScenarioConstraint {
  id: string
  label: string
  durationMin?: number
  hard?: boolean
  /** How the constraint relates to scheduling (from LLM structured output). */
  category?: ConstraintCategory
}

export interface ClarificationItem {
  id: string
  question: string
}

export type ScenarioId = 'scenario-1' | 'scenario-2'

/** Internal only — never display to participants. */
export type ConditionKind = 'prompt-only' | 'mental-model-explicit'

export interface ScenarioConfig {
  id: ScenarioId
  title: string
  defaultPrompt: string
  /** Short follow-up questions when the model needs user input (0–3). */
  clarificationsNeeded?: ClarificationItem[]
  tasks: ScenarioTask[]
  constraints: ScenarioConstraint[]
  assumptions: ScenarioAssumption[]
  llmFallback?: boolean
}

export type LogEventType =
  | 'input_submitted'
  | 'plan_generated'
  | 'assumptions_viewed'
  | 'assumption_marked_correct'
  | 'assumption_marked_incorrect'
  | 'assumption_dismissed'
  | 'plan_updated'
  | 'conflict_surfaced'
  | 'recent_changes_viewed'
  | 'scenario_completed'
  | 'task_started'
  | 'questionnaire_likert_answered'
  | 'questionnaire_detail_answered'
  | 'session_phase'
  | 'screen_recording'

export interface LogEvent {
  timestamp: string
  scenarioId: ScenarioId | null
  eventType: LogEventType
  metadata: Record<string, unknown>
}

export interface PlanResult {
  blocks: ScheduledBlock[]
  conflicts: string[]
  changeLog: string[]
  /** When the planner adjusts task times (e.g. after rejecting an assumption), apply to scenario state. */
  scenarioPatch?: { tasks: ScenarioTask[] }
}

/** Transparency log line; conflicts are highlighted in the UI. */
export interface RecentChangeEntry {
  text: string
  isConflict?: boolean
}
