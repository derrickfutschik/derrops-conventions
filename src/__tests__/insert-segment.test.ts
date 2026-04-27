import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const ACCOUNT_ID = '123456789012'

describe('insertSegment()', () => {
  const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

  // ── Positioning ─────────────────────────────────────────────────────────────

  describe('positioning', () => {
    it('default (no position) appends after all segments', () => {
      expect(
        base.with({}).insertSegment('suffix', 'x').name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe('acme--payments--checkout-api--fn--x')
    })

    it("'last' appends after all segments", () => {
      expect(
        base
          .with({})
          .insertSegment('suffix', 'x', 'last')
          .name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe('acme--payments--checkout-api--fn--x')
    })

    it("'first' prepends before all segments", () => {
      expect(
        base
          .with({})
          .insertSegment('accountId', ACCOUNT_ID, 'first')
          .name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe(`${ACCOUNT_ID}--acme--payments--checkout-api--fn`)
    })

    it('{ before: anchor } inserts immediately before the anchor', () => {
      expect(
        base
          .with({})
          .insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
          .name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe(`${ACCOUNT_ID}--acme--payments--checkout-api--fn`)
    })

    it('{ after: anchor } inserts immediately after the anchor', () => {
      expect(
        base
          .with({})
          .insertSegment('tier', 'gold', { after: 'org' })
          .name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe('acme--gold--payments--checkout-api--fn')
    })

    it('throws when { before } anchor is not in the current order', () => {
      expect(() => base.with({}).insertSegment('x', 'y', { before: 'nonexistent' })).toThrow(
        /anchor segment "nonexistent" not found/,
      )
    })

    it('throws when { after } anchor is not in the current order', () => {
      expect(() => base.with({}).insertSegment('x', 'y', { after: 'nonexistent' })).toThrow(
        /anchor segment "nonexistent" not found/,
      )
    })
  })

  // ── Idempotency ──────────────────────────────────────────────────────────────

  describe('calling insertSegment twice with same key', () => {
    it('updates the value', () => {
      const c = base
        .with({})
        .insertSegment('accountId', '111111111111', { before: 'org' })
        .insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
      expect(c.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        `${ACCOUNT_ID}--acme--payments--checkout-api--fn`,
      )
    })

    it('repositions the segment to the new position', () => {
      const c = base
        .with({})
        .insertSegment('tier', 'gold', { after: 'service' })
        .insertSegment('tier', 'gold', { before: 'org' })
      expect(c.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        'gold--acme--payments--checkout-api--fn',
      )
    })
  })

  // ── S3 object keys (the primary use case) ───────────────────────────────────

  describe('s3ObjectKey with accountId prefix', () => {
    const svc = new DerropsConventions({
      org: 'acme',
      domain: 'payments',
      service: 'checkout-api',
    }).insertSegment('accountId', ACCOUNT_ID, { before: 'org' })

    it('prepends account ID before org in s3ObjectKey', () => {
      expect(svc.name({ type: 's3ObjectKey', key: 'schema.sql' })).toBe(
        `${ACCOUNT_ID}/acme/payments/checkout-api/schema.sql`,
      )
    })

    it('prepends account ID in s3LogKey with partition', () => {
      expect(svc.name({ type: 's3LogKey', partition: '2024/01/15/14', key: 'events-001.gz' })).toBe(
        `${ACCOUNT_ID}/acme/payments/checkout-api/2024/01/15/14/events-001.gz`,
      )
    })

    it('s3Prefix() includes account ID prefix', () => {
      expect(svc.s3Prefix({ partition: '2024/01/15/14' })).toBe(
        `${ACCOUNT_ID}/acme/payments/checkout-api/2024/01/15/14/`,
      )
    })

    it('s3Prefix() with date + granularity includes account ID prefix', () => {
      const date = new Date('2024-01-15T14:00:00Z')
      expect(svc.s3Prefix({ date, granularity: 'hour' })).toBe(
        `${ACCOUNT_ID}/acme/payments/checkout-api/2024/01/15/14/`,
      )
    })

    it('s3Prefix() service-level prefix includes account ID', () => {
      expect(svc.s3Prefix()).toBe(`${ACCOUNT_ID}/acme/payments/checkout-api/`)
    })
  })

  // ── Propagation through .with() ──────────────────────────────────────────────

  describe('propagation through .with()', () => {
    it('child inherits the custom segment and its position', () => {
      const parent = base.with({}).insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
      const child = parent.with({ service: 'billing-api' })
      expect(child.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        `${ACCOUNT_ID}--acme--payments--billing-api--fn`,
      )
    })

    it('child can override the custom segment value via insertSegment', () => {
      const parent = base.with({}).insertSegment('accountId', '111111111111', { before: 'org' })
      const child = parent.with({}).insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
      expect(child.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        `${ACCOUNT_ID}--acme--payments--checkout-api--fn`,
      )
      // Parent is unaffected
      expect(parent.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        `111111111111--acme--payments--checkout-api--fn`,
      )
    })

    it('parent is not mutated by child insertSegment', () => {
      const parent = base.with({})
      parent.with({}).insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
      // parent itself should have no custom segment
      expect(parent.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        'acme--payments--checkout-api--fn',
      )
    })
  })

  // ── Tags are unaffected ───────────────────────────────────────────────────────

  describe('tags() is unaffected by custom segments', () => {
    it('custom segment value is not emitted as a standalone ownership tag', () => {
      const c = base.with({}).insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
      const t = c.tagKeys('org', 'domain', 'service').tags()
      // Ownership tags are unchanged — the account ID value does not appear as a tag value
      expect(t['org']).toBe('acme')
      expect(t['domain']).toBe('payments')
      expect(t['service']).toBe('checkout-api')
      expect(Object.values(t)).not.toContain(ACCOUNT_ID)
    })

    it('tagRule() and tagAugment() are unaffected', () => {
      const c = base
        .with({})
        .insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
        .tagRule(() => ({ custom: 'yes' }))
      const t = c.tags()
      expect(t['custom']).toBe('yes')
      expect('accountId' in t).toBe(false)
    })
  })

  // ── insertSegmentAt() ─────────────────────────────────────────────────────────

  describe('insertSegmentAt()', () => {
    it('no index appends at the end', () => {
      expect(
        base.with({}).insertSegmentAt('suffix', 'x').name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe('acme--payments--checkout-api--fn--x')
    })

    it('index 0 prepends before all segments', () => {
      expect(
        base
          .with({})
          .insertSegmentAt('accountId', ACCOUNT_ID, 0)
          .name({ type: 's3ObjectKey', key: 'f.json' }),
      ).toBe(`${ACCOUNT_ID}/acme/payments/checkout-api/f.json`)
    })

    it('index beyond order length appends at end', () => {
      expect(
        base
          .with({})
          .insertSegmentAt('suffix', 'x', 999)
          .name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe('acme--payments--checkout-api--fn--x')
    })

    it('negative index is clamped to 0 (prepend)', () => {
      expect(
        base
          .with({})
          .insertSegmentAt('accountId', ACCOUNT_ID, -5)
          .name({ type: 's3ObjectKey', key: 'f.json' }),
      ).toBe(`${ACCOUNT_ID}/acme/payments/checkout-api/f.json`)
    })

    it('works with s3Prefix()', () => {
      expect(base.with({}).insertSegmentAt('accountId', ACCOUNT_ID, 0).s3Prefix()).toBe(
        `${ACCOUNT_ID}/acme/payments/checkout-api/`,
      )
    })

    it('second call updates value and repositions', () => {
      const c = base
        .with({})
        .insertSegmentAt('accountId', '111111111111', 0)
        .insertSegmentAt('accountId', ACCOUNT_ID, 0)
      expect(c.name({ type: 's3ObjectKey', key: 'f.json' })).toBe(
        `${ACCOUNT_ID}/acme/payments/checkout-api/f.json`,
      )
    })

    it('propagates through .with()', () => {
      const parent = base.with({}).insertSegmentAt('accountId', ACCOUNT_ID, 0)
      expect(parent.with({ service: 'billing-api' }).s3Prefix()).toBe(
        `${ACCOUNT_ID}/acme/payments/billing-api/`,
      )
    })

    it('account ID value is not emitted as a tag', () => {
      const c = base.with({}).insertSegmentAt('accountId', ACCOUNT_ID, 0)
      expect(Object.values(c.tagKeys('org', 'domain', 'service').tags())).not.toContain(ACCOUNT_ID)
    })
  })

  // ── Compound usage ────────────────────────────────────────────────────────────

  describe('compound: insertSegment + moveSegment', () => {
    it('can add a segment then reposition it separately via moveSegment', () => {
      const c = base
        .with({})
        .insertSegment('tier', 'gold') // appended last
        .moveSegment('tier', 'domain') // now before domain
      expect(c.name({ type: 'lambdaFunction', key: 'fn' })).toBe(
        'acme--gold--payments--checkout-api--fn',
      )
    })
  })

  // ── Non-s3 resource types ─────────────────────────────────────────────────────

  describe('non-s3 resource types', () => {
    it('custom segment participates in lambdaFunction names', () => {
      expect(
        base
          .with({})
          .insertSegment('env-label', 'prod', { after: 'org' })
          .name({ type: 'lambdaFunction', key: 'fn' }),
      ).toBe('acme--prod--payments--checkout-api--fn')
    })

    it('custom segment participates in dynamoDb names', () => {
      expect(
        base
          .with({})
          .insertSegment('env-label', 'prod', { after: 'org' })
          .name({ type: 'dynamoDb', key: 'orders' }),
      ).toBe('acme--prod--payments--checkout-api--orders')
    })
  })

  // ── Fixed-segment resource types ──────────────────────────────────────────────

  describe('fixed-segment resource types', () => {
    // openSearchIndex has segments: ['org', 'domain', 'entity', 'tenant']
    it('injects custom segment into openSearchIndex after its predecessor', () => {
      expect(
        base
          .with({})
          .insertSegment('shard', 'hot', { after: 'domain' })
          .name({ type: 'openSearchIndex', entity: 'transactions' }),
      ).toBe('acme--payments--hot--transactions')
    })

    it('prepends custom segment to openSearchIndex when before all fixed segments', () => {
      expect(
        base
          .with({})
          .insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
          .name({ type: 'openSearchIndex', entity: 'users' }),
      ).toBe(`${ACCOUNT_ID}--acme--payments--users`)
    })

    it('appends custom segment to openSearchIndex when after all fixed segments', () => {
      expect(
        base
          .with({ tenant: 't-abc' })
          .insertSegment('suffix', 'v2')
          .name({ type: 'openSearchIndex', entity: 'events' }),
      ).toBe('acme--payments--events--t-abc--v2')
    })

    // appSyncDataSource has segments: ['org', 'domain', 'service', 'target']
    it('injects tier segment between domain and service in appSyncDataSource', () => {
      expect(
        base
          .with({})
          .insertSegment('tier', 'gold', { after: 'domain' })
          .name({ type: 'appSyncDataSource', target: 'orders' }),
      ).toBe('acme--payments--gold--checkout-api--orders')
    })

    // cloudwatchMetricNamespace has segments: ['org', 'domain']
    it('prepends accountId to cloudwatchMetricNamespace', () => {
      expect(
        base
          .with({})
          .insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
          .name({ type: 'cloudwatchMetricNamespace' }),
      ).toBe(`${ACCOUNT_ID}/acme/payments`)
    })

    it('insertSegmentAt index 0 works on fixed-segment type', () => {
      expect(
        base
          .with({})
          .insertSegmentAt('accountId', ACCOUNT_ID, 0)
          .name({ type: 'openSearchIndex', entity: 'orders' }),
      ).toBe(`${ACCOUNT_ID}--acme--payments--orders`)
    })

    it('propagates through .with() for fixed-segment types', () => {
      const parent = base.with({}).insertSegment('accountId', ACCOUNT_ID, { before: 'org' })
      const child = parent.with({ service: 'billing-api' })
      expect(child.name({ type: 'openSearchIndex', entity: 'invoices' })).toBe(
        `${ACCOUNT_ID}--acme--payments--invoices`,
      )
    })
  })
})
