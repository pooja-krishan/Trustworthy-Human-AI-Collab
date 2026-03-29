import { QuestionnaireBlock } from '../components/Questionnaire'
import {
  allLikertRatingsComplete,
  type LikertKey,
  type ScenarioQuestionnaireValues,
} from '../components/questionnaireItems'

interface Props {
  afterTask: 1 | 2
  values: ScenarioQuestionnaireValues
  onChange: (key: LikertKey, value: number) => void
  onDetailChange: (key: LikertKey, value: string) => void
  onContinue: () => void
}

export function QuizScreen({ afterTask, values, onChange, onDetailChange, onContinue }: Props) {
  const ratingsComplete = allLikertRatingsComplete(values)

  return (
    <div className="screen screen--wide">
      <h1 className="screen__title">Post-task questionnaire</h1>
      <p className="screen__text">Please answer about the planning task you just completed.</p>
      <p className="screen__text screen__text--muted">
        Select a rating (1–5) for each statement. Text boxes are optional.
      </p>
      <div className="screen--wide__scroll">
        <QuestionnaireBlock
          title={`After planning task ${afterTask}`}
          values={values}
          onChange={onChange}
          onDetailChange={onDetailChange}
        />
      </div>
      <div className="screen--wide__actions">
        <button type="button" className="btn btn--accent" onClick={onContinue} disabled={!ratingsComplete}>
          Continue
        </button>
      </div>
    </div>
  )
}
