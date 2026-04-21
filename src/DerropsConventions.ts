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

/**
 * Options passed to `tags()` — segment overrides that merge with the instance defaults.
 * No `type` is required; tags are resource-type-agnostic.
 */
export type TagOptions<C extends SegmentConstraints = {}> = ConstrainedSegments<C>

/** The four conventional AWS resource tag keys produced by `tags()`. */
export type TagKey = 'org' | 'domain' | 'service' | 'environment'

/**
 * Casing applied to tag keys before they are written to the output dict.
 *
 * The base tag keys are kebab-case words (`org`, `domain`, `service`, `environment`).
 * Casing affects multi-word keys and is most visible when combined with `tagPrefix()`.
 *
 * | Casing    | `environment`   | hypothetical `cost-center` |
 * | --------- | --------------- | -------------------------- |
 * | `kebab`   | `environment`   | `cost-center`              |
 * | `camel`   | `environment`   | `costCenter`               |
 * | `snake`   | `environment`   | `cost_center`              |
 * | `pascal`  | `Environment`   | `CostCenter`               |
 */
export type TagKeyCasing = 'kebab' | 'camel' | 'snake' | 'pascal'

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
 * Maps each tag key to the segment it reads from.
 * `org` and `environment` are hidden by default (account-segregated deployments make them
 * redundant); `domain` and `service` are shown by default.
 */
const SEGMENT_FOR_TAG: Record<TagKey, keyof Segments> = {
  org: 'org',
  domain: 'domain',
  service: 'service',
  environment: 'env',
}

const DEFAULT_TAG_KEYS: TagKey[] = ['domain', 'service']
const DEFAULT_TAG_CASING: TagKeyCasing = 'kebab'

// Default limits match AWS tag constraints — https://docs.aws.amazon.com/general/latest/gr/aws_tagging.html
const DEFAULT_TAG_KEY_MAX = 128
const DEFAULT_TAG_VALUE_MAX = 256
const DEFAULT_TAG_COUNT_MAX = 50

function applyTagKeyCasing(key: string, casing: TagKeyCasing): string {
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
  private visibleTags: TagKey[]
  private keyPrefix: string
  private keyCasing: TagKeyCasing
  private tagRules: Array<(segments: Segments) => Record<string, string>>
  private tagAugmentors: Array<(tags: Record<string, string>) => Record<string, string>>
  private tagKeyMax: number
  private tagValueMax: number
  private tagCountMax: number
  private tagPolicies: Array<{ fn: (tags: Record<string, string>) => boolean; message: string }>

  constructor(
    defaults: ConstrainedSegments<C> = {} as ConstrainedSegments<C>,
    defaultType?: ResourceType,
  ) {
    this.defaults = { ...defaults } as Segments
    this.order = [...DEFAULT_SEGMENT_ORDER]
    this.defaultType = defaultType
    this.visibleTags = [...DEFAULT_TAG_KEYS]
    this.keyPrefix = ''
    this.keyCasing = DEFAULT_TAG_CASING
    this.tagRules = []
    this.tagAugmentors = []
    this.tagKeyMax = DEFAULT_TAG_KEY_MAX
    this.tagValueMax = DEFAULT_TAG_VALUE_MAX
    this.tagCountMax = DEFAULT_TAG_COUNT_MAX
    this.tagPolicies = []
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
   * Set which tag keys are included in `tags()` output.
   *
   * By default only `domain` and `service` are shown — `org` and `environment` are hidden
   * because account-segregated deployments already provide that context.
   *
   * Chainable — returns `this`.
   *
   * @example
   * naming.tagKeys('org', 'domain', 'service', 'environment')
   * naming.tags() // → { org: 'acme', domain: 'payments', service: 'checkout-api', environment: 'prod' }
   */
  tagKeys(...keys: TagKey[]): this {
    this.visibleTags = keys
    return this
  }

  /**
   * Set a string prepended to every tag key in `tags()` output. The prefix is appended
   * as-is — include the separator you want (e.g. `'slaops:'`, `'my-app/'`, `'MyApp_'`).
   *
   * Applied after `tagKeyCasing()`, so the cased key is what gets prefixed.
   *
   * Chainable — returns `this`.
   *
   * @example
   * naming.tagPrefix('slaops:').tags()
   * // → { 'slaops:domain': 'payments', 'slaops:service': 'checkout-api' }
   */
  tagPrefix(prefix: string): this {
    this.keyPrefix = prefix
    return this
  }

  /**
   * Set the casing applied to tag keys before they are written to the output dict.
   * Defaults to `'kebab'` (no transformation).
   *
   * Casing is applied before `tagPrefix()`, so the cased key is what gets prefixed.
   *
   * Chainable — returns `this`.
   *
   * @example
   * naming.tagKeyCasing('camel').tags()
   * // → { domain: 'payments', service: 'checkout-api' }  // single-word keys unchanged
   *
   * naming.tagKeyCasing('pascal').tagPrefix('MyApp_').tags()
   * // → { 'MyApp_Domain': 'payments', 'MyApp_Service': 'checkout-api' }
   */
  tagKeyCasing(casing: TagKeyCasing): this {
    this.keyCasing = casing
    return this
  }

  /**
   * Register a custom tag rule — a function that receives the resolved segment values and returns
   * additional key-value pairs merged into the `tags()` output.
   *
   * Rules run after the built-in segment tags and in registration order. When multiple rules return
   * the same key the later rule wins. Tag rule output is written as-is — `tagPrefix()` and
   * `tagKeyCasing()` do NOT apply to rule-generated keys; the caller controls the exact key.
   *
   * Chainable — returns `this`.
   *
   * @example
   * naming.tagRule(segments => ({
   *   sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
   * }))
   * naming.tags() // → { domain: 'auth', service: 'token-service', sensitive: 'true' }
   */
  tagRule(fn: (segments: Segments) => Record<string, string>): this {
    this.tagRules.push(fn)
    return this
  }

  /**
   * Register a tag augmentor — a function called after all `tagRule()` results are merged and
   * before limit validation and policies. Receives a **snapshot** of the current accumulated tags
   * and returns additional key-value pairs to merge in.
   *
   * Use this for tags that are computed from the already-resolved tag set, or for fully dynamic
   * values that don't come from segments (e.g. timestamps, UUIDs).
   *
   * Augmentors run in registration order; each receives the output of the previous one. Like
   * `tagRule()`, augmentor output bypasses `tagPrefix()` and `tagKeyCasing()` — the caller
   * controls the exact key.
   *
   * Chainable — returns `this`.
   *
   * @example
   * // Add a timestamp tag every time tags() is called
   * naming.tagAugment(() => ({ 'updated-at': new Date().toISOString() }))
   *
   * // Derive a composite tag from already-resolved tags
   * naming.tagAugment(tags => ({ 'resource-id': `${tags['domain']}/${tags['service']}` }))
   */
  tagAugment(fn: (tags: Record<string, string>) => Record<string, string>): this {
    this.tagAugmentors.push(fn)
    return this
  }

  /**
   * Set the maximum byte length allowed for a single tag key (after prefix and casing are applied).
   * Defaults to 128, matching the AWS limit.
   *
   * `tags()` throws if any key in the output exceeds this limit.
   *
   * Chainable — returns `this`.
   */
  keyMax(max: number): this {
    this.tagKeyMax = max
    return this
  }

  /**
   * Set the maximum byte length allowed for a single tag value.
   * Defaults to 256, matching the AWS limit.
   *
   * `tags()` throws if any value in the output exceeds this limit.
   *
   * Chainable — returns `this`.
   */
  valueMax(max: number): this {
    this.tagValueMax = max
    return this
  }

  /**
   * Set the maximum number of tags that `tags()` may return.
   * Defaults to 50, matching the AWS limit.
   *
   * `tags()` throws if the total number of output tags exceeds this limit.
   *
   * Chainable — returns `this`.
   */
  maxTags(max: number): this {
    this.tagCountMax = max
    return this
  }

  /**
   * Register a tag policy — a predicate evaluated against the final resolved tags when `tags()`
   * is called. If the predicate returns `false`, `tags()` throws with the supplied message.
   *
   * Policies run after limit validation (`keyMax`, `valueMax`, `maxTags`) and receive the
   * complete, already-built tag output so they can assert on real keys and values — including
   * those produced by `tagRule()` functions.
   *
   * Chainable — returns `this`.
   *
   * @example
   * // Require a cost-center tag on every resource
   * naming
   *   .tagRule(segments => ({ 'cost-center': costCenterFor(segments.domain) }))
   *   .policy(tags => 'cost-center' in tags, 'cost-center tag is required')
   *
   * // Require service tag to be present
   * naming.policy(tags => Boolean(tags['service']), 'service tag must not be empty')
   */
  policy(fn: (tags: Record<string, string>) => boolean, message = 'Policy violation'): this {
    this.tagPolicies.push({ fn, message })
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
    derived.visibleTags = [...this.visibleTags]
    derived.keyPrefix = this.keyPrefix
    derived.keyCasing = this.keyCasing
    derived.tagRules = [...this.tagRules]
    derived.tagAugmentors = [...this.tagAugmentors]
    derived.tagKeyMax = this.tagKeyMax
    derived.tagValueMax = this.tagValueMax
    derived.tagCountMax = this.tagCountMax
    derived.tagPolicies = [...this.tagPolicies]
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

  /**
   * Generate the standard AWS resource tags for this resource.
   *
   * Returns a `Record<string, string>` keyed by the conventional tag names from the Derrops
   * tagging strategy. Only tag keys enabled via `tagKeys()` and with a resolved segment value
   * are included. Keys are transformed by `tagKeyCasing()` then prefixed by `tagPrefix()`.
   *
   * Default visible tags: `domain`, `service`.
   * Hidden by default: `org`, `environment` (account-segregated deployments make them redundant).
   *
   * @example
   * conventions.tags()
   * // → { domain: 'payments', service: 'checkout-api' }
   *
   * conventions.tagKeys('org', 'domain', 'service', 'environment').tags()
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api', environment: 'prod' }
   *
   * conventions.tagPrefix('slaops:').tags()
   * // → { 'slaops:domain': 'payments', 'slaops:service': 'checkout-api' }
   *
   * conventions.tagKeyCasing('pascal').tagPrefix('MyApp_').tags()
   * // → { 'MyApp_Domain': 'payments', 'MyApp_Service': 'checkout-api' }
   */
  tags(options: TagOptions<C> = {} as TagOptions<C>): Record<string, string> {
    const merged: Segments = { ...this.defaults, ...(options as Segments) }
    const result: Record<string, string> = {}

    for (const tagKey of this.visibleTags) {
      const value = merged[SEGMENT_FOR_TAG[tagKey]]
      if (value) {
        const finalKey = this.keyPrefix + applyTagKeyCasing(tagKey, this.keyCasing)
        result[finalKey] = value
      }
    }

    for (const rule of this.tagRules) {
      Object.assign(result, rule(merged))
    }

    for (const augment of this.tagAugmentors) {
      Object.assign(result, augment({ ...result }))
    }

    const entries = Object.entries(result)

    if (entries.length > this.tagCountMax) {
      throw new Error(`tags() produced ${entries.length} tags but maxTags is ${this.tagCountMax}`)
    }

    for (const [k, v] of entries) {
      if (k.length > this.tagKeyMax) {
        throw new Error(`Tag key "${k}" is ${k.length} characters but keyMax is ${this.tagKeyMax}`)
      }
      if (v.length > this.tagValueMax) {
        throw new Error(
          `Tag value for key "${k}" is ${v.length} characters but valueMax is ${this.tagValueMax}`,
        )
      }
    }

    for (const { fn, message } of this.tagPolicies) {
      if (!fn(result)) {
        throw new Error(message)
      }
    }

    return result
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
