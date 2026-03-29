/** Self-report constructs aligned with methodology (Likert 1–5). */

export const LIKERT_ITEMS = [
  {
    key: 'understanding',
    text: 'I felt I understood why the system made this plan and its updates.',
    detailPrompt: 'What helped or hurt your understanding in this task?',
  },
  {
    key: 'controlAgency',
    text: 'I felt in control and had agency during the interaction.',
    detailPrompt: 'Describe a moment where you felt in control (or not).',
  },
  {
    key: 'confidenceReliance',
    text: 'I felt confident relying on the system during this task.',
    detailPrompt: 'What influenced your confidence level?',
  },
  {
    key: 'friction',
    text: 'The interaction felt frustrating or cumbersome.',
    detailPrompt: 'Where did interaction friction show up most?',
  },
] as const

export type LikertKey = (typeof LIKERT_ITEMS)[number]['key']

export interface ScenarioQuestionnaireValues {
  ratings: Partial<Record<LikertKey, number>>
  details: Partial<Record<LikertKey, string>>
}

/** True when every Likert item has a 1–5 rating (text details optional). */
export function allLikertRatingsComplete(values: ScenarioQuestionnaireValues): boolean {
  return LIKERT_ITEMS.every((item) => {
    const v = values.ratings[item.key]
    return typeof v === 'number' && v >= 1 && v <= 5
  })
}
