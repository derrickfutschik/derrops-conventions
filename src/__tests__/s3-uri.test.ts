import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

// ── Shared fixture ─────────────────────────────────────────────────────────────
// A fully-configured convention representing the derrops org, logs domain, ingest service.
// Used across multiple test groups to produce consistent names and tags.
const makeConv = () =>
  new DerropsConventions({
    org: 'acme',
    domain: 'logs',
    service: 'ingest',
    env: 'prod',
    region: 'ap-southeast-2',
  })
    .tagPrefix('derrops:')
    .tagKeys('org', 'domain', 'service', 'environment')

describe('DerropsConventions — S3 URI convention', () => {
  // ── Schema tags on s3Bucket ──────────────────────────────────────────────────

  describe('tags({ type: "s3Bucket" }) — schema tags', () => {
    it('includes s3-prefix-segment with the full key template', () => {
      const c = makeConv()
      expect(c.tags({ type: 's3Bucket' })).toMatchObject({
        'derrops:s3-prefix-segment': 'org/domain/service/tenant/partition',
      })
    })

    it('includes s3-object-name-segment with "key"', () => {
      const c = makeConv()
      expect(c.tags({ type: 's3Bucket' })).toMatchObject({
        'derrops:s3-object-name-segment': 'key',
      })
    })

    it('s3-prefix-segment is always the full template regardless of which segments are set', () => {
      // Even if tenant is not set on the instance, the template shows it
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(c.tags({ type: 's3Bucket' })['s3-prefix-segment']).toBe(
        'org/domain/service/tenant/partition',
      )
    })

    it('schema tags are absent for non-bucket types', () => {
      const c = makeConv()
      const tags = c.tags({ type: 'lambdaFunction' })
      expect(tags).not.toHaveProperty('derrops:s3-prefix-segment')
      expect(tags).not.toHaveProperty('derrops:s3-object-name-segment')
    })

    it('schema tags absent when no type is passed', () => {
      const c = makeConv()
      const tags = c.tags()
      expect(tags).not.toHaveProperty('derrops:s3-prefix-segment')
      expect(tags).not.toHaveProperty('derrops:s3-object-name-segment')
    })

    it('schema tag keys respect tagPrefix', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
      }).tagPrefix('myapp:')
      const tags = c.tags({ type: 's3Bucket' })
      expect(tags).toHaveProperty('myapp:s3-prefix-segment')
      expect(tags).toHaveProperty('myapp:s3-object-name-segment')
    })

    it('schema tag keys respect pascal tagKeyCasing', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
      }).tagKeyCasing('pascal')
      const tags = c.tags({ type: 's3Bucket' })
      expect(tags).toHaveProperty('S3PrefixSegment')
      expect(tags).toHaveProperty('S3ObjectNameSegment')
    })

    it('all three segment tags are present together', () => {
      const c = makeConv()
      const tags = c.tags({ type: 's3Bucket' })
      expect(tags).toHaveProperty('derrops:segment') // bucket name convention
      expect(tags).toHaveProperty('derrops:s3-prefix-segment') // prefix convention
      expect(tags).toHaveProperty('derrops:s3-object-name-segment') // object name convention
    })

    it('three tags encode the full naming contract for the URI', () => {
      const c = makeConv()
      const tags = c.tags({ type: 's3Bucket' })
      // bucket name: region--env--org--domain--service
      expect(tags['derrops:segment']).toBe('region--env--org--domain--service')
      // prefix:      org/domain/service/tenant/partition
      expect(tags['derrops:s3-prefix-segment']).toBe('org/domain/service/tenant/partition')
      // object name: key
      expect(tags['derrops:s3-object-name-segment']).toBe('key')
    })
  })

  // ── Static parseS3Uri — URI formats ─────────────────────────────────────────

  describe('DerropsConventions.parseS3Uri() — URI format handling', () => {
    const bucket = 'ap-southeast-2--prod--acme--logs--ingest'
    const objectKey = 'acme/logs/ingest/2024/03/15/14/log.gz'

    it('parses s3:// scheme', () => {
      const result = DerropsConventions.parseS3Uri(`s3://${bucket}/${objectKey}`)
      expect(result.bucket.region).toBe('ap-southeast-2')
      expect(result.bucket.org).toBe('acme')
    })

    it('parses arn:aws:s3::: scheme', () => {
      const result = DerropsConventions.parseS3Uri(`arn:aws:s3:::${bucket}/${objectKey}`)
      expect(result.bucket.region).toBe('ap-southeast-2')
      expect(result.bucket.env).toBe('prod')
    })

    it('returns empty prefix and obj for bucket-only URI (no slash)', () => {
      const result = DerropsConventions.parseS3Uri(`s3://${bucket}`)
      expect(result.bucket.org).toBe('acme')
      expect(result.prefix).toEqual({})
      expect(result.obj).toEqual({})
    })

    it('returns empty prefix and obj for bucket-only URI (trailing slash)', () => {
      const result = DerropsConventions.parseS3Uri(`s3://${bucket}/`)
      expect(result.bucket.org).toBe('acme')
      // A bare trailing slash means no key — prefix and obj empty
      expect(result.prefix).toEqual({})
      expect(result.obj).toEqual({})
    })

    it('throws on an unrecognised scheme', () => {
      expect(() => DerropsConventions.parseS3Uri('https://bucket/key')).toThrow(
        /unsupported URI scheme/,
      )
    })
  })

  // ── Static parseS3Uri — layer structure ─────────────────────────────────────

  describe('DerropsConventions.parseS3Uri() — result layers', () => {
    it('bucket layer contains region, env, org, domain, service', () => {
      const result = DerropsConventions.parseS3Uri(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/file.gz',
      )
      expect(result.bucket).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
      })
    })

    it('prefix layer contains org, domain, service, partition — no key', () => {
      const result = DerropsConventions.parseS3Uri(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/file.gz',
      )
      expect(result.prefix.org).toBe('acme')
      expect(result.prefix.domain).toBe('logs')
      expect(result.prefix.service).toBe('ingest')
      expect(result.prefix.partition).toBe('2024/03')
      expect(result.prefix).not.toHaveProperty('key')
      expect(result.prefix).not.toHaveProperty('region')
      expect(result.prefix).not.toHaveProperty('env')
    })

    it('obj layer contains only key', () => {
      const result = DerropsConventions.parseS3Uri(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/file.gz',
      )
      expect(result.obj).toEqual({ key: 'file.gz' })
    })

    it('all layer is the complete merged view', () => {
      const result = DerropsConventions.parseS3Uri(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/file.gz',
      )
      expect(result.all).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03',
        key: 'file.gz',
      })
    })

    it('bucket and prefix share org/domain/service (intentional redundancy)', () => {
      const result = DerropsConventions.parseS3Uri(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/log.gz',
      )
      expect(result.bucket.org).toBe(result.prefix.org)
      expect(result.bucket.domain).toBe(result.prefix.domain)
      expect(result.bucket.service).toBe(result.prefix.service)
    })
  })

  // ── Time-partitioned log scenarios ──────────────────────────────────────────

  describe('DerropsConventions.parseS3Uri() — time-partitioned logs', () => {
    const bucket = 'ap-southeast-2--prod--acme--logs--ingest'

    it('hour partition: partition = year/month/day/hour', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/logs/ingest/2024/03/15/14/access.log.gz`,
      )
      expect(result.prefix.partition).toBe('2024/03/15/14')
      expect(result.obj.key).toBe('access.log.gz')
    })

    it('day partition: partition = year/month/day', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/logs/ingest/2024/03/15/access.log.gz`,
      )
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj.key).toBe('access.log.gz')
    })

    it('month partition: partition = year/month', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/logs/ingest/2024/03/summary.gz`,
      )
      expect(result.prefix.partition).toBe('2024/03')
      expect(result.obj.key).toBe('summary.gz')
    })

    it('year partition: partition = year', () => {
      const result = DerropsConventions.parseS3Uri(`s3://${bucket}/acme/logs/ingest/2024/annual.gz`)
      expect(result.prefix.partition).toBe('2024')
      expect(result.obj.key).toBe('annual.gz')
    })

    it('no partition: object directly under service prefix', () => {
      const result = DerropsConventions.parseS3Uri(`s3://${bucket}/acme/logs/ingest/schema.json`)
      expect(result.prefix).not.toHaveProperty('partition')
      expect(result.obj.key).toBe('schema.json')
    })

    it('prefix URI (trailing slash): partition present, obj empty', () => {
      const result = DerropsConventions.parseS3Uri(`s3://${bucket}/acme/logs/ingest/2024/03/15/`)
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj).toEqual({})
    })
  })

  // ── Tenant scenarios ─────────────────────────────────────────────────────────

  describe('DerropsConventions.parseS3Uri() — with tenant', () => {
    const bucket = 'ap-southeast-2--prod--acme--payments--api'

    it('tenant appears in prefix layer between service and partition', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/payments/api/t-xyz/2024/03/15/tx.json`,
      )
      // Without tenant being known, the tenant value folds into the start of partition
      // The instance doesn't know tenant=t-xyz, so the prefix is parsed generically
      // partition starts from after service: t-xyz/2024/03/15
      expect(result.prefix.partition).toBe('t-xyz/2024/03/15')
      expect(result.obj.key).toBe('tx.json')
    })

    it('with known tenant (passed via instance): tenant stripped, partition clean', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 't-xyz',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const result = c.parseS3Uri(`s3://${bucket}/acme/payments/api/t-xyz/2024/03/15/tx.json`)
      expect(result.prefix.tenant).toBe('t-xyz')
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj.key).toBe('tx.json')
    })
  })

  // ── Hive-style and custom partition keys ────────────────────────────────────

  describe('DerropsConventions.parseS3Uri() — hive-style and custom partition keys', () => {
    const bucket = 'ap-southeast-2--prod--acme--analytics--events'

    it('hive-style partitioning — partition opaque string with key=value pairs', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/analytics/events/year=2024/month=03/day=15/part-00001.parquet`,
      )
      expect(result.prefix.partition).toBe('year=2024/month=03/day=15')
      expect(result.obj.key).toBe('part-00001.parquet')
    })

    it('hive + date hybrid: year=2024/2024/03/15 still treated as opaque partition', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/analytics/events/year=2024/03/15/data.json`,
      )
      expect(result.prefix.partition).toBe('year=2024/03/15')
      expect(result.obj.key).toBe('data.json')
    })

    it('partition with trailing dimension key: 2024/03/region=ap-southeast-2/file.gz', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/analytics/events/2024/03/region=ap-southeast-2/file.gz`,
      )
      expect(result.prefix.partition).toBe('2024/03/region=ap-southeast-2')
      expect(result.obj.key).toBe('file.gz')
    })

    it('prefix-style hive URI (trailing slash)', () => {
      const result = DerropsConventions.parseS3Uri(
        `s3://${bucket}/acme/analytics/events/year=2024/month=03/`,
      )
      expect(result.prefix.partition).toBe('year=2024/month=03')
      expect(result.obj).toEqual({})
    })
  })

  // ── Instance parseS3Uri — validation ────────────────────────────────────────

  describe('instance parseS3Uri() — validation against known defaults', () => {
    it('passes when all parsed segments are consistent with instance defaults', () => {
      const c = makeConv()
      expect(() =>
        c.parseS3Uri(
          's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/15/log.gz',
        ),
      ).not.toThrow()
    })

    it('throws when org in bucket name conflicts with instance', () => {
      const c = new DerropsConventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
      expect(() =>
        c.parseS3Uri('s3://ap-southeast-2--prod--globex--logs--ingest/globex/logs/ingest/log.gz'),
      ).toThrow(/parseS3Uri.*"org".*"acme"/)
    })

    it('throws when env in bucket name conflicts with instance', () => {
      const c = new DerropsConventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
      expect(() =>
        c.parseS3Uri('s3://ap-southeast-2--dev--acme--logs--ingest/acme/logs/ingest/log.gz'),
      ).toThrow(/parseS3Uri.*"env".*"prod"/)
    })

    it('instance parseS3Uri returns same layered structure as static', () => {
      const c = makeConv()
      const result = c.parseS3Uri(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/15/log.gz',
      )
      expect(result.bucket).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
      })
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj).toEqual({ key: 'log.gz' })
    })
  })

  // ── End-to-end: generate → tags → parse ─────────────────────────────────────

  describe('end-to-end round-trips', () => {
    it('hour partition: name() → s3Prefix() → parseS3Uri() restores all segments', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T14:00:00Z'), granularity: 'hour' })
      const objectName = 'access.log.gz'
      // prefix ends with '/', so full key is prefix + objectName
      const uri = `s3://${bucket}/${prefix}${objectName}`

      const result = DerropsConventions.parseS3Uri(uri)

      expect(result.bucket).toMatchObject({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
      })
      expect(result.prefix).toMatchObject({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15/14',
      })
      expect(result.obj).toEqual({ key: 'access.log.gz' })
      expect(result.all).toMatchObject({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15/14',
        key: 'access.log.gz',
      })
    })

    it('day partition round-trip', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T00:00:00Z'), granularity: 'day' })
      const uri = `s3://${bucket}/${prefix}data.parquet`

      const result = DerropsConventions.parseS3Uri(uri)

      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj.key).toBe('data.parquet')
    })

    it('month partition round-trip', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix({ date: new Date('2024-03-01T00:00:00Z'), granularity: 'month' })
      const uri = `s3://${bucket}/${prefix}monthly.gz`

      const result = DerropsConventions.parseS3Uri(uri)
      expect(result.prefix.partition).toBe('2024/03')
      expect(result.obj.key).toBe('monthly.gz')
    })

    it('year partition round-trip', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix({ date: new Date('2024-01-01T00:00:00Z'), granularity: 'year' })
      const uri = `s3://${bucket}/${prefix}annual.gz`

      const result = DerropsConventions.parseS3Uri(uri)
      expect(result.prefix.partition).toBe('2024')
      expect(result.obj.key).toBe('annual.gz')
    })

    it('no-date prefix round-trip — no partition in result', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix()
      const uri = `s3://${bucket}/${prefix}schema.json`

      const result = DerropsConventions.parseS3Uri(uri)
      expect(result.prefix).not.toHaveProperty('partition')
      expect(result.obj.key).toBe('schema.json')
      expect(result.all).toMatchObject({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        key: 'schema.json',
      })
    })

    it('tenant + day partition round-trip', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 't-xyz',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix({
        date: new Date('2024-03-15T00:00:00Z'),
        granularity: 'day',
        tenant: 't-xyz',
      })
      const uri = `s3://${bucket}/${prefix}tx.json`

      const result = c.parseS3Uri(uri)

      expect(result.prefix.tenant).toBe('t-xyz')
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj.key).toBe('tx.json')
      expect(result.all).toMatchObject({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 't-xyz',
        partition: '2024/03/15',
        key: 'tx.json',
      })
    })

    it('using bucket tags for aided bucket-name parsing in parseS3Uri', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const bucketTags = c.tags({ type: 's3Bucket' })
      const uri = `s3://${bucket}/acme/logs/ingest/2024/03/15/log.gz`

      // Tags contain derrops:segment → parse() uses it for bucket name key order
      const result = DerropsConventions.parseS3Uri(uri, { tags: bucketTags })

      // The s3-prefix-segment and s3-object-name-segment tags should not confuse _findSegmentTag
      expect(result.bucket.org).toBe('acme')
      expect(result.bucket.region).toBe('ap-southeast-2')
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj.key).toBe('log.gz')
    })

    it('ARN scheme round-trip', () => {
      const c = makeConv()
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T14:00:00Z'), granularity: 'day' })
      const arn = `arn:aws:s3:::${bucket}/${prefix}file.gz`

      const result = DerropsConventions.parseS3Uri(arn)
      expect(result.bucket.env).toBe('prod')
      expect(result.prefix.partition).toBe('2024/03/15')
      expect(result.obj.key).toBe('file.gz')
    })
  })

  // ── name() using s3KeyPrefix and s3ObjectName types ──────────────────────────

  describe('s3KeyPrefix and s3ObjectName resource types', () => {
    it('s3KeyPrefix generates org/domain/service/tenant/partition prefix path', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(c.name({ type: 's3KeyPrefix', partition: '2024/03/15' })).toBe(
        'acme/logs/ingest/2024/03/15',
      )
    })

    it('s3KeyPrefix with tenant', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(c.name({ type: 's3KeyPrefix', tenant: 't-xyz', partition: '2024/03/15' })).toBe(
        'acme/logs/ingest/t-xyz/2024/03/15',
      )
    })

    it('s3KeyPrefix without partition — stops at service', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(c.name({ type: 's3KeyPrefix' })).toBe('acme/logs/ingest')
    })

    it('s3ObjectName returns just the key segment', () => {
      const c = new DerropsConventions({})
      expect(c.name({ type: 's3ObjectName', key: 'access.log.gz' })).toBe('access.log.gz')
    })

    it('s3KeyPrefix + s3ObjectName compose to a full object key', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      const prefix = c.name({ type: 's3KeyPrefix', partition: '2024/03/15' })
      const filename = c.name({ type: 's3ObjectName', key: 'log-001.gz' })
      expect(`${prefix}/${filename}`).toBe('acme/logs/ingest/2024/03/15/log-001.gz')
    })

    it('full S3 URI composed from s3Bucket + s3KeyPrefix + s3ObjectName', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const bucket = c.name({ type: 's3Bucket' })
      const prefix = c.name({ type: 's3KeyPrefix', partition: '2024/03/15' })
      const filename = c.name({ type: 's3ObjectName', key: 'log-001.gz' })
      const uri = `s3://${bucket}/${prefix}/${filename}`

      const result = DerropsConventions.parseS3Uri(uri)
      expect(result.all).toMatchObject({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15',
        key: 'log-001.gz',
      })
    })
  })
})
