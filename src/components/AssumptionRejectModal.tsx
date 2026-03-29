import { useState } from 'react'

interface Props {
  assumptionText: string
  onCancel: () => void
  onSubmit: (correction: string) => void
}

export function AssumptionRejectModal({ assumptionText, onCancel, onSubmit }: Props) {
  const [value, setValue] = useState('')

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-clar-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reject-clar-title" className="modal-card__title">
          Clarify this assumption
        </h3>
        <p className="modal-card__muted">The system assumed:</p>
        <p className="modal-card__quote">{assumptionText}</p>
        <label className="modal-card__label" htmlFor="reject-clar-input">
          What should we use instead? (one or two sentences)
        </label>
        <textarea
          id="reject-clar-input"
          className="modal-card__textarea"
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Evenings after 8pm are free; workouts only Tue/Thu."
        />
        <div className="modal-card__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!value.trim()}
            onClick={() => onSubmit(value.trim())}
          >
            Update schedule
          </button>
        </div>
      </div>
    </div>
  )
}
