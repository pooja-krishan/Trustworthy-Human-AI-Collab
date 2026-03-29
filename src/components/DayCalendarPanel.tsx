import type { ScheduledBlock } from '../types/types'
import { formatLongDate } from '../lib/dateRange'

/** Full-day view: 6:00 AM through 10:00 PM (last slot ends at 10 PM). */
const DAY_START_HOUR = 6
const DAY_END_HOUR = 22
const GRID_START = DAY_START_HOUR * 60
const GRID_END = DAY_END_HOUR * 60
const GRID_MIN = GRID_END - GRID_START
const HOUR_COUNT = DAY_END_HOUR - DAY_START_HOUR

function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${m.toString().padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`
}

function formatHourGutter(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${ampm}`
}

const kindClass: Record<ScheduledBlock['kind'], string> = {
  meeting: 'block--meeting',
  deepwork: 'block--deep',
  health: 'block--health',
  admin: 'block--admin',
}

interface Props {
  dateISO: string
  blocks: ScheduledBlock[]
}

export function DayCalendarPanel({ dateISO, blocks }: Props) {
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => DAY_START_HOUR + i)
  const dayBlocks = blocks.filter((b) => b.dateISO === dateISO && b.endMin > GRID_START && b.startMin < GRID_END)

  return (
    <section className="day-calendar" aria-label="Single day schedule">
      <div className="day-calendar__title">
        <span className="day-calendar__date">{formatLongDate(dateISO)}</span>
        <span className="day-calendar__range" aria-hidden>
          {formatHourGutter(DAY_START_HOUR)}–{formatHourGutter(DAY_END_HOUR)}
        </span>
      </div>
      <div className="day-calendar__grid">
        <div className="day-calendar__hours">
          {hours.map((h) => (
            <div key={h} className="day-calendar__hour-label">
              <span className="day-calendar__hour-text">{formatHourGutter(h)}</span>
            </div>
          ))}
        </div>
        <div className="day-calendar__track">
          <div className="day-calendar__grid-lines" aria-hidden>
            {hours.map((h) => (
              <div key={h} className="day-calendar__hour-line" />
            ))}
          </div>
          <div className="day-calendar__events">
          {dayBlocks.map((b) => {
            const startClamped = Math.max(b.startMin, GRID_START)
            const endClamped = Math.min(b.endMin, GRID_END)
            const top = ((startClamped - GRID_START) / GRID_MIN) * 100
            const height = Math.max(((endClamped - startClamped) / GRID_MIN) * 100, 0.8)
            return (
              <div
                key={b.id}
                className={`calendar-block ${kindClass[b.kind]}`}
                style={{ top: `${top}%`, height: `${height}%` }}
                title={`${b.label} (${formatTime(b.startMin)}–${formatTime(b.endMin)})`}
              >
                <span className="calendar-block__label">{b.label}</span>
                <span className="calendar-block__time">
                  {formatTime(b.startMin)} – {formatTime(b.endMin)}
                </span>
                {b.pinned && <span className="calendar-block__pin">📌</span>}
              </div>
            )
          })}
          </div>
        </div>
      </div>
    </section>
  )
}
