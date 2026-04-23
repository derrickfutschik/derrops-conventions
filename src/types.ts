export type SegmentKey =
  | 'region'
  | 'env'
  | 'org'
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
  tenant?: string
  domain?: string
  service?: string
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
  /** Target resource or data source — e.g. `user-table`, `events-bus` */
  target?: string
  /** Version identifier for image tags and similar — e.g. `1.2.3`, `latest` */
  version?: string
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
  /** Literal string appended after all segments are joined, e.g. `'--gsi'`, `'.fifo'`, `'-rule'` */
  suffix?: string
  /** IAM action prefix for this resource type, e.g. `'s3'`, `'lambda'`. */
  iamService?: string
  /** ARN construction metadata. Omit for sub-resources and purely naming helpers. */
  arn?: ArnConfig
  /** Curated IAM action sets per permission tier. Defined when `arn` is also set. */
  permissions?: ResourcePermissions
}
