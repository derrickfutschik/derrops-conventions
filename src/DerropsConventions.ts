import type {
  SegmentKey,
  Segments,
  ResourceTypeConfig,
  SegmentConstraints,
  ConstrainedSegments,
  ParsedSegments,
  ParsedS3Uri,
  S3ResourceLayers,
  S3Resource,
  CostExplorerFilter,
  ValidationResult,
  LintReport,
  TenantManifest,
  TenantResource,
} from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import type { ResourceType } from './resource-types.js'
import { StaticPolicyBuilder } from './policy/StaticPolicyBuilder.js'
import { DynamicPolicySession } from './policy/DynamicPolicySession.js'
import { PolicyBuilder } from './policy/PolicyBuilder.js'
import type { Resource, SqsPair } from './policy/Resource.js'
import type { ArnContext } from './policy/types.js'
import { buildNetworkTopology, buildCapacityReport } from './topology.js'
import type { OrgNetworkTopology } from './topology.js'
import type { TopologyOptions, TopologyCapacityReport } from './topology-types.js'
import { renderMermaid } from './mermaid.js'
import type { MermaidOptions } from './mermaid.js'
import type {
  NameOptions,
  TagOptions,
  TagKey,
  TagKeyCasing,
  DatePartitionGranularity,
  DimensionKey,
  ConventionSpec,
  MaybeConstrain,
  IsLiteralString,
  CfgKeyBase,
} from './conventions-types.js'
import {
  DEFAULT_SEGMENT_ORDER,
  TAG_FOR_SEGMENT,
  ALL_TAG_KEYS,
  DEFAULT_TAG_KEYS,
  DEFAULT_TAG_CASING,
  DEFAULT_DIMENSION_KEYS,
  DEFAULT_TAG_KEY_MAX,
  DEFAULT_TAG_VALUE_MAX,
  DEFAULT_TAG_COUNT_MAX,
} from './conventions-constants.js'
import { parseResourceName, parseDatePartition, parseRegionCode } from './parsing.js'
import type { ConventionsContext } from './conventions-context.js'
import { buildS3Prefix, buildS3Resource } from './s3.js'
import { buildDimensions, buildCloudwatchResource } from './cloudwatch.js'
import { buildCostFilter, buildBudgetName, buildCostAllocationTags } from './cost.js'
import {
  buildEksResource,
  buildCloudMapResource,
  buildSqsPair,
  buildCfnExport,
} from './service-bundles.js'
import { buildImageTag, buildEcrUri } from './ecr.js'
import { buildEventSource, buildDetailType } from './eventbridge.js'
import { buildTenantManifest } from './tenant.js'
import { buildValidate, buildLint } from './validation.js'
import { buildDependencies, buildPolicyFor } from './dependencies.js'
import {
  resolveApex as resolveApexFn,
  effectiveOrder as effectiveOrderFn,
  mergeExtraSegments,
  buildSegments as buildSegmentsFn,
  resolveArnContext as resolveArnContextFn,
} from './helpers.js'
import { buildTags } from './tagging.js'
import type { TagBuildState } from './tagging.js'
import {
  buildOrgNetworkLayer,
  buildDomainNetworkLayer,
  buildServiceNetworkLayer,
} from './network-layers.js'
import { buildStaticPolicy, buildDynamicPolicy, buildResource } from './iam.js'
import { buildCfgKey, buildCfgProp } from './config-keys.js'
import { parseS3KeyFromDefaults, parseS3UriFromDefaults, parseS3UriStatic } from './s3.js'

// Re-export types that were previously declared here so direct importers of this file
// continue to work without modification.
export type {
  NameOptions,
  TagOptions,
  TagKey,
  TagKeyCasing,
  DatePartitionGranularity,
  DimensionKey,
  ConventionSpec,
  MaybeConstrain,
  IsLiteralString,
  CfgKeyBase,
} from './conventions-types.js'

/**
 * `C` — phantom type encoding which segment values have been narrowed to literal unions.
 * `TType` — phantom type encoding the default resource type (set via `.with({ type })`).
 *           When set, `type` is optional in `name()` and falls back to this value.
 * `TDomain` — phantom type encoding the currently-set domain default as a literal.
 *             `string` means "no literal domain set on this instance".
 * `TService` — phantom type encoding the currently-set service default as a literal.
 *              `string` means "no literal service set on this instance".
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
  TDomain extends string = string,
  TService extends string = string,
> {
  private readonly defaults: Segments
  private order: Array<SegmentKey | string>
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
  private storedArnContext: { accountId: string; partition?: string } | undefined
  private apexMapFn: ((segments: Segments) => string) | undefined
  private apexZoneMap: Record<string, string> | undefined
  private visibleDimensions: DimensionKey[]
  private storedConstraints: Partial<Record<SegmentKey, readonly string[]>>
  private _emitSegmentValues: boolean
  private extraSegments: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _dependencies: Array<{
    owner: DerropsConventions<any, any, any, any>
    resources: ResourceType[]
  }>
  /**
   * Derivatives created via `.with()`. Mutated only by `.with()` for the sole purpose of
   * letting `toMermaid()` walk the hierarchy. Never read by naming, tag, or policy logic.
   * Not propagated through `.with()` — each instance owns its own children list.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _children: DerropsConventions<any, any, any, any>[] = []

  constructor(
    defaults: ConstrainedSegments<C> = {} as ConstrainedSegments<C>,
    defaultType?: ResourceType,
  ) {
    this.defaults = { ...defaults } as Segments
    this.order = [...DEFAULT_SEGMENT_ORDER]
    this.defaultType = defaultType
    const tagKeySet = new Set<TagKey>(DEFAULT_TAG_KEYS)
    for (const seg of Object.keys(defaults) as (keyof Segments)[]) {
      const tagKey = TAG_FOR_SEGMENT[seg]
      if (tagKey !== undefined) tagKeySet.add(tagKey)
    }
    this.visibleTags = ALL_TAG_KEYS.filter((k) => tagKeySet.has(k))
    this.keyPrefix = ''
    this.keyCasing = DEFAULT_TAG_CASING
    this.tagRules = []
    this.tagAugmentors = []
    this.tagKeyMax = DEFAULT_TAG_KEY_MAX
    this.tagValueMax = DEFAULT_TAG_VALUE_MAX
    this.tagCountMax = DEFAULT_TAG_COUNT_MAX
    this.tagPolicies = []
    this.storedArnContext = undefined
    this.apexMapFn = undefined
    this.apexZoneMap = undefined
    this.visibleDimensions = [...DEFAULT_DIMENSION_KEYS]
    this.storedConstraints = {}
    this._emitSegmentValues = false
    this.extraSegments = {}
    this._dependencies = []
    this._children = []
  }

  // ── Segment constraint helpers ────────────────────────────────────────────

  /**
   * Narrow the allowed values for one segment key, returning a more-specific instance type.
   * Calling `.constrain()` again on the same key replaces the previous constraint.
   *
   * Also stores the values at runtime so they are accessible via `constraints()` and
   * used by `topology()` to determine domain ordering for CIDR allocation. All
   * segment-specific helpers (`.domain()`, `.service()`, etc.) delegate to this method,
   * so they also store values automatically.
   */
  constrain<K extends SegmentKey, V extends string>(
    key: K,
    ...values: V[]
  ): DerropsConventions<Omit<C, K> & Record<K, V>, TType, TDomain, TService> {
    this.storedConstraints = { ...this.storedConstraints, [key]: values }
    return this as unknown as DerropsConventions<
      Omit<C, K> & Record<K, V>,
      TType,
      TDomain,
      TService
    >
  }

  /** Constrain allowed `region` values. */
  region<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'region'> & Record<'region', V>, TType, TDomain, TService> {
    return this.constrain('region', ...values)
  }

  /** Constrain allowed `env` values. */
  env<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'env'> & Record<'env', V>, TType, TDomain, TService> {
    return this.constrain('env', ...values)
  }

  /** Constrain allowed `org` values. */
  org<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'org'> & Record<'org', V>, TType, TDomain, TService> {
    return this.constrain('org', ...values)
  }

  /**
   * Constrain allowed `apex` values — the registered DNS domain for the org, e.g. `'acme.com'`.
   * Used by DNS resource types (Route53, ACM certificates, CloudFront aliases) as the root zone.
   * Pair with `.apexMapping()` to derive the effective zone per environment. Not emitted as a tag by default.
   */
  apex<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'apex'> & Record<'apex', V>, TType, TDomain, TService> {
    return this.constrain('apex', ...values)
  }

  /**
   * Register a function that derives the effective DNS zone from the resolved segments.
   * Called at `name()` time whenever `apex` appears in a resource type's segment list.
   * The return value replaces the raw `apex` segment value for that call only.
   *
   * Use this to handle environment-specific zone patterns — e.g. prepend the env for
   * non-prod but omit it for prod, or use a custom subdomain scheme:
   *
   * @example
   * // prod → 'acme.com', others → 'dev.acme.com' / 'staging.acme.com'
   * conventions.apexMapping(s => s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`)
   *
   * // custom subdomain per env: prod → 'app.acme.com', others → 'app-dev.acme.com'
   * conventions.apexMapping(s => s.env === 'prod' ? `app.${s.apex}` : `app-${s.env}.${s.apex}`)
   *
   * Chainable — returns `this`.
   */
  apexMapping(fn: (segments: Segments) => string): this {
    this.apexMapFn = fn
    return this
  }

  /**
   * Define which DNS zones belong to which regions using a domain-keyed lookup table.
   *
   * Pass an object mapping each purchased domain (or base zone) to the list of AWS regions
   * that use it. At naming time the instance's `region` segment is looked up and the
   * corresponding domain becomes the effective `apex` for that call.
   *
   * If no entry matches the current region the raw `apex` value is used as fallback.
   *
   * Composes with `.apexMapping()`: zone resolution happens first, then the mapping function
   * receives the resolved base domain as `s.apex` and can apply env qualification on top.
   *
   * **Mode A — one purchased domain per locale:**
   * @example
   * conventions
   *   .apexZones({
   *     'acme.com':    ['us-east-1', 'us-west-2', 'eu-west-1'],
   *     'acme.com.au': ['ap-southeast-2'],
   *   })
   *   .apexMapping(s => s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`)
   * // us-east-1  prod → 'acme.com'       dev → 'dev.acme.com'
   * // ap-se-2    prod → 'acme.com.au'    dev → 'dev.acme.com.au'
   *
   * **Mode B — single domain, region as subdomain:**
   * @example
   * conventions
   *   .apexZones({
   *     'acme.com':    ['us-east-1', 'us-west-2', 'eu-west-1'],
   *     'au.acme.com': ['ap-southeast-2'],
   *   })
   *   .apexMapping(s => s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`)
   * // us-east-1  prod → 'acme.com'       dev → 'dev.acme.com'
   * // ap-se-2    prod → 'au.acme.com'    dev → 'dev.au.acme.com'
   *
   * Chainable — returns `this`.
   */
  apexZones(zones: Record<string, string[]>): this {
    const regionToZone: Record<string, string> = {}
    for (const [domain, regions] of Object.entries(zones)) {
      for (const region of regions) {
        regionToZone[region] = domain
      }
    }
    this.apexZoneMap = regionToZone
    return this
  }

  /** Constrain allowed `tenant` values. */
  tenant<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'tenant'> & Record<'tenant', V>, TType, TDomain, TService> {
    return this.constrain('tenant', ...values)
  }

  /** Constrain allowed `domain` values. */
  domain<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'domain'> & Record<'domain', V>, TType, TDomain, TService> {
    return this.constrain('domain', ...values)
  }

  /** Constrain allowed `service` values. */
  service<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'service'> & Record<'service', V>, TType, TDomain, TService> {
    return this.constrain('service', ...values)
  }

  /** Constrain allowed `partition` values. */
  partition<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'partition'> & Record<'partition', V>, TType, TDomain, TService> {
    return this.constrain('partition', ...values)
  }

  /** Constrain allowed `key` values. */
  key<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'key'> & Record<'key', V>, TType, TDomain, TService> {
    return this.constrain('key', ...values)
  }

  /** Constrain allowed `purpose` values — functional role of a resource, e.g. `'web'`, `'worker'`, `'db'`. */
  purpose<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'purpose'> & Record<'purpose', V>, TType, TDomain, TService> {
    return this.constrain('purpose', ...values)
  }

  /** Constrain allowed `kind` values — sub-classification within a type, e.g. `'private'`/`'public'` for subnets. */
  kind<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'kind'> & Record<'kind', V>, TType, TDomain, TService> {
    return this.constrain('kind', ...values)
  }

  /** Constrain allowed `az` values — availability zone suffix, e.g. `'1a'`, `'1b'`, `'1c'`. */
  az<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'az'> & Record<'az', V>, TType, TDomain, TService> {
    return this.constrain('az', ...values)
  }

  /** Constrain allowed `num` values — ordinal instance number, e.g. `'01'`, `'02'`, `'03'`. */
  num<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'num'> & Record<'num', V>, TType, TDomain, TService> {
    return this.constrain('num', ...values)
  }

  /** Constrain allowed `consumer` values — consuming service or principal, e.g. `'partner-a'`. */
  consumer<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'consumer'> & Record<'consumer', V>, TType, TDomain, TService> {
    return this.constrain('consumer', ...values)
  }

  /** Constrain allowed `target` values — target resource or data source, e.g. `'user-table'`. */
  target<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'target'> & Record<'target', V>, TType, TDomain, TService> {
    return this.constrain('target', ...values)
  }

  /** Constrain allowed `version` values — version identifier for image tags, e.g. `'1.2.3'`, `'latest'`. */
  version<V extends string>(
    values: readonly V[],
  ): DerropsConventions<Omit<C, 'version'> & Record<'version', V>, TType, TDomain, TService> {
    return this.constrain('version', ...values)
  }

  // ── Instance derivation ───────────────────────────────────────────────────

  /**
   * Override the default segment order. Provide all segments you want considered, in the
   * desired order. Any segment not listed is omitted from names (unless the resource type
   * defines its own explicit `segments` list).
   *
   * Chainable — returns `this`.
   */
  segmentOrder(...segments: Array<SegmentKey | string>): this {
    this.order = segments
    return this
  }

  /**
   * Move a segment to immediately before another segment in the current naming order.
   *
   * Use via `.with({})` to create a scoped override without mutating the shared parent
   * instance. Primary use case: exception resource types (e.g. S3 buckets) that require
   * `tenant` before `domain` for global-namespace uniqueness when the default convention
   * uses ABAC positioning (tenant after service).
   *
   * Chainable — returns `this`.
   *
   * @example
   * // ABAC convention: tenant second-last
   * const svc = org.with({ domain: 'payments', service: 'checkout', tenant: 't-a3f8b2' })
   *
   * // S3 exception: tenant before domain for global uniqueness
   * svc.with({}).moveSegment('tenant', 'domain').name({ type: 's3Bucket', key: 'data' })
   * // → 'ap-southeast-2--prod--acme--t-a3f8b2--payments--checkout--data'
   */
  moveSegment(segment: SegmentKey | string, before: SegmentKey | string): this {
    const order = this.order.filter((s) => s !== segment)
    const idx = order.indexOf(before)
    if (idx === -1)
      throw new Error(`moveSegment: segment "${before}" not found in current segment order`)
    order.splice(idx, 0, segment)
    this.order = order
    return this
  }

  /**
   * Register a custom segment key-value pair and insert it into the naming order.
   *
   * Custom segments extend naming beyond the standard `Segments` interface. They participate
   * in `name()` and `s3Prefix()` but are NOT emitted by `tags()` — they are infrastructure
   * identifiers, not ownership labels.
   *
   * `position` controls placement:
   * - Omitted or `'last'` — appended after all current segments.
   * - `'first'` — prepended before all current segments.
   * - `{ before: anchor }` — inserted immediately before the named segment.
   * - `{ after: anchor }` — inserted immediately after the named segment.
   *
   * Calling `insertSegment` twice with the same key updates the value and repositions it.
   * Propagates through `.with()` and `.for()`.
   *
   * Chainable — returns `this`.
   *
   * @example
   * // Cross-account S3 sync: prepend source account ID before org
   * svcConvention
   *   .insertSegment('accountId', sourceAccountId, { before: 'org' })
   *   .s3Prefix({ date: new Date(), granularity: 'hour' })
   * // → '123456789012/acme/payments/checkout-api/2024/01/15/14/'
   *
   * // Append a custom suffix segment
   * convention
   *   .insertSegment('region-code', 'apse2', { after: 'service' })
   *   .name({ type: 'lambdaFunction', key: 'handler' })
   * // → 'acme--payments--checkout-api--apse2--handler'
   */
  insertSegment(
    key: string,
    value: string,
    position?: 'first' | 'last' | { before: SegmentKey | string } | { after: SegmentKey | string },
  ): this {
    this.extraSegments[key] = value
    this.order = this.order.filter((s) => s !== key)

    if (!position || position === 'last') {
      this.order.push(key)
    } else if (position === 'first') {
      this.order.unshift(key)
    } else if ('before' in position) {
      const idx = this.order.indexOf(position.before)
      if (idx === -1)
        throw new Error(
          `insertSegment: anchor segment "${position.before}" not found in current order`,
        )
      this.order.splice(idx, 0, key)
    } else {
      const idx = this.order.indexOf(position.after)
      if (idx === -1)
        throw new Error(
          `insertSegment: anchor segment "${position.after}" not found in current order`,
        )
      this.order.splice(idx + 1, 0, key)
    }

    return this
  }

  /**
   * Register a custom segment key-value pair and insert it at an absolute position in
   * the naming order. Useful when the target index is known (e.g. `0` for always-first)
   * without needing to name an anchor segment.
   *
   * `index` is optional — omit it to append at the end. When provided, it is clamped to
   * `[0, order.length]`. Calling with the same key twice updates the value and repositions it.
   * Propagates through `.with()` and `.for()`.
   *
   * Chainable — returns `this`.
   *
   * @example
   * // Cross-account S3 sync: account ID always first
   * svcConvention
   *   .insertSegmentAt('accountId', sourceAccountId, 0)
   *   .s3Prefix({ date: new Date(), granularity: 'hour' })
   * // → '123456789012/acme/payments/checkout-api/2024/01/15/14/'
   */
  insertSegmentAt(key: string, value: string, index?: number): this {
    this.extraSegments[key] = value
    this.order = this.order.filter((s) => s !== key)
    if (index === undefined) {
      this.order.push(key)
    } else {
      this.order.splice(Math.max(0, Math.min(index, this.order.length)), 0, key)
    }
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
  with<
    T extends ResourceType | undefined = undefined,
    D extends string = string,
    S extends string = string,
  >(
    overrides: ConstrainedSegments<C> & { type?: T; domain?: D; service?: S },
  ): DerropsConventions<
    C,
    T extends ResourceType ? T : TType,
    IsLiteralString<D> extends true ? D : TDomain,
    IsLiteralString<S> extends true ? S : TService
  > {
    const { type, ...segmentOverrides } = overrides as ConstrainedSegments<C> & {
      type?: ResourceType
    }
    const derived = new DerropsConventions<C>(
      { ...this.defaults, ...segmentOverrides } as ConstrainedSegments<C>,
      (type ?? this.defaultType) as ResourceType | undefined,
    )
    this._cloneState(derived)
    // Register the derivative on this instance so toMermaid() can walk the hierarchy.
    // _children is intentionally NOT copied from `this` — each instance owns its own list.
    this._children.push(derived)
    return derived as unknown as DerropsConventions<
      C,
      T extends ResourceType ? T : TType,
      IsLiteralString<D> extends true ? D : TDomain,
      IsLiteralString<S> extends true ? S : TService
    >
  }

  /**
   * Return a new instance with any combination of segment values overridden.
   *
   * Unlike `.with()`, this method accepts any `Partial<Segments>` without TypeScript
   * constraint narrowing — useful when you want to project the convention to a different
   * context at runtime without needing a per-segment helper method.
   *
   * The returned instance does **not** register as a child in `_children` (it is a
   * projection, not a domain/service hierarchy node).
   *
   * @example
   * // Project to production to read the prod bucket name from a dev convention
   * const devConv = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest', env: 'dev' })
   * devConv.for({ env: 'prod' }).name({ type: 's3Bucket' })
   * // → 'ap-southeast-2--prod--acme--logs--ingest'
   *
   * // Override multiple segments at once
   * orgConv.for({ domain: 'payments', service: 'api', env: 'staging' }).name({ type: 'lambdaFunction' })
   */
  for(segments: Partial<Segments>): DerropsConventions<C, TType, string, string> {
    const derived = new DerropsConventions<C>(
      { ...this.defaults, ...segments } as ConstrainedSegments<C>,
      this.defaultType as ResourceType | undefined,
    )
    this._cloneState(derived)
    // Not registered in _children — a projection is not a hierarchy node.
    return derived as unknown as DerropsConventions<C, TType, string, string>
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _cloneState(derived: DerropsConventions<any, any, any, any>): void {
    derived.order = [...this.order]
    derived.extraSegments = { ...this.extraSegments }
    derived.visibleTags = [...this.visibleTags]
    derived.keyPrefix = this.keyPrefix
    derived.keyCasing = this.keyCasing
    derived.tagRules = [...this.tagRules]
    derived.tagAugmentors = [...this.tagAugmentors]
    derived.tagKeyMax = this.tagKeyMax
    derived.tagValueMax = this.tagValueMax
    derived.tagCountMax = this.tagCountMax
    derived.tagPolicies = [...this.tagPolicies]
    derived.storedArnContext = this.storedArnContext
    derived.apexMapFn = this.apexMapFn
    derived.apexZoneMap = this.apexZoneMap
    derived.visibleDimensions = [...this.visibleDimensions]
    derived.storedConstraints = { ...this.storedConstraints }
    derived._emitSegmentValues = this._emitSegmentValues
  }

  // ── Config key generation ─────────────────────────────────────────────────

  /**
   * Generate a typed application config key using the instance's `domain` and `service`
   * defaults as the leading segments, joined with `.`.
   *
   * The return type is a template literal when both `domain` and `service` were set as
   * string literals (via `.with()` or `.constrain()`/`.domain()`/`.service()`). When
   * only `domain` is a literal the key is `domain.key`. When neither is a literal the
   * return type degrades to `string`.
   *
   * Pass an optional `suffix` to append one more dot-separated segment — useful for
   * sub-keys that share the same domain/service prefix.
   *
   * @example
   * const oaspecCache = conventions.with({ domain: 'oaspec', service: 'dynamodb-cache' })
   *
   * oaspecCache.cfgKey('ttl-seconds')
   * // type:  'oaspec.dynamodb-cache.ttl-seconds'
   *
   * oaspecCache.cfgKey('ttl-seconds', 'ms')
   * // type:  'oaspec.dynamodb-cache.ttl-seconds.ms'
   */
  cfgKey<K extends string>(key: K): CfgKeyBase<TDomain, TService, K>
  cfgKey<K extends string, Sfx extends string>(
    key: K,
    suffix: Sfx,
  ): `${CfgKeyBase<TDomain, TService, K>}.${Sfx}`
  cfgKey(key: string, suffix?: string): string {
    return buildCfgKey(this.defaults, key, suffix)
  }

  /**
   * Generate a typed config property object — shorthand for `{ [cfgKey(key)]: value }`.
   *
   * Spread the result directly into a config return object to inline a single typed entry.
   * The return key type matches what `cfgKey()` would produce for the same arguments.
   *
   * @example
   * const oaspecCache = conventions.with({ domain: 'oaspec', service: 'dynamodb-cache' })
   *
   * return {
   *   ...oaspecCache.cfgProp(300, 'ttl-seconds'),
   *   // equivalent to: { 'oaspec.dynamodb-cache.ttl-seconds': 300 }
   *
   *   ...oaspecCache.cfgProp(10_000, 'timeout', 'ms'),
   *   // equivalent to: { 'oaspec.dynamodb-cache.timeout.ms': 10_000 }
   * }
   */
  cfgProp<V, K extends string>(value: V, key: K): Record<CfgKeyBase<TDomain, TService, K>, V>
  cfgProp<V, K extends string, Sfx extends string>(
    value: V,
    key: K,
    suffix: Sfx,
  ): Record<`${CfgKeyBase<TDomain, TService, K>}.${Sfx}`, V>
  cfgProp(value: unknown, key: string, suffix?: string): Record<string, unknown> {
    return buildCfgProp(this.defaults, value, key, suffix) as Record<string, unknown>
  }

  // ── Hierarchy introspection ───────────────────────────────────────────────

  /**
   * Read-only view of derivatives created via `.with()` on this instance.
   * Intended for visualisation (`toMermaid()`) and debugging.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children(): readonly DerropsConventions<any, any, any, any>[] {
    return this._children
  }

  /** The raw segment defaults stored on this instance. Used by `toMermaid()`. */
  segments(): Readonly<Segments> {
    return this.defaults
  }

  /** The default resource type set via `.with({ type })`, if any. */
  defaultResourceType(): ResourceType | undefined {
    return this.defaultType
  }

  /** The stored ARN context set via `.arnContext()`, if any. */
  arnContextValue(): { accountId: string; partition?: string } | undefined {
    return this.storedArnContext
  }

  /**
   * Render this instance and every descendant created via `.with()` as a Mermaid
   * `flowchart`, with each segment tier expressed as a nested `subgraph`.
   *
   * @example
   * const org = new DerropsConventions({ org: 'slaops' })
   * const platform = org.with({ domain: 'platform' })
   * platform.with({ service: 'vpc' })
   * console.log(org.toMermaid())
   */
  toMermaid(options?: MermaidOptions): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return renderMermaid(this as unknown as DerropsConventions<any, any, any, any>, options)
  }

  /**
   * Opt this instance in to emitting a `segment-values` tag from `tags()`.
   *
   * The tag stores all active segment key-value pairs in `key=value,...` format,
   * enabling reconstruction of the full segment context from AWS tags alone —
   * without needing the resource name.
   *
   * Chainable — returns `this`. Propagates to instances derived via `.with()`.
   *
   * @example
   * conventions.emitSegmentValues().tags()
   * // → { domain: 'payments', service: 'api', segment: 'domain--service',
   * //     'segment-values': 'domain=payments,service=api' }
   */
  emitSegmentValues(): this {
    this._emitSegmentValues = true
    return this
  }

  // ── ConventionsContext accessor methods ───────────────────────────────────
  // These satisfy the ConventionsContext interface consumed by domain modules.

  tagKeyPrefix(): string {
    return this.keyPrefix
  }

  tagCasing(): TagKeyCasing {
    return this.keyCasing
  }

  visibleTagKeys(): readonly TagKey[] {
    return this.visibleTags
  }

  visibleDimensionKeys(): readonly DimensionKey[] {
    return this.visibleDimensions
  }

  _getDeps(): Array<{ owner: ConventionsContext; resources: ResourceType[] }> {
    return this._dependencies as Array<{ owner: ConventionsContext; resources: ResourceType[] }>
  }

  resolveApex(merged: Segments): string | undefined {
    return resolveApexFn(merged, this.apexZoneMap, this.apexMapFn)
  }

  resolveArnCtx(override?: Partial<ArnContext>): ArnContext {
    return resolveArnContextFn(override, this.storedArnContext, this.defaults.region)
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
    const segments = buildSegmentsFn(
      { ...this.defaults, ...overrides },
      config,
      this.extraSegments,
      this.order,
      this.apexZoneMap,
      this.apexMapFn,
    )
    const joined = segments.join(config.segmentDelimiter)
    const base = config.leadingDelimiter ? `${config.segmentDelimiter}${joined}` : joined
    const prefixed = config.namePrefix ? `${config.namePrefix}${base}` : base
    return config.suffix ? `${prefixed}${config.suffix}` : prefixed
  }

  /**
   * Parse a resource name back into its constituent segments.
   *
   * Uses the instance's `defaultType` when `options.type` is omitted.
   * Any segment defaults already set on this instance are validated against the parsed values —
   * an error is thrown if a parsed segment conflicts with a known default.
   *
   * Pass `options.tags` with the resource's actual AWS tags (e.g. fetched from the AWS API)
   * to use the `segment` tag for unambiguous key ordering. Without it, the key order is
   * derived from the resource type's configuration.
   *
   * Returns only the segments found in the name (does not merge instance defaults).
   *
   * @example
   * const c = new DerropsConventions({ org: 'acme', env: 'prod' })
   * c.parse('acme--payments--checkout-api', { type: 'lambdaFunction' })
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api' }
   *
   * // With real resource tags for precise key order:
   * c.parse('acme--payments--checkout-api--v2', {
   *   type: 'lambdaFunction',
   *   tags: { segment: 'org--domain--service--version' },
   * })
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api', version: 'v2' }
   */
  parse(
    name: string,
    options?: { type?: ResourceType; tags?: Record<string, string> },
  ): ParsedSegments {
    const resolvedType = options?.type ?? this.defaultType
    if (!resolvedType) {
      throw new Error(
        'parse() requires a "type" — either pass it directly or set a default via .with({ type })',
      )
    }

    const parsed = DerropsConventions.parse(name, resolvedType, { tags: options?.tags })

    for (const [key, knownValue] of Object.entries(this.defaults) as [keyof Segments, string][]) {
      const parsedValue = parsed[key as SegmentKey]
      if (parsedValue !== undefined && parsedValue !== knownValue) {
        throw new Error(
          `parse(): segment "${key}" in name is "${parsedValue}" but instance default is "${knownValue}"`,
        )
      }
    }

    return parsed
  }

  /**
   * Build an S3 key prefix — a path ending with `/` suitable for `ListObjectsV2`,
   * S3 batch operations, Glue crawl roots, and Athena partition projections.
   *
   * Accepts either a `Date` + `granularity` pair (resolved via `datePartition()` into the
   * `partition` segment) or a raw `partition` string as an escape hatch. Omit both to get a
   * plain service-scoped prefix with no date component.
   *
   * Instance defaults for `org`, `domain`, `service`, and `tenant` are inherited as usual.
   * Pass `tenant` here to override the instance default for a single call.
   *
   * @example
   * // All objects ingested in the 14:00 UTC hour of 2024-03-15
   * c.s3Prefix({ date: new Date('2024-03-15T14:30:00Z'), granularity: 'hour' })
   * // → 'slaops/logs/ingest/2024/03/15/14/'
   *
   * // Per-tenant log prefix for a full day
   * c.s3Prefix({ tenant: 't-a3f8b2', date: new Date('2024-03-15T00:00:00Z'), granularity: 'day' })
   * // → 'slaops/logs/ingest/t-a3f8b2/2024/03/15/'
   *
   * // Plain service prefix — no date
   * c.s3Prefix()
   * // → 'slaops/logs/ingest/'
   *
   * // Raw partition string (escape hatch for custom layouts)
   * c.s3Prefix({ partition: 'custom/path' })
   * // → 'slaops/logs/ingest/custom/path/'
   */
  s3Prefix(
    options: {
      date?: Date
      granularity?: DatePartitionGranularity
      tenant?: string
      partition?: string
    } = {},
  ): string {
    return buildS3Prefix(this, options)
  }

  /**
   * Build a fully-described S3 resource from this convention.
   *
   * Returns an `S3Resource` with every naming layer (`bucketName`, `prefix`, `objectName`,
   * `objectKey`), every reference format (`uri`, `arn`, `url`), the layered `segments`
   * breakdown, and a complete `tags` record ready to apply to the bucket.
   *
   * **Layer control via `layers`:** pass a `S3ResourceLayers` object to override which
   * segments appear in each naming layer. When a layer array is supplied it *replaces* the
   * default for that layer; omit it to keep the convention default.
   *
   * Default layers:
   * - `bucket` → region, env, org, domain, service  (the `s3Bucket` type, `--` delimiter)
   * - `prefix` → org, domain, service, tenant, partition  (`/` delimiter)
   * - `obj`    → key  (`-` delimiter)
   *
   * @example
   * // Default: org/domain/service appears in both bucket and prefix
   * c.s3Resource({ partition: '2024/03/15', key: 'log.gz' })
   *
   * // No redundancy — prefix carries only the partition
   * c.s3Resource({ partition: '2024/03/15', key: 'log.gz',
   *   layers: { prefix: ['partition'] }
   * })
   *
   * // Custom bucket boundary
   * c.s3Resource({ partition: '2024/03/15', key: 'log.gz',
   *   layers: {
   *     bucket: ['region', 'env', 'org'],
   *     prefix: ['domain', 'service', 'partition'],
   *   }
   * })
   */
  s3Resource(
    options: {
      key?: string
      date?: Date
      granularity?: DatePartitionGranularity
      partition?: string
      tenant?: string
      layers?: S3ResourceLayers
    } = {},
  ): S3Resource {
    return buildS3Resource(this, options)
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
   * **Auto-generated `segment` tag:** always included regardless of `tagKeys()`. Its value is
   * the ordered segment key names that would appear in a resource name, joined by that type's
   * delimiter. Pass `type` (or set a default via `.with({ type })`) to get the exact delimiter
   * and segment ordering for a specific resource type; falls back to `--` and the full default
   * order when no type is known.
   *
   * @example
   * conventions.tags()
   * // → { domain: 'payments', service: 'checkout-api', segment: 'domain--service' }
   *
   * conventions.tags({ type: 's3ObjectKey' })
   * // → { domain: 'payments', service: 'checkout-api', segment: 'org/domain/service' }
   *
   * conventions.tagKeys('org', 'domain', 'service', 'environment').tags()
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api', environment: 'prod', segment: 'org--domain--service' }
   *
   * conventions.tagPrefix('slaops:').tags()
   * // → { 'slaops:domain': 'payments', 'slaops:service': 'checkout-api', 'slaops:segment': 'domain--service' }
   *
   * conventions.tagKeyCasing('pascal').tagPrefix('MyApp_').tags()
   * // → { 'MyApp_Domain': 'payments', 'MyApp_Service': 'checkout-api', 'MyApp_Segment': 'domain--service' }
   */
  tags(options: TagOptions<C> = {} as TagOptions<C>): Record<string, string> {
    const typeOverride = (options as { type?: ResourceType }).type
    const merged: Segments = { ...this.defaults, ...(options as Segments) }
    const state: TagBuildState = {
      defaults: this.defaults,
      visibleTags: this.visibleTags,
      keyPrefix: this.keyPrefix,
      keyCasing: this.keyCasing,
      defaultType: this.defaultType,
      order: this.order,
      extraSegments: this.extraSegments,
      tagRules: this.tagRules,
      tagAugmentors: this.tagAugmentors,
      tagKeyMax: this.tagKeyMax,
      tagValueMax: this.tagValueMax,
      tagCountMax: this.tagCountMax,
      tagPolicies: this.tagPolicies,
      _emitSegmentValues: this._emitSegmentValues,
    }
    return buildTags(state, merged, typeOverride)
  }

  /**
   * Call `fn(key, value)` for every tag produced by `tags()`.
   *
   * Avoids a manual loop at the call site — pass any setter that accepts `(key, value)`:
   *
   * @example
   * // AWS CDK
   * svcConvention.applyTags((k, v) => Tags.of(this).add(k, v))
   *
   * // Pulumi
   * svcConvention.applyTags((k, v) => (resourceTags[k] = v))
   */
  applyTags(fn: (key: string, value: string) => void, options?: TagOptions<C>): void {
    for (const [k, v] of Object.entries(this.tags(options ?? ({} as TagOptions<C>)))) {
      fn(k, v)
    }
  }

  // ── CloudWatch dimensions ─────────────────────────────────────────────────

  /**
   * Set which segment keys appear as CloudWatch metric Dimensions in `dimensions()` output.
   *
   * Defaults to `['service']` — the namespace produced by `cloudwatchMetricNamespace` already
   * captures `org` and `domain`, so only the service (and optionally environment/tenant) need
   * to be expressed as Dimensions.
   *
   * **Cardinality warning for `'tenant'`:** CloudWatch bills per unique metric stream
   * (namespace + all dimension values). Adding `Tenant` multiplies your metric count by the
   * number of tenants — at 1,000 tenants and 50 metric names that is 50,000 streams, which
   * costs roughly $15,000/month. Only include `'tenant'` when your tenant count is small
   * (< ~50) and per-tenant operational metrics are genuinely required. For high-cardinality
   * per-tenant analysis prefer CloudWatch Contributor Insights or EMF structured logs.
   *
   * Chainable — returns `this`. Propagates to instances derived via `.with()`.
   *
   * @example
   * naming.dimensionKeys('service', 'environment').dimensions()
   * // → [{ Name: 'Service', Value: 'checkout-api' }, { Name: 'Environment', Value: 'prod' }]
   */
  dimensionKeys(...keys: DimensionKey[]): this {
    this.visibleDimensions = keys
    return this
  }

  /**
   * Generate the CloudWatch metric Dimensions array for this resource.
   *
   * Returns an `Array<{ Name: string; Value: string }>` ready to pass to
   * `CloudWatch.putMetricData({ Dimensions: ... })`. Only dimensions enabled via
   * `dimensionKeys()` and with a resolved segment value are included.
   *
   * Dimension `Name` values use PascalCase to match AWS CloudWatch convention:
   * `Service`, `Domain`, `Environment`, `Org`, `Tenant`.
   *
   * Pair with `cloudwatchMetricNamespace` — the namespace captures `org/domain`; Dimensions
   * add the service (and optionally environment/tenant) to uniquely identify each metric series.
   *
   * @example
   * const naming = new DerropsConventions({
   *   org: 'acme', domain: 'payments', service: 'checkout-api', env: 'prod',
   * })
   *
   * naming.name({ type: 'cloudwatchMetricNamespace' })
   * // → 'acme/payments'
   *
   * naming.dimensions()
   * // → [{ Name: 'Service', Value: 'checkout-api' }]
   *
   * naming.dimensionKeys('service', 'environment').dimensions()
   * // → [{ Name: 'Service', Value: 'checkout-api' }, { Name: 'Environment', Value: 'prod' }]
   */
  dimensions(options: TagOptions<C> = {} as TagOptions<C>): Array<{ Name: string; Value: string }> {
    return buildDimensions(this, options as Partial<Segments>)
  }

  /**
   * Build a bundle of all CloudWatch observability resource names for this service.
   *
   * Returns names for the metric namespace, log group, dashboard, and — when `key`
   * is provided — an alarm name. All names are derived from the same convention so
   * they share a consistent identity without any manual string construction.
   *
   * @example
   * const obs = c.cloudwatchResource({ key: 'error-rate' })
   * obs.namespace   // 'acme/payments'
   * obs.logGroup    // '/acme/payments/checkout-api'
   * obs.dashboard   // 'acme--payments--checkout-api'
   * obs.alarm       // 'acme--payments--checkout-api--error-rate'
   * obs.dimensions  // [{ Name: 'Service', Value: 'checkout-api' }]
   */
  cloudwatchResource(options?: { key?: string }): {
    namespace: string
    logGroup: string
    dashboard: string
    alarm: string | undefined
    dimensions: Array<{ Name: string; Value: string }>
  } {
    return buildCloudwatchResource(this, options)
  }

  // ── EKS ───────────────────────────────────────────────────────────────────

  /**
   * Build a bundle of all EKS + Kubernetes resource names for this service.
   *
   * Returns the EKS cluster name, Kubernetes namespace (domain-scoped), deployment,
   * service, and optional node group / ConfigMap / Secret names — all derived from
   * the same convention instance.
   *
   * @example
   * const eks = c.eksResource({ nodeGroupPurpose: 'workers' })
   * eks.cluster       // 'acme--payments--api'
   * eks.namespace     // 'payments'         (k8s namespace = domain)
   * eks.deployment    // 'api'              (k8s deployment = service)
   * eks.service       // 'api'
   * eks.nodeGroup     // 'acme--payments--api--workers'
   */
  eksResource(options?: {
    /** Purpose label for the EKS node group name (e.g. `'workers'`, `'spot'`). */
    nodeGroupPurpose?: string
    /** Key for ConfigMap / Secret names (e.g. `'config'`, `'credentials'`). */
    key?: string
  }): {
    cluster: string
    namespace: string
    deployment: string
    service: string
    nodeGroup: string | undefined
    configMap: string | undefined
    secret: string | undefined
  } {
    return buildEksResource(this, options)
  }

  // ── Cloud Map ─────────────────────────────────────────────────────────────

  /**
   * Build the AWS Cloud Map namespace and service names for this convention.
   *
   * Namespace maps to the domain-level (`payments.acme.local`).
   * Service maps to the service-level (`checkout-api`).
   * FQDN is the fully-qualified discovery address: `service.namespace`.
   *
   * @example
   * c.cloudMapResource()
   * // → {
   * //   namespace: 'payments.acme.local',
   * //   service:   'checkout-api',
   * //   fqdn:      'checkout-api.payments.acme.local',
   * // }
   */
  cloudMapResource(): { namespace: string; service: string; fqdn: string } {
    return buildCloudMapResource(this)
  }

  // ── Cost allocation ───────────────────────────────────────────────────────

  /**
   * Generate an AWS Cost Explorer tag-based filter that matches resources tagged
   * by this convention. Returns an `{ And: [...] }` expression — one filter per
   * visible tag that has a value.
   *
   * Pass the result to `CostExplorer.getCostAndUsage({ Filter: costFilter() })`.
   *
   * @example
   * c.tagKeys('org', 'domain', 'service', 'environment').costFilter()
   * // → { And: [
   * //     { Tags: { Key: 'slaops:org', Values: ['acme'], MatchOptions: ['EQUALS'] } },
   * //     { Tags: { Key: 'slaops:domain', Values: ['payments'], MatchOptions: ['EQUALS'] } },
   * //     ...
   * //   ] }
   */
  costFilter(): CostExplorerFilter {
    return buildCostFilter(this)
  }

  /**
   * Generate a stable AWS Budgets budget name for this convention scope.
   *
   * Produces a `--`-delimited name from the active segments, suitable as the
   * `BudgetName` in `Budgets.createBudget()`.
   *
   * @example
   * c.budgetName()  // 'acme--payments--checkout-api--prod'
   */
  budgetName(): string {
    return buildBudgetName(this)
  }

  /**
   * Return the list of tag key names (as registered in AWS Cost Allocation Tags)
   * that this convention emits. These are the keys you must activate in the AWS
   * Billing console under Cost Allocation Tags.
   *
   * @example
   * c.tagPrefix('slaops:').tagKeys('org', 'domain', 'service').costAllocationTags()
   * // → ['slaops:org', 'slaops:domain', 'slaops:service']
   */
  costAllocationTags(): string[] {
    return buildCostAllocationTags(this)
  }

  // ── Network topology ──────────────────────────────────────────────────────

  /**
   * Generate all resource names for the **org network layer** — resources provisioned
   * once per account (VPC, Transit Gateway). Call on an instance with `org` set.
   *
   * @example
   * orgConvention.orgNetworkLayer()
   * // → { vpc: 'acme', transitGateway: 'acme--tgw' }
   */
  orgNetworkLayer(): { vpc: string; transitGateway: string } {
    return buildOrgNetworkLayer(this)
  }

  /**
   * Generate all resource names for the **domain network layer** — resources provisioned
   * when a new domain is added (subnets, NACL, route tables, TGW attachment).
   * Call on an instance with `org` + `domain` set.
   *
   * @param azs - Availability zone suffixes to generate subnets for, e.g. `['1a', '1b', '1c']`
   * @param kinds - Subnet tiers to generate. Defaults to `['private', 'public', 'isolated']`
   *
   * @example
   * orgConvention.with({ domain: 'payments' }).domainNetworkLayer(['1a', '1b', '1c'])
   * // → {
   * //   subnets: {
   * //     private:  ['acme--payments--private--1a', ...],
   * //     public:   ['acme--payments--public--1a', ...],
   * //     isolated: ['acme--payments--isolated--1a', ...],
   * //   },
   * //   nacl: 'acme--payments--nacl',
   * //   routeTables: { private: 'acme--payments--private', public: 'acme--payments--public', isolated: 'acme--payments--isolated' },
   * //   tgwAttachment: 'acme--payments--tgw-attach',
   * // }
   */
  domainNetworkLayer(
    azs: string[],
    kinds: string[] = ['private', 'public', 'isolated'],
  ): {
    subnets: Record<string, string[]>
    nacl: string
    routeTables: Record<string, string>
    tgwAttachment: string
  } {
    return buildDomainNetworkLayer(this, azs, kinds)
  }

  /**
   * Generate all security group names for the **service network layer** — resources
   * provisioned with each service deployment. Call on an instance with `org` + `domain` + `service` set.
   *
   * The `purpose` value encodes the access role the security group protects:
   * `web` (HTTP/HTTPS), `db` (database), `cache` (Redis), `search` (OpenSearch),
   * `internal` (intra-domain), `relay` (egress), `bastion` (SSH), `worker`.
   *
   * @param purposes - Access roles to generate security groups for
   *
   * @example
   * orgConvention.with({ domain: 'payments', service: 'checkout-api' })
   *   .serviceNetworkLayer(['web', 'db', 'internal'])
   * // → {
   * //   securityGroups: {
   * //     web:      'acme--payments--checkout-api--web',
   * //     db:       'acme--payments--checkout-api--db',
   * //     internal: 'acme--payments--checkout-api--internal',
   * //   }
   * // }
   */
  serviceNetworkLayer(purposes: string[]): { securityGroups: Record<string, string> } {
    return buildServiceNetworkLayer(this, purposes)
  }

  // ── Constraints ───────────────────────────────────────────────────────────

  /**
   * Returns the constrained segment values registered via `.constrain()` or any segment
   * helper (`.domain()`, `.service()`, `.key()`, etc.). Only segments that have been
   * explicitly constrained are present — unconstrained segments (e.g. `tenant`) are absent.
   *
   * Used by `topology()` to determine the ordered domain list for CIDR allocation.
   * The order in which domains were passed to `.domain([...])` is preserved and determines
   * which /20 CIDR block each domain receives.
   *
   * @example
   * convention.domain(['payments', 'identity']).constraints()
   * // → { domain: ['payments', 'identity'] }
   *
   * convention.domain(['payments']).service(['checkout-api', 'auth-service']).constraints()
   * // → { domain: ['payments'], service: ['checkout-api', 'auth-service'] }
   */
  constraints(): Partial<Record<SegmentKey, readonly string[]>> {
    return { ...this.storedConstraints }
  }

  /**
   * Generate the full network topology — names AND CIDR blocks — for the org and all
   * constrained domains. Domain ordering must be established first via `.domain([...])`;
   * the order determines CIDR allocation (domain 0 → first /20 block, etc.).
   *
   * Network logic lives in the separate `topology.ts` module. This method is a thin
   * delegation so `DerropsConventions` stays focused on naming.
   *
   * @throws if `.domain([...])` has not been called on this instance
   *
   * @example
   * const plan = orgConvention
   *   .domain(['payments', 'identity', 'platform'])
   *   .topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
   *
   * plan.vpc        // { name: 'acme', cidr: '10.0.0.0/16' }
   * plan.domains.payments.cidr             // '10.0.0.0/20'
   * plan.domains.payments.subnets.private  // [{ name, cidr, az }, ...]
   */
  topology(options: TopologyOptions): OrgNetworkTopology {
    return buildNetworkTopology(this, options)
  }

  /**
   * Returns a capacity report describing CIDR slot utilisation for all constrained domains,
   * without throwing. Use before deployment to audit space consumption.
   *
   * A warning is emitted when any domain exceeds 75 % of kind slots, or any kind exceeds
   * 75 % of AZ slots.
   *
   * @example
   * const report = orgConvention.capacityReport({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
   * if (report.warnings.length) console.warn(report.warnings)
   */
  capacityReport(options: TopologyOptions): TopologyCapacityReport {
    return buildCapacityReport(this, options)
  }

  // ── IAM policy generation ─────────────────────────────────────────────────

  /**
   * Store the AWS account ID (and optional partition) on this instance for ARN construction.
   * Used by `.staticPolicy()` and `.dynamicPolicy()` when no explicit context is provided.
   * Region is sourced from the instance's segment defaults.
   *
   * Chainable — returns `this`.
   *
   * @example
   * const conventions = new DerropsConventions({ org: 'acme', region: 'us-east-1' })
   *   .arnContext({ accountId: '123456789012' })
   */
  arnContext(context: { accountId: string; partition?: string }): this {
    this.storedArnContext = context
    return this
  }

  /**
   * Create a static policy builder that generates an IAM policy document by declaring
   * which resource types to include. ARNs are derived from the convention's segments.
   *
   * Provide `context` to supply or override `accountId`, `region`, or `partition`.
   * When omitted, values are sourced from `.arnContext()` and the `region` segment default.
   *
   * @example
   * const doc = conventions.staticPolicy()
   *   .include('s3Bucket', { key: 'uploads' }, { permissions: 'read' })
   *   .include('dynamoDb', { service: 'users' }, { permissions: 'readWrite' })
   *   .buildPolicy()
   */
  staticPolicy(context?: Partial<ArnContext>): StaticPolicyBuilder<C> {
    return buildStaticPolicy(this, context, (type, nameOptions) =>
      this.name(nameOptions as NameOptions<C, TType>),
    ) as StaticPolicyBuilder<C>
  }

  /**
   * Create a dynamic policy session that intercepts every `.name()` call, records the
   * generated ARNs, and can produce an IAM policy document from all recorded resources.
   *
   * @example
   * const session = conventions.dynamicPolicy()
   * const bucket = session.name({ type: 's3Bucket', key: 'uploads' }, { permissions: 'read' })
   * const table  = session.name({ type: 'dynamoDb', service: 'users' }, { permissions: 'readWrite' })
   * const doc = session.buildPolicy()
   */
  dynamicPolicy(context?: Partial<ArnContext>): DynamicPolicySession<C> {
    return buildDynamicPolicy(
      this,
      context,
      (options) => this.name(options as NameOptions<C, TType>),
      () => this.defaultType,
    ) as DynamicPolicySession<C>
  }

  /**
   * Generate a named resource descriptor — the same name as `.name()` plus pre-computed ARNs,
   * resource type, and tags. Use `.read()`, `.write()`, `.manage()`, or `.raw()` on the result
   * to produce `GrantDescriptor` objects for `PolicyBuilder.allow()` / `.deny()`.
   *
   * Throws if the resource type has no ARN configuration (use `.name()` for naming-only types).
   * Requires `.arnContext({ accountId })` to be set on the instance.
   *
   * @example
   * const table = c.resource({ type: 'dynamoDb', key: 'orders' })
   * const bucket = c.resource({ type: 's3Bucket', key: 'uploads' })
   *
   * const doc = c.policyBuilder()
   *   .allow(table.read(), table2.read())  // merged into one statement
   *   .allow(bucket.write())
   *   .build()
   */
  resource(options: NameOptions<C, TType>): Resource<ResourceType> {
    return buildResource(this, options as Record<string, unknown>)
  }

  /**
   * Create a `PolicyBuilder` for composing IAM policy documents from `Resource` grant descriptors.
   *
   * No `arnContext` is required — ARNs are carried on `Resource` objects produced by `.resource()`.
   * The method exists on the instance for discoverability; `new PolicyBuilder()` works equally well
   * for cross-convention scenarios.
   *
   * @example
   * const doc = c.policyBuilder()
   *   .allow(table.read(), table2.read())
   *   .deny(adminBucket.manage())
   *   .build()
   */
  policyBuilder(): PolicyBuilder {
    return new PolicyBuilder()
  }

  // ── Tenant provisioning ───────────────────────────────────────────────────

  /**
   * Generate the full set of resource names and ARNs that should be provisioned for a tenant.
   *
   * The tenant ID is injected as the `tenant` segment for every resource type listed.
   * Resource types without `arn` config (naming-only types) still appear in the manifest
   * but with `arn: undefined`.
   *
   * The returned manifest's `diff(existing)` method computes added / removed / unchanged
   * resources between two manifest snapshots.
   *
   * @example
   * const manifest = c.tenantManifest('t-xyz', ['dynamoDb', 's3Bucket', 'sqsQueue'])
   * // manifest.resources → [{ type: 'dynamoDb', name: '...', arn: '...', tags: {...} }, ...]
   * manifest.diff(previousManifest)
   * // → { added: [], removed: [], unchanged: [...] }
   */
  tenantManifest(tenantId: string, resourceTypes: ResourceType[]): TenantManifest {
    return buildTenantManifest(this, tenantId, resourceTypes)
  }

  // ── CloudFormation ────────────────────────────────────────────────────────

  /**
   * Generate a CloudFormation cross-stack export name for the given export key.
   *
   * Produces a globally-unique, stable `--`-delimited name from the active segments
   * (org, domain, service) plus the export key. Pass this to `CfnOutput.exportName`
   * and `Fn.importValue()` at import sites.
   *
   * @example
   * c.cfnExport('vpc-id')      // 'acme--payments--api--vpc-id'
   * c.cfnExport('bucket-arn')  // 'acme--payments--api--bucket-arn'
   */
  cfnExport(exportKey: string): string {
    return buildCfnExport(this, exportKey)
  }

  // ── EventBridge ───────────────────────────────────────────────────────────

  /**
   * Generate the EventBridge event `source` string for this convention.
   *
   * Emits a dot-delimited hierarchy from `org.domain.service`. Use the `level` option to
   * truncate the depth for prefix-match routing patterns in EventBridge rules.
   *
   * @example
   * svc.eventSource()                    // 'slaops.platform.api'
   * svc.eventSource({ level: 'domain' }) // 'slaops.platform'  ← matches all platform services
   * svc.eventSource({ level: 'org' })    // 'slaops'           ← matches all slaops events
   *
   * // Rule matching all platform-domain events:
   * { source: [{ prefix: svc.eventSource({ level: 'domain' }) }] }
   */
  eventSource(options?: { level?: 'org' | 'domain' | 'service' }): string {
    return buildEventSource(this, options)
  }

  /**
   * Normalise an event action name to PascalCase for use as an EventBridge `detail-type`.
   *
   * @example
   * svc.detailType('request-logged')  // 'RequestLogged'
   * svc.detailType('RequestLogged')   // 'RequestLogged'
   * svc.detailType('user signed in')  // 'UserSignedIn'
   */
  detailType(action: string): string {
    return buildDetailType(action)
  }

  // ── ECR ──────────────────────────────────────────────────────────────────

  /**
   * Generate a `--`-delimited image tag from the `env`, `version`, and `key` segments.
   * Segments that are not set on this instance are omitted.
   *
   * The `key` segment is the natural holder for a git SHA or build ID.
   *
   * @example
   * c.with({ env: 'prod' }).imageTag()                             // 'prod'
   * c.with({ env: 'prod', version: 'v1.2.3' }).imageTag()         // 'prod--v1.2.3'
   * c.with({ env: 'prod', version: 'v1.2.3', key: 'abc123f' }).imageTag()
   * // 'prod--v1.2.3--abc123f'
   */
  imageTag(): string {
    return buildImageTag(this)
  }

  /**
   * Generate the full ECR image URI: `{accountId}.dkr.ecr.{region}.amazonaws.com/{repo}[:{tag}]`.
   *
   * Repository path uses the `ecr` resource type (`/`-delimited `org/domain/service`).
   * Image tag is produced by `.imageTag()` — omitted from the URI when no tag segments are set.
   *
   * Requires `.arnContext({ accountId })` and a `region` segment default.
   *
   * @example
   * c.arnContext({ accountId: '123456789012' })
   *  .with({ env: 'prod', version: 'v1.2.3', key: 'abc123f' })
   *  .ecrUri()
   * // '123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/slaops/platform/api:prod--v1.2.3--abc123f'
   */
  ecrUri(): string {
    return buildEcrUri(this)
  }

  // ── SQS ──────────────────────────────────────────────────────────────────

  /**
   * Generate a paired SQS queue + dead-letter queue as a single bundle.
   *
   * Both resources share the same naming segments; the DLQ name is the queue name + `--dlq`.
   * Returns full `Resource` objects — use `.arn`, `.logicalId`, `.read()`, `.write()` directly
   * on each. `redrivePolicyArn` is a convenience alias for `dlq.arn`.
   *
   * @example
   * const { queue, dlq, redrivePolicyArn } = svc.sqsPair({ key: 'ingest' })
   * // queue.name → 'slaops--platform--api--ingest'
   * // dlq.name   → 'slaops--platform--api--ingest--dlq'
   * // redrivePolicyArn === dlq.arn
   */
  sqsPair(options: Segments): SqsPair {
    return buildSqsPair(this, options)
  }

  // ── Dependency modelling ──────────────────────────────────────────────────

  /**
   * Declare that this service depends on specific resource types owned by another convention.
   *
   * Use `policyFor()` on the owner to generate the IAM policy that grants this caller
   * access to those resources.
   *
   * Chainable — returns `this`.
   *
   * @example
   * const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
   * const db  = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'db' })
   *
   * api.dependsOn(db, ['dynamoDb', 's3Bucket'])
   * db.policyFor(api)  // → IAM policy granting api read/write on db's DynamoDB + S3 resources
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dependsOn(owner: DerropsConventions<any, any, any, any>, resources: ResourceType[]): this {
    this._dependencies.push({ owner, resources })
    return this
  }

  /**
   * Returns the dependency graph rooted at this instance.
   *
   * Performs a breadth-first traversal following `dependsOn()` declarations.
   * Circular dependencies are detected and not re-visited.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dependencies(): {
    nodes: DerropsConventions<any, any, any, any>[]
    edges: Array<{
      from: DerropsConventions<any, any, any, any>
      owner: DerropsConventions<any, any, any, any>
      resources: ResourceType[]
    }>
  } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return buildDependencies(this) as any
  }

  /**
   * Generate an IAM policy that grants `caller` access to the resources it declared
   * it depends on via `caller.dependsOn(this, resourceTypes)`.
   *
   * Requires `.arnContext({ accountId })` to be set on this instance.
   *
   * @example
   * const db = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'db' })
   *   .arnContext({ accountId: '123456789012', region: 'ap-southeast-2' })
   * const api = new DerropsConventions({ ... })
   * api.dependsOn(db, ['dynamoDb'])
   *
   * db.policyFor(api)
   * // → IAM policy: { Statement: [{ Effect: 'Allow', Action: ['dynamodb:Get*', ...], Resource: [...] }] }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  policyFor(caller: DerropsConventions<any, any, any, any>): PolicyBuilder {
    return buildPolicyFor(this, caller)
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validate that a resource name was generated by this convention for the given type.
   *
   * Parses the name, checks every known segment default against the parsed values,
   * and reports all mismatches. Returns `{ valid: true }` only when the name parses
   * cleanly AND every known segment agrees.
   *
   * @example
   * const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
   * c.validate('acme--payments--api', 'lambdaFunction')
   * // → { valid: true, errors: [], parsed: { org:'acme', domain:'payments', service:'api' }, type: 'lambdaFunction' }
   *
   * c.validate('acme--WRONG--api', 'lambdaFunction')
   * // → { valid: false, errors: ['segment "domain": expected "payments", got "WRONG"'], ... }
   */
  validate(name: string, type: ResourceType): ValidationResult {
    return buildValidate(this, name, type)
  }

  /**
   * Batch-validate a set of resource names against this convention.
   *
   * @example
   * const report = c.lint({
   *   lambdaFunction: 'acme--payments--api',
   *   s3Bucket: 'ap-southeast-2--prod--acme--wrong--api',
   * })
   * report.summary  // '1/2 passed'
   * report.failed[0].errors  // ['segment "domain": expected "payments", got "wrong"']
   */
  lint(names: Partial<Record<ResourceType, string>>): LintReport {
    return buildLint(this, names)
  }

  // ── Static utilities ──────────────────────────────────────────────────────

  /**
   * Parse a resource name back into its constituent segments without any instance context.
   *
   * When `options.tags` contains a `segment` tag (with any key prefix), that tag's value is
   * used as the authoritative ordered key list. Otherwise the key order is derived from the
   * resource type's configuration.
   *
   * Note: word-delimiter normalisation applied during `name()` (e.g. hyphens → underscores
   * for RDS/Glue types) is not reversed — values are returned as they appear in the name.
   *
   * @example
   * DerropsConventions.parse('acme--payments--checkout-api', 'lambdaFunction')
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api' }
   *
   * DerropsConventions.parse('ap-southeast-2--prod--acme--payments--uploads', 's3Bucket')
   * // → { region: 'ap-southeast-2', env: 'prod', org: 'acme',
   * //     domain: 'payments', service: 'uploads' }
   *
   * // With segment tag for unambiguous key order:
   * DerropsConventions.parse('acme--payments--v2', 'lambdaFunction', {
   *   tags: { segment: 'org--domain--version' },
   * })
   * // → { org: 'acme', domain: 'payments', version: 'v2' }
   */
  static parse(
    name: string,
    type: ResourceType,
    options?: { tags?: Record<string, string> },
  ): ParsedSegments {
    return parseResourceName(name, type, options)
  }

  /**
   * Parse an S3 object key back into its constituent segments.
   *
   * Strips the instance's known prefix segments (`org/domain/service[/tenant]`) from the
   * front of the key, then treats the final `/`-separated component as the `key` segment
   * and everything in between as the `partition` segment (which may contain `/` date paths
   * like `2024/03/15`).
   *
   * Throws if the key does not start with the expected prefix for any segment that is set
   * on this instance.
   *
   * @example
   * const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })
   * c.parseS3Key('acme/payments/checkout-api/2024/03/15/14/log-001.gz')
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api',
   * //     partition: '2024/03/15/14', key: 'log-001.gz' }
   *
   * c.parseS3Key('acme/payments/checkout-api/t-xyz/2024/03/15/')
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api',
   * //     tenant: 't-xyz', partition: '2024/03/15' }
   */
  parseS3Key(key: string, options?: { tenant?: string }): ParsedSegments {
    return parseS3KeyFromDefaults(key, this.defaults, options)
  }

  /**
   * Parse a full S3 URI or ARN into layered segments, validated against this instance's defaults.
   *
   * Returns a `ParsedS3Uri` with four views: `bucket`, `prefix`, `obj`, and `all`.
   * Throws if any parsed segment conflicts with a known instance default.
   *
   * Supported schemes: `s3://` and `arn:aws:s3:::`.
   *
   * @example
   * const c = new DerropsConventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
   * c.parseS3Uri('s3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/15/log.gz')
   * // → {
   * //   bucket: { region: 'ap-southeast-2', env: 'prod', org: 'acme', domain: 'logs', service: 'ingest' },
   * //   prefix: { org: 'acme', domain: 'logs', service: 'ingest', partition: '2024/03/15' },
   * //   obj:    { key: 'log.gz' },
   * //   all:    { region: 'ap-southeast-2', env: 'prod', org: 'acme', domain: 'logs', service: 'ingest', partition: '2024/03/15', key: 'log.gz' },
   * // }
   */
  parseS3Uri(uri: string, options?: { tags?: Record<string, string> }): ParsedS3Uri {
    return parseS3UriFromDefaults(uri, this.defaults, options)
  }

  /**
   * Parse an S3 object key back into its constituent segments without any instance context.
   *
   * Equivalent to `DerropsConventions.parse(key, 's3ObjectKey', options)`.
   * The last `/`-separated component is greedy — it absorbs any extra delimiter parts,
   * making it suitable for keys whose final segment value contains `/`.
   *
   * For log keys with multi-part date partitions in the middle of the path, prefer the
   * instance `parseS3Key()` method which can strip a known prefix first.
   *
   * @example
   * DerropsConventions.parseS3Key('acme/payments/checkout-api', { tags: { segment: 'org/domain/service' } })
   * // → { org: 'acme', domain: 'payments', service: 'checkout-api' }
   */
  static parseS3Key(key: string, options?: { tags?: Record<string, string> }): ParsedSegments {
    return DerropsConventions.parse(key, 's3ObjectKey', options)
  }

  /**
   * Parse a full S3 URI or ARN into layered segments without any instance context.
   *
   * Returns a `ParsedS3Uri` with four views:
   * - `bucket` — segments from the bucket name (region, env, org, domain, service)
   * - `prefix` — segments from the key prefix (org, domain, service, [tenant], [partition])
   * - `obj` — segments from the object filename ([key])
   * - `all` — all segments merged
   *
   * `bucket` and `prefix` share org/domain/service (intentional — shows what each layer contributed).
   * Supported schemes: `s3://` and `arn:aws:s3:::`.
   *
   * @example
   * DerropsConventions.parseS3Uri(
   *   's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/15/14/access.log.gz',
   * )
   * // → {
   * //   bucket: { region: 'ap-southeast-2', env: 'prod', org: 'acme', domain: 'logs', service: 'ingest' },
   * //   prefix: { org: 'acme', domain: 'logs', service: 'ingest', partition: '2024/03/15/14' },
   * //   obj:    { key: 'access.log.gz' },
   * //   all:    { region: ..., env: ..., org: ..., domain: ..., service: ..., partition: ..., key: ... },
   * // }
   */
  static parseS3Uri(uri: string, options?: { tags?: Record<string, string> }): ParsedS3Uri {
    return parseS3UriStatic(uri, options, (segs) => new DerropsConventions(segs))
  }

  /** List all registered resource type keys. */
  static resourceTypes(): string[] {
    return Object.keys(RESOURCE_TYPES).sort()
  }

  /** Register a custom resource type, or override an existing one. */
  static registerResourceType(name: string, config: ResourceTypeConfig): void {
    ;(RESOURCE_TYPES as Record<string, ResourceTypeConfig>)[name] = config
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
   *
   * Always UTC — pass this result as the `partition` segment to `name()` or `s3Prefix()`:
   * @example
   * c.name({
   *   type: 's3LogKey',
   *   partition: DerropsConventions.datePartition(new Date(), 'hour'),
   *   key: 'log-001.gz',
   * })
   */
  static datePartition(date: Date, granularity: DatePartitionGranularity): string {
    return parseDatePartition(date, granularity)
  }

  /**
   * Type-safe factory — create a convention from a single config object where
   * **arrays constrain** segment values and **strings set defaults**.
   *
   * TypeScript infers a union type from each array and enforces it on every
   * downstream `name()`, `tags()`, `with()`, and `topology()` call.
   *
   * Prefer the top-level `conventions()` function for brevity.
   *
   * @example
   * const conv = DerropsConventions.create({
   *   org: 'acme',                        // string → default, not constrained
   *   env: 'prod',                        // string → default
   *   domain: ['payments', 'identity'],   // array → type narrowed to 'payments' | 'identity'
   *   service: ['checkout-api'],           // array → type narrowed to 'checkout-api'
   * })
   *
   * conv.name({ type: 'lambdaFunction', domain: 'analytics' }) // ← TypeScript error ✓
   */
  static create<
    TDomain extends string = never,
    TService extends string = never,
    TEnv extends string = never,
    TKind extends string = never,
    TPurpose extends string = never,
    TAz extends string = never,
  >(
    spec: ConventionSpec<TDomain, TService, TEnv, TKind, TPurpose, TAz>,
  ): DerropsConventions<
    MaybeConstrain<'domain', TDomain> &
      MaybeConstrain<'service', TService> &
      MaybeConstrain<'env', TEnv> &
      MaybeConstrain<'kind', TKind> &
      MaybeConstrain<'purpose', TPurpose> &
      MaybeConstrain<'az', TAz>
  > {
    // Collect string values as segment defaults
    const defaults: Partial<Record<SegmentKey, string>> = {}
    const allKeys = [
      'org',
      'region',
      'apex',
      'tenant',
      'partition',
      'key',
      'num',
      'consumer',
      'target',
      'version',
      'domain',
      'service',
      'env',
      'kind',
      'purpose',
      'az',
    ] as const

    for (const k of allKeys) {
      const v = (spec as Record<string, unknown>)[k]
      if (typeof v === 'string') defaults[k as SegmentKey] = v
    }

    const instance = new DerropsConventions(defaults)

    // Apply array values as runtime constraints (also narrows the type phantom-style)
    const constrainableKeys = ['domain', 'service', 'env', 'kind', 'purpose', 'az'] as const
    for (const k of constrainableKeys) {
      const v = (spec as Record<string, unknown>)[k]
      if (Array.isArray(v) && v.length > 0) {
        instance.constrain(k, ...(v as string[]))
      }
    }

    return instance as unknown as ReturnType<
      typeof DerropsConventions.create<TDomain, TService, TEnv, TKind, TPurpose, TAz>
    >
  }

  /**
   * Convert an AWS region name to a compact alphabetic code suitable for DNS labels and resource names.
   *
   * | Region            | Code    |
   * | ----------------- | ------- |
   * | `us-east-1`       | `use1`  |
   * | `us-west-2`       | `usw2`  |
   * | `ap-southeast-2`  | `apse2` |
   * | `ap-northeast-1`  | `apne1` |
   * | `eu-central-1`    | `euc1`  |
   * | `eu-west-1`       | `euw1`  |
   * | `ca-central-1`    | `cac1`  |
   * | `sa-east-1`       | `sae1`  |
   * | `us-gov-east-1`   | `usge1` |
   *
   * Primarily used inside `.apexMapping()` when embedding region in a DNS zone name:
   * @example
   * conventions.apexMapping(s => {
   *   const rc = DerropsConventions.regionCode(s.region!)
   *   return s.env === 'prod' ? `${rc}.${s.apex}` : `${s.env}.${rc}.${s.apex}`
   * })
   */
  static regionCode(region: string): string {
    return parseRegionCode(region)
  }
}

/**
 * Type-safe convention factory — create a `DerropsConventions` instance from a single
 * config object where **arrays constrain** segment values and **strings set defaults**.
 *
 * TypeScript infers the union type from each array literal and enforces it on every
 * `name()`, `tags()`, `with()`, and `topology()` call on the resulting instance.
 * No `as const` required.
 *
 * ```typescript
 * const conv = conventions({
 *   org: 'acme',
 *   env: 'prod',
 *   domain: ['payments', 'identity'],    // → type narrowed to 'payments' | 'identity'
 *   service: ['checkout-api'],            // → type narrowed to 'checkout-api'
 * })
 *
 * conv.name({ type: 'lambdaFunction', domain: 'analytics' })
 * //                                 ^^^^^^ TypeScript error: not assignable to 'payments' | 'identity'
 *
 * conv.with({ domain: 'payments' })      // ✓ valid
 * conv.with({ domain: 'analytics' })     // ✗ TypeScript error
 * ```
 *
 * Segments passed as plain strings are set as defaults and do NOT constrain the type
 * (e.g. `org: 'acme'` makes `'acme'` the default org but does not prevent overriding it).
 *
 * Segments intentionally not constrainable via this factory: `tenant` (provisioned at runtime),
 * `key`, `partition`, `num`, `consumer`, `target`, `version` (typically set per `name()` call).
 * These remain constrainable via the `.constrain()` / `.key()` / etc. chaining API.
 */
export function conventions<
  TDomain extends string = never,
  TService extends string = never,
  TEnv extends string = never,
  TKind extends string = never,
  TPurpose extends string = never,
  TAz extends string = never,
>(
  spec: ConventionSpec<TDomain, TService, TEnv, TKind, TPurpose, TAz>,
): DerropsConventions<
  MaybeConstrain<'domain', TDomain> &
    MaybeConstrain<'service', TService> &
    MaybeConstrain<'env', TEnv> &
    MaybeConstrain<'kind', TKind> &
    MaybeConstrain<'purpose', TPurpose> &
    MaybeConstrain<'az', TAz>
> {
  return DerropsConventions.create(spec)
}
