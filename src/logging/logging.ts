import type { LogEvent, LogEventType, ScenarioId } from '../types/types'

export function createLogEvent(
  scenarioId: ScenarioId | null,
  eventType: LogEventType,
  metadata: Record<string, unknown> = {},
): LogEvent {
  return {
    timestamp: new Date().toISOString(),
    scenarioId,
    eventType,
    metadata,
  }
}

export function downloadLogsJson(data: unknown, filename = 'session-backup.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
