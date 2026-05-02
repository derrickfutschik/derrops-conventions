import type { ConventionsContext } from './conventions-context.js'

export function buildEventSource(
  ctx: ConventionsContext,
  options?: { level?: 'org' | 'domain' | 'service' },
): string {
  const { org, domain, service } = ctx.segments()
  const parts = [org, domain, service].filter((v): v is string => v !== undefined && v.length > 0)
  const depth = options?.level === 'org' ? 1 : options?.level === 'domain' ? 2 : parts.length
  return parts.slice(0, depth).join('.')
}

export function buildDetailType(action: string): string {
  return action
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}
