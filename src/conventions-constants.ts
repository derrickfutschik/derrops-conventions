import type { SegmentKey } from './types.js'
import type { TagKey, TagKeyCasing, DimensionKey } from './conventions-types.js'

// ── Segment ordering ──────────────────────────────────────────────────────────

export const REGION_DIRECTION_CODES: Record<string, string> = {
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
  central: 'c',
  local: 'l',
  'gov-east': 'ge',
  'gov-west': 'gw',
}

export const DEFAULT_SEGMENT_ORDER: SegmentKey[] = [
  'region',
  'env',
  'org',
  'domain',
  'service',
  'tenant',
  'partition',
  'key',
  'purpose',
  'kind',
  'az',
  'num',
  'consumer',
  'target',
  'version',
  // 'apex' is intentionally absent — it only participates in resource types that
  // declare it explicitly in their segments list (DNS types). Including it in the
  // default order would pollute names for all other resource types.
  //
  // 'entity' is also intentionally absent — it is only meaningful for openSearchIndex
  // (and any custom type that declares it explicitly). Passing entity to a type that
  // doesn't list it in its segments has no effect and produces no output.
]

export const GLOBAL_ONLY_SEGMENTS: SegmentKey[] = ['region', 'env']

// ── Tag mapping ───────────────────────────────────────────────────────────────

/** Canonical ordering for tag keys in `visibleTags`. */
export const ALL_TAG_KEYS: TagKey[] = ['org', 'domain', 'service', 'env', 'tenant']

export const DEFAULT_TAG_KEYS: TagKey[] = ['domain', 'service']
export const DEFAULT_TAG_CASING: TagKeyCasing = 'kebab'

// ── CloudWatch dimension mapping ──────────────────────────────────────────────

// Default: just Service — namespace already captures Org/Domain via cloudwatchMetricNamespace.
export const DEFAULT_DIMENSION_KEYS: DimensionKey[] = ['service']

// ── Tag limits ────────────────────────────────────────────────────────────────

// Default limits match AWS tag constraints — https://docs.aws.amazon.com/general/latest/gr/aws_tagging.html
export const DEFAULT_TAG_KEY_MAX = 128
export const DEFAULT_TAG_VALUE_MAX = 256
export const DEFAULT_TAG_COUNT_MAX = 50

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function applyTagKeyCasing(key: string, casing: TagKeyCasing): string {
  const words = key.split('-')
  switch (casing) {
    case 'kebab':
      return key
    case 'snake':
      return words.join('_')
    case 'camel':
      return (
        words[0] +
        words
          .slice(1)
          .map((w) => w[0]!.toUpperCase() + w.slice(1))
          .join('')
      )
    case 'pascal':
      return words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')
  }
}

/**
 * Normalise a segment value to lowercase, replacing whitespace and (when the delimiter
 * is not already `-`) hyphens with the supplied word delimiter.
 */
export function normalize(value: string, wordDelimiter: string): string {
  const lower = value.toLowerCase().replace(/\s+/g, wordDelimiter)
  return wordDelimiter !== '-' ? lower.replace(/-/g, wordDelimiter) : lower
}
