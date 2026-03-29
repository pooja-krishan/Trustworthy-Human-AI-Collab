/** Study window: March 1 – April 30 (current year). */

export function studyYearBounds(): { min: string; max: string; year: number } {
  const year = new Date().getFullYear()
  const min = `${year}-03-01`
  const max = `${year}-04-30`
  return { min, max, year }
}

/** Local calendar date (user timezone), YYYY-MM-DD. */
export function localCalendarDateISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function defaultStudyDateISO(): string {
  const { min, max } = studyYearBounds()
  const today = localCalendarDateISO()
  if (today >= min && today <= max) return today
  return min
}

export function formatLongDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** YYYY-MM-DD in the user's local calendar (avoid UTC day shift from `toISOString()`). */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toLocalISODate(d)
}

/**
 * 0 = Monday of the anchor week containing `dateISO`, … 6 = Sunday, relative to user's `localDateISO` calendar day.
 * Returns null if local date falls outside that week.
 */
export function todayOffsetInAnchorWeek(dateISO: string, localDateISO: string): number | null {
  const weekStartISO = startOfWeekISO(dateISO)
  const today = new Date(localDateISO + 'T12:00:00')
  const diffDays = Math.floor(
    (today.getTime() - new Date(weekStartISO + 'T12:00:00').getTime()) / 86400000,
  )
  if (diffDays < 0 || diffDays > 6) return null
  return diffDays
}

/** Monday-based week start for any given ISO date. */
export function startOfWeekISO(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay() // 0=Sun, 1=Mon, ... 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday)
  return toLocalISODate(d)
}

/** Move anchor to the same weekday slot in a week that is `deltaWeeks` away (by Monday week). */
export function shiftWeekBy(dateISO: string, deltaWeeks: number): string {
  const start = startOfWeekISO(dateISO)
  return addDaysISO(start, deltaWeeks * 7)
}

/** Short range label for Mon–Sun week containing `weekStartISO` (Monday). */
export function formatWeekRangeShort(weekStartISO: string): string {
  const end = addDaysISO(weekStartISO, 6)
  const a = new Date(weekStartISO + 'T12:00:00')
  const b = new Date(end + 'T12:00:00')
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const y = a.getFullYear()
  if (b.getFullYear() !== y) {
    return `${a.toLocaleDateString(undefined, { ...o, year: 'numeric' })} – ${b.toLocaleDateString(undefined, { ...o, year: 'numeric' })}`
  }
  return `${a.toLocaleDateString(undefined, o)} – ${b.toLocaleDateString(undefined, o)}, ${y}`
}
