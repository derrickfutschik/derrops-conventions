import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'
import type { SegmentKey } from '../types.js'

// ── Shared conventions ────────────────────────────────────────────────────────

/** Full convention: org, domain, service, env, region */
const fullConv = () =>
  new DerropsConventions({
    org: 'acme',
    domain: 'logs',
    service: 'ingest',
    env: 'prod',
    region: 'ap-southeast-2',
  })
    .tagPrefix('derrops:')
    .tagKeys('org', 'domain', 'service', 'environment')

/** Convention without region/env (domain-scoped only) */
const domainConv = () => new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })

describe('DerropsConventions — s3Resource()', () => {
  // ── Bucket name construction ───────────────────────────────────────────────

  describe('bucket name', () => {
    it('includes region, env, org, domain, service with -- delimiter', () => {
      expect(fullConv().s3Resource().bucketName).toBe('ap-southeast-2--prod--acme--logs--ingest')
    })

    it('hyphenated service name is preserved in bucket name', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'platform',
        service: 'checkout-api',
        env: 'dev',
        region: 'us-east-1',
      })
      expect(c.s3Resource().bucketName).toBe('us-east-1--dev--acme--platform--checkout-api')
    })

    it('omits region and env when not set on convention (non-global segments)', () => {
      // Without region/env the bucket type still requires them for global naming;
      // segments not set are simply omitted from the name
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(c.s3Resource().bucketName).toBe('acme--logs--ingest')
    })

    it('multi-word org is lowercased', () => {
      const c = new DerropsConventions({
        org: 'Big Corp',
        domain: 'payments',
        service: 'api',
        env: 'prod',
        region: 'eu-west-1',
      })
      expect(c.s3Resource().bucketName).toContain('big-corp')
    })
  })

  // ── Prefix construction ───────────────────────────────────────────────────

  describe('prefix', () => {
    it('always ends with /', () => {
      expect(fullConv().s3Resource().prefix).toMatch(/\/$/)
    })

    it('no partition: prefix is org/domain/service/', () => {
      expect(domainConv().s3Resource().prefix).toBe('acme/payments/api/')
    })

    it('year partition', () => {
      const r = domainConv().s3Resource({ partition: '2024' })
      expect(r.prefix).toBe('acme/payments/api/2024/')
    })

    it('month partition', () => {
      const r = domainConv().s3Resource({ partition: '2024/03' })
      expect(r.prefix).toBe('acme/payments/api/2024/03/')
    })

    it('day partition', () => {
      const r = domainConv().s3Resource({ partition: '2024/03/15' })
      expect(r.prefix).toBe('acme/payments/api/2024/03/15/')
    })

    it('hour partition', () => {
      const r = domainConv().s3Resource({ partition: '2024/03/15/14' })
      expect(r.prefix).toBe('acme/payments/api/2024/03/15/14/')
    })

    it('date + granularity=year', () => {
      const r = domainConv().s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'year',
      })
      expect(r.prefix).toBe('acme/payments/api/2024/')
    })

    it('date + granularity=month', () => {
      const r = domainConv().s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'month',
      })
      expect(r.prefix).toBe('acme/payments/api/2024/03/')
    })

    it('date + granularity=day', () => {
      const r = domainConv().s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'day',
      })
      expect(r.prefix).toBe('acme/payments/api/2024/03/15/')
    })

    it('date + granularity=hour', () => {
      const r = domainConv().s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'hour',
      })
      expect(r.prefix).toBe('acme/payments/api/2024/03/15/14/')
    })

    it('tenant from options inserted between service and partition', () => {
      const r = domainConv().s3Resource({ tenant: 't-xyz', partition: '2024/03/15' })
      expect(r.prefix).toBe('acme/payments/api/t-xyz/2024/03/15/')
    })

    it('tenant from instance default inserted correctly', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 't-default',
      })
      const r = c.s3Resource({ partition: '2024/03' })
      expect(r.prefix).toBe('acme/payments/api/t-default/2024/03/')
    })

    it('options tenant overrides instance tenant', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 'default-tenant',
      })
      const r = c.s3Resource({ tenant: 'override-tenant', partition: '2024/03' })
      expect(r.prefix).toBe('acme/payments/api/override-tenant/2024/03/')
    })

    it('tenant + no partition: prefix is org/domain/service/tenant/', () => {
      const r = domainConv().s3Resource({ tenant: 't-abc' })
      expect(r.prefix).toBe('acme/payments/api/t-abc/')
    })

    it('hive-style partition key treated as opaque string', () => {
      const r = domainConv().s3Resource({ partition: 'year=2024/month=03/day=15' })
      expect(r.prefix).toBe('acme/payments/api/year=2024/month=03/day=15/')
    })
  })

  // ── Object name and key ───────────────────────────────────────────────────

  describe('objectName and objectKey', () => {
    it('objectName is the key segment value', () => {
      const r = domainConv().s3Resource({ key: 'access.log.gz' })
      expect(r.objectName).toBe('access.log.gz')
    })

    it('objectName is empty string when no key given', () => {
      const r = domainConv().s3Resource()
      expect(r.objectName).toBe('')
    })

    it('objectKey = prefix + objectName (with trailing slash from prefix)', () => {
      const r = domainConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      expect(r.objectKey).toBe('acme/payments/api/2024/03/15/log.gz')
      expect(r.objectKey).toBe(`${r.prefix}${r.objectName}`)
    })

    it('objectKey without key equals prefix without trailing slash', () => {
      const r = domainConv().s3Resource({ partition: '2024/03/15' })
      expect(r.objectKey).toBe('acme/payments/api/2024/03/15')
      expect(r.prefix).toBe('acme/payments/api/2024/03/15/')
    })

    it('hyphens in key filename preserved', () => {
      const r = domainConv().s3Resource({ key: 'access-log-001.json.gz' })
      expect(r.objectName).toBe('access-log-001.json.gz')
    })

    it('objectKey composed from hour partition + key', () => {
      const r = domainConv().s3Resource({
        date: new Date('2024-03-15T14:30:00Z'),
        granularity: 'hour',
        key: 'part-00001.parquet',
      })
      expect(r.objectKey).toBe('acme/payments/api/2024/03/15/14/part-00001.parquet')
    })

    it('objectKey with tenant + day partition + key', () => {
      const r = domainConv().s3Resource({
        tenant: 't-xyz',
        partition: '2024/03/15',
        key: 'tx.json',
      })
      expect(r.objectKey).toBe('acme/payments/api/t-xyz/2024/03/15/tx.json')
    })
  })

  // ── URI / ARN / URL formats ───────────────────────────────────────────────

  describe('reference formats', () => {
    it('uri uses s3:// scheme', () => {
      const r = fullConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      expect(r.uri).toMatch(/^s3:\/\//)
      expect(r.uri).toBe(
        's3://ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/15/log.gz',
      )
    })

    it('arn uses arn:aws:s3::: scheme (no region or account in S3 ARNs)', () => {
      const r = fullConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      expect(r.arn).toBe(
        'arn:aws:s3:::ap-southeast-2--prod--acme--logs--ingest/acme/logs/ingest/2024/03/15/log.gz',
      )
    })

    it('url uses virtual-hosted format with region', () => {
      const r = fullConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      expect(r.url).toBe(
        'https://ap-southeast-2--prod--acme--logs--ingest.s3.ap-southeast-2.amazonaws.com/acme/logs/ingest/2024/03/15/log.gz',
      )
    })

    it('url omits region when not set on convention', () => {
      const r = domainConv().s3Resource({ key: 'schema.json' })
      expect(r.url).toMatch(/^https:\/\/.*\.s3\.amazonaws\.com\//)
      expect(r.url).not.toContain('.s3.ap-')
    })

    it('uri and arn differ only in scheme prefix', () => {
      const r = fullConv().s3Resource({ key: 'file.gz' })
      const uriPath = r.uri.slice('s3://'.length)
      const arnPath = r.arn.slice('arn:aws:s3:::'.length)
      expect(uriPath).toBe(arnPath)
    })

    it('uri for prefix-only (no key) ends without trailing slash', () => {
      const r = domainConv().s3Resource({ partition: '2024/03' })
      expect(r.uri).toBe('s3://acme--payments--api/acme/payments/api/2024/03')
      expect(r.uri).not.toMatch(/\/$/)
    })

    it('all reference formats include the bucket name', () => {
      const r = fullConv().s3Resource({ key: 'f.gz' })
      expect(r.uri).toContain(r.bucketName)
      expect(r.arn).toContain(r.bucketName)
      expect(r.url).toContain(r.bucketName)
    })
  })

  // ── Segment breakdown ─────────────────────────────────────────────────────

  describe('segments', () => {
    it('bucket layer has region, env, org, domain, service', () => {
      const r = fullConv().s3Resource()
      expect(r.segments.bucket).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
      })
    })

    it('prefix layer has org, domain, service, partition — no region or env', () => {
      const r = fullConv().s3Resource({ partition: '2024/03/15' })
      expect(r.segments.prefix).toEqual({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15',
      })
      expect(r.segments.prefix).not.toHaveProperty('region')
      expect(r.segments.prefix).not.toHaveProperty('env')
    })

    it('obj layer has only key when key is set', () => {
      const r = domainConv().s3Resource({ key: 'data.parquet' })
      expect(r.segments.obj).toEqual({ key: 'data.parquet' })
    })

    it('obj layer is empty when no key', () => {
      const r = domainConv().s3Resource()
      expect(r.segments.obj).toEqual({})
    })

    it('all layer merges bucket + prefix + obj', () => {
      const r = fullConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      expect(r.segments.all).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15',
        key: 'log.gz',
      })
    })

    it('org/domain/service appear in BOTH bucket and prefix (intentional overlap)', () => {
      const r = fullConv().s3Resource({ partition: '2024/03' })
      expect(r.segments.bucket.org).toBe(r.segments.prefix.org)
      expect(r.segments.bucket.domain).toBe(r.segments.prefix.domain)
      expect(r.segments.bucket.service).toBe(r.segments.prefix.service)
    })

    it('tenant appears only in prefix and all, not in bucket', () => {
      const r = domainConv().s3Resource({ tenant: 't-xyz', partition: '2024/03' })
      expect(r.segments.prefix.tenant).toBe('t-xyz')
      expect(r.segments.all.tenant).toBe('t-xyz')
      expect(r.segments.bucket).not.toHaveProperty('tenant')
    })

    it('partition appears only in prefix and all, not in bucket', () => {
      const r = domainConv().s3Resource({ partition: '2024/03/15' })
      expect(r.segments.prefix.partition).toBe('2024/03/15')
      expect(r.segments.all.partition).toBe('2024/03/15')
      expect(r.segments.bucket).not.toHaveProperty('partition')
    })

    it('key appears only in obj and all, not in bucket or prefix', () => {
      const r = domainConv().s3Resource({ key: 'file.gz' })
      expect(r.segments.obj.key).toBe('file.gz')
      expect(r.segments.all.key).toBe('file.gz')
      expect(r.segments.bucket).not.toHaveProperty('key')
      expect(r.segments.prefix).not.toHaveProperty('key')
    })

    it('date granularity resolved into partition segment', () => {
      const r = domainConv().s3Resource({
        date: new Date('2024-03-15T14:30:00Z'),
        granularity: 'hour',
      })
      expect(r.segments.prefix.partition).toBe('2024/03/15/14')
      expect(r.segments.all.partition).toBe('2024/03/15/14')
    })
  })

  // ── Tags ──────────────────────────────────────────────────────────────────

  describe('tags', () => {
    describe('schema tags', () => {
      it('bucket segment schema tag (key names with -- delimiter)', () => {
        const r = fullConv().s3Resource()
        expect(r.tags['derrops:segment']).toBe('region--env--org--domain--service')
      })

      it('prefix segment schema tag (full template, always all keys)', () => {
        const r = fullConv().s3Resource()
        expect(r.tags['derrops:s3-prefix-segment']).toBe('org/domain/service/tenant/partition')
      })

      it('object name schema tag', () => {
        const r = fullConv().s3Resource()
        expect(r.tags['derrops:s3-object-name-segment']).toBe('key')
      })

      it('prefix schema tag includes tenant even when no tenant is set', () => {
        const r = domainConv().s3Resource()
        expect(r.tags['s3-prefix-segment']).toBe('org/domain/service/tenant/partition')
      })
    })

    describe('visible segment tags', () => {
      it('visible tags present for segments set on instance', () => {
        const r = fullConv().s3Resource()
        expect(r.tags['derrops:org']).toBe('acme')
        expect(r.tags['derrops:domain']).toBe('logs')
        expect(r.tags['derrops:service']).toBe('ingest')
        expect(r.tags['derrops:environment']).toBe('prod')
      })
    })

    describe('segment-value tags (runtime instance tags per layer)', () => {
      it('segment-values encodes the bucket layer segments', () => {
        const r = fullConv().s3Resource()
        expect(r.tags['derrops:segment-values']).toBe(
          'region=ap-southeast-2,env=prod,org=acme,domain=logs,service=ingest',
        )
      })

      it('s3-prefix-segment-values encodes the prefix layer segments', () => {
        const r = fullConv().s3Resource({ partition: '2024/03/15' })
        expect(r.tags['derrops:s3-prefix-segment-values']).toBe(
          'org=acme,domain=logs,service=ingest,partition=2024/03/15',
        )
      })

      it('s3-prefix-segment-values includes tenant when set', () => {
        const r = fullConv().s3Resource({ tenant: 't-xyz', partition: '2024/03/15' })
        expect(r.tags['derrops:s3-prefix-segment-values']).toBe(
          'org=acme,domain=logs,service=ingest,tenant=t-xyz,partition=2024/03/15',
        )
      })

      it('s3-prefix-segment-values omits partition when not set', () => {
        const r = fullConv().s3Resource()
        expect(r.tags['derrops:s3-prefix-segment-values']).toBe(
          'org=acme,domain=logs,service=ingest',
        )
      })

      it('s3-object-name-segment-values encodes the key', () => {
        const r = fullConv().s3Resource({ key: 'access.log.gz' })
        expect(r.tags['derrops:s3-object-name-segment-values']).toBe('key=access.log.gz')
      })

      it('s3-object-name-segment-values absent when no key', () => {
        const r = fullConv().s3Resource()
        expect(r.tags).not.toHaveProperty('derrops:s3-object-name-segment-values')
      })

      it('all three segment-value tags together enable full URI reconstruction from tags', () => {
        const r = fullConv().s3Resource({
          partition: '2024/03/15/14',
          key: 'access.log.gz',
        })
        // bucket: region--env--org--domain--service
        expect(r.tags['derrops:segment-values']).toContain('region=ap-southeast-2')
        expect(r.tags['derrops:segment-values']).toContain('env=prod')
        // prefix: org/domain/service/partition
        expect(r.tags['derrops:s3-prefix-segment-values']).toContain('partition=2024/03/15/14')
        // obj: key
        expect(r.tags['derrops:s3-object-name-segment-values']).toBe('key=access.log.gz')
      })
    })

    describe('tag key prefix and casing', () => {
      it('tag keys respect tagPrefix', () => {
        const c = new DerropsConventions({
          org: 'acme',
          domain: 'logs',
          service: 'ingest',
        }).tagPrefix('app:')
        const r = c.s3Resource({ key: 'log.gz' })
        expect(r.tags).toHaveProperty('app:segment')
        expect(r.tags).toHaveProperty('app:s3-prefix-segment')
        expect(r.tags).toHaveProperty('app:segment-values')
        expect(r.tags).toHaveProperty('app:s3-prefix-segment-values')
        expect(r.tags).toHaveProperty('app:s3-object-name-segment-values')
      })

      it('tag keys respect pascal casing', () => {
        const c = new DerropsConventions({
          org: 'acme',
          domain: 'logs',
          service: 'ingest',
        }).tagKeyCasing('pascal')
        const r = c.s3Resource({ key: 'log.gz' })
        expect(r.tags).toHaveProperty('Segment')
        expect(r.tags).toHaveProperty('S3PrefixSegment')
        expect(r.tags).toHaveProperty('SegmentValues')
        expect(r.tags).toHaveProperty('S3PrefixSegmentValues')
        expect(r.tags).toHaveProperty('S3ObjectNameSegmentValues')
      })
    })
  })

  // ── Complete S3 URI construction ─────────────────────────────────────────

  describe('complete S3 URI construction from convention', () => {
    it('builds a fully-specified log URI with all layers', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'platform',
        service: 'api-gateway',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const r = c.s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'hour',
        key: 'access-2024031514-0001.log.gz',
      })

      expect(r.bucketName).toBe('ap-southeast-2--prod--acme--platform--api-gateway')
      expect(r.prefix).toBe('acme/platform/api-gateway/2024/03/15/14/')
      expect(r.objectName).toBe('access-2024031514-0001.log.gz')
      expect(r.objectKey).toBe(
        'acme/platform/api-gateway/2024/03/15/14/access-2024031514-0001.log.gz',
      )
      expect(r.uri).toBe(
        's3://ap-southeast-2--prod--acme--platform--api-gateway/' +
          'acme/platform/api-gateway/2024/03/15/14/access-2024031514-0001.log.gz',
      )
    })

    it('builds a multi-tenant log URI', () => {
      const c = new DerropsConventions({
        org: 'derrops',
        domain: 'logging',
        service: 'collector',
        env: 'prod',
        region: 'us-east-1',
      })
      const r = c.s3Resource({
        tenant: 'customer-abc',
        date: new Date('2024-06-01T09:00:00Z'),
        granularity: 'day',
        key: 'events.json.gz',
      })

      expect(r.bucketName).toBe('us-east-1--prod--derrops--logging--collector')
      expect(r.prefix).toBe('derrops/logging/collector/customer-abc/2024/06/01/')
      expect(r.uri).toBe(
        's3://us-east-1--prod--derrops--logging--collector/' +
          'derrops/logging/collector/customer-abc/2024/06/01/events.json.gz',
      )
      expect(r.segments.all.tenant).toBe('customer-abc')
    })

    it('builds a configuration object key (no partition, direct key)', () => {
      const r = domainConv().s3Resource({ key: 'openapi-schema.json' })
      expect(r.objectKey).toBe('acme/payments/api/openapi-schema.json')
      expect(r.uri).toBe('s3://acme--payments--api/acme/payments/api/openapi-schema.json')
    })

    it('builds an analytics parquet URI with hive partitioning', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'analytics',
        service: 'events',
        env: 'prod',
        region: 'eu-west-1',
      })
      const r = c.s3Resource({
        partition: 'year=2024/month=03/day=15',
        key: 'part-00001.parquet',
      })
      expect(r.prefix).toBe('acme/analytics/events/year=2024/month=03/day=15/')
      expect(r.objectKey).toBe('acme/analytics/events/year=2024/month=03/day=15/part-00001.parquet')
    })

    it('all four date granularities produce the correct s3Resource', () => {
      const c = domainConv()
      const date = new Date('2024-03-15T14:30:00Z')

      const year = c.s3Resource({ date, granularity: 'year', key: 'f.gz' })
      const month = c.s3Resource({ date, granularity: 'month', key: 'f.gz' })
      const day = c.s3Resource({ date, granularity: 'day', key: 'f.gz' })
      const hour = c.s3Resource({ date, granularity: 'hour', key: 'f.gz' })

      expect(year.objectKey).toBe('acme/payments/api/2024/f.gz')
      expect(month.objectKey).toBe('acme/payments/api/2024/03/f.gz')
      expect(day.objectKey).toBe('acme/payments/api/2024/03/15/f.gz')
      expect(hour.objectKey).toBe('acme/payments/api/2024/03/15/14/f.gz')
    })

    it('derived convention with() adds segment on the fly', () => {
      // Start from a base org convention, derive a scoped one at call time
      const orgConv = new DerropsConventions({
        org: 'acme',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const r = orgConv.with({ domain: 'logs', service: 'ingest' }).s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
      })

      expect(r.bucketName).toBe('ap-southeast-2--prod--acme--logs--ingest')
      expect(r.objectKey).toBe('acme/logs/ingest/2024/03/15/log.gz')
    })

    it('s3Resource round-trips through parseS3Uri correctly', () => {
      const c = fullConv()
      const r = c.s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'hour',
        key: 'access.log.gz',
      })

      const parsed = c.parseS3Uri(r.uri)

      expect(parsed.bucket).toEqual(r.segments.bucket)
      expect(parsed.prefix.partition).toBe(r.segments.prefix.partition)
      expect(parsed.obj).toEqual(r.segments.obj)
    })
  })

  // ── Layer control ─────────────────────────────────────────────────────────

  describe('layers — prefix layer', () => {
    it('default: org/domain/service appear in both bucket and prefix', () => {
      const r = fullConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      // Bucket has them
      expect(r.segments.bucket.org).toBe('acme')
      expect(r.segments.bucket.domain).toBe('logs')
      expect(r.segments.bucket.service).toBe('ingest')
      // Prefix also has them
      expect(r.segments.prefix.org).toBe('acme')
      expect(r.segments.prefix.domain).toBe('logs')
      expect(r.segments.prefix.service).toBe('ingest')
    })

    it('layers.prefix=["partition"] — no redundancy, prefix carries only partition', () => {
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: { prefix: ['partition'] },
      })
      expect(r.prefix).toBe('2024/03/15/')
      expect(r.objectKey).toBe('2024/03/15/log.gz')
      expect(r.segments.prefix).toEqual({ partition: '2024/03/15' })
      // Bucket unchanged
      expect(r.segments.bucket).toMatchObject({ org: 'acme', domain: 'logs', service: 'ingest' })
    })

    it('layers.prefix=["tenant","partition"] — only tenant+partition in prefix', () => {
      const r = fullConv().s3Resource({
        tenant: 't-xyz',
        partition: '2024/03/15',
        key: 'log.gz',
        layers: { prefix: ['tenant', 'partition'] },
      })
      expect(r.prefix).toBe('t-xyz/2024/03/15/')
      expect(r.segments.prefix).toEqual({ tenant: 't-xyz', partition: '2024/03/15' })
    })

    it('layers.prefix=["service","partition"] — service as namespace disambiguation', () => {
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: { prefix: ['service', 'partition'] },
      })
      expect(r.prefix).toBe('ingest/2024/03/15/')
      expect(r.segments.prefix).toEqual({ service: 'ingest', partition: '2024/03/15' })
    })

    it('layers.prefix=[] — empty prefix (object at bucket root)', () => {
      const r = fullConv().s3Resource({
        key: 'manifest.json',
        layers: { prefix: [] },
      })
      expect(r.prefix).toBe('')
      expect(r.objectKey).toBe('manifest.json')
      expect(r.uri).toBe('s3://ap-southeast-2--prod--acme--logs--ingest/manifest.json')
    })

    it('layers.prefix omits segments not in the pool', () => {
      // 'az' is not set on the convention — it is simply skipped
      const r = fullConv().s3Resource({
        partition: '2024/03',
        key: 'f.gz',
        layers: { prefix: ['az', 'partition'] },
      })
      expect(r.prefix).toBe('2024/03/')
      expect(r.segments.prefix).toEqual({ partition: '2024/03' })
    })

    it('layers.prefix with date granularity', () => {
      const r = fullConv().s3Resource({
        date: new Date('2024-03-15T14:00:00Z'),
        granularity: 'hour',
        key: 'log.gz',
        layers: { prefix: ['partition'] },
      })
      expect(r.prefix).toBe('2024/03/15/14/')
      expect(r.objectKey).toBe('2024/03/15/14/log.gz')
    })
  })

  describe('layers — bucket layer', () => {
    it('layers.bucket=["region","env","org"] — only org in bucket, domain+service move to prefix', () => {
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: {
          bucket: ['region', 'env', 'org'],
          prefix: ['domain', 'service', 'partition'],
        },
      })
      expect(r.bucketName).toBe('ap-southeast-2--prod--acme')
      expect(r.prefix).toBe('logs/ingest/2024/03/15/')
      expect(r.objectKey).toBe('logs/ingest/2024/03/15/log.gz')
      expect(r.segments.bucket).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
      })
      expect(r.segments.prefix).toEqual({
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15',
      })
    })

    it('layers.bucket=["org","domain"] — coarser bucket (no service)', () => {
      const r = domainConv().s3Resource({
        key: 'schema.json',
        layers: {
          bucket: ['org', 'domain'],
          prefix: ['service', 'key'],
        },
      })
      expect(r.bucketName).toBe('acme--payments')
      expect(r.prefix).toBe('api/schema.json/')
    })

    it('layers.bucket normalises multi-word values', () => {
      const c = new DerropsConventions({
        org: 'Big Corp',
        domain: 'platform',
        service: 'api',
        env: 'prod',
        region: 'us-east-1',
      })
      const r = c.s3Resource({ layers: { bucket: ['org', 'env'] } })
      expect(r.bucketName).toBe('big-corp--prod')
    })

    it('layers.bucket=["env","org","domain","service"] — no region in bucket name', () => {
      const r = fullConv().s3Resource({
        layers: { bucket: ['env', 'org', 'domain', 'service'] },
      })
      expect(r.bucketName).toBe('prod--acme--logs--ingest')
      expect(r.bucketName).not.toContain('ap-southeast-2')
      expect(r.segments.bucket.region).toBeUndefined()
    })

    it('url still uses convention region even when region is not in custom bucket layer', () => {
      // url always uses this.defaults.region, regardless of bucket layer config
      const r = fullConv().s3Resource({
        key: 'f.gz',
        layers: { bucket: ['org', 'domain', 'service'] },
      })
      expect(r.url).toContain('s3.ap-southeast-2.amazonaws.com')
    })

    // ── Parsing custom-layer URIs back to segments ─────────────────────────

    it('parse: default layers — segment in bucket is also in prefix (no tags needed)', () => {
      // Standard case: org/domain/service in both bucket and prefix
      const r = fullConv().s3Resource({ partition: '2024/03/15', key: 'log.gz' })
      const parsed = DerropsConventions.parseS3Uri(r.uri)

      // org appears in BOTH bucket and prefix because path parsing strips it from key too
      expect(parsed.bucket.org).toBe('acme')
      expect(parsed.prefix.org).toBe('acme')
      expect(parsed.prefix.domain).toBe('logs')
      expect(parsed.prefix.service).toBe('ingest')
      expect(parsed.prefix.partition).toBe('2024/03/15')
      expect(parsed.obj.key).toBe('log.gz')
    })

    it('parse: custom bucket layer — segment in bucket NOT in prefix path (requires tags)', () => {
      // org is only in the bucket; prefix path starts with domain
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: {
          bucket: ['region', 'env', 'org'],
          prefix: ['domain', 'service', 'partition'],
        },
      })
      // URI: s3://ap-southeast-2--prod--acme/logs/ingest/2024/03/15/log.gz

      // Without tags: path parser can only extract what it can see in the path
      const parsedNoTags = DerropsConventions.parseS3Uri(r.uri)
      expect(parsedNoTags.bucket).toEqual({ region: 'ap-southeast-2', env: 'prod', org: 'acme' })
      // domain/service are in the path but temp conv only knows org, so they fall into partition
      expect(parsedNoTags.prefix.partition).toContain('logs')
      expect(parsedNoTags.prefix.domain).toBeUndefined()

      // With tags from s3Resource(): segment-value tags let the parser reconstruct exactly
      const parsedWithTags = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })
      expect(parsedWithTags.bucket).toEqual({ region: 'ap-southeast-2', env: 'prod', org: 'acme' })
      expect(parsedWithTags.prefix).toEqual({
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15',
      })
      expect(parsedWithTags.obj).toEqual({ key: 'log.gz' })
      expect(parsedWithTags.all).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        partition: '2024/03/15',
        key: 'log.gz',
      })
    })

    it('parse: coarser bucket ["org","domain"], service+partition in prefix', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const r = c.s3Resource({
        partition: '2024/03',
        key: 'data.gz',
        layers: {
          bucket: ['region', 'env', 'org', 'domain'],
          prefix: ['service', 'partition'],
        },
      })
      // bucket: ap-southeast-2--prod--acme--logs   prefix: ingest/2024/03/
      const parsed = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })

      expect(parsed.bucket).toMatchObject({ org: 'acme', domain: 'logs' })
      expect(parsed.bucket.service).toBeUndefined()
      expect(parsed.prefix).toEqual({ service: 'ingest', partition: '2024/03' })
      expect(parsed.obj).toEqual({ key: 'data.gz' })
    })

    it('parse: same segment in bucket AND prefix — both layers carry the value', () => {
      // Deliberately put 'service' in both layers (intentional redundancy)
      const r = fullConv().s3Resource({
        partition: '2024/03',
        key: 'f.gz',
        layers: {
          bucket: ['region', 'env', 'org', 'domain', 'service'],
          prefix: ['service', 'partition'], // service repeated
        },
      })
      // bucket: ap-southeast-2--prod--acme--logs--ingest   prefix: ingest/2024/03/
      const parsed = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })

      // service appears in both layers
      expect(parsed.bucket.service).toBe('ingest')
      expect(parsed.prefix.service).toBe('ingest')
      expect(parsed.all.service).toBe('ingest') // merged once in all
      expect(parsed.prefix.partition).toBe('2024/03')
      expect(parsed.obj.key).toBe('f.gz')
    })

    it('parse: same segment in all three layers', () => {
      // env in bucket, env in prefix, env embedded in obj name
      const r = fullConv().s3Resource({
        key: 'report.gz',
        layers: {
          bucket: ['region', 'env', 'org', 'domain', 'service'],
          prefix: ['env', 'partition'], // env repeated in prefix
          obj: ['env', 'key'], // env also in object name
        },
      })
      // prefix: prod/   objectName: prod-report.gz
      const parsed = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })

      expect(parsed.bucket.env).toBe('prod')
      expect(parsed.prefix.env).toBe('prod')
      expect(parsed.obj.env).toBe('prod')
      expect(parsed.obj.key).toBe('report.gz')
      expect(parsed.all.env).toBe('prod') // still just one entry in all
    })

    it('parse: partition-only prefix — segments appear only in their intended layer', () => {
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: { prefix: ['partition'] }, // bucket keeps its default; prefix has only partition
      })
      // bucket: ap-southeast-2--prod--acme--logs--ingest   prefix: 2024/03/15/
      const parsed = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })

      // org/domain/service ONLY in bucket, not in prefix
      expect(parsed.bucket.org).toBe('acme')
      expect(parsed.prefix.org).toBeUndefined()
      expect(parsed.prefix.domain).toBeUndefined()
      expect(parsed.prefix.service).toBeUndefined()
      expect(parsed.prefix.partition).toBe('2024/03/15')
      expect(parsed.obj.key).toBe('log.gz')
    })

    it('parse: tags with prefix (derrops:) are found correctly by parser', () => {
      // fullConv() uses derrops: prefix — verify _findTagByName handles it
      const r = fullConv().s3Resource({
        partition: '2024/03',
        key: 'f.gz',
        layers: { prefix: ['partition'] },
      })
      expect(r.tags).toHaveProperty('derrops:s3-prefix-segment-values')
      const parsed = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })
      expect(parsed.prefix).toEqual({ partition: '2024/03' })
    })

    it('parse: full round-trip with all four date granularities and custom bucket', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const date = new Date('2024-03-15T14:30:00Z')
      const customLayers = {
        bucket: ['region', 'env', 'org'] as SegmentKey[],
        prefix: ['domain', 'service', 'partition'] as SegmentKey[],
      }

      for (const [granularity, expectedPartition] of [
        ['year', '2024'],
        ['month', '2024/03'],
        ['day', '2024/03/15'],
        ['hour', '2024/03/15/14'],
      ] as const) {
        const r = c.s3Resource({ date, granularity, key: 'f.gz', layers: customLayers })
        const parsed = DerropsConventions.parseS3Uri(r.uri, { tags: r.tags })
        expect(parsed.bucket.org).toBe('acme')
        expect(parsed.prefix.domain).toBe('logs')
        expect(parsed.prefix.service).toBe('ingest')
        expect(parsed.prefix.partition).toBe(expectedPartition)
        expect(parsed.obj.key).toBe('f.gz')
      }
    })
  })

  describe('layers — obj layer', () => {
    it('default obj layer is just the key', () => {
      const r = fullConv().s3Resource({ key: 'access.log.gz' })
      expect(r.objectName).toBe('access.log.gz')
      expect(r.segments.obj).toEqual({ key: 'access.log.gz' })
    })

    it('layers.obj=["service","key"] — service prefixes the filename', () => {
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: {
          prefix: ['org', 'domain', 'partition'],
          obj: ['service', 'key'],
        },
      })
      expect(r.objectName).toBe('ingest-log.gz')
      expect(r.objectKey).toBe('acme/logs/2024/03/15/ingest-log.gz')
      expect(r.segments.obj).toEqual({ service: 'ingest', key: 'log.gz' })
    })

    it('layers.obj=["env","key"] — env prefixes the filename', () => {
      const r = fullConv().s3Resource({
        key: 'export.csv',
        layers: { obj: ['env', 'key'] },
      })
      expect(r.objectName).toBe('prod-export.csv')
      expect(r.segments.obj).toEqual({ env: 'prod', key: 'export.csv' })
    })

    it('layers.obj omits segments not in pool', () => {
      const r = fullConv().s3Resource({
        key: 'data.gz',
        layers: { obj: ['tenant', 'key'] }, // tenant not set
      })
      expect(r.objectName).toBe('data.gz')
    })
  })

  describe('layers — all three layers together', () => {
    it('fully custom split: every segment in a different layer', () => {
      const r = fullConv().s3Resource({
        tenant: 't-abc',
        partition: '2024/03',
        key: 'f.gz',
        layers: {
          bucket: ['region', 'env', 'org'],
          prefix: ['domain', 'service', 'tenant', 'partition'],
          obj: ['key'],
        },
      })
      expect(r.bucketName).toBe('ap-southeast-2--prod--acme')
      expect(r.prefix).toBe('logs/ingest/t-abc/2024/03/')
      expect(r.objectName).toBe('f.gz')
      expect(r.objectKey).toBe('logs/ingest/t-abc/2024/03/f.gz')
      expect(r.uri).toBe('s3://ap-southeast-2--prod--acme/logs/ingest/t-abc/2024/03/f.gz')
      // No segment appears in more than its intended layer
      expect(r.segments.bucket).not.toHaveProperty('domain')
      expect(r.segments.prefix).not.toHaveProperty('region')
      expect(r.segments.prefix).not.toHaveProperty('env')
      expect(r.segments.obj).not.toHaveProperty('partition')
    })

    it('segment appears in multiple layers when explicitly listed in both', () => {
      // service deliberately appears in both bucket and prefix
      const r = fullConv().s3Resource({
        partition: '2024/03',
        key: 'f.gz',
        layers: {
          bucket: ['region', 'env', 'org', 'service'],
          prefix: ['service', 'partition'], // service repeated
        },
      })
      expect(r.bucketName).toContain('ingest')
      expect(r.prefix).toBe('ingest/2024/03/')
      expect(r.segments.bucket.service).toBe('ingest')
      expect(r.segments.prefix.service).toBe('ingest')
    })
  })

  describe('layers — tags reflect custom layer configuration', () => {
    it('segment-values reflects custom bucket layer', () => {
      const r = fullConv().s3Resource({
        layers: { bucket: ['region', 'env', 'org'] },
      })
      expect(r.tags['derrops:segment-values']).toBe('region=ap-southeast-2,env=prod,org=acme')
    })

    it('s3-prefix-segment-values reflects custom prefix layer', () => {
      const r = fullConv().s3Resource({
        partition: '2024/03/15',
        key: 'log.gz',
        layers: { prefix: ['partition'] },
      })
      expect(r.tags['derrops:s3-prefix-segment-values']).toBe('partition=2024/03/15')
    })

    it('s3-object-name-segment-values reflects custom obj layer', () => {
      const r = fullConv().s3Resource({
        key: 'f.gz',
        layers: { obj: ['service', 'key'] },
      })
      expect(r.tags['derrops:s3-object-name-segment-values']).toBe('service=ingest,key=f.gz')
    })

    it('s3-prefix-segment schema tag always shows full template, regardless of custom layer', () => {
      // The schema tag describes what COULD be in the prefix, not what IS in it for this call
      const r = fullConv().s3Resource({
        layers: { prefix: ['partition'] },
      })
      expect(r.tags['derrops:s3-prefix-segment']).toBe('org/domain/service/tenant/partition')
    })

    it('url changes when bucket layer changes', () => {
      const r = fullConv().s3Resource({
        key: 'f.gz',
        layers: { bucket: ['org', 'domain', 'service'] },
      })
      // Custom bucket name (no region/env) still uses convention region in the URL
      expect(r.bucketName).toBe('acme--logs--ingest')
      expect(r.url).toBe(
        'https://acme--logs--ingest.s3.ap-southeast-2.amazonaws.com/acme/logs/ingest/f.gz',
      )
    })
  })
})
