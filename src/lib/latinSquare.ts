import type { ConditionKind } from '../types/types'

export type TaskVariant = 'task-1' | 'task-2'

export interface AssignedTaskArm {
  conditionKind: ConditionKind
  taskVariant: TaskVariant
}

/**
 * 2×2 Latin square: 2 task slots × (conditionKind × taskVariant) so order effects are balanced.
 * Index 0..3 is a full counterbalancing pool; add rows here to scale to larger designs.
 */
export type CounterbalancedOrder = [AssignedTaskArm, AssignedTaskArm]

export const LATIN_SQUARE_ARMS: CounterbalancedOrder[] = [
  [
    { conditionKind: 'prompt-only', taskVariant: 'task-1' },
    { conditionKind: 'mental-model-explicit', taskVariant: 'task-2' },
  ],
  [
    { conditionKind: 'prompt-only', taskVariant: 'task-2' },
    { conditionKind: 'mental-model-explicit', taskVariant: 'task-1' },
  ],
  [
    { conditionKind: 'mental-model-explicit', taskVariant: 'task-1' },
    { conditionKind: 'prompt-only', taskVariant: 'task-2' },
  ],
  [
    { conditionKind: 'mental-model-explicit', taskVariant: 'task-2' },
    { conditionKind: 'prompt-only', taskVariant: 'task-1' },
  ],
]

/** @deprecated use LATIN_SQUARE_ARMS */
export const ORDER_TABLE = LATIN_SQUARE_ARMS

export function orderBySequence(sequenceNumber: number): CounterbalancedOrder {
  const safe = Number.isFinite(sequenceNumber) ? Math.max(0, Math.floor(sequenceNumber)) : 0
  return LATIN_SQUARE_ARMS[safe % LATIN_SQUARE_ARMS.length]
}

/** Fixed arm for shared links (?arm=0..3) — must match LATIN_SQUARE_ARMS length. */
export function orderByArmIndex(armIndex: number): CounterbalancedOrder | null {
  if (!Number.isFinite(armIndex) || armIndex < 0 || armIndex >= LATIN_SQUARE_ARMS.length) return null
  return LATIN_SQUARE_ARMS[Math.floor(armIndex)]
}

export function conditionForTaskIndex(
  order: CounterbalancedOrder,
  taskIndex: 1 | 2,
): ConditionKind {
  return taskIndex === 1 ? order[0].conditionKind : order[1].conditionKind
}
