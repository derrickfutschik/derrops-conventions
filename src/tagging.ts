import type { SegmentKey, Segments, ResourceTypeConfig } from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import type { ResourceType } from './resource-types.js'
import { SEGMENT_FOR_TAG, applyTagKeyCasing } from './conventions-constants.js'
import type { TagKey, TagKeyCasing } from './conventions-types.js'
import { effectiveOrder, mergeExtraSegments } from './helpers.js'

export interface TagBuildState {
  readonly defaults: Segments
  readonly visibleTags: readonly TagKey[]
  readonly keyPrefix: string
  readonly keyCasing: TagKeyCasing
  readonly defaultType: ResourceType | undefined
  readonly order: readonly (SegmentKey | string)[]
  readonly extraSegments: Readonly<Record<string, string>>
  readonly tagRules: ReadonlyArray<(segments: Segments) => Record<string, string>>
  readonly tagAugmentors: ReadonlyArray<(tags: Record<string, string>) => Record<string, string>>
  readonly tagKeyMax: number
  readonly tagValueMax: number
  readonly tagCountMax: number
  readonly tagPolicies: ReadonlyArray<{
    fn: (tags: Record<string, string>) => boolean
    message: string
  }>
  readonly _emitSegmentValues: boolean
}

export function buildTags(
  state: TagBuildState,
  merged: Segments,
  typeOverride: ResourceType | undefined,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const tagKey of state.visibleTags) {
    const value = merged[SEGMENT_FOR_TAG[tagKey]]
    if (value) {
      result[state.keyPrefix + applyTagKeyCasing(tagKey, state.keyCasing)] = value
    }
  }

  const resolvedType = typeOverride ?? state.defaultType
  let activeSegmentOrder: Array<SegmentKey | string>
  let segmentDelimiter: string
  if (resolvedType) {
    const config: ResourceTypeConfig = RESOURCE_TYPES[resolvedType]
    activeSegmentOrder = config.segments
      ? mergeExtraSegments(
          config.segments,
          state.extraSegments as Record<string, string>,
          state.order as Array<SegmentKey | string>,
        )
      : effectiveOrder(config, state.order as Array<SegmentKey | string>)
    segmentDelimiter = config.segmentDelimiter
  } else {
    const extra = (['apex', 'entity'] as SegmentKey[]).filter((k) => !state.order.includes(k))
    activeSegmentOrder = [...state.order, ...extra]
    segmentDelimiter = '--'
  }

  const lookup = (key: string): string | undefined =>
    (merged as Record<string, string | undefined>)[key] ??
    (state.extraSegments as Record<string, string>)[key]

  const segmentPattern = activeSegmentOrder
    .filter((key) => {
      const v = lookup(key)
      return v !== undefined && v.length > 0
    })
    .join(segmentDelimiter)
  if (segmentPattern) {
    result[state.keyPrefix + applyTagKeyCasing('segment', state.keyCasing)] = segmentPattern
  }

  if (state._emitSegmentValues) {
    const segmentValues = activeSegmentOrder
      .filter((key) => {
        const v = lookup(key)
        return v !== undefined && v.length > 0
      })
      .map((key) => `${key}=${lookup(key)}`)
      .join(',')
    if (segmentValues) {
      result[state.keyPrefix + applyTagKeyCasing('segment-values', state.keyCasing)] = segmentValues
    }
  }

  if (resolvedType === 's3Bucket') {
    const prefixConfig = RESOURCE_TYPES['s3KeyPrefix']
    const objNameConfig = RESOURCE_TYPES['s3ObjectName']
    result[state.keyPrefix + applyTagKeyCasing('s3-prefix-segment', state.keyCasing)] =
      prefixConfig.segments!.join(prefixConfig.segmentDelimiter)
    result[state.keyPrefix + applyTagKeyCasing('s3-object-name-segment', state.keyCasing)] =
      objNameConfig.segments!.join(objNameConfig.segmentDelimiter)
  }

  for (const rule of state.tagRules) {
    Object.assign(result, rule(merged))
  }
  for (const augment of state.tagAugmentors) {
    Object.assign(result, augment({ ...result }))
  }

  const entries = Object.entries(result)
  if (entries.length > state.tagCountMax) {
    throw new Error(`tags() produced ${entries.length} tags but maxTags is ${state.tagCountMax}`)
  }
  for (const [k, v] of entries) {
    if (k.length > state.tagKeyMax) {
      throw new Error(`Tag key "${k}" is ${k.length} characters but keyMax is ${state.tagKeyMax}`)
    }
    if (v.length > state.tagValueMax) {
      throw new Error(
        `Tag value for key "${k}" is ${v.length} characters but valueMax is ${state.tagValueMax}`,
      )
    }
  }
  for (const { fn, message } of state.tagPolicies) {
    if (!fn(result)) throw new Error(message)
  }

  return result
}
