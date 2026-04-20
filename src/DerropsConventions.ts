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
 * Options passed to `name()`.
 *
 * - Segment fields are narrowed to their allowed literal unions when the instance has been
 *   configured via `.constrain()` / segment helpers.
 * - `type` is required when no default type has been set on the instance via `.with({ type })`,
 *   and optional (overridable) when one has.
 */
export type NameOptions<
  C extends SegmentConstraints = {},
  TType extends ResourceType | undefined = undefined,
> = ConstrainedSegments<C> &
  (TType extends ResourceType ? { type?: ResourceType } : { type: ResourceType })

const DEFAULT_SEGMENT_ORDER: SegmentKey[] = [
  'region',
  'env',
  'org',
  'tenant',
  'domain',
  'service',
  'partition',
  'key',
]

const GLOBAL_ONLY_SEGMENTS: SegmentKey[] = ['region', 'env']

/**
 * `C` — phantom type encoding which segment values have been narrowed to literal unions.
 * `TType` — phantom type encoding the default resource type (set via `.with({ type })`).
 *           When set, `type` is optional in `name()` and falls back to this value.
 *
 * @example
 * const naming = new DerropsConventions({ org: 'acme', env: 'dev' })
 *   .domain(['payments', 'identity'])
 *   .service(['checkout-api', 'auth-service'])
 *
 * // Derive a scoped instance with a default resource type
 * const oaspec = naming.with({ domain: 'oaspec', type: 'openSearchIndex' })
 * oaspec.name({})                          // uses default type
 * oaspec.name({ type: 'lambdaFunction' })  // overrides it
 */
export class DerropsConventions<
  C extends SegmentConstraints = {},
  TType extends ResourceType | undefined = undefined,
> {
  private readonly defaults: Segments
  private order: SegmentKey[]
  private defaultType: ResourceType | undefined

  constructor(
    defaults: ConstrainedSegments<C> = {} as ConstrainedSegments<C>,
    defaultType?: ResourceType,
  ) {
    this.defaults = { ...defaults } as Segments
    this.order = [...DEFAULT_SEGMENT_ORDER]
    this.defaultType = defaultType
  }

  // ── Segment constraint helpers ────────────────────────────────────────────

  /**
   * Narrow the allowed values for one segment key, returning a more-specific instance type.
   * This is a compile-time-only operation — no runtime validation is performed.
   * Calling `.constrain()` again on the same key replaces the previous constraint.
   */
  constrain<K extends SegmentKey, V extends string>(
    key: K,
    ...values: V[]
  ): DerropsConventions<Omit<C, K> & Record<K, V>, TType> {
    void key
    void values
    return this as unknown as DerropsConventions<Omit<C, K> & Record<K, V>, TType>
  }

  /** Constrain allowed `region` values. */
  region<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'region'> & Record<'region', V>, TType> {
    return this.constrain('region', ...values)
  }

  /** Constrain allowed `env` values. */
  env<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'env'> & Record<'env', V>, TType> {
    return this.constrain('env', ...values)
  }

  /** Constrain allowed `org` values. */
  org<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'org'> & Record<'org', V>, TType> {
    return this.constrain('org', ...values)
  }

  /** Constrain allowed `tenant` values. */
  tenant<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'tenant'> & Record<'tenant', V>, TType> {
    return this.constrain('tenant', ...values)
  }

  /** Constrain allowed `domain` values. */
  domain<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'domain'> & Record<'domain', V>, TType> {
    return this.constrain('domain', ...values)
  }

  /** Constrain allowed `service` values. */
  service<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'service'> & Record<'service', V>, TType> {
    return this.constrain('service', ...values)
  }

  /** Constrain allowed `partition` values. */
  partition<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'partition'> & Record<'partition', V>, TType> {
    return this.constrain('partition', ...values)
  }

  /** Constrain allowed `key` values. */
  key<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'key'> & Record<'key', V>, TType> {
    return this.constrain('key', ...values)
  }

  // ── Instance derivation ───────────────────────────────────────────────────

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
   * Return a new instance with additional defaults merged in.
   * Passing `type` stores it as the default resource type for `name()` calls on the derived instance.
   *
   * @example
   * const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
   * oaspec.name({})                         // type defaults to 'openSearchIndex'
   * oaspec.name({ type: 'lambdaFunction' }) // override for a single call
   */
  with<T extends ResourceType | undefined = undefined>(
    overrides: ConstrainedSegments<C> & { type?: T },
  ): DerropsConventions<C, T extends ResourceType ? T : TType> {
    const { type, ...segmentOverrides } = overrides as ConstrainedSegments<C> & {
      type?: ResourceType
    }
    const derived = new DerropsConventions<C>(
      { ...this.defaults, ...segmentOverrides } as ConstrainedSegments<C>,
      (type ?? this.defaultType) as ResourceType | undefined,
    )
    derived.order = [...this.order]
    return derived as unknown as DerropsConventions<C, T extends ResourceType ? T : TType>
  }

  // ── Name generation ───────────────────────────────────────────────────────

  /**
   * Generate a resource name.
   *
   * `type` is required unless a default type was set via `.with({ type })`.
   *
   * @example
   * conventions.name({ type: 's3Bucket', domain: 'payments', key: 'data' })
   * // → 'ap-southeast-2--dev--acme--payments--data'
   */
  name(options: NameOptions<C, TType>): string {
    const resolvedType = (options as { type?: ResourceType }).type ?? this.defaultType
    if (!resolvedType) {
      throw new Error(
        'name() requires a "type" — either pass it directly or set a default via .with({ type })',
      )
    }
    const config: ResourceTypeConfig = RESOURCE_TYPES[resolvedType]
    const { type: _type, ...overrides } = options as { type?: ResourceType } & Segments
    const segments = this.buildSegments({ ...this.defaults, ...overrides }, config)
    const joined = segments.join(config.segmentDelimiter)
    return config.leadingDelimiter ? `${config.segmentDelimiter}${joined}` : joined
  }

  // ── Static utilities ──────────────────────────────────────────────────────

  /** List all registered resource type keys. */
  static resourceTypes(): string[] {
    return Object.keys(RESOURCE_TYPES).sort()
  }

  /** Register a custom resource type, or override an existing one. */
  static registerResourceType(name: string, config: ResourceTypeConfig): void {
    ;(RESOURCE_TYPES as Record<string, ResourceTypeConfig>)[name] = config
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private buildSegments(merged: Segments, config: ResourceTypeConfig): string[] {
    const activeOrder = config.segments ?? this.effectiveOrder(config)

    return activeOrder
      .map((key) => merged[key])
      .filter((v): v is string => v !== undefined && v.length > 0)
      .map((v) => this.normalize(v, config.wordDelimiter))
  }

  private effectiveOrder(config: ResourceTypeConfig): SegmentKey[] {
    if (config.global) return this.order
    return this.order.filter((s) => !GLOBAL_ONLY_SEGMENTS.includes(s))
  }

  private normalize(value: string, wordDelimiter: string): string {
    return value.toLowerCase().replace(/\s+/g, wordDelimiter)
  }
}
