import type { ScenarioTask } from '../types/types'

const WORKOUT_LABEL = /workout|exercise|gym|run\b|jog|training|movement/i

/**
 * Apply simple natural-language refinements after merge so chat can remove
 * weekend routines etc. without requiring the model to echo every task id.
 */
export function applyPromptScheduleRefinements(prompt: string, tasks: ScenarioTask[]): ScenarioTask[] {
  const raw = prompt.trim()
  if (!raw) return tasks

  const noWeekend =
    /\b(no|not|don't|dont|skip|without|avoid|never).{0,70}(weekend|weekends|saturday|sunday|\bsat\b|\bsun\b)\b/i.test(
      raw,
    ) || /\bonly\s+(on\s+)?(weekdays|monday|tuesday|wednesday|thursday|friday)\b/i.test(raw)

  let next = tasks

  if (noWeekend) {
    next = next.filter((t) => {
      const d = t.dayOffset ?? 0
      if (d < 5 || d > 6) return true
      if (t.kind === 'health' && WORKOUT_LABEL.test(t.label)) return false
      if (t.id.startsWith('t-auto-workout-')) return false
      return true
    })
  }

  return next
}
