import type { ConditionKind } from '../types/types'
import type { TaskVariant } from '../lib/latinSquare'

/**
 * What participants READ before each task (not the hidden condition label).
 * Edit here to match your protocol / paper.
 */
export const PARTICIPANT_SCENARIO_BRIEF: Record<
  ConditionKind,
  { title: string; bullets: string[] }
> = {
  'prompt-only': {
    title: 'Interface A — Prompt-only planning',
    bullets: [
      'You will drive all revisions using prompt text only; planning internals are intentionally hidden in this mode.',
      'Follow the task instructions exactly, including conflict and ambiguity probes, by editing the prompt between generations.',
      'Your goal is to achieve a usable weekly plan adhering to the task instructions while showing your revision strategy in the prompt wording.',
    ],
  },
  'mental-model-explicit': {
    title: 'Interface B — Mental-model surfaced',
    bullets: [
      'You can use assumptions, constraints, clarifications, and recent changes alongside prompt edits.',
      'Follow the task instructions exactly, including conflict, ambiguity, and adaptation probes.',
      'Your goal is to reach a usable weekly plan adhereing to the task instructions and evaluate how visible system reasoning affects your workflow.',
    ],
  },
}

export const TASK_VARIANT_BRIEF: Record<TaskVariant, { title: string; bullets: string[] }> = {
  'task-1': {
    title: 'Task 1 - Plan your week as per the instructions below',
    bullets: [
      'Round 1 (baseline): Ask for (a) a 90-minute deep-work brief-writing block, (b) a 60-minute collaborator sync at noon, and (c) a daily 5:00-6:00 PM workout routine.',
      'Round 2 (adaptation probe): Change one planning assumption or restate it in prompt-only mode (for example, modify the routine workout task to be on specific days, only weekdays, or only weekends, etc.) and observe what the planner does.',
      'Round 3 (conflict probe): Intentionally add a conflicting request (for example, another meeting overlapping the noon sync) and observe what the planner does. The conflict can be added using the prompt or the assumptions panel on the left if it is visible',
      'Round 4 (ambiguity probe): Add a vague request (for example, "I want to visit my mom on the weekend") and then revise it if it doesn\'t satisfy the date, time or duration constraints you had in mind.',
      'Round 5 (completion): Once you are satisfied with the plan, click the "Continue to questionnaire" button to submit your plan.',
    ],
  },
  'task-2': {
    title: 'Task 2 — Plan your week as per the instructions below',
    bullets: [
      'Round 1 (baseline): Ask for (a) a 90-minute vendor plan block, (b) a 60-minute partner check-in at 3 PM, and (c) a daily morning meditation routine from 6:00-6:30 AM.',
      'Round 2 (adaptation probe): Change one planning assumption or restate it in prompt-only mode (for example, modify the routine meditation task to be on specific days, only weekdays, or only weekends, etc.) and observe what the planner does.',
      'Round 2 (conflict probe): Intentionally introduce one overlap (for example, rehearsal during partner check-in) and observe what the planner does. The conflict can be added using the prompt or the assumptions panel on the left if it is visible',
      'Round 3 (ambiguity probe): Include one vague instruction (for example, "I want to visit the museum this weekend") and then revise it if it doesn\'t satisfy the date, time or duration constraints you had in mind.',
      'Round 5 (completion): Once you are satisfied with the plan, click the "Continue to questionnaire" button to submit your plan.',
    ],
  },
}
