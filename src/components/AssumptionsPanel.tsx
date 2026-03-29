import type { AssumptionStatus, ScenarioConfig } from '../types/types'
import type { AssumptionStateMap } from '../planner/planner'

interface Props {
  scenario: ScenarioConfig | null
  states: AssumptionStateMap
  onMark: (assumptionId: string, status: 'correct' | 'incorrect') => void
  dismissedAssumptionIds: string[]
  onDismiss: (assumptionId: string) => void
}

function statusLabel(s: AssumptionStatus): string {
  if (s === 'unreviewed') return 'Unreviewed'
  if (s === 'correct') return 'Correct'
  return 'Incorrect'
}

export function AssumptionsPanel({
  scenario,
  states,
  onMark,
  dismissedAssumptionIds,
  onDismiss,
}: Props) {
  if (!scenario) {
    return (
      <section className="assumptions-panel" aria-label="Assumptions panel">
        <h3 className="side-section__heading">Assumptions panel</h3>
        <p className="side-section__empty">Generate a plan to review system assumptions.</p>
      </section>
    )
  }

  const dismissed = new Set(dismissedAssumptionIds)
  const visible = scenario.assumptions.filter((a) => !dismissed.has(a.id))

  return (
    <section className="assumptions-panel" aria-label="Assumptions panel">
      <h3 className="side-section__heading">Assumptions panel</h3>
      <ul className="assumption-cards">
        {visible.map((a) => {
          const st = states[a.id] ?? 'unreviewed'
          return (
            <li key={a.id} className={`assumption-card assumption-card--${st}`}>
              <p className="assumption-card__text">{a.text}</p>
              <div className="assumption-card__meta">
                <span className="assumption-card__status">{statusLabel(st)}</span>
              </div>
              <div className="assumption-card__actions assumption-card__actions--icons">
                <button
                  type="button"
                  className="btn btn--icon btn--icon-ok"
                  onClick={() => onMark(a.id, 'correct')}
                  disabled={st === 'correct'}
                  aria-label="Mark correct"
                  title="Right"
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="btn btn--icon btn--icon-bad"
                  onClick={() => onMark(a.id, 'incorrect')}
                  disabled={st === 'incorrect'}
                  aria-label="Mark incorrect"
                  title="Wrong"
                >
                  ✗
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost assumption-card__dismiss"
                  onClick={() => onDismiss(a.id)}
                  aria-label="Dismiss assumption from list"
                  title="Dismiss from list"
                >
                  Dismiss
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
