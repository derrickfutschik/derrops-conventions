import type {
  SegmentKey,
  Segments,
  ResourceTypeConfig,
  SegmentConstraints,
  ConstrainedSegments,
} from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import type { ResourceType } from './resource-types.js'

/**
 * Options passed to `name()`. Segment fields are narrowed to their allowed literal unions
 * when the instance has been configured via `.constrain()`.
 */
export type NameOptions<C extends SegmentConstraints = {}> = ConstrainedSegments<C> & {
  type: ResourceType
}

const DEFAULT_SEGMENT_ORDER: SegmentKey[] = [
  'region', 'env', 'org', 'tenant', 'domain', 'service', 'partition', 'key',
]

const GLOBAL_ONLY_SEGMENTS: SegmentKey[] = ['region', 'env']

/**
 * `C` is a phantom type parameter that encodes which segment values have been constrained
 * to literal unions via `.constrain()`. It has no runtime representation — it only affects
 * what TypeScript will accept in calls to `name()` and `with()`.
 *
 * @example
 * const c = new DerropsConventions({ org: 'acme', env: 'dev' })
 *   .constrain('domain', 'payments', 'identity', 'platform')
 *   .constrain('service', 'checkout-api', 'auth-service')
 *
 * c.name({ type: 'lambdaFunction', domain: 'payments' })     // ✅
 * c.name({ type: 'lambdaFunction', domain: 'invalid' })      // ❌ compile error
 */
export class DerropsConventions<C extends SegmentConstraints = {}> {
  private readonly defaults: Segments
  private order: SegmentKey[]

  constructor(defaults: ConstrainedSegments<C> = {} as ConstrainedSegments<C>) {
    this.defaults = { ...defaults } as Segments
    this.order = [...DEFAULT_SEGMENT_ORDER]
  }

  /**
   * Narrow the allowed values for one segment key, returning a more-specific instance type.
   * This is a compile-time-only operation — no runtime validation is performed.
   *
   * Calling `.constrain()` again on the same key replaces the previous constraint.
   *
   * @example
   * const c = new DerropsConventions({ org: 'acme' })
   *   .constrain('domain', 'payments', 'identity', 'platform')
   */
  constrain<K extends SegmentKey, V extends string>(
    key: K,
    ...values: V[]
  ): DerropsConventions<Omit<C, K> & Record<K, V>> {
    void key
    void values
    return this as unknown as DerropsConventions<Omit<C, K> & Record<K, V>>
  }

  // ── Per-segment constraint helpers ────────────────────────────────────────

  /** Constrain allowed `region` values. */
  region<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'region'> & Record<'region', V>> {
    return this.constrain('region', ...values)
  }

  /** Constrain allowed `env` values. */
  env<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'env'> & Record<'env', V>> {
    return this.constrain('env', ...values)
  }

  /** Constrain allowed `org` values. */
  org<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'org'> & Record<'org', V>> {
    return this.constrain('org', ...values)
  }

  /** Constrain allowed `tenant` values. */
  tenant<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'tenant'> & Record<'tenant', V>> {
    return this.constrain('tenant', ...values)
  }

  /** Constrain allowed `domain` values. */
  domain<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'domain'> & Record<'domain', V>> {
    return this.constrain('domain', ...values)
  }

  /** Constrain allowed `service` values. */
  service<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'service'> & Record<'service', V>> {
    return this.constrain('service', ...values)
  }

  /** Constrain allowed `partition` values. */
  partition<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'partition'> & Record<'partition', V>> {
    return this.constrain('partition', ...values)
  }

  /** Constrain allowed `key` values. */
  key<V extends string>(values: readonly V[]): DerropsConventions<Omit<C, 'key'> & Record<'key', V>> {
    return this.constrain('key', ...values)
  }

  /**
   * Override the default segment order. Provide all segments you want considered, in the
   * desired order. Any segment not listed is omitted from names (unless the resource type
   * defines its own explicit `segments` list).
   *
   * Chainable — returns `this`.
   */
  segmentOrder(...segments: SegmentKey[]): this {
    this.order = segments
    return this
  }

  /**
   * Return a new `DerropsConventions` instance with additional default overrides merged in.
   * Useful for creating per-tenant or per-domain derived instances.
   */
  with(overrides: ConstrainedSegments<C>): DerropsConventions<C> {
    const derived = new DerropsConventions<C>(
      { ...this.defaults, ...overrides } as ConstrainedSegments<C>,
    )
    derived.order = [...this.order]
    return derived
  }

  /**
   * Generate a resource name.
   *
   * @param options - Segment values merged with instance defaults, plus a required `type`.
   * @returns The formatted resource name string.
   *
   * @example
   * conventions.name({ type: 's3Bucket', domain: 'payments', service: 'checkout-api', key: 'data' })
   * // → 'ap-southeast-2--dev--acme--payments--checkout-api--data'
   */
  name(options: NameOptions<C>): string {
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
    return value.toLowerCase().replace(/\s+/g, wordDelimiter)
  }
}
