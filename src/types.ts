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
}
