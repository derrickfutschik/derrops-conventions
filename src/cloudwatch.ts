import type { Segments } from './types.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildDimensions(
  ctx: ConventionsContext,
  overrides: Partial<Segments> = {},
): Array<{ Name: string; Value: string }> {
  const merged: Segments = { ...ctx.segments(), ...overrides }
  const result: Array<{ Name: string; Value: string }> = []
  for (const dimKey of ctx.visibleDimensionKeys()) {
    const value = merged[dimKey]
    if (value) result.push({ Name: dimKey, Value: value })
  }
  return result
}

export function buildCloudwatchResource(
  ctx: ConventionsContext,
  options?: { key?: string },
): {
  namespace: string
  logGroup: string
  dashboard: string
  alarm: string | undefined
  dimensions: Array<{ Name: string; Value: string }>
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object) => ctx.name(opts as any)
  const namespace = n({ type: 'cloudwatchMetricNamespace' })
  const logGroup = n({ type: 'cloudwatchLogsGroup' })
  const dashboard = n({ type: 'cloudwatchDashboard' })
  const alarm = options?.key ? n({ type: 'cloudwatchAlarm', key: options.key }) : undefined
  return { namespace, logGroup, dashboard, alarm, dimensions: buildDimensions(ctx) }
}
