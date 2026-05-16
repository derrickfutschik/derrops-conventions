import type { SegmentKey, Segments, ResourceTypeConfig } from './types.js'
import type { ArnContext } from './policy/types.js'
import { normalize, GLOBAL_ONLY_SEGMENTS } from './conventions-constants.js'

// ── Apex resolution ───────────────────────────────────────────────────────────

export function resolveApex(
  merged: Segments,
  apexZoneMap: Record<string, string> | undefined,
  apexMapFn: ((segments: Segments) => string) | undefined,
): string | undefined {
  let apex = merged.apex
  if (apexZoneMap !== undefined && merged.region !== undefined) {
    apex = apexZoneMap[merged.region] ?? apex
  }
  if (apexMapFn !== undefined && apex !== undefined) {
    apex = apexMapFn({ ...merged, apex })
  }
  return apex
}

// ── Segment ordering ──────────────────────────────────────────────────────────

export function effectiveOrder(
  config: ResourceTypeConfig,
  order: Array<SegmentKey | string>,
): Array<SegmentKey | string> {
  if (config.global) return order
  return order.filter((s) => !(GLOBAL_ONLY_SEGMENTS as string[]).includes(s))
}

/**
 * Merge extra segments (from `insertSegment`/`insertSegmentAt`) into a fixed segment list.
 * Extra keys are inserted at the position closest to where they appear in `order`,
 * so fixed segments keep their declared relative order and custom segments slot in naturally.
 */
export function mergeExtraSegments(
  fixedOrder: readonly (SegmentKey | string)[],
  extraSegments: Record<string, string>,
  order: Array<SegmentKey | string>,
): Array<SegmentKey | string> {
  const extraKeys = Object.keys(extraSegments)
  if (extraKeys.length === 0) return [...fixedOrder]

  const orderedExtras = order.filter((k) => extraKeys.includes(k))
  if (orderedExtras.length === 0) return [...fixedOrder]

  const result: Array<SegmentKey | string> = [...fixedOrder]

  for (const key of orderedExtras) {
    const keyIdx = order.indexOf(key)
    let insertAfterIdx = -1
    for (let i = keyIdx - 1; i >= 0; i--) {
      const pred = order[i]!
      const rIdx = result.indexOf(pred)
      if (rIdx !== -1) {
        insertAfterIdx = rIdx
        break
      }
    }
    result.splice(insertAfterIdx + 1, 0, key)
  }

  return result
}

// ── Segment building ──────────────────────────────────────────────────────────

export function buildSegmentsKeyed(
  merged: Segments,
  config: ResourceTypeConfig,
  extraSegments: Record<string, string>,
  order: Array<SegmentKey | string>,
  apexZoneMap: Record<string, string> | undefined,
  apexMapFn: ((segments: Segments) => string) | undefined,
): Array<{ key: string; value: string }> {
  const activeOrder = config.segments
    ? mergeExtraSegments(config.segments, extraSegments, order)
    : effectiveOrder(config, order)

  const lookup = (source: Record<string, string | undefined>, key: string): string | undefined =>
    source[key] ?? extraSegments[key]

  let source: Record<string, string | undefined> = merged as Record<string, string | undefined>

  if (activeOrder.includes('apex')) {
    let effective: Segments = merged
    if (apexZoneMap !== undefined && merged.region !== undefined) {
      const zone = apexZoneMap[merged.region]
      if (zone !== undefined) effective = { ...merged, apex: zone }
    }
    if (apexMapFn !== undefined) {
      effective = { ...effective, apex: apexMapFn(effective) }
    }
    source = effective as Record<string, string | undefined>
  }

  return activeOrder
    .map((key) => {
      const raw = lookup(source, key)
      if (!raw || raw.length === 0) return null
      return { key, value: normalize(raw, config.wordDelimiter) }
    })
    .filter((p): p is { key: string; value: string } => p !== null)
}

export function buildSegments(
  merged: Segments,
  config: ResourceTypeConfig,
  extraSegments: Record<string, string>,
  order: Array<SegmentKey | string>,
  apexZoneMap: Record<string, string> | undefined,
  apexMapFn: ((segments: Segments) => string) | undefined,
): string[] {
  return buildSegmentsKeyed(merged, config, extraSegments, order, apexZoneMap, apexMapFn).map(
    (p) => p.value,
  )
}

// ── ARN context ───────────────────────────────────────────────────────────────

export function resolveArnContext(
  override: Partial<ArnContext> | undefined,
  storedArnContext: { accountId: string; partition?: string } | undefined,
  defaultRegion: string | undefined,
): ArnContext {
  const accountId = override?.accountId ?? storedArnContext?.accountId
  if (!accountId) {
    throw new Error(
      'arnContext.accountId is required. Set it via .arnContext({ accountId }) on the instance or pass it directly to .staticPolicy() / .dynamicPolicy().',
    )
  }
  return {
    partition: override?.partition ?? storedArnContext?.partition,
    region: override?.region ?? defaultRegion,
    accountId,
  }
}
