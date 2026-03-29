import type { ScheduledBlock } from '../types/types'

function overlaps(a: ScheduledBlock, b: ScheduledBlock): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin
}

function maxConcurrentOverlaps(blocks: ScheduledBlock[]): number {
  const ev: { t: number; d: number }[] = []
  for (const b of blocks) {
    ev.push({ t: b.startMin, d: 1 })
    ev.push({ t: b.endMin, d: -1 })
  }
  ev.sort((a, b) => a.t - b.t || a.d - b.d)
  let c = 0
  let m = 0
  for (const e of ev) {
    c += e.d
    m = Math.max(m, c)
  }
  return Math.max(1, m)
}

/** Union–find overlap components on the same calendar day. */
function overlapComponents(blocks: ScheduledBlock[]): ScheduledBlock[][] {
  const n = blocks.length
  if (n === 0) return []
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(blocks[i], blocks[j])) union(i, j)
    }
  }
  const byRoot = new Map<number, ScheduledBlock[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r)!.push(blocks[i])
  }
  return [...byRoot.values()]
}

/**
 * Google Calendar–style columns: overlapping events share horizontal space within each overlap component.
 */
export function layoutDayBlocks(blocks: ScheduledBlock[]): Map<string, { leftPct: number; widthPct: number }> {
  const out = new Map<string, { leftPct: number; widthPct: number }>()
  const components = overlapComponents(blocks)
  for (const cluster of components) {
    const ncols = maxConcurrentOverlaps(cluster)
    const sorted = [...cluster].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
    const colEnd: number[] = []
    const colById = new Map<string, number>()
    for (const b of sorted) {
      let c = colEnd.findIndex((end) => b.startMin >= end)
      if (c < 0) {
        c = colEnd.length
        colEnd.push(b.endMin)
      } else {
        colEnd[c] = Math.max(colEnd[c], b.endMin)
      }
      colById.set(b.id, c)
    }
    const used = Math.max(ncols, colEnd.length)
    for (const b of cluster) {
      const col = colById.get(b.id) ?? 0
      out.set(b.id, { leftPct: (col / used) * 100, widthPct: 100 / used })
    }
  }
  return out
}
