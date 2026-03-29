import { useEffect, useState } from 'react'
import type { ScenarioConfig } from '../types/types'

interface Props {
  scenario: ScenarioConfig | null
  clarificationAnswers: Record<string, string>
  onClarificationCommit: (id: string, value: string) => void
}

function categoryLabel(c: string | undefined): string {
  if (c === 'time') return 'Time'
  if (c === 'preference') return 'Preference'
  if (c === 'resource') return 'Resource'
  return 'Other'
}

export function TasksConstraintsPanel({ scenario, clarificationAnswers, onClarificationCommit }: Props) {
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    setDraftAnswers(clarificationAnswers)
  }, [clarificationAnswers])

  if (!scenario) {
    return (
      <section className="side-section" aria-label="Tasks and constraints panel">
        <h3 className="side-section__heading">Constraints &amp; clarifications</h3>
        <p className="side-section__empty">Start a scenario to review constraints and clarifications.</p>
      </section>
    )
  }

  const clarifications = (scenario.clarificationsNeeded ?? []).filter(
    (q) => !(clarificationAnswers[q.id] ?? '').trim(),
  )

  return (
    <section className="side-section side-section--panel" aria-label="Tasks and constraints panel">
      {clarifications.length > 0 && (
        <div className="clarifications-block panel-card">
          <h3 className="side-section__heading">Clarifications</h3>
          <p className="clarifications-block__hint">
            Press Enter to submit. Answers are merged into the next plan refresh.
          </p>
          <ul className="clarifications-block__list">
            {clarifications.map((q) => (
              <li key={q.id} className="clarifications-block__item">
                <label className="clarifications-block__q" htmlFor={`cl-${q.id}`}>
                  {q.question}
                </label>
                <textarea
                  id={`cl-${q.id}`}
                  className="clarifications-block__input"
                  rows={2}
                  value={draftAnswers[q.id] ?? ''}
                  onChange={(e) => setDraftAnswers((x) => ({ ...x, [q.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      onClarificationCommit(q.id, draftAnswers[q.id] ?? '')
                    }
                  }}
                  placeholder="Type your answer…"
                />
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => onClarificationCommit(q.id, draftAnswers[q.id] ?? '')}
                >
                  Enter
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel-card panel-card--constraints">
        <h3 className="side-section__heading">Inferred constraints</h3>
        <p className="clarifications-block__hint">Shown for transparency; not editable.</p>
        <ul className="constraint-list">
          {scenario.constraints.length === 0 ? (
            <li className="side-section__empty">No constraints inferred yet.</li>
          ) : (
            scenario.constraints.map((c) => {
              const label = c.label.trim()
              return (
                <li key={c.id} className="constraint-row constraint-row--readonly">
                  <div className="constraint-row__tags">
                    <span
                      className={`constraint-tag ${c.hard ? 'constraint-tag--hard' : 'constraint-tag--soft'}`}
                      title={c.hard ? 'Hard constraint' : 'Soft preference'}
                    >
                      {c.hard ? 'Hard' : 'Soft'}
                    </span>
                    <span className="constraint-tag constraint-tag--cat">{categoryLabel(c.category)}</span>
                  </div>
                  <div className="constraint-row__text">
                    <p className="constraint-row__line">{label}</p>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </section>
  )
}
