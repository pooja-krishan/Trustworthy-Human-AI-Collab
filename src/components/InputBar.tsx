interface Props {
  value: string
  onChange: (v: string) => void
  onGenerate: () => void
  disabled: boolean
}

export function InputBar({ value, onChange, onGenerate, disabled }: Props) {
  return (
    <div className="input-bar">
      <div className="input-bar__brand">
        <span className="input-bar__logo" aria-hidden>
          ◇
        </span>
        <span className="input-bar__title">Planning workspace</span>
      </div>
      <div className="input-bar__field-wrap">
        <textarea
          className="input-bar__field input-bar__field--textarea"
          placeholder="Add or revise instructions — previous submitted turns stay in context."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Natural language planning instructions"
          rows={2}
        />
        <button type="button" className="btn btn--accent" onClick={onGenerate} disabled={disabled}>
          Generate plan
        </button>
      </div>
      <p className="input-bar__hint">
        Each generate sends your full conversation so far (prior submitted turns plus this box). Add or edit below; it is
        not treated as a brand-new session.
      </p>
    </div>
  )
}
