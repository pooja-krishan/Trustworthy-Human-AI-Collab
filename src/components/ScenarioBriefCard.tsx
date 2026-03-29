interface BriefSlice {
  title: string
  bullets: string[]
}

interface Props {
  title: string
  bullets: string[]
}

export function ScenarioBriefCard({ title, bullets }: Props) {
  return (
    <section className="scenario-brief" aria-label="Task instructions">
      <h2 className="scenario-brief__title">{title}</h2>
      <ul className="scenario-brief__list">
        {bullets.map((b) => (
          <li key={b.slice(0, 40)}>{b}</li>
        ))}
      </ul>
    </section>
  )
}

/** Single compact card: scenario + task; full steps in a scrollable / collapsible area. */
export function CombinedPlanningBrief({ scenario, task }: { scenario: BriefSlice; task: BriefSlice }) {
  return (
    <section className="scenario-brief scenario-brief--combined" aria-label="Study instructions">
      <details className="scenario-brief__details" open>
        <summary className="scenario-brief__summary">
          <span className="scenario-brief__summary-main">{scenario.title}</span>
          <span className="scenario-brief__summary-sep">·</span>
          <span className="scenario-brief__summary-main">{task.title}</span>
          <span className="scenario-brief__summary-hint">(expand for full rounds)</span>
        </summary>
        <div className="scenario-brief__combined-body">
          <div className="scenario-brief__chunk">
            <h3 className="scenario-brief__subtitle">{scenario.title}</h3>
            <ul className="scenario-brief__list scenario-brief__list--compact">
              {scenario.bullets.map((b) => (
                <li key={b.slice(0, 48)}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="scenario-brief__chunk">
            <h3 className="scenario-brief__subtitle">{task.title}</h3>
            <ul className="scenario-brief__list scenario-brief__list--compact">
              {task.bullets.map((b) => (
                <li key={b.slice(0, 48)}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  )
}
