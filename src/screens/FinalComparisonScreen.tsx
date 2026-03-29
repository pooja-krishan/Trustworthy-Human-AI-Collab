interface FinalComparisonValues {
  betterInteraction: 'prompt-only' | 'mental-model-explicit' | 'tie' | ''
  promptOnlyRating: number | null
  mentalModelRating: number | null
  explanation: string
}

interface Props {
  values: FinalComparisonValues
  onChange: (next: FinalComparisonValues) => void
  onContinue: () => void
}

export function FinalComparisonScreen({ values, onChange, onContinue }: Props) {
  const ready =
    values.betterInteraction !== '' &&
    values.promptOnlyRating != null &&
    values.mentalModelRating != null &&
    values.explanation.trim().length > 0

  return (
    <div className="screen screen--wide">
      <h1 className="screen__title">Final comparison</h1>
      <p className="screen__text">Compare the two interaction styles you just used.</p>
      <div className="screen--wide__scroll">
        <div className="questionnaire__block">
          <fieldset className="likert">
            <legend className="likert__q">
              Which interaction felt better overall?
              <span className="questionnaire__tag questionnaire__tag--required">Required</span>
            </legend>
            <div className="compare-choice">
              {[
                { id: 'prompt-only', label: 'Prompt-only' },
                { id: 'mental-model-explicit', label: 'Mental-model-explicit' },
                { id: 'tie', label: 'Tie / no clear winner' },
              ].map((opt) => (
                <label key={opt.id} className="compare-choice__opt">
                  <input
                    type="radio"
                    name="betterInteraction"
                    checked={values.betterInteraction === opt.id}
                    onChange={() => onChange({ ...values, betterInteraction: opt.id as FinalComparisonValues['betterInteraction'] })}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="likert">
            <legend className="likert__q">
              Rate Prompt-only (1 = poor, 5 = excellent)
              <span className="questionnaire__tag questionnaire__tag--required">Required</span>
            </legend>
            <div className="likert__scale" role="group" aria-label="Rate prompt-only">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={`prompt-${n}`} className="likert__opt">
                  <input
                    type="radio"
                    name="promptOnlyRating"
                    checked={values.promptOnlyRating === n}
                    onChange={() => onChange({ ...values, promptOnlyRating: n })}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="likert">
            <legend className="likert__q">
              Rate Mental-model-explicit (1 = poor, 5 = excellent)
              <span className="questionnaire__tag questionnaire__tag--required">Required</span>
            </legend>
            <div className="likert__scale" role="group" aria-label="Rate mental-model-explicit">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={`mental-${n}`} className="likert__opt">
                  <input
                    type="radio"
                    name="mentalModelRating"
                    checked={values.mentalModelRating === n}
                    onChange={() => onChange({ ...values, mentalModelRating: n })}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="questionnaire__open-label" htmlFor="final-compare-explain">
            Briefly explain your choice and ratings.
            <span className="questionnaire__tag questionnaire__tag--required">Required</span>
          </label>
          <textarea
            id="final-compare-explain"
            className="questionnaire__textarea"
            rows={4}
            value={values.explanation}
            onChange={(e) => onChange({ ...values, explanation: e.target.value })}
            placeholder="Share what worked better and why."
          />
        </div>
      </div>
      <div className="screen--wide__actions">
        <button type="button" className="btn btn--accent" onClick={onContinue} disabled={!ready}>
          Continue
        </button>
      </div>
    </div>
  )
}
