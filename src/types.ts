export type SegmentKey = 'region' | 'env' | 'org' | 'tenant' | 'domain' | 'service' | 'partition' | 'key'

export interface Segments {
  region?: string
  env?: string
  org?: string
  tenant?: string
  domain?: string
  service?: string
  partition?: string
  key?: string
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
}

