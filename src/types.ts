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

