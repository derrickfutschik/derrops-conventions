import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions — parse()', () => {
  // ── Static parse ──────────────────────────────────────────────────────────

  describe('DerropsConventions.parse() — static', () => {
    it('parses a standard non-global name (lambdaFunction)', () => {
      expect(DerropsConventions.parse('acme--payments--checkout-api', 'lambdaFunction')).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
    })

    it('parses a global name including region and env (s3Bucket)', () => {
      expect(
        DerropsConventions.parse('ap-southeast-2--prod--acme--payments--uploads', 's3Bucket'),
      ).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'payments',
        service: 'uploads',
      })
    })

    it('strips the leading delimiter (ssmParam)', () => {
      expect(DerropsConventions.parse('/acme/payments/checkout-api', 'ssmParam')).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
    })

    it('strips the suffix (dynamoDbGsi)', () => {
      const result = DerropsConventions.parse('acme--payments--orders--gsi', 'dynamoDbGsi')
      expect(result['org']).toBe('acme')
      expect(result['domain']).toBe('payments')
      expect(result['service']).toBe('orders')
      // --gsi suffix stripped, so only 3 parts remain
      expect(Object.keys(result)).not.toContain('key')
    })

    it('uses segment tag for key order when provided', () => {
      expect(
        DerropsConventions.parse('acme--payments--v2', 'lambdaFunction', {
          tags: { segment: 'org--domain--version' },
        }),
      ).toEqual({ org: 'acme', domain: 'payments', version: 'v2' })
    })

    it('uses segment tag with prefix (e.g. derrops:segment)', () => {
      expect(
        DerropsConventions.parse('acme--payments--v2', 'lambdaFunction', {
          tags: { 'derrops:segment': 'org--domain--version' },
        }),
      ).toEqual({ org: 'acme', domain: 'payments', version: 'v2' })
    })

    it('uses segment tag with pascal casing (Segment)', () => {
      expect(
        DerropsConventions.parse('acme--payments--checkout-api', 'lambdaFunction', {
          tags: { Segment: 'org--domain--service' },
        }),
      ).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
    })

    it('ignores segment-values tag when looking for key order', () => {
      // segment-values uses key=value format — should not be confused with segment key list
      const result = DerropsConventions.parse('acme--payments--checkout-api', 'lambdaFunction', {
        tags: { 'segment-values': 'org=acme,domain=payments,service=checkout-api' },
      })
      // Falls back to type config order (org, domain, service for lambdaFunction)
      expect(result).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
    })

    it('parses a dot-delimited DNS name (route53Record)', () => {
      const result = DerropsConventions.parse('checkout-api.acme.com', 'route53Record', {
        tags: { segment: 'service.apex' },
      })
      expect(result['service']).toBe('checkout-api')
      expect(result['apex']).toBe('acme.com')
    })

    it('returns only segments present in the name — does not pad with undefined', () => {
      const result = DerropsConventions.parse('acme--payments', 'lambdaFunction')
      expect(result).toEqual({ org: 'acme', domain: 'payments' })
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('handles extra segments in name via segment tag', () => {
      const result = DerropsConventions.parse(
        'acme--payments--api--t-xyz--my-key',
        'lambdaFunction',
        {
          tags: { segment: 'org--domain--service--tenant--key' },
        },
      )
      expect(result).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 't-xyz',
        key: 'my-key',
      })
    })

    it('round-trips: parse(name(opts)) === opts segments', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      const name = c.name({ type: 's3Bucket' })
      const parsed = DerropsConventions.parse(name, 's3Bucket')
      expect(parsed).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
    })
  })

  // ── Instance parse ────────────────────────────────────────────────────────

  describe('instance parse()', () => {
    it('parses a name using the instance defaultType', () => {
      const c = new DerropsConventions({ org: 'acme' }).with({ type: 'lambdaFunction' })
      expect(c.parse('acme--payments--checkout-api')).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
    })

    it('accepts an explicit type override', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(c.parse('acme--payments--checkout-api', { type: 'lambdaFunction' })).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
    })

    it('throws when no type is set and none is passed', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(() => c.parse('acme--payments')).toThrow(/requires a "type"/)
    })

    it('returns only parsed segments — does not merge instance defaults', () => {
      const c = new DerropsConventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
      // lambdaFunction is non-global: region/env are not in the name
      const result = c.parse('acme--payments--checkout-api', { type: 'lambdaFunction' })
      // region was a known default but is not in the name — should not appear
      expect(result).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
      expect(result).not.toHaveProperty('region')
    })

    it('validates parsed segments against known instance defaults — passes when consistent', () => {
      const c = new DerropsConventions({ org: 'acme', env: 'prod' })
      expect(() =>
        c.parse('ap-southeast-2--prod--acme--payments', { type: 's3Bucket' }),
      ).not.toThrow()
    })

    it('throws when a parsed segment conflicts with a known instance default', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(() => c.parse('globex--payments--checkout-api', { type: 'lambdaFunction' })).toThrow(
        /segment "org" in name is "globex" but instance default is "acme"/,
      )
    })

    it('passes caller-provided tags through to the static parser', () => {
      const c = new DerropsConventions({ org: 'acme' })
      const result = c.parse('acme--payments--v2', {
        type: 'lambdaFunction',
        tags: { segment: 'org--domain--version' },
      })
      expect(result).toEqual({ org: 'acme', domain: 'payments', version: 'v2' })
    })

    it('correctly resolves segment tag with instance prefix', () => {
      const c = new DerropsConventions({ org: 'acme' }).tagPrefix('derrops:')
      // The instance's generated tags will have 'derrops:segment' key
      const result = c.parse('acme--payments--v2', {
        type: 'lambdaFunction',
        tags: { 'derrops:segment': 'org--domain--version' },
      })
      expect(result).toEqual({ org: 'acme', domain: 'payments', version: 'v2' })
    })
  })

  // ── parseS3Key ────────────────────────────────────────────────────────────

  describe('parseS3Key() — static', () => {
    it('parses org/domain/service with explicit segment tag', () => {
      expect(
        DerropsConventions.parseS3Key('acme/payments/checkout-api', {
          tags: { segment: 'org/domain/service' },
        }),
      ).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
    })

    it('parses org/domain/service without tags (uses default type order)', () => {
      const result = DerropsConventions.parseS3Key('acme/payments/checkout-api')
      expect(result.org).toBe('acme')
      expect(result.domain).toBe('payments')
      expect(result.service).toBe('checkout-api')
    })

    it('parses org/domain with segment tag', () => {
      expect(
        DerropsConventions.parseS3Key('acme/payments', { tags: { segment: 'org/domain' } }),
      ).toEqual({ org: 'acme', domain: 'payments' })
    })

    it('parses with hyphens in service name', () => {
      const result = DerropsConventions.parseS3Key('acme/platform/checkout-api', {
        tags: { segment: 'org/domain/service' },
      })
      expect(result.service).toBe('checkout-api')
    })

    it('parses with prefixed segment tag (e.g. derrops:segment)', () => {
      expect(
        DerropsConventions.parseS3Key('acme/payments/api', {
          tags: { 'derrops:segment': 'org/domain/service' },
        }),
      ).toEqual({ org: 'acme', domain: 'payments', service: 'api' })
    })

    it('uses last-key-greedy behaviour for extra slash parts', () => {
      // Service value contains a slash (shouldn't happen in practice, but greedy handles it)
      const result = DerropsConventions.parseS3Key('acme/payments/checkout-api', {
        tags: { segment: 'org/domain' },
      })
      // Last key (domain) should absorb remaining slashes
      expect(result.org).toBe('acme')
      expect(result.domain).toBe('payments/checkout-api')
    })

    it('round-trips: parse(name({ type: s3ObjectKey })) restores segments', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      const name = c.name({ type: 's3ObjectKey' })
      const parsed = DerropsConventions.parseS3Key(name, { tags: c.tags({ type: 's3ObjectKey' }) })
      expect(parsed.org).toBe('acme')
      expect(parsed.domain).toBe('logs')
      expect(parsed.service).toBe('ingest')
    })
  })

  describe('parseS3Key() — instance: date granularities', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })

    it('hour granularity: extracts partition and key', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/15/14/log-001.gz')
      expect(result.partition).toBe('2024/03/15/14')
      expect(result.key).toBe('log-001.gz')
    })

    it('day granularity: extracts partition and key', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/15/log-001.gz')
      expect(result.partition).toBe('2024/03/15')
      expect(result.key).toBe('log-001.gz')
    })

    it('month granularity: extracts partition and key', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/log-001.gz')
      expect(result.partition).toBe('2024/03')
      expect(result.key).toBe('log-001.gz')
    })

    it('year granularity: extracts partition and key', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/log-001.gz')
      expect(result.partition).toBe('2024')
      expect(result.key).toBe('log-001.gz')
    })

    it('no date partition: single component after prefix treated as key', () => {
      const result = c.parseS3Key('acme/logs/ingest/log-001.gz')
      expect(result).not.toHaveProperty('partition')
      expect(result.key).toBe('log-001.gz')
    })

    it('always includes the fixed prefix segments in the result', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/15/14/f.gz')
      expect(result.org).toBe('acme')
      expect(result.domain).toBe('logs')
      expect(result.service).toBe('ingest')
    })
  })

  describe('parseS3Key() — instance: prefix (trailing slash)', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })

    it('hour prefix: partition set, key absent', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/15/14/')
      expect(result.partition).toBe('2024/03/15/14')
      expect(result).not.toHaveProperty('key')
    })

    it('day prefix: partition set, key absent', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/15/')
      expect(result.partition).toBe('2024/03/15')
      expect(result).not.toHaveProperty('key')
    })

    it('month prefix: partition set, key absent', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/03/')
      expect(result.partition).toBe('2024/03')
      expect(result).not.toHaveProperty('key')
    })

    it('year prefix: partition set, key absent', () => {
      const result = c.parseS3Key('acme/logs/ingest/2024/')
      expect(result.partition).toBe('2024')
      expect(result).not.toHaveProperty('key')
    })

    it('service-only prefix (no partition, trailing slash): no partition or key', () => {
      const result = c.parseS3Key('acme/logs/ingest/')
      expect(result).toEqual({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(result).not.toHaveProperty('partition')
      expect(result).not.toHaveProperty('key')
    })
  })

  describe('parseS3Key() — instance: tenant', () => {
    it('strips tenant set on instance before parsing partition + key', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 't-xyz',
      })
      const result = c.parseS3Key('acme/payments/api/t-xyz/2024/03/15/14/log.gz')
      expect(result.tenant).toBe('t-xyz')
      expect(result.partition).toBe('2024/03/15/14')
      expect(result.key).toBe('log.gz')
    })

    it('strips tenant from options when not set on instance', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const result = c.parseS3Key('acme/payments/api/t-abc/2024/01/file.gz', {
        tenant: 't-abc',
      })
      expect(result.tenant).toBe('t-abc')
      expect(result.partition).toBe('2024/01')
      expect(result.key).toBe('file.gz')
    })

    it('options tenant takes precedence over instance tenant', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        tenant: 'default-tenant',
      })
      const result = c.parseS3Key('acme/payments/api/override-tenant/2024/file.gz', {
        tenant: 'override-tenant',
      })
      expect(result.tenant).toBe('override-tenant')
    })

    it('does not strip tenant when no tenant is known', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      // Key has a tenant-looking component but instance has no tenant — it becomes part of partition
      const result = c.parseS3Key('acme/payments/api/t-xyz/2024/03/file.gz')
      expect(result).not.toHaveProperty('tenant')
      expect(result.partition).toBe('t-xyz/2024/03')
      expect(result.key).toBe('file.gz')
    })

    it('tenant prefix with trailing slash: tenant + partition set, no key', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'logs',
        service: 'ingest',
        tenant: 't-abc',
      })
      const result = c.parseS3Key('acme/logs/ingest/t-abc/2024/03/')
      expect(result.tenant).toBe('t-abc')
      expect(result.partition).toBe('2024/03')
      expect(result).not.toHaveProperty('key')
    })
  })

  describe('parseS3Key() — instance: partial prefix (not all segments known)', () => {
    it('only org set — extracts org and leaves remainder as partition/key', () => {
      const c = new DerropsConventions({ org: 'acme' })
      const result = c.parseS3Key('acme/payments/api/2024/03/file.gz')
      expect(result.org).toBe('acme')
      expect(result.partition).toBe('payments/api/2024/03')
      expect(result.key).toBe('file.gz')
    })

    it('only org + domain set — extracts both and leaves remainder', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      const result = c.parseS3Key('acme/payments/api/2024/03/file.gz')
      expect(result.org).toBe('acme')
      expect(result.domain).toBe('payments')
      expect(result.partition).toBe('api/2024/03')
      expect(result.key).toBe('file.gz')
    })

    it('no segments set — entire key treated as partition + key', () => {
      const c = new DerropsConventions({})
      const result = c.parseS3Key('acme/payments/api/file.gz')
      expect(result).not.toHaveProperty('org')
      expect(result).not.toHaveProperty('domain')
      expect(result.partition).toBe('acme/payments/api')
      expect(result.key).toBe('file.gz')
    })
  })

  describe('parseS3Key() — instance: error cases', () => {
    it('throws when org does not match', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(() => c.parseS3Key('globex/payments/api/file.gz')).toThrow(
        /parseS3Key.*org prefix "acme/,
      )
    })

    it('throws when domain does not match', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      expect(() => c.parseS3Key('acme/identity/api/file.gz')).toThrow(
        /parseS3Key.*domain prefix "payments/,
      )
    })

    it('throws when service does not match', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      expect(() => c.parseS3Key('acme/payments/wrong-service/file.gz')).toThrow(
        /parseS3Key.*service prefix "api/,
      )
    })
  })

  describe('parseS3Key() — instance: round-trips with s3Prefix()', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })

    it('year prefix round-trips', () => {
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T00:00:00Z'), granularity: 'year' })
      const parsed = c.parseS3Key(prefix)
      expect(parsed.partition).toBe('2024')
      expect(parsed).not.toHaveProperty('key')
    })

    it('month prefix round-trips', () => {
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T00:00:00Z'), granularity: 'month' })
      const parsed = c.parseS3Key(prefix)
      expect(parsed.partition).toBe('2024/03')
    })

    it('day prefix round-trips', () => {
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T00:00:00Z'), granularity: 'day' })
      const parsed = c.parseS3Key(prefix)
      expect(parsed.partition).toBe('2024/03/15')
    })

    it('hour prefix round-trips', () => {
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T14:30:00Z'), granularity: 'hour' })
      const parsed = c.parseS3Key(prefix)
      expect(parsed.partition).toBe('2024/03/15/14')
    })

    it('plain prefix (no date) round-trips with no partition', () => {
      const prefix = c.s3Prefix()
      const parsed = c.parseS3Key(prefix)
      expect(parsed).toEqual({ org: 'acme', domain: 'logs', service: 'ingest' })
    })

    it('tenant prefix round-trips', () => {
      const ct = c.with({ tenant: 't-xyz' })
      const prefix = ct.s3Prefix({
        date: new Date('2024-03-15T00:00:00Z'),
        granularity: 'day',
        tenant: 't-xyz',
      })
      const parsed = ct.parseS3Key(prefix)
      expect(parsed.tenant).toBe('t-xyz')
      expect(parsed.partition).toBe('2024/03/15')
    })
  })
})
