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

export function buildSegments(
  merged: Segments,
  config: ResourceTypeConfig,
  extraSegments: Record<string, string>,
  order: Array<SegmentKey | string>,
  apexZoneMap: Record<string, string> | undefined,
  apexMapFn: ((segments: Segments) => string) | undefined,
): string[] {
  const activeOrder = config.segments
    ? mergeExtraSegments(config.segments, extraSegments, order)
    : effectiveOrder(config, order)

  if (!activeOrder.includes('apex')) {
    return activeOrder
      .map((key) => (merged as Record<string, string | undefined>)[key] ?? extraSegments[key])
      .filter((v): v is string => v !== undefined && v.length > 0)
      .map((v) => normalize(v, config.wordDelimiter))
  }

  // Step 1: zone lookup — resolve base domain from region
  let effective: Segments = merged
  if (apexZoneMap !== undefined && merged.region !== undefined) {
    const zone = apexZoneMap[merged.region]
    if (zone !== undefined) effective = { ...merged, apex: zone }
  }

  // Step 2: apex mapping — env qualification or other derivation on top of resolved zone
  if (apexMapFn !== undefined) {
    effective = { ...effective, apex: apexMapFn(effective) }
  }

  return activeOrder
    .map((key) => (effective as Record<string, string | undefined>)[key] ?? extraSegments[key])
    .filter((v): v is string => v !== undefined && v.length > 0)
    .map((v) => normalize(v, config.wordDelimiter))
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
