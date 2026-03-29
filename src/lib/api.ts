import type { ConditionKind, ScenarioConfig } from '../types/types'

export interface ParsePlanResponse {
  scenario: ScenarioConfig
  model: string
  raw: unknown
  llmMode?: 'full' | 'fallback'
  llmError?: string
}

export interface ParsePlanContext {
  previousPrompts?: string[]
  currentTasks?: ScenarioConfig['tasks']
  currentAssumptions?: ScenarioConfig['assumptions']
  clarificationAnswers?: Record<string, string>
}

export interface SessionOrderResponse {
  sequenceNumber: number
}

export async function requestSessionOrder(): Promise<SessionOrderResponse> {
  const r = await fetch('/api/session-order', { method: 'POST' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || r.statusText)
  }
  return r.json() as Promise<SessionOrderResponse>
}

export async function parsePlan(
  userPrompt: string,
  conditionKind: ConditionKind,
  dateISO: string,
  context?: ParsePlanContext,
): Promise<ParsePlanResponse> {
  const now = new Date()
  const localDateISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const localMin = now.getHours() * 60 + now.getMinutes()
  const r = await fetch('/api/parse-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPrompt, conditionKind, dateISO, localDateISO, localMin, context }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || r.statusText)
  }
  return r.json() as Promise<ParsePlanResponse>
}

export interface RecalibrateAssumptionsResponse {
  assumptions: ScenarioConfig['assumptions']
  model: string
  raw: unknown
}

export async function recalibrateAssumptions(
  userPrompt: string,
  conditionKind: ConditionKind,
  dateISO: string,
  tasks: ScenarioConfig['tasks'],
  currentAssumptions: ScenarioConfig['assumptions'],
): Promise<RecalibrateAssumptionsResponse> {
  const now = new Date()
  const localDateISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const localMin = now.getHours() * 60 + now.getMinutes()
  const r = await fetch('/api/recalibrate-assumptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPrompt, conditionKind, dateISO, localDateISO, localMin, tasks, currentAssumptions }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || r.statusText)
  }
  return r.json() as Promise<RecalibrateAssumptionsResponse>
}

export async function uploadSession(meta: object, recordingBlob?: Blob | null): Promise<unknown> {
  const fd = new FormData()
  fd.append('meta', JSON.stringify(meta))
  if (recordingBlob && recordingBlob.size > 0) {
    fd.append('recording', recordingBlob, 'screen-recording.webm')
  }
  const r = await fetch('/api/session', { method: 'POST', body: fd })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || r.statusText)
  }
  return r.json()
}
