import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions — parse()', () => {
  // ── Static parse ──────────────────────────────────────────────────────────

  describe('DerropsConventions.parse() — static', () => {
    it('parses a standard non-global name (lambdaFunction)', () => {
      expect(
        DerropsConventions.parse('acme--payments--checkout-api', 'lambdaFunction'),
      ).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
    })

    it('parses a global name including region and env (s3Bucket)', () => {
      expect(
        DerropsConventions.parse(
          'ap-southeast-2--prod--acme--payments--uploads',
          's3Bucket',
        ),
      ).toEqual({
        region: 'ap-southeast-2',
        env: 'prod',
        org: 'acme',
        domain: 'payments',
        service: 'uploads',
      })
    })

    it('strips the leading delimiter (ssmParam)', () => {
      expect(
        DerropsConventions.parse('/acme/payments/checkout-api', 'ssmParam'),
      ).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
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

    it('uses segment tag with prefix (e.g. slaops:segment)', () => {
      expect(
        DerropsConventions.parse('acme--payments--v2', 'lambdaFunction', {
          tags: { 'slaops:segment': 'org--domain--version' },
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
      const result = DerropsConventions.parse('acme--payments--api--t-xyz--my-key', 'lambdaFunction', {
        tags: { segment: 'org--domain--service--tenant--key' },
      })
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
      expect(() =>
        c.parse('globex--payments--checkout-api', { type: 'lambdaFunction' }),
      ).toThrow(/segment "org" in name is "globex" but instance default is "acme"/)
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
      const c = new DerropsConventions({ org: 'acme' }).tagPrefix('slaops:')
      // The instance's generated tags will have 'slaops:segment' key
      const result = c.parse('acme--payments--v2', {
        type: 'lambdaFunction',
        tags: { 'slaops:segment': 'org--domain--version' },
      })
      expect(result).toEqual({ org: 'acme', domain: 'payments', version: 'v2' })
    })
  })

  // ── parseS3Key ────────────────────────────────────────────────────────────

  describe('parseS3Key() — static', () => {
    it('parses a basic S3 object key using segment tag', () => {
      expect(
        DerropsConventions.parseS3Key('acme/payments/checkout-api', {
          tags: { segment: 'org/domain/service' },
        }),
      ).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
    })

    it('parses without tags using default type order', () => {
      const result = DerropsConventions.parseS3Key('acme/payments/checkout-api')
      expect(result['org']).toBe('acme')
      expect(result['domain']).toBe('payments')
      expect(result['service']).toBe('checkout-api')
    })
  })

  describe('parseS3Key() — instance', () => {
    it('strips the known prefix and extracts partition + key', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
      expect(c.parseS3Key('acme/payments/checkout-api/2024/03/15/14/log-001.gz')).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        partition: '2024/03/15/14',
        key: 'log-001.gz',
      })
    })

    it('strips tenant when present in the key', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        tenant: 't-xyz',
      })
      expect(c.parseS3Key('acme/payments/checkout-api/t-xyz/2024/03/15/log.gz')).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        tenant: 't-xyz',
        partition: '2024/03/15',
        key: 'log.gz',
      })
    })

    it('accepts tenant via options when not set on instance', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const result = c.parseS3Key('acme/payments/api/t-abc/2024/01/01/file.gz', {
        tenant: 't-abc',
      })
      expect(result.tenant).toBe('t-abc')
      expect(result.partition).toBe('2024/01/01')
      expect(result.key).toBe('file.gz')
    })

    it('handles an s3Prefix (trailing slash) — no key segment emitted', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
      const result = c.parseS3Key('acme/payments/checkout-api/2024/03/15/')
      expect(result.partition).toBe('2024/03/15')
      expect(result).not.toHaveProperty('key')
    })

    it('returns only the fixed segments when no remainder', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      })
      const result = c.parseS3Key('acme/payments/checkout-api/')
      expect(result).toEqual({ org: 'acme', domain: 'payments', service: 'checkout-api' })
    })

    it('throws when key does not match expected prefix', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      expect(() => c.parseS3Key('globex/payments/api/log.gz')).toThrow(
        /parseS3Key.*org prefix "acme/,
      )
    })

    it('round-trips: parseS3Key(s3Prefix()) extracts partition', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
      })
      const prefix = c.s3Prefix({ date: new Date('2024-03-15T14:30:00Z'), granularity: 'day' })
      const parsed = c.parseS3Key(prefix)
      expect(parsed.partition).toBe('2024/03/15')
    })
  })
})
