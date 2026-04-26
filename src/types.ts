export type SegmentKey =
  | 'region'
  | 'env'
  | 'org'
  | 'apex'
  | 'tenant'
  | 'domain'
  | 'service'
  | 'entity'
  | 'partition'
  | 'key'
  | 'purpose'
  | 'kind'
  | 'az'
  | 'num'
  | 'consumer'
  | 'target'
  | 'version'

export interface Segments {
  region?: string
  env?: string
  org?: string
  /**
   * The registered DNS domain for the organisation — e.g. `'acme.com'`, `'acme.io'`.
   * Used as the root zone by DNS resource types (`route53HostedZone`, `route53Record`,
   * `route53PrivateRecord`, `cloudFrontAlias`, `acmCertificate`).
   *
   * Use `.apexMapping()` on the convention instance to derive the effective zone per
   * environment (e.g. prepend `dev.` for non-prod, omit for prod). When no mapping
   * is set, `apex` is used verbatim.
   *
   * Not emitted as a tag by default — it is a naming-only segment.
   */
  apex?: string
  tenant?: string
  domain?: string
  service?: string
  /**
   * Data entity within a domain — e.g. `'transactions'`, `'users'`.
   * Intentionally absent from `DEFAULT_SEGMENT_ORDER`. Only participates in resource types
   * that declare it explicitly in their `segments` list (e.g. `openSearchIndex`). Passing
   * `entity` to any other type has no effect and produces no name output.
   */
  entity?: string
  partition?: string
  key?: string
  /** Functional role of a resource — e.g. `web`, `worker`, `db` */
  purpose?: string
  /** Sub-classification within a type — e.g. `private`/`public` for subnets, `web`/`worker` for EC2 */
  kind?: string
  /** Availability zone suffix — e.g. `1a`, `1b`, `1c` */
  az?: string
  /** Ordinal instance number — e.g. `01`, `02`, `03` */
  num?: string
  /** Consuming service or principal for API keys and similar — e.g. `partner-a` */
  consumer?: string
  /** Target resource or data source — e.g. `user-table`, `events-bus`; or remote org name for VPC peering — e.g. `globex` */
  target?: string
  /** Version identifier for image tags and similar — e.g. `1.2.3`, `latest` */
  version?: string
}

/** Segments extracted by parsing a resource name back through the convention. */
export type ParsedSegments = Partial<Record<SegmentKey, string>>

/** A single resource entry in a tenant provisioning manifest. */
export interface TenantResource {
  type: import('./resource-types.js').ResourceType
  name: string
  arn: string | undefined
  tags: Record<string, string>
}

/** Diff between two tenant manifests — useful for provisioning / deprovisioning. */
export interface TenantManifestDiff {
  added: TenantResource[]
  removed: TenantResource[]
  unchanged: TenantResource[]
}

/** Full set of resources that should be provisioned for a single tenant. */
export interface TenantManifest {
  tenantId: string
  resources: TenantResource[]
  /** Compare against an existing manifest to compute the delta. */
  diff(existing: TenantManifest): TenantManifestDiff
}

/**
 * A declared dependency from one convention's service to specific resource types
 * owned by another convention.
 */
export interface DependencyEdge {
  /** The convention that owns the resources being depended on. */
  owner: unknown // typed as unknown to avoid circular import; cast to DerropsConventions at use-site
  /** The resource types the caller depends on from the owner. */
  resources: import('./resource-types.js').ResourceType[]
}

/** Dependency graph rooted at a convention instance. */
export interface DependencyGraph {
  /** All convention instances reachable (including the root). */
  nodes: unknown[]
  /** Directed edges: `from` depends on `to.owner` for `to.resources`. */
  edges: Array<{ from: unknown; to: DependencyEdge }>
}

/** Result of validating a single resource name against a convention. */
export interface ValidationResult {
  /** Whether the name fully matches the convention (parses cleanly and all known segments agree). */
  valid: boolean
  /** Human-readable error messages when `valid` is false. */
  errors: string[]
  /** Segments extracted from the name. */
  parsed: ParsedSegments
  /** Resource type used for parsing. */
  type: import('./resource-types.js').ResourceType
}

/** Batch lint report from `DerropsConventions.lint()`. */
export interface LintReport {
  passed: ValidationResult[]
  failed: ValidationResult[]
  /** Summary line: `'X/Y passed'` */
  summary: string
}

/**
 * AWS Cost Explorer tag-based filter expression.
 * Pass to `CostExplorer.getCostAndUsage({ Filter: costFilter })`.
 */
export interface CostExplorerTagFilter {
  Tags: {
    Key: string
    Values: string[]
    MatchOptions: string[]
  }
}

/**
 * Logical AND of tag filters for Cost Explorer — one filter per visible segment tag.
 * Pass to `CostExplorer.getCostAndUsage({ Filter: { And: costFilter.And } })`.
 */
export interface CostExplorerFilter {
  And: CostExplorerTagFilter[]
}

/**
 * Controls which segments appear in each naming layer of `s3Resource()`.
 *
 * When a layer array is supplied it *replaces* the default segment list for that layer.
 * Omit a layer to keep the convention default.
 *
 * | Layer    | Default segments                              | Delimiter |
 * | -------- | --------------------------------------------- | --------- |
 * | `bucket` | region, env, org, domain, service (s3Bucket)  | `--`      |
 * | `prefix` | org, domain, service, tenant, partition        | `/`       |
 * | `obj`    | key                                           | `-`       |
 *
 * @example
 * // No redundancy — prefix carries only the date partition
 * c.s3Resource({ partition: '2024/03/15', key: 'log.gz',
 *   layers: { prefix: ['partition'] }
 * })
 *
 * // Custom bucket boundary — org in bucket, domain+service in prefix
 * c.s3Resource({ partition: '2024/03/15', key: 'log.gz',
 *   layers: {
 *     bucket: ['region', 'env', 'org'],
 *     prefix: ['domain', 'service', 'partition'],
 *   }
 * })
 */
export interface S3ResourceLayers {
  /** Segments to include in the bucket name, joined with `--`. */
  bucket?: SegmentKey[]
  /** Segments to include in the key prefix, joined with `/`. */
  prefix?: SegmentKey[]
  /** Segments to include in the object (file) name, joined with `-`. */
  obj?: SegmentKey[]
}

/**
 * A fully-described S3 resource produced by `s3Resource()`.
 *
 * Bundles every reference format (name, URI, ARN, URL) alongside the structured segment
 * breakdown and tags, so callers never need to reassemble pieces from separate calls.
 */
export interface S3Resource {
  // ── Naming layers ──────────────────────────────────────────────────────────
  /** Bucket name — `region--env--org--domain--service`. */
  bucketName: string
  /** Key prefix path, always ending with `/`. Empty string when no prefix segments are set. */
  prefix: string
  /** Object filename (the `key` segment value). Empty string when no key was specified. */
  objectName: string
  /** Full S3 object key — `prefix + objectName`. When no key was given this equals `prefix` without the trailing slash. */
  objectKey: string

  // ── Reference formats ──────────────────────────────────────────────────────
  /** `s3://bucket/objectKey` */
  uri: string
  /** `arn:aws:s3:::bucket/objectKey` */
  arn: string
  /** `https://bucket.s3.region.amazonaws.com/objectKey` (virtual-hosted URL). Region omitted when not set on the convention. */
  url: string

  // ── Segments ───────────────────────────────────────────────────────────────
  /** Layered segment breakdown — `bucket`, `prefix`, `obj`, and merged `all`. */
  segments: ParsedS3Uri

  // ── Tags ───────────────────────────────────────────────────────────────────
  /**
   * Tags suitable for applying to the S3 bucket resource.
   *
   * Includes the standard visible segment tags, all three schema tags
   * (`segment`, `s3-prefix-segment`, `s3-object-name-segment`), and
   * per-layer segment-value tags with the runtime values for this specific
   * resource instance (`segment-values`, `s3-prefix-segment-values`,
   * `s3-object-name-segment-values`).
   */
  tags: Record<string, string>
}

/**
 * Structured result of `parseS3Uri()` — segments differentiated by which S3 layer they came from.
 *
 * `bucket` and `prefix` share org/domain/service (the redundancy is intentional —
 * it shows exactly what each layer contributed). `all` is the convenience merge.
 */
export interface ParsedS3Uri {
  /** Segments extracted from the bucket name (region, env, org, domain, service). */
  bucket: ParsedSegments
  /** Segments extracted from the key prefix path (org, domain, service, [tenant], [partition]). */
  prefix: ParsedSegments
  /** Segments extracted from the object filename ([key]). */
  obj: ParsedSegments
  /** All segments merged — bucket + prefix + obj. */
  all: ParsedSegments
}

/** Maps a subset of segment keys to narrowed string literal unions. */
export type SegmentConstraints = Partial<Record<SegmentKey, string>>

/**
 * Resolves the segment interface for a given constraint map `C`.
 * Keys present in `C` are narrowed to their literal union; all other keys remain `string`.
 */
export type ConstrainedSegments<C extends SegmentConstraints> = {
  [K in SegmentKey]?: K extends keyof C ? C[K] : string
}

/** ARN construction metadata for a resource type. */
export interface ArnConfig {
  /** IAM/ARN service identifier: `'s3'`, `'lambda'`, `'dynamodb'`, `'iam'`, etc. */
  service: string
  /** Whether the ARN includes the region component (false for IAM, S3 bucket-level, CloudFront). */
  includeRegion: boolean
  /** Whether the ARN includes the account-id component (false for S3 bucket-level ARNs only). */
  includeAccount: boolean
  /** Resource type prefix in the ARN resource component, e.g. `'function:'`, `'table/'`, `'role'`. When undefined the name is appended directly. */
  resourcePrefix?: string
  /** Literal suffix appended after the resource name, e.g. `'/index/*'` for GSI wildcard policies. */
  resourceSuffix?: string
  /**
   * When set, policy generation emits TWO ARN entries: the base ARN and the base ARN with this
   * suffix appended. Used for S3 buckets where bucket-level actions (`s3:ListBucket`) target
   * `arn:aws:s3:::bucket` and object-level actions (`s3:GetObject`) target `arn:aws:s3:::bucket/*`.
   */
  policyResourceSuffix?: string
  /**
   * When set, this string is stripped from the end of the resource name before ARN construction.
   * Used for `dynamoDbGsi` where the `--gsi` naming suffix must not appear in the table ARN.
   */
  stripSuffix?: string
}

/** Named permission tiers for IAM policy generation. Actions per tier are defined on each resource type. */
export type PermissionLevel = 'read' | 'readWrite' | 'manage'

/** Curated IAM action sets for each permission tier. Defined per resource type via `ResourceTypeConfig.permissions`. */
export interface ResourcePermissions {
  /** Minimal read-only actions, e.g. `['s3:Get*', 's3:List*']`. */
  read?: string[]
  /** Read + write/mutate actions. */
  readWrite?: string[]
  /** Full control — always `['<service>:*']`. */
  manage?: string[]
}

export interface ResourceTypeConfig {
  /** Whether the resource exists in a global namespace and needs region/env for uniqueness */
  global: boolean
  /** Delimiter between naming segments (e.g. `--`, `/`, `.`) */
  segmentDelimiter: string
  /** Delimiter between words within a single segment value (e.g. `-`, `_`) */
  wordDelimiter: string
  /** Explicit ordered list of segments to include — overrides the global/instance order logic */
  segments?: SegmentKey[]
  /** Prepend the segment delimiter at the start of the name (e.g. SSM `/acme/...`) */
  leadingDelimiter?: boolean
  /** Literal string prepended to the joined name (before suffix). Used for wildcard DNS records: `'*.'` */
  namePrefix?: string
  /** Literal string appended after all segments are joined, e.g. `'--gsi'`, `'.fifo'`, `'-rule'` */
  suffix?: string
  /** IAM action prefix for this resource type, e.g. `'s3'`, `'lambda'`. */
  iamService?: string
  /** ARN construction metadata. Omit for sub-resources and purely naming helpers. */
  arn?: ArnConfig
  /** Curated IAM action sets per permission tier. Defined when `arn` is also set. */
  permissions?: ResourcePermissions
  /**
   * AWS Console product label for this resource type — used as the type discriminator in the
   * `dns` field returned by `DerropsConventions.resource()`. Follows the AWS Console name
   * (e.g. `'dynamodb'`, `'lambda'`, `'ecs-cluster'`, `'cloudwatch-logs'`).
   * Set on types that have `arn` defined; omit for naming helpers and sub-resources.
   */
  consoleLabel?: string
}
