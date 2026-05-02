import type {
  SegmentKey,
  Segments,
  S3Resource,
  S3ResourceLayers,
  ParsedSegments,
  ParsedS3Uri,
} from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import {
  parseDatePartition,
  splitS3Uri,
  parseResourceName,
  parseSegmentValues,
  findTagByName,
} from './parsing.js'
import { normalize, applyTagKeyCasing } from './conventions-constants.js'
import type { DatePartitionGranularity } from './conventions-types.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildS3Prefix(
  ctx: ConventionsContext,
  options: {
    date?: Date
    granularity?: DatePartitionGranularity
    tenant?: string
    partition?: string
  } = {},
): string {
  const { date, granularity, tenant, partition: rawPartition } = options
  const partition =
    date !== undefined && granularity !== undefined
      ? parseDatePartition(date, granularity)
      : rawPartition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = ctx.name({
    type: 's3LogKey',
    ...(tenant !== undefined && { tenant }),
    ...(partition !== undefined && { partition }),
  } as any)
  return base.endsWith('/') ? base : `${base}/`
}

export function buildS3Resource(
  ctx: ConventionsContext,
  options: {
    key?: string
    date?: Date
    granularity?: DatePartitionGranularity
    partition?: string
    tenant?: string
    layers?: S3ResourceLayers
  } = {},
): S3Resource {
  const { key, date, granularity, partition: rawPartition, tenant, layers } = options
  const segs = ctx.segments()

  const partition =
    date !== undefined && granularity !== undefined
      ? parseDatePartition(date, granularity)
      : rawPartition

  const resolvedTenant = tenant ?? segs.tenant

  const pool: Partial<Record<SegmentKey, string>> = {
    region: segs.region,
    env: segs.env,
    org: segs.org,
    apex: segs.apex,
    domain: segs.domain,
    service: segs.service,
    entity: segs.entity,
    tenant: resolvedTenant,
    partition,
    key,
    purpose: segs.purpose,
    kind: segs.kind,
    az: segs.az,
    num: segs.num,
    consumer: segs.consumer,
    target: segs.target,
    version: segs.version,
  }

  const pick = (segKeys: SegmentKey[]): string[] =>
    segKeys.map((k) => pool[k]).filter((v): v is string => v !== undefined && v !== '')

  const segsOf = (segKeys: SegmentKey[]): ParsedSegments =>
    Object.fromEntries(
      segKeys.filter((k) => pool[k] !== undefined).map((k) => [k, pool[k]]),
    ) as ParsedSegments

  // ── Bucket layer ──────────────────────────────────────────────────────────────
  let bucketName: string
  let bucketSegs: ParsedSegments

  if (layers?.bucket) {
    bucketName = pick(layers.bucket)
      .map((v) => normalize(v, '-'))
      .join('--')
    bucketSegs = segsOf(layers.bucket)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bucketName = ctx.name({ type: 's3Bucket' } as any)
    bucketSegs = segsOf(['region', 'env', 'org', 'domain', 'service'])
  }

  // ── Prefix layer ──────────────────────────────────────────────────────────────
  const prefixSegKeys: SegmentKey[] =
    layers?.prefix ?? (RESOURCE_TYPES['s3KeyPrefix'].segments as SegmentKey[])
  const prefixParts = pick(prefixSegKeys).map((v) => normalize(v, '-'))
  const prefixBase = prefixParts.join('/')
  const prefix = prefixBase ? `${prefixBase}/` : ''
  const prefixSegs = segsOf(prefixSegKeys)

  // ── Object layer ──────────────────────────────────────────────────────────────
  const objSegKeys: SegmentKey[] = layers?.obj ?? ['key']
  const objParts = pick(objSegKeys).map((v) => normalize(v, '-'))
  const objectName = objParts.join('-')
  const objSegs = segsOf(objSegKeys)

  // ── Compose key and reference formats ─────────────────────────────────────────
  const objectKey = objectName ? `${prefix}${objectName}` : prefixBase

  const region = segs.region
  const uri = `s3://${bucketName}/${objectKey}`
  const arn = `arn:aws:s3:::${bucketName}/${objectKey}`
  const url = region
    ? `https://${bucketName}.s3.${region}.amazonaws.com/${objectKey}`
    : `https://${bucketName}.s3.amazonaws.com/${objectKey}`

  const segments: ParsedS3Uri = {
    bucket: bucketSegs,
    prefix: prefixSegs,
    obj: objSegs,
    all: { ...bucketSegs, ...prefixSegs, ...objSegs },
  }

  // ── Tags ──────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tags: Record<string, string> = { ...ctx.tags({ type: 's3Bucket' } as any) }

  const layerValues = (s: ParsedSegments): string =>
    Object.entries(s)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')

  const prefix_ = ctx.tagKeyPrefix()
  const casing = ctx.tagCasing()
  const bv = layerValues(bucketSegs)
  const pv = layerValues(prefixSegs)
  const ov = layerValues(objSegs)

  if (bv) tags[prefix_ + applyTagKeyCasing('segment-values', casing)] = bv
  if (pv) tags[prefix_ + applyTagKeyCasing('s3-prefix-segment-values', casing)] = pv
  if (ov) tags[prefix_ + applyTagKeyCasing('s3-object-name-segment-values', casing)] = ov

  return { bucketName, prefix, objectName, objectKey, uri, arn, url, segments, tags }
}

// ── Instance S3 key and URI parsing ───────────────────────────────────────────

export function parseS3KeyFromDefaults(
  key: string,
  defaults: Readonly<Segments>,
  options?: { tenant?: string },
): ParsedSegments {
  const result: ParsedSegments = {}
  let remainder = key

  const stripSegment = (label: keyof Segments, value: string): void => {
    if (remainder.startsWith(value + '/')) {
      result[label] = value
      remainder = remainder.slice(value.length + 1)
    } else if (remainder === value) {
      result[label] = value
      remainder = ''
    } else {
      throw new Error(
        `parseS3Key(): key does not match expected ${label} prefix "${value}/" — got "${remainder}"`,
      )
    }
  }

  if (defaults.org) stripSegment('org', defaults.org)
  if (defaults.domain) stripSegment('domain', defaults.domain)
  if (defaults.service) stripSegment('service', defaults.service)

  const tenant = options?.tenant ?? defaults.tenant
  if (tenant && remainder.startsWith(tenant + '/')) {
    result.tenant = tenant
    remainder = remainder.slice(tenant.length + 1)
  }

  if (!remainder) return result

  const isPrefix = remainder.endsWith('/')
  if (isPrefix) remainder = remainder.slice(0, -1)
  if (!remainder) return result

  if (isPrefix) {
    result.partition = remainder
  } else {
    const lastSlash = remainder.lastIndexOf('/')
    if (lastSlash === -1) {
      result.key = remainder
    } else {
      result.partition = remainder.slice(0, lastSlash)
      result.key = remainder.slice(lastSlash + 1)
    }
  }

  return result
}

export function parseS3UriStatic(
  uri: string,
  options: { tags?: Record<string, string> } | undefined,
  createForSegments: (segments: Segments) => {
    parseS3Key(key: string, opts?: { tenant?: string }): ParsedSegments
  },
): ParsedS3Uri {
  const { bucket: bucketName, key: objectKey } = splitS3Uri(uri)
  const bucketSegments = parseResourceName(bucketName, 's3Bucket', options)

  if (!objectKey) {
    return { bucket: bucketSegments, prefix: {}, obj: {}, all: { ...bucketSegments } }
  }

  const prefixValTag = options?.tags
    ? findTagByName(options.tags, 's3-prefix-segment-values')
    : undefined
  const objValTag = options?.tags
    ? findTagByName(options.tags, 's3-object-name-segment-values')
    : undefined

  if (prefixValTag !== undefined || objValTag !== undefined) {
    const prefixSegments = prefixValTag ? parseSegmentValues(prefixValTag) : {}
    const objSegments = objValTag ? parseSegmentValues(objValTag) : {}
    return {
      bucket: bucketSegments,
      prefix: prefixSegments,
      obj: objSegments,
      all: { ...bucketSegments, ...prefixSegments, ...objSegments },
    }
  }

  const tempInst = createForSegments(bucketSegments as Segments)
  let prefixSegments: ParsedSegments
  let objSegments: ParsedSegments
  try {
    const keyResult = tempInst.parseS3Key(objectKey)
    const { key, ...prefixOnly } = keyResult
    prefixSegments = prefixOnly
    objSegments = key !== undefined ? { key } : {}
  } catch {
    const isPrefix = objectKey.endsWith('/')
    const clean = isPrefix ? objectKey.slice(0, -1) : objectKey
    const lastSlash = clean.lastIndexOf('/')
    if (isPrefix) {
      prefixSegments = clean ? { partition: clean } : {}
      objSegments = {}
    } else if (lastSlash === -1) {
      prefixSegments = {}
      objSegments = { key: clean }
    } else {
      prefixSegments = { partition: clean.slice(0, lastSlash) }
      objSegments = { key: clean.slice(lastSlash + 1) }
    }
  }

  return {
    bucket: bucketSegments,
    prefix: prefixSegments,
    obj: objSegments,
    all: { ...bucketSegments, ...prefixSegments, ...objSegments },
  }
}

export function parseS3UriFromDefaults(
  uri: string,
  defaults: Readonly<Segments>,
  options?: { tags?: Record<string, string> },
): ParsedS3Uri {
  const { bucket: bucketName, key: objectKey } = splitS3Uri(uri)
  const bucketSegments = parseResourceName(bucketName, 's3Bucket', options)

  for (const [key, knownValue] of Object.entries(defaults) as [keyof Segments, string][]) {
    const parsedValue = bucketSegments[key as SegmentKey]
    if (parsedValue !== undefined && parsedValue !== knownValue) {
      throw new Error(
        `parseS3Uri(): segment "${key}" in URI is "${parsedValue}" but instance default is "${knownValue}"`,
      )
    }
  }

  if (!objectKey) {
    return { bucket: bucketSegments, prefix: {}, obj: {}, all: { ...bucketSegments } }
  }

  const prefixValTag = options?.tags
    ? findTagByName(options.tags, 's3-prefix-segment-values')
    : undefined
  const objValTag = options?.tags
    ? findTagByName(options.tags, 's3-object-name-segment-values')
    : undefined

  let prefixSegments: ParsedSegments
  let objSegments: ParsedSegments

  if (prefixValTag !== undefined || objValTag !== undefined) {
    prefixSegments = prefixValTag ? parseSegmentValues(prefixValTag) : {}
    objSegments = objValTag ? parseSegmentValues(objValTag) : {}
  } else {
    const keyResult = parseS3KeyFromDefaults(objectKey, defaults)
    const { key, ...prefixOnly } = keyResult
    prefixSegments = prefixOnly
    objSegments = key !== undefined ? { key } : {}
  }

  return {
    bucket: bucketSegments,
    prefix: prefixSegments,
    obj: objSegments,
    all: { ...bucketSegments, ...prefixSegments, ...objSegments },
  }
}
