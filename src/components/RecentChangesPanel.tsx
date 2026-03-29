import { useMemo } from 'react'

const MAX_VISIBLE = 10

interface Props {
  /** Short descriptions of visible UI updates only (not user intent, not conflicts). */
  lines: string[]
  onView?: () => void
}

export function RecentChangesPanel({ lines, onView }: Props) {
  const displayed = useMemo(() => {
    if (lines.length === 0) return []
    return [...lines].slice(-MAX_VISIBLE).reverse()
  }, [lines])

  const total = lines.length

  return (
    <section
      className="recent-panel recent-panel--ui-only"
      aria-label="Recent UI updates"
      onMouseEnter={onView}
      onFocus={onView}
    >
      <div className="recent-panel__head">
        <h3 className="recent-panel__title">Recent UI updates</h3>
        {total > 0 && (
          <span className="recent-panel__badge" aria-live="polite">
            {Math.min(total, MAX_VISIBLE)} / {total}
          </span>
        )}
      </div>
      <p className="recent-panel__sub">Newest first · last {MAX_VISIBLE} · calendar and panel changes only</p>
      <ul className="recent-panel__list">
        {displayed.length === 0 ? (
          <li className="recent-panel__empty">
            <span className="recent-panel__empty-icon" aria-hidden>
              ✨
            </span>
            <span>Edits to the schedule will appear here.</span>
          </li>
        ) : (
          displayed.map((text, i) => (
            <li
              key={`${total}-${i}-${text.slice(0, 40)}`}
              className="recent-panel__item"
              style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}
            >
              <span className="recent-panel__dot" aria-hidden />
              <span className="recent-panel__text">{text}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
