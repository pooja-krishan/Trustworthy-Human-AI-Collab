import { useEffect, useState } from 'react'

interface Props {
  conflicts: string[]
}

/** Scheduling conflicts — shown separately from the top-10 UI activity log. */
export function ConflictsPanel({ conflicts }: Props) {
  const [alertStopped, setAlertStopped] = useState(false)
  const sig = conflicts.join('\n')

  useEffect(() => {
    setAlertStopped(false)
  }, [sig])

  const shouldFlash = conflicts.length > 0 && !alertStopped

  if (conflicts.length === 0) {
    return (
      <section className="conflicts-panel" aria-label="Scheduling conflicts">
        <div className="conflicts-panel__head">
          <h3 className="conflicts-panel__title">Conflicts</h3>
        </div>
        <p className="conflicts-panel__empty">No overlapping blocks detected.</p>
      </section>
    )
  }

  return (
    <section
      className={`conflicts-panel${shouldFlash ? ' conflicts-panel--alert' : ''}`}
      aria-label="Scheduling conflicts"
      aria-live="polite"
    >
      <div className="conflicts-panel__head">
        <h3 className="conflicts-panel__title">Conflicts</h3>
        <div className="conflicts-panel__head-actions">
          <span className="conflicts-panel__badge">{conflicts.length}</span>
          {shouldFlash && (
            <button
              type="button"
              className="btn btn--small btn--ghost conflicts-panel__stop"
              onClick={() => setAlertStopped(true)}
            >
              Stop alert
            </button>
          )}
        </div>
      </div>
      <p className="conflicts-panel__sub">Overlaps in the current calendar — resolve by editing events or constraints.</p>
      <ul className="conflicts-panel__list">
        {conflicts.map((c, i) => (
          <li key={`${i}-${c.slice(0, 48)}`} className="conflicts-panel__item">
            <span className="conflicts-panel__dot" aria-hidden />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
