import type { Segments } from './types.js'
import type { ResourceType } from './resource-types.js'
import type { Resource } from './policy/Resource.js'
import type { TagKey, TagKeyCasing, DimensionKey } from './conventions-types.js'

/**
 * Minimal interface consumed by domain modules (s3.ts, cloudwatch.ts, etc.).
 *
 * `DerropsConventions` satisfies this interface via a small set of getter methods.
 * Domain files import this type and accept it as their first argument, keeping them
 * decoupled from the concrete class.
 */
export interface ConventionsContext {
  /** Resolved segment defaults for this instance. */
  segments(): Readonly<Segments>

  /** The stored ARN context, if set via `.arnContext()`. */
  arnContextValue(): { accountId: string; partition?: string } | undefined

  /** Generate a resource name. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  name(options: Record<string, any>): string

  /**
   * Return the key-value pairs of segments that actually contributed to the name for the
   * given options, in the order they appear in the name.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  namedSegments(options: Record<string, any>): Record<string, string>

  /** Generate AWS resource tags. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tags(options?: Record<string, any>): Record<string, string>

  /** Generate a named resource descriptor with ARNs and grant methods. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resource(options: Record<string, any>): Resource<ResourceType>

  /** Return a new instance with additional segment defaults merged in. */
  for(segments: Partial<Segments>): ConventionsContext

  /** @internal Accessor for the dependency graph traversal in dependencies.ts. */
  _getDeps(): Array<{ owner: ConventionsContext; resources: ResourceType[] }>

  /** The string prepended to every tag key (may be empty). */
  tagKeyPrefix(): string

  /** The casing applied to tag keys. */
  tagCasing(): TagKeyCasing

  /** The tag keys currently enabled for output. */
  visibleTagKeys(): readonly TagKey[]

  /** The CloudWatch dimension keys currently enabled for output. */
  visibleDimensionKeys(): readonly DimensionKey[]

  /** The default resource type set via `.with({ type })`, if any. */
  defaultResourceType(): ResourceType | undefined

  /** Resolve the effective apex/DNS zone from a merged segment set. */
  resolveApex(merged: Segments): string | undefined

  /**
   * Resolve the ARN context (accountId, region, partition) for this instance.
   * Throws if no accountId has been set.
   * @internal Used by iam.ts domain module.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveArnCtx(
    override?: Partial<import('./policy/types.js').ArnContext>,
  ): import('./policy/types.js').ArnContext
}
