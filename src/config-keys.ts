import type { Segments } from './types.js'

export function buildCfgKey(defaults: Readonly<Segments>, key: string, suffix?: string): string {
  const parts: string[] = []
  if (defaults.domain !== undefined) parts.push(defaults.domain)
  if (defaults.service !== undefined) parts.push(defaults.service)
  parts.push(key)
  if (suffix !== undefined) parts.push(suffix)
  return parts.join('.')
}

export function buildCfgProp(
  defaults: Readonly<Segments>,
  value: unknown,
  key: string,
  suffix?: string,
): Record<string, unknown> {
  return { [buildCfgKey(defaults, key, suffix)]: value }
}
