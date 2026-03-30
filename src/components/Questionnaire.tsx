import { LIKERT_ITEMS, type LikertKey, type ScenarioQuestionnaireValues } from './questionnaireItems'

interface Props {
  title: string
  values: ScenarioQuestionnaireValues
  onChange: (key: LikertKey, value: number) => void
  onDetailChange: (key: LikertKey, value: string) => void
}

export function QuestionnaireBlock({ title, values, onChange, onDetailChange }: Props) {
  return (
    <div className="questionnaire__block">
      <h3 className="questionnaire__block-title">{title}</h3>
      {LIKERT_ITEMS.map((item) => (
        <fieldset key={item.key} className="likert">
          <legend className="likert__q">
            {item.text} <span className="questionnaire__tag questionnaire__tag--required">Required</span>
          </legend>
          <div
            className="likert__row"
            role="group"
            aria-label={`${item.text}. Scale: 1 means Disagree, 5 means Agree.`}
          >
            <span className="likert__anchor likert__anchor--left">Disagree</span>
            <div className="likert__scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="likert__opt">
                  <input
                    type="radio"
                    name={`${title}-${item.key}`}
                    checked={values.ratings[item.key] === n}
                    onChange={() => onChange(item.key, n)}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
            <span className="likert__anchor likert__anchor--right">Agree</span>
          </div>
          <label className="questionnaire__open-label" htmlFor={`${title}-${item.key}-detail`}>
            {item.detailPrompt}{' '}
            <span className="questionnaire__tag questionnaire__tag--optional">Optional</span>
          </label>
          <textarea
            id={`${title}-${item.key}-detail`}
            className="questionnaire__textarea"
            rows={3}
            value={values.details[item.key] ?? ''}
            onChange={(e) => onDetailChange(item.key, e.target.value)}
            placeholder="Share details..."
          />
        </fieldset>
      ))}
    </div>
  )
}
