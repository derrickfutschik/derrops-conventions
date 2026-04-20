import type { SegmentKey, Segments, ResourceTypeConfig } from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import type { ResourceType } from './resource-types.js'

export type NameOptions = Segments & { type: ResourceType }

const DEFAULT_SEGMENT_ORDER: SegmentKey[] = [
  'region', 'env', 'org', 'tenant', 'domain', 'service', 'partition', 'key',
]

const GLOBAL_ONLY_SEGMENTS: SegmentKey[] = ['region', 'env']

export class DerropsConventions {
  private readonly defaults: Segments
  private order: SegmentKey[]

  constructor(defaults: Segments = {}) {
    this.defaults = { ...defaults }
    this.order = [...DEFAULT_SEGMENT_ORDER]
  }

  /**
   * Override the default segment order. Provide all segments you want considered,
   * in the desired order. Any segment not listed will be omitted from names unless
   * the resource type defines its own explicit `segments` list.
   *
   * Chainable — returns `this`.
   */
  segmentOrder(...segments: SegmentKey[]): this {
    this.order = segments
    return this
  }

  /**
   * Return a new DerropsConventions instance with additional default overrides merged in.
   * Useful for creating per-tenant or per-domain derived instances.
   */
  with(overrides: Segments): DerropsConventions {
    const derived = new DerropsConventions({ ...this.defaults, ...overrides })
    derived.order = [...this.order]
    return derived
  }

  /**
   * Generate a resource name.
   *
   * @param options - Segment overrides merged with instance defaults, plus a required `type`.
   * @returns The formatted resource name string.
   * @throws If `type` is not a recognised resource type.
   *
   * @example
   * conventions.name({ type: 's3Bucket', domain: 'sales', service: 'email', key: 'mail list' })
   * // → 'ap-southeast-2--dev--acme--sales--email--mail-list'
   */
  name(options: NameOptions): string {
    const { type, ...overrides } = options
    const config: ResourceTypeConfig = RESOURCE_TYPES[type]

    const segments = this.buildSegments({ ...this.defaults, ...overrides } as Segments, config)
    const joined = segments.join(config.segmentDelimiter)
    return config.leadingDelimiter ? `${config.segmentDelimiter}${joined}` : joined
  }

  /** List all registered resource type keys. */
  static resourceTypes(): string[] {
    return Object.keys(RESOURCE_TYPES).sort()
  }

  /** Register a custom resource type, or override an existing one. */
  static registerResourceType(name: string, config: ResourceTypeConfig): void {
    ;(RESOURCE_TYPES as Record<string, ResourceTypeConfig>)[name] = config
  }

  private buildSegments(merged: Segments, config: ResourceTypeConfig): string[] {
    const activeOrder = config.segments ?? this.effectiveOrder(config)

    return activeOrder
      .map(key => merged[key])
      .filter((v): v is string => v !== undefined && v.length > 0)
      .map(v => this.normalize(v, config.wordDelimiter))
  }

  private effectiveOrder(config: ResourceTypeConfig): SegmentKey[] {
    if (config.global) return this.order
    return this.order.filter(s => !GLOBAL_ONLY_SEGMENTS.includes(s))
  }

  private normalize(value: string, wordDelimiter: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, wordDelimiter)
  }
}
