import type { SegmentConstraints, ConstrainedSegments } from './types.js'
import type { ResourceType } from './resource-types.js'

// ── Public exported types ─────────────────────────────────────────────────────

/** The conventional AWS resource tag keys produced by `tags()`. */
export type TagKey = 'org' | 'domain' | 'service' | 'environment' | 'tenant'

/**
 * Granularity for `DerropsConventions.datePartition()`.
 * Controls how many path components of `yyyy/mm/dd/hh` are emitted.
 */
export type DatePartitionGranularity = 'year' | 'month' | 'day' | 'hour'

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

/**
 * The segment keys that can appear as CloudWatch metric Dimensions.
 * Same set as `TagKey` — both read from the same segments — but kept separate
 * so the two concepts can diverge independently.
 */
export type DimensionKey = 'org' | 'domain' | 'service' | 'environment' | 'tenant'

/**
 * Spec object accepted by `conventions()` and `DerropsConventions.create()`.
 *
 * Pass a **string** for segments that are global defaults (org, env, region, etc.).
 * Pass a **readonly array of string literals** for segments you want to constrain —
 * TypeScript will infer the union type and enforce it on every downstream `name()`,
 * `tags()`, `with()`, and `topology()` call.
 *
 * Segments intentionally not constrainable here: `tenant` (runtime-provisioned),
 * `key`, `partition`, `num`, `consumer`, `target`, `version` (typically per-call).
 *
 * @example
 * const conv = conventions({
 *   org: 'acme',
 *   env: 'prod',
 *   domain: ['payments', 'identity'],   // ← constrained: 'payments' | 'identity'
 *   service: ['checkout-api'],           // ← constrained: 'checkout-api'
 * })
 * conv.name({ type: 'lambdaFunction', domain: 'analytics' }) // TypeScript error ✓
 */
export interface ConventionSpec<
  TDomain extends string,
  TService extends string,
  TEnv extends string,
  TKind extends string,
  TPurpose extends string,
  TAz extends string,
> {
  /** Top-level org identifier, e.g. `'acme'` */
  org?: string
  /** AWS region code, e.g. `'ap-southeast-2'` */
  region?: string
  /** Registered DNS apex domain, e.g. `'acme.com'` */
  apex?: string
  /** Opaque tenant ID — set as default only; constraints are runtime-provisioned */
  tenant?: string
  /** Date/time partition path */
  partition?: string
  /** Specific resource key */
  key?: string
  /** Ordinal instance number */
  num?: string
  /** Consuming service or principal */
  consumer?: string
  /** Target resource or data source */
  target?: string
  /** Version identifier */
  version?: string
  /**
   * Deployment environment.
   * - `string` → sets a default value
   * - `readonly string[]` → constrains and narrows the type
   */
  env?: readonly TEnv[] | string
  /**
   * Business domain bounded context.
   * - `string` → sets a default value
   * - `readonly string[]` → constrains and narrows the type
   */
  domain?: readonly TDomain[] | string
  /**
   * Deployable service unit.
   * - `string` → sets a default value
   * - `readonly string[]` → constrains and narrows the type
   */
  service?: readonly TService[] | string
  /**
   * Subnet or resource sub-classification (`'private'`, `'public'`, `'isolated'`).
   * - `string` → sets a default value
   * - `readonly string[]` → constrains and narrows the type
   */
  kind?: readonly TKind[] | string
  /**
   * Functional purpose for security groups and target groups.
   * - `string` → sets a default value
   * - `readonly string[]` → constrains and narrows the type
   */
  purpose?: readonly TPurpose[] | string
  /**
   * Availability zone suffix (`'1a'`, `'1b'`, `'1c'`).
   * - `string` → sets a default value
   * - `readonly string[]` → constrains and narrows the type
   */
  az?: readonly TAz[] | string
}

// ── Options types ─────────────────────────────────────────────────────────────

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
 * Pass `type` to use that resource type's segment ordering and delimiter for the
 * auto-generated `segment` tag. Defaults to the instance's `defaultType` (if set via
 * `.with({ type })`), then falls back to `'--'` delimiter with the full default order.
 */
export type TagOptions<C extends SegmentConstraints = {}> = ConstrainedSegments<C> & {
  type?: ResourceType
}

// ── Internal type helpers (not re-exported from index.ts) ─────────────────────

/** @internal Produce `Record<K, V>` when V is not `never`, else an empty record. */
export type MaybeConstrain<K extends string, V extends string> = [V] extends [never]
  ? Record<never, never>
  : Record<K, V>

/**
 * Whether `T` is a concrete string literal (not the broad `string` type).
 * @internal
 */
export type IsLiteralString<T extends string> = string extends T ? false : true

/**
 * The base return type of `cfgKey(key)`.
 * @internal
 */
export type CfgKeyBase<TDomain extends string, TService extends string, K extends string> =
  IsLiteralString<TDomain> extends true
    ? IsLiteralString<TService> extends true
      ? `${TDomain}.${TService}.${K}`
      : `${TDomain}.${K}`
    : string

/** A mapping from domain names to their valid service names. */
export type AnyDomainMap = Record<string, readonly string[]>

/**
 * Given a domain-service map and a specific domain literal `D`, resolve the allowed
 * service type:
 * - If `TMap` is unconstrained (the default), service is `string`
 * - If `D` is a literal key of `TMap`, service is narrowed to that domain's services
 * - If `D` is `string` (no literal domain), service is the union of all services in the map
 */
export type ServiceForDomain<
  TMap extends AnyDomainMap,
  D extends string,
> = string extends keyof TMap
  ? string
  : string extends D
    ? TMap[keyof TMap][number]
    : D extends keyof TMap
      ? TMap[D][number]
      : string
