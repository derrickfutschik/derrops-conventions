import type { Segments, SegmentKey, ParsedSegments, S3Resource } from './types.js'
import type { ResourceType } from './resource-types.js'
import { DerropsConventions } from './DerropsConventions.js'

export class Namespace<T extends Partial<Segments> = Partial<Segments>> {
  /** All accumulated segment values from root to this level. */
  readonly segments: T

  /**
   * Only the segment keys+values added at THIS level (not inherited from parent).
   * Use these keys to derive layer boundaries for s3Resource({ layers }) or similar.
   *
   * @example
   * const prefixNs = bucketNs.child({ tenant: 't-abc123', partition: '2024/01/15' })
   * Object.keys(prefixNs.ownSegments) // → ['tenant', 'partition']
   */
  readonly ownSegments: Partial<Segments>

  constructor(segments: T, ownSegments: Partial<Segments>) {
    this.segments = segments
    this.ownSegments = ownSegments
  }

  /**
   * Add segments for the next namespace level.
   *
   * TypeScript rejects any segment key already present in `T` — each segment may be
   * specified at exactly one level in the hierarchy.
   * At runtime, throws if a duplicate key is detected.
   */
  child<TNew extends { [K in Exclude<SegmentKey, keyof T>]?: string }>(
    newSegments: TNew,
  ): Namespace<T & TNew> {
    const existingKeys = Object.keys(this.segments)
    for (const key of Object.keys(newSegments)) {
      if (existingKeys.includes(key)) {
        throw new Error(
          `Namespace.child(): segment '${key}' is already defined in an ancestor namespace`,
        )
      }
    }
    return new Namespace(
      { ...this.segments, ...newSegments } as T & TNew,
      newSegments as Partial<Segments>,
    )
  }

  /**
   * Generate a resource name using ALL accumulated segments.
   * The resource type's own `segments` config determines which of those appear in the output.
   * Per-call overrides merge on top of accumulated values.
   */
  name(options: { type: ResourceType } & Partial<Segments>): string {
    return new DerropsConventions(this.segments as Segments).name(options)
  }

  /**
   * Parse a name string back into its segment values.
   * Uses the accumulated segment defaults as validation context.
   */
  parse(name: string, options: { type: ResourceType }): ParsedSegments {
    return new DerropsConventions(this.segments as Segments).parse(name, options)
  }

  /**
   * Returns a `DerropsConventions` instance with all accumulated segments as defaults.
   *
   * Use for IAM policy generation, tags, `s3Resource()`, and all other `DerropsConventions`
   * features that aren't directly exposed on `Namespace`.
   */
  toConventions(): DerropsConventions {
    return new DerropsConventions(this.segments as Segments)
  }
}

/**
 * Create a root namespace from the given segment values.
 *
 * @example
 * const bucketNs = namespace({ region: 'ap-southeast-2', env: 'prod', org: 'derrops', domain: 'oaspec', service: 'storage' })
 * const prefixNs = bucketNs.child({ tenant: 't-abc123', partition: '2024/01/15' })
 * const objectNs = prefixNs.child({ key: 'request-log.gz' })
 *
 * bucketNs.name({ type: 's3Bucket' })    // → 'ap-southeast-2--prod--derrops--oaspec--storage'
 * prefixNs.name({ type: 's3KeyPrefix' }) // → 'derrops/oaspec/storage/t-abc123/2024/01/15/'
 * objectNs.name({ type: 's3ObjectKey' }) // → 'request-log.gz'
 */
export function namespace<T extends Partial<Segments>>(segments: T): Namespace<T> {
  return new Namespace(segments, segments as Partial<Segments>)
}

/**
 * Build a full `S3Resource` from three namespace levels, deriving each layer's segments
 * from the namespace's `ownSegments`. This ensures the prefix contains only its own
 * keys (e.g. tenant/partition) and does not repeat the bucket's segments (org/domain/service).
 *
 * @example
 * const s3 = s3NamespaceResource(bucketNs, prefixNs, objectNs)
 * s3.bucketName  // → 'ap-southeast-2--prod--derrops--oaspec--storage'
 * s3.prefix      // → 't-abc123/2024/01/15/'
 * s3.objectName  // → 'request-log.gz'
 * s3.uri         // → 's3://ap-southeast-2--prod--derrops--oaspec--storage/t-abc123/2024/01/15/request-log.gz'
 * s3.segments    // → { bucket: { region, env, org, domain, service }, prefix: { tenant, partition }, obj: { key }, all: {...} }
 */
export function s3NamespaceResource(
  bucketNs: Namespace<any>,
  prefixNs: Namespace<any>,
  objNs: Namespace<any>,
): S3Resource {
  // buildS3Resource reads `key` and `partition` from the options object rather than
  // ctx.segments(), so we must pass them explicitly from the accumulated segments.
  const allSegs = objNs.segments as Partial<Segments>
  return objNs.toConventions().s3Resource({
    ...(allSegs.key !== undefined && { key: allSegs.key }),
    ...(allSegs.partition !== undefined && { partition: allSegs.partition }),
    layers: {
      bucket: Object.keys(bucketNs.ownSegments) as SegmentKey[],
      prefix: Object.keys(prefixNs.ownSegments) as SegmentKey[],
      obj: Object.keys(objNs.ownSegments) as SegmentKey[],
    },
  })
}
