import type { SegmentKey, ParsedSegments, ResourceTypeConfig } from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import { DEFAULT_SEGMENT_ORDER, GLOBAL_ONLY_SEGMENTS } from './conventions-constants.js'
import type { DatePartitionGranularity } from './conventions-types.js'

// ── Private helpers ───────────────────────────────────────────────────────────

export function splitS3Uri(uri: string): { bucket: string; key: string } {
  let path: string
  if (uri.startsWith('s3://')) {
    path = uri.slice(5)
  } else if (uri.startsWith('arn:aws:s3:::')) {
    path = uri.slice('arn:aws:s3:::'.length)
  } else {
    throw new Error(
      `parseS3Uri(): unsupported URI scheme — expected "s3://" or "arn:aws:s3:::" but got "${uri.slice(0, 30)}..."`,
    )
  }
  const slashIdx = path.indexOf('/')
  if (slashIdx === -1) return { bucket: path, key: '' }
  const bucket = path.slice(0, slashIdx)
  const key = path.slice(slashIdx + 1)
  return { bucket, key: key === '' ? '' : key }
}

/** Parse a `key=val,key=val` tag value into a `ParsedSegments` dict. */
export function parseSegmentValues(str: string): ParsedSegments {
  return Object.fromEntries(
    str
      .split(',')
      .map((pair) => {
        const eq = pair.indexOf('=')
        return eq === -1 ? [] : [pair.slice(0, eq), pair.slice(eq + 1)]
      })
      .filter(([k]) => k),
  ) as ParsedSegments
}

/**
 * Find a tag value by canonical base name, ignoring prefix (e.g. `slaops:`) and casing variants.
 * Normalises by stripping `-` / `_` and lowercasing before comparison.
 */
export function findTagByName(tags: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase().replace(/[-_]/g, '')
  for (const [key, value] of Object.entries(tags)) {
    const baseKey = key.includes(':') ? key.split(':').pop()! : key
    if (baseKey.toLowerCase().replace(/[-_]/g, '') === target) return value
  }
  return undefined
}

export function defaultSegmentOrder(config: ResourceTypeConfig): SegmentKey[] {
  if (config.segments) return config.segments
  if (config.global) return DEFAULT_SEGMENT_ORDER
  return DEFAULT_SEGMENT_ORDER.filter((s) => !GLOBAL_ONLY_SEGMENTS.includes(s))
}

export function findSegmentTag(tags: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(tags)) {
    const baseKey = key.includes(':') ? key.split(':').pop()! : key
    // Match 'segment' (and any casing: 'Segment') but not 'segment-values' variants
    if (baseKey.toLowerCase() === 'segment') return value
  }
  return undefined
}

// ── Public parse functions ────────────────────────────────────────────────────

/**
 * Parse a resource name back into its constituent segments without any instance context.
 *
 * When `options.tags` contains a `segment` tag (with any key prefix), that tag's value is
 * used as the authoritative ordered key list. Otherwise the key order is derived from the
 * resource type's configuration.
 */
export function parseResourceName(
  name: string,
  type: string,
  options?: { tags?: Record<string, string> },
): ParsedSegments {
  const config: ResourceTypeConfig = (RESOURCE_TYPES as Record<string, ResourceTypeConfig>)[type]!
  const delimiter = config.segmentDelimiter

  let cleanName = name
  if (config.leadingDelimiter && cleanName.startsWith(delimiter)) {
    cleanName = cleanName.slice(delimiter.length)
  }
  if (config.namePrefix && cleanName.startsWith(config.namePrefix)) {
    cleanName = cleanName.slice(config.namePrefix.length)
  }
  if (config.suffix && cleanName.endsWith(config.suffix)) {
    cleanName = cleanName.slice(0, -config.suffix.length)
  }

  const segmentTagValue = options?.tags ? findSegmentTag(options.tags) : undefined

  const keyOrder: SegmentKey[] =
    segmentTagValue !== undefined
      ? (segmentTagValue.split(delimiter) as SegmentKey[])
      : defaultSegmentOrder(config)

  const parts = cleanName.split(delimiter)
  const result: ParsedSegments = {}
  const keyCount = Math.min(keyOrder.length, parts.length)
  for (let i = 0; i < keyCount; i++) {
    const key = keyOrder[i]
    // Last key is greedy: collect any remaining delimiter-bearing parts into it.
    const value =
      i === keyCount - 1 && parts.length > keyCount ? parts.slice(i).join(delimiter) : parts[i]!
    if (key && value) result[key] = value
  }

  return result
}

/**
 * Format a `Date` as an S3 time-partition path segment using UTC.
 *
 * | Granularity | Output example      |
 * | ----------- | ------------------- |
 * | `'year'`    | `'2024'`            |
 * | `'month'`   | `'2024/03'`         |
 * | `'day'`     | `'2024/03/15'`      |
 * | `'hour'`    | `'2024/03/15/14'`   |
 */
export function parseDatePartition(date: Date, granularity: DatePartitionGranularity): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  switch (granularity) {
    case 'year':
      return `${y}`
    case 'month':
      return `${y}/${m}`
    case 'day':
      return `${y}/${m}/${d}`
    case 'hour':
      return `${y}/${m}/${d}/${h}`
  }
}

/**
 * Convert an AWS region name to a compact alphabetic code suitable for DNS labels and resource names.
 *
 * | Region            | Code    |
 * | ----------------- | ------- |
 * | `us-east-1`       | `use1`  |
 * | `us-west-2`       | `usw2`  |
 * | `ap-southeast-2`  | `apse2` |
 */
export function parseRegionCode(region: string): string {
  const REGION_DIRECTION_CODES: Record<string, string> = {
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
  const parts = region.split('-')
  if (parts.length < 2) return region
  const location = parts[0]!
  const num = parts[parts.length - 1]!
  const direction = parts.slice(1, -1).join('-')
  const abbrev = REGION_DIRECTION_CODES[direction] ?? direction.slice(0, 2)
  return `${location}${abbrev}${num}`
}
