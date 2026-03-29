import { MAX_TASK_DURATION_MIN } from '../lib/constants'
import {
  addDaysISO,
  formatWeekRangeShort,
  shiftWeekBy,
  startOfWeekISO,
} from '../lib/dateRange'
import { layoutDayBlocks } from '../lib/calendarLayout'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ScheduledBlock } from '../types/types'

const CLOCK_STORAGE_KEY = 'weekCalendarClockFormat'

/** Full day in minutes (grid is 00:00–24:00). */
const GRID_START = 0
const GRID_END = 24 * 60
const GRID_MIN = GRID_END - GRID_START
const HOUR_COUNT = 24
/** First hour row shown when the calendar opens (scroll position). */
const DEFAULT_VIEW_START_HOUR = 9

type ClockFormat = '12' | '24'

function formatTime12(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${m.toString().padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`
}

function formatTime24(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTime(min: number, clock: ClockFormat): string {
  return clock === '24' ? formatTime24(min) : formatTime12(min)
}

function formatHourGutter(h: number, clock: ClockFormat): string {
  if (clock === '24') {
    return `${String(h % 24).padStart(2, '0')}:00`
  }
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function readClockFormat(): ClockFormat {
  try {
    const v = localStorage.getItem(CLOCK_STORAGE_KEY)
    if (v === '12' || v === '24') return v
  } catch {
    /* ignore */
  }
  return '24'
}

const kindClass: Record<ScheduledBlock['kind'], string> = {
  meeting: 'block--meeting',
  deepwork: 'block--deep',
  health: 'block--health',
  admin: 'block--admin',
}

interface Props {
  dateISO: string
  /** Study window for anchor picker and week navigation. */
  dateMin: string
  dateMax: string
  onDateISOChange: (iso: string) => void
  blocks: ScheduledBlock[]
  onBlockEdit?: (
    blockId: string,
    patch: { label?: string; dayOffset?: number; startMin?: number; durationMin?: number },
  ) => void
  onCreateEvent?: (dayOffset: number, startMin: number) => void
  onDeleteEvent?: (blockId: string) => void
}

function minutesToTimeValue(m: number): string {
  const h = Math.floor(m / 60) % 24
  const mi = m % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

function parseTimeValue(s: string): number {
  const [hs, ms] = s.split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (Number.isNaN(h) || Number.isNaN(m)) return 9 * 60
  return Math.min(1439, Math.max(0, h * 60 + m))
}

function yToStartMin(yPx: number, heightPx: number): number {
  if (heightPx <= 0) return 9 * 60
  const ratio = Math.max(0, Math.min(1, yPx / heightPx))
  const raw = GRID_START + ratio * GRID_MIN
  const snapped = Math.round(raw / 15) * 15
  return Math.max(GRID_START, Math.min(GRID_END - 15, snapped))
}

export function WeekCalendarPanel({
  dateISO,
  dateMin,
  dateMax,
  onDateISOChange,
  blocks,
  onBlockEdit,
  onCreateEvent,
  onDeleteEvent,
}: Props) {
  const weekStartISO = startOfWeekISO(dateISO)
  const prevWeekAnchor = shiftWeekBy(dateISO, -1)
  const nextWeekAnchor = shiftWeekBy(dateISO, 1)
  const canPrev = prevWeekAnchor >= dateMin
  const canNext = nextWeekAnchor <= dateMax
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i)),
    [weekStartISO],
  )
  const dayOffsetByDate = useMemo(() => {
    const m = new Map<string, number>()
    weekDays.forEach((d, i) => m.set(d, i))
    return m
  }, [weekDays])
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => i)
  const [clockFormat, setClockFormat] = useState<ClockFormat>(readClockFormat)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CLOCK_STORAGE_KEY, clockFormat)
    } catch {
      /* ignore */
    }
  }, [clockFormat])

  /** Scroll so ~09:00 is at the top when the week loads or changes (full day still scrollable above). */
  useLayoutEffect(() => {
    const el = gridScrollRef.current
    if (!el) return
    const apply = () => {
      const ratio = DEFAULT_VIEW_START_HOUR / HOUR_COUNT
      const max = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollTop = Math.min(ratio * el.scrollHeight, max)
    }
    apply()
    requestAnimationFrame(apply)
  }, [dateISO, weekStartISO])

  const [editing, setEditing] = useState<{
    id: string
    label: string
    dayOffset: number
    startMin: number
    durationMin: number
  } | null>(null)
  const { byDate, layoutByDate } = useMemo(() => {
    const byDate = new Map<string, ScheduledBlock[]>()
    for (const b of blocks) {
      if (!byDate.has(b.dateISO)) byDate.set(b.dateISO, [])
      byDate.get(b.dateISO)!.push(b)
    }
    for (const d of weekDays) {
      byDate.set(
        d,
        (byDate.get(d) ?? [])
          .filter((b) => b.endMin > GRID_START && b.startMin < GRID_END)
          .sort((a, b) => a.startMin - b.startMin),
      )
    }
    const layoutByDate = new Map<string, Map<string, { leftPct: number; widthPct: number }>>()
    for (const d of weekDays) {
      layoutByDate.set(d, layoutDayBlocks(byDate.get(d) ?? []))
    }
    return { byDate, layoutByDate }
  }, [blocks, weekDays])

  const maxDurForSlotEdit = editing
    ? Math.min(MAX_TASK_DURATION_MIN, GRID_END - editing.startMin)
    : 0

  return (
    <section className="week-calendar" aria-label="Weekly schedule">
      <div className="week-calendar__title">
        <button
          type="button"
          className="week-calendar__nav-btn"
          aria-label="Previous week"
          disabled={!canPrev}
          onClick={() => canPrev && onDateISOChange(prevWeekAnchor)}
        >
          &lt;
        </button>
        <div className="week-calendar__anchor-wrap">
          <label className="week-calendar__anchor-label" htmlFor="week-anchor-date">
            Week anchor
          </label>
          <div className="week-calendar__anchor-row">
            <input
              id="week-anchor-date"
              className="week-calendar__date-input"
              type="date"
              min={dateMin}
              max={dateMax}
              value={dateISO}
              onChange={(e) => onDateISOChange(e.target.value)}
              aria-label="Choose week anchor date"
            />
            <span className="week-calendar__range-text">{formatWeekRangeShort(weekStartISO)}</span>
          </div>
        </div>
        <button
          type="button"
          className="week-calendar__nav-btn"
          aria-label="Next week"
          disabled={!canNext}
          onClick={() => canNext && onDateISOChange(nextWeekAnchor)}
        >
          &gt;
        </button>
        <div className="week-calendar__clock-toggle" role="group" aria-label="Clock format for times">
          <button
            type="button"
            className={`week-calendar__clock-btn ${clockFormat === '12' ? 'week-calendar__clock-btn--active' : ''}`}
            aria-pressed={clockFormat === '12'}
            onClick={() => setClockFormat('12')}
          >
            12h
          </button>
          <button
            type="button"
            className={`week-calendar__clock-btn ${clockFormat === '24' ? 'week-calendar__clock-btn--active' : ''}`}
            aria-pressed={clockFormat === '24'}
            onClick={() => setClockFormat('24')}
          >
            24h
          </button>
        </div>
      </div>
      <div className="week-calendar__header">
        <div className="week-calendar__corner" />
        {weekDays.map((d) => (
          <div key={d} className="week-calendar__day-head">
            {new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        ))}
      </div>
      <div className="week-calendar__grid" ref={gridScrollRef}>
        <div className="week-calendar__hours">
          {hours.map((h) => (
            <div key={h} className="week-calendar__hour-label">
              <span className="week-calendar__hour-text">{formatHourGutter(h, clockFormat)}</span>
            </div>
          ))}
        </div>
        <div className="week-calendar__columns">
          {weekDays.map((d) => (
            <div
              key={d}
              className="week-calendar__day-column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const blockId = e.dataTransfer.getData('text/plain')
                if (!blockId) return
                const rect = e.currentTarget.getBoundingClientRect()
                const startMin = yToStartMin(e.clientY - rect.top, rect.height)
                const dayOffset = dayOffsetByDate.get(d) ?? 0
                onBlockEdit?.(blockId, { dayOffset, startMin })
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement
                if (target.closest('.calendar-block')) return
                const rect = e.currentTarget.getBoundingClientRect()
                const startMin = yToStartMin(e.clientY - rect.top, rect.height)
                const dayOffset = dayOffsetByDate.get(d) ?? 0
                onCreateEvent?.(dayOffset, startMin)
              }}
            >
              <div className="week-calendar__grid-lines" aria-hidden>
                {hours.map((h) => (
                  <div key={h} className="week-calendar__hour-line" />
                ))}
              </div>
              <div className="week-calendar__events">
                {(byDate.get(d) ?? []).map((b) => {
                  const startClamped = Math.max(b.startMin, GRID_START)
                  const endClamped = Math.min(b.endMin, GRID_END)
                  const top = ((startClamped - GRID_START) / GRID_MIN) * 100
                  const height = Math.max(((endClamped - startClamped) / GRID_MIN) * 100, 0.8)
                  const layout = layoutByDate.get(d)?.get(b.id)
                  const leftPct = layout?.leftPct ?? 0
                  const widthPct = layout?.widthPct ?? 100
                  return (
                    <div
                      key={b.id}
                      className={`calendar-block ${kindClass[b.kind]}`}
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        right: 'auto',
                      }}
                      title={`${b.label} (${formatTime(b.startMin, clockFormat)}–${formatTime(b.endMin, clockFormat)})`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', b.id)
                      }}
                      onClick={() =>
                        setEditing({
                          id: b.id,
                          label: b.label,
                          dayOffset: dayOffsetByDate.get(b.dateISO) ?? 0,
                          startMin: b.startMin,
                          durationMin: Math.max(15, b.endMin - b.startMin),
                        })
                      }
                    >
                      <span className="calendar-block__label">{b.label}</span>
                      <span className="calendar-block__time">
                        {formatTime(b.startMin, clockFormat)} – {formatTime(b.endMin, clockFormat)}
                      </span>
                      {b.pinned && <span className="calendar-block__pin">📌</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <div className="calendar-edit" role="dialog" aria-modal="true" aria-label="Edit calendar event">
          <div className="calendar-edit__card">
            <h4 className="calendar-edit__title">Edit event</h4>
            <label className="calendar-edit__field">
              Name
              <input
                type="text"
                value={editing.label}
                onChange={(e) => setEditing((x) => (x ? { ...x, label: e.target.value } : x))}
              />
            </label>
            <div className="calendar-edit__row">
              <label className="calendar-edit__field">
                Day
                <select
                  value={editing.dayOffset}
                  onChange={(e) => setEditing((x) => (x ? { ...x, dayOffset: Number(e.target.value) } : x))}
                >
                  {weekDays.map((d, i) => (
                    <option key={d} value={i}>
                      {new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="calendar-edit__field">
                Start
                <input
                  type="time"
                  value={minutesToTimeValue(editing.startMin)}
                  onChange={(e) =>
                    setEditing((x) => {
                      if (!x) return x
                      const startMin = parseTimeValue(e.target.value)
                      const cap = Math.min(MAX_TASK_DURATION_MIN, GRID_END - startMin)
                      return { ...x, startMin, durationMin: Math.min(x.durationMin, cap) }
                    })
                  }
                />
              </label>
              <label className="calendar-edit__field">
                Minutes
                <input
                  type="number"
                  min={15}
                  max={maxDurForSlotEdit}
                  step={5}
                  value={editing.durationMin}
                  onChange={(e) =>
                    setEditing((x) => {
                      if (!x) return x
                      const cap = Math.min(MAX_TASK_DURATION_MIN, GRID_END - x.startMin)
                      const raw = Number(e.target.value)
                      const n = Number.isFinite(raw) ? raw : 60
                      return { ...x, durationMin: Math.min(cap, Math.max(15, n)) }
                    })
                  }
                />
              </label>
            </div>
            <div className="calendar-edit__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  onDeleteEvent?.(editing.id)
                  setEditing(null)
                }}
              >
                Delete
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--accent btn--small"
                onClick={() => {
                  onBlockEdit?.(editing.id, {
                    label: editing.label,
                    dayOffset: editing.dayOffset,
                    startMin: editing.startMin,
                    durationMin: editing.durationMin,
                  })
                  setEditing(null)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
