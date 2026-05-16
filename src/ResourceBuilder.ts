import type { Segments, SegmentKey } from './types.js'
import type { ResourceType } from './resource-types.js'
import { DerropsConventions } from './DerropsConventions.js'

// ── Layer types ───────────────────────────────────────────────────────────────

/** Configuration for one named layer within a resource definition. */
type LayerDef<S extends readonly SegmentKey[]> = {
  /** The resource type that determines delimiters and name formatting. */
  type: ResourceType
  /** Ordered segment keys whose values compose this layer's name. */
  segments: S
}

/** Map of user-defined layer names to their configurations. */
type LayersDef = Record<string, LayerDef<readonly SegmentKey[]>>

// ── Derived types ─────────────────────────────────────────────────────────────

/** Union of every segment key referenced across all layers. */
type AllLayerSegmentKeys<TLayers extends LayersDef> = {
  [K in keyof TLayers]: TLayers[K]['segments'][number]
}[keyof TLayers]

/** Segment keys that have no default → must be supplied at call time. */
type RequiredKeys<TLayers extends LayersDef, TDefaults extends Partial<Segments>> = Exclude<
  AllLayerSegmentKeys<TLayers>,
  keyof TDefaults
>

/** Optional keys = all layer keys that already have defaults. */
type OptionalKeys<TLayers extends LayersDef, TDefaults extends Partial<Segments>> = Exclude<
  AllLayerSegmentKeys<TLayers>,
  RequiredKeys<TLayers, TDefaults>
>

/** Input to the factory function returned by `defineResource`. */
type ResourceInput<TLayers extends LayersDef, TDefaults extends Partial<Segments>> = {
  [K in RequiredKeys<TLayers, TDefaults>]: string
} & {
  [K in OptionalKeys<TLayers, TDefaults>]?: string
}

/** Object returned by the factory function — one string property per named layer. */
type ResourceOutput<TLayers extends LayersDef> = {
  [K in keyof TLayers]: string
}

// ── defineResource ────────────────────────────────────────────────────────────

/**
 * Creates a typed factory function for a hierarchical resource whose name is spread
 * across multiple layers, each using a specific resource type and segment subset.
 *
 * 1. **Specify defaults** — segment values that are the same for every call.
 * 2. **Specify required segments** — TypeScript derives these automatically: any segment
 *    declared in a layer but absent from `defaults` becomes required at call time.
 * 3. **Specify segments per layer** — each layer independently controls which segments
 *    compose its name and which resource type (hence delimiter) formats them.
 * 4. **Call the factory** — pass only the required segments; get back a typed object with
 *    one property per layer.
 *
 * @example
 * const buildStorage = defineResource({
 *   defaults: {
 *     region: 'ap-southeast-2', env: 'prod', org: 'derrops', domain: 'oaspec', service: 'storage',
 *   },
 *   layers: {
 *     bucket: { type: 's3Bucket',     segments: ['region', 'env', 'org', 'domain', 'service'] as const },
 *     prefix: { type: 's3KeyPrefix',  segments: ['tenant', 'partition'] as const },
 *     name:   { type: 's3ObjectName', segments: ['key'] as const },
 *   },
 * })
 *
 * const s3 = buildStorage({ tenant: 't-abc123', partition: '2024/01/15', key: 'log.gz' })
 * s3.bucket  // → 'ap-southeast-2--prod--derrops--oaspec--storage'
 * s3.prefix  // → 't-abc123/2024/01/15/'
 * s3.name    // → 'log.gz'
 */
export function defineResource<
  TLayers extends Record<string, LayerDef<readonly SegmentKey[]>>,
  TDefaults extends Partial<Segments>,
>(config: {
  defaults: TDefaults
  layers: TLayers
}): (input: ResourceInput<TLayers, TDefaults>) => ResourceOutput<TLayers> {
  return function buildResource(input) {
    const allSegments = { ...config.defaults, ...input } as Partial<Record<SegmentKey, string>>

    const result: Record<string, string> = {}

    for (const [layerName, layerDef] of Object.entries(config.layers)) {
      const layerSegments: Partial<Record<SegmentKey, string>> = {}
      for (const segKey of layerDef.segments) {
        const value = allSegments[segKey]
        if (value !== undefined) {
          layerSegments[segKey] = value
        }
      }
      result[layerName] = new DerropsConventions(layerSegments as Segments).name({
        type: layerDef.type,
      })
    }

    return result as ResourceOutput<TLayers>
  }
}
