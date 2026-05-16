import type { ResourceTypeConfig } from '../types.js'
import type { ResourceType } from '../resource-types.js'
import type { GrantDescriptor } from './types.js'

/**
 * A fully-resolved resource descriptor returned by `DerropsConventions.resource()`.
 *
 * Carries the generated name, pre-computed ARNs, resource type, and tags.
 * Use `.read()`, `.write()`, `.manage()`, or `.raw()` to produce `GrantDescriptor` objects
 * for `PolicyBuilder.allow()` / `.deny()`.
 */
export interface Resource<T extends ResourceType = ResourceType> {
  /** The generated name string — identical to what `DerropsConventions.name()` returns. */
  readonly name: string
  /** The base ARN for this resource. `undefined` for naming-only resource types with no ARN configuration. */
  readonly arn: string | undefined
  /**
   * All ARNs needed for the IAM `Resource` field. Usually `[arn]`, but two entries for types
   * that emit a `policyResourceSuffix` (e.g. S3 buckets emit `bucket` + `bucket/*`).
   */
  readonly arns: string[]
  readonly type: T
  /** AWS resource tags from the convention's segment defaults. */
  readonly tags: Record<string, string>
  /**
   * The segment key-value pairs that actually contributed to this resource's name, in name order.
   * Use this to reliably identify which dimensions are encoded in the name.
   */
  readonly segments: Record<string, string>
  /**
   * PascalCase CDK construct ID derived from the resource name.
   *
   * Converts the `--`-delimited name to PascalCase by splitting on any run of
   * non-alphanumeric characters and capitalising the first letter of each word.
   * Suitable for use as a CDK construct ID or CloudFormation logical resource ID.
   *
   * @example
   * resource({ type: 'dynamoDb', key: 'orders' }).logicalId
   * // 'DerropsPlatformApiOrders'
   *
   * // Scope the convention instance for shorter IDs:
   * svcConvention.with({ org: undefined, domain: undefined })
   *   .resource({ type: 'dynamoDb', key: 'orders' }).logicalId
   * // 'ApiOrders'
   */
  readonly logicalId: string

  /**
   * The FQDN this resource would be addressable at in DNS, if `apex` is configured on the
   * convention instance. Format: `{key}.{service}.{console-label}.{zone}` — the resource type
   * label prevents collisions between resources of the same name but different types.
   * `undefined` when no `apex`/zone is set, or for resource types without a `consoleLabel`.
   */
  readonly dns: string | undefined

  /**
   * Deep-link URL to this resource in the AWS Console.
   * `undefined` for resource types without a well-known console URL pattern,
   * or when `region`/`accountId` are not available.
   */
  readonly console: string | undefined

  /** Read-only access — maps to the resource type's `read` permission tier. */
  read(): GrantDescriptor

  /** Read + write access — maps to the resource type's `readWrite` permission tier. */
  write(): GrantDescriptor

  /** Full control — maps to the resource type's `manage` permission tier. */
  manage(): GrantDescriptor

  /** Explicit action list — bypasses tier lookup. Use for custom subsets or service-wildcard grants. */
  raw(...actions: string[]): GrantDescriptor

  /**
   * Call `fn(key, value)` for every tag on this resource.
   *
   * @example
   * resources.userpool.applyTags((k, v) => Tags.of(this).add(k, v))
   */
  applyTags(fn: (key: string, value: string) => void): void
}

export class ResourceImpl<T extends ResourceType> implements Resource<T> {
  readonly name: string
  readonly arn: string | undefined
  readonly arns: string[]
  readonly type: T
  readonly tags: Record<string, string>
  readonly segments: Record<string, string>
  readonly dns: string | undefined
  readonly console: string | undefined
  private readonly config: ResourceTypeConfig
  private readonly logicalName: string

  constructor(
    name: string,
    logicalName: string,
    arns: string[],
    type: T,
    tags: Record<string, string>,
    config: ResourceTypeConfig,
    dns: string | undefined,
    consoleUrl: string | undefined,
    segments: Record<string, string>,
  ) {
    this.name = name
    this.logicalName = logicalName
    this.arn = arns[0]
    this.arns = arns
    this.type = type
    this.tags = tags
    this.segments = segments
    this.config = config
    this.dns = dns
    this.console = consoleUrl
  }

  read(): GrantDescriptor {
    const actions = this.config.permissions?.read
    if (!actions?.length) {
      throw new Error(`Resource type "${this.type}" has no read permission tier defined.`)
    }
    return { arns: this.arns, actions }
  }

  write(): GrantDescriptor {
    const actions = this.config.permissions?.readWrite
    if (!actions?.length) {
      throw new Error(
        `Resource type "${this.type}" has no readWrite permission tier defined. ` +
          `Use .raw(...actions) to specify actions explicitly.`,
      )
    }
    return { arns: this.arns, actions }
  }

  manage(): GrantDescriptor {
    const actions = this.config.permissions?.manage
    if (!actions?.length) {
      throw new Error(`Resource type "${this.type}" has no manage permission tier defined.`)
    }
    return { arns: this.arns, actions }
  }

  raw(...actions: string[]): GrantDescriptor {
    if (actions.length === 0) {
      throw new Error(`.raw() requires at least one action string.`)
    }
    return { arns: this.arns, actions }
  }

  applyTags(fn: (key: string, value: string) => void): void {
    for (const [k, v] of Object.entries(this.tags)) {
      fn(k, v)
    }
  }

  get logicalId(): string {
    const base = this.logicalName
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')
    return this.config.localId ? `${base}${this.config.localId}` : base
  }
}

/**
 * A paired SQS queue and dead-letter queue returned by `DerropsConventions.sqsPair()`.
 *
 * Both resources share the same naming segments; the DLQ name is the queue name + `--dlq`.
 * Use `queue` and `dlq` as full `Resource` objects for IAM policy generation, CDK construct IDs,
 * and ARN references. `redrivePolicyArn` is a convenience alias for `dlq.arn`.
 */
export interface SqsPair {
  /** The main SQS queue resource. */
  readonly queue: Resource
  /** The dead-letter queue resource — name is queue name + `--dlq`. */
  readonly dlq: Resource
  /**
   * ARN of the DLQ — convenience alias for `dlq.arn`.
   * Pass directly to CDK `redrivePolicy` or CloudFormation `RedrivePolicy`.
   */
  readonly redrivePolicyArn: string
}
