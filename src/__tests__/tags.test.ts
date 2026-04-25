import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions — tags', () => {
  describe('tags()', () => {
    it('returns all default segments as tags', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        env: 'prod',
      })
      expect(c.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('org and environment are shown by default when set as constructor defaults', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        env: 'prod',
      })
      expect(c.tags()).toHaveProperty('org')
      expect(c.tags()).toHaveProperty('environment')
    })

    it('call-time overrides merge with instance defaults', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })
      expect(c.tags({ domain: 'identity', service: 'auth-service' })).toEqual({
        org: 'acme',
        domain: 'identity',
        service: 'auth-service',
        segment: 'org--domain--service',
      })
    })

    it('omits tags whose segments are absent', () => {
      const c = new DerropsConventions({ domain: 'payments' })
      expect(c.tags()).toEqual({ domain: 'payments', segment: 'domain' })
    })

    it('never includes region, tenant, key, or partition in the visible tag set', () => {
      const c = new DerropsConventions({
        region: 'ap-southeast-2',
        org: 'acme',
        tenant: 't-a3f8b2',
        domain: 'payments',
        service: 'checkout-api',
        env: 'prod',
        key: 'stripe-key',
      }).tagKeys('org', 'domain', 'service', 'environment')
      expect(c.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'region--env--org--domain--service--tenant--key',
      })
    })

    it('with() derived instance reflects merged defaults', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'platform', env: 'dev' })
      const scoped = base.with({ domain: 'payments', service: 'checkout-api' })
      expect(scoped.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'dev',
        segment: 'env--org--domain--service',
      })
    })

    it('does not mutate instance defaults', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      c.tags({ service: 'checkout-api' })
      expect(c.tags()).toEqual({ org: 'acme', domain: 'payments', segment: 'org--domain' })
    })
  })

  describe('segment tag', () => {
    it('uses the correct delimiter when type is passed', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' })
      expect(c.tags({ type: 's3ObjectKey' })).toMatchObject({
        segment: 'org/domain/service',
      })
    })

    it('uses -- for lambdaFunction (non-global, standard delimiter)', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      expect(c.tags({ type: 'lambdaFunction' })).toMatchObject({
        segment: 'org--domain--service',
      })
    })

    it('includes region and env key names for global types when they are set', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'storage',
        service: 'uploads',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      expect(c.tags({ type: 's3Bucket' })).toMatchObject({
        segment: 'region--env--org--domain--service',
      })
    })

    it('excludes region and env key names for non-global types even when set', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        env: 'prod',
        region: 'ap-southeast-2',
      })
      expect(c.tags({ type: 'lambdaFunction' })).toMatchObject({
        segment: 'org--domain--service',
      })
    })

    it('falls back to -- delimiter when no type is known', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      expect(c.tags()).toMatchObject({ segment: 'org--domain--service' })
    })

    it('uses defaultType set via with({ type }) when no type is passed to tags()', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' }).with({
        type: 's3ObjectKey',
      })
      expect(c.tags()).toMatchObject({ segment: 'org/domain/service' })
    })

    it('type passed to tags() overrides instance defaultType', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest' }).with({
        type: 's3ObjectKey',
      })
      expect(c.tags({ type: 'lambdaFunction' })).toMatchObject({ segment: 'org--domain--service' })
    })

    it('respects tagPrefix', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).tagPrefix('slaops:')
      expect(c.tags()).toMatchObject({ 'slaops:segment': 'domain--service' })
    })

    it('respects pascal tagKeyCasing', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).tagKeyCasing(
        'pascal',
      )
      expect(c.tags()).toMatchObject({ Segment: 'domain--service' })
    })

    it('is always present even when tagKeys() is empty', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).tagKeys()
      expect(c.tags()).toEqual({ segment: 'domain--service' })
    })

    it('segment value uses only segments that have non-empty values', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(c.tags()).toMatchObject({ segment: 'org' })
    })

    it('segment value is empty and tag is omitted when no segments are set', () => {
      const c = new DerropsConventions({})
      expect(c.tags()).not.toHaveProperty('segment')
    })
  })

  describe('tagKeys()', () => {
    const c = new DerropsConventions({
      org: 'acme',
      domain: 'payments',
      service: 'checkout-api',
      env: 'prod',
    })

    it('show all four tags', () => {
      expect(c.tagKeys('org', 'domain', 'service', 'environment').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('show only org', () => {
      expect(c.tagKeys('org').tags()).toEqual({
        org: 'acme',
        segment: 'env--org--domain--service',
      })
    })

    it('show only environment', () => {
      expect(c.tagKeys('environment').tags()).toEqual({
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('empty tagKeys produces only the segment tag', () => {
      expect(c.tagKeys().tags()).toEqual({ segment: 'env--org--domain--service' })
    })

    it('with() inherits tagKeys from parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', env: 'dev' }).tagKeys(
        'org',
        'domain',
        'service',
        'environment',
      )
      const scoped = base.with({ service: 'checkout-api' })
      expect(scoped.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'dev',
        segment: 'env--org--domain--service',
      })
    })

    it('tagKeys on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagKeys('org', 'domain', 'service', 'environment')
      expect(base.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        segment: 'org--domain--service',
      })
    })
  })

  describe('tagPrefix()', () => {
    const defaults = { org: 'acme', domain: 'payments', service: 'checkout-api', env: 'prod' }

    it('prepends prefix to default tag keys', () => {
      const c = new DerropsConventions(defaults)
      expect(c.tagPrefix('slaops:').tags()).toEqual({
        'slaops:org': 'acme',
        'slaops:domain': 'payments',
        'slaops:service': 'checkout-api',
        'slaops:environment': 'prod',
        'slaops:segment': 'env--org--domain--service',
      })
    })

    it('works with slash separator', () => {
      const c = new DerropsConventions(defaults)
      expect(c.tagPrefix('my-app/').tags()).toEqual({
        'my-app/org': 'acme',
        'my-app/domain': 'payments',
        'my-app/service': 'checkout-api',
        'my-app/environment': 'prod',
        'my-app/segment': 'env--org--domain--service',
      })
    })

    it('works with all four visible tags', () => {
      const c = new DerropsConventions(defaults)
      expect(
        c.tagKeys('org', 'domain', 'service', 'environment').tagPrefix('slaops:').tags(),
      ).toEqual({
        'slaops:org': 'acme',
        'slaops:domain': 'payments',
        'slaops:service': 'checkout-api',
        'slaops:environment': 'prod',
        'slaops:segment': 'env--org--domain--service',
      })
    })

    it('empty prefix has no effect', () => {
      const c = new DerropsConventions(defaults)
      expect(c.tagPrefix('').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('with() inherits prefix from parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments' }).tagPrefix('slaops:')
      const scoped = base.with({ service: 'checkout-api' })
      expect(scoped.tags()).toEqual({
        'slaops:org': 'acme',
        'slaops:domain': 'payments',
        'slaops:service': 'checkout-api',
        'slaops:segment': 'org--domain--service',
      })
    })

    it('tagPrefix on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagPrefix('slaops:')
      expect(base.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        segment: 'org--domain--service',
      })
    })
  })

  describe('tagKeyCasing()', () => {
    const c = new DerropsConventions({
      org: 'acme',
      domain: 'payments',
      service: 'checkout-api',
      env: 'prod',
    }).tagKeys('org', 'domain', 'service', 'environment')

    it('kebab (default) — no transformation', () => {
      expect(c.tagKeyCasing('kebab').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('snake — single-word keys unchanged, multi-word hyphen replaced with underscore', () => {
      expect(c.tagKeyCasing('snake').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('camel — single-word keys unchanged', () => {
      expect(c.tagKeyCasing('camel').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
        segment: 'env--org--domain--service',
      })
    })

    it('pascal — each word title-cased', () => {
      expect(c.tagKeyCasing('pascal').tags()).toEqual({
        Org: 'acme',
        Domain: 'payments',
        Service: 'checkout-api',
        Environment: 'prod',
        Segment: 'env--org--domain--service',
      })
    })

    it('pascal + prefix — casing applied before prefix', () => {
      expect(c.tagKeyCasing('pascal').tagPrefix('MyApp_').tags()).toEqual({
        MyApp_Org: 'acme',
        MyApp_Domain: 'payments',
        MyApp_Service: 'checkout-api',
        MyApp_Environment: 'prod',
        MyApp_Segment: 'env--org--domain--service',
      })
    })

    it('camel + prefix', () => {
      expect(
        new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
          .tagKeyCasing('camel')
          .tagPrefix('myApp.')
          .tags(),
      ).toEqual({
        'myApp.domain': 'payments',
        'myApp.service': 'checkout-api',
        'myApp.segment': 'domain--service',
      })
    })

    it('with() inherits casing from parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments' }).tagKeyCasing(
        'pascal',
      )
      const scoped = base.with({ service: 'checkout-api' })
      expect(scoped.tags()).toEqual({
        Org: 'acme',
        Domain: 'payments',
        Service: 'checkout-api',
        Segment: 'org--domain--service',
      })
    })

    it('tagKeyCasing on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagKeyCasing('pascal')
      expect(base.tags()).toEqual({
        domain: 'payments',
        service: 'api',
        segment: 'domain--service',
      })
    })
  })

  describe('keyMax()', () => {
    it('does not throw when all keys are within the limit', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).keyMax(10)
      expect(() => c.tags()).not.toThrow()
    })

    it('throws when a built-in key exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).keyMax(5)
      // 'domain' is 6 chars — exceeds limit of 5
      expect(() => c.tags()).toThrow(/keyMax/)
    })

    it('throws when a rule-generated key exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' })
        .keyMax(8)
        .tagRule(() => ({ 'cost-center': 'team' }))
      // 'cost-center' is 11 chars — exceeds limit of 8
      expect(() => c.tags()).toThrow(/keyMax/)
    })

    it('throws when a prefixed key exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' })
        .tagPrefix('slaops:')
        .keyMax(12)
      // 'slaops:domain' is 13 chars — exceeds limit of 12
      expect(() => c.tags()).toThrow(/keyMax/)
    })

    it('defaults to 128 (AWS limit)', () => {
      const longKey = 'a'.repeat(128)
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).tagRule(() => ({
        [longKey]: 'v',
      }))
      expect(() => c.tags()).not.toThrow()

      const tooLong = 'a'.repeat(129)
      const c2 = new DerropsConventions({ domain: 'pay', service: 'api' }).tagRule(() => ({
        [tooLong]: 'v',
      }))
      expect(() => c2.tags()).toThrow(/keyMax/)
    })

    it('with() inherits keyMax from parent', () => {
      const base = new DerropsConventions({ domain: 'pay', service: 'api' }).keyMax(5)
      const derived = base.with({})
      expect(() => derived.tags()).toThrow(/keyMax/)
    })

    it('keyMax on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ domain: 'pay', service: 'api' })
      const derived = base.with({}).keyMax(3)
      expect(() => base.tags()).not.toThrow()
      expect(() => derived.tags()).toThrow(/keyMax/)
    })
  })

  describe('valueMax()', () => {
    it('does not throw when all values are within the limit', () => {
      // segment value is 'domain--service' (14 chars) — limit must accommodate it
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).valueMax(20)
      expect(() => c.tags()).not.toThrow()
    })

    it('throws when a built-in value exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).valueMax(5)
      // 'payments' is 8 chars — exceeds limit of 5
      expect(() => c.tags()).toThrow(/valueMax/)
    })

    it('throws when a rule-generated value exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' })
        .valueMax(4)
        .tagRule(() => ({ tier: 'premium' }))
      // 'premium' is 7 chars — exceeds limit of 4
      expect(() => c.tags()).toThrow(/valueMax/)
    })

    it('defaults to 256 (AWS limit)', () => {
      const longVal = 'x'.repeat(256)
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).tagRule(() => ({
        tier: longVal,
      }))
      expect(() => c.tags()).not.toThrow()

      const tooLong = 'x'.repeat(257)
      const c2 = new DerropsConventions({ domain: 'pay', service: 'api' }).tagRule(() => ({
        tier: tooLong,
      }))
      expect(() => c2.tags()).toThrow(/valueMax/)
    })

    it('with() inherits valueMax from parent', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' }).valueMax(5)
      const derived = base.with({})
      expect(() => derived.tags()).toThrow(/valueMax/)
    })

    it('valueMax on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ domain: 'pay', service: 'api' })
      const derived = base.with({}).valueMax(2)
      expect(() => base.tags()).not.toThrow()
      expect(() => derived.tags()).toThrow(/valueMax/)
    })
  })

  describe('maxTags()', () => {
    it('does not throw when tag count is within the limit', () => {
      // domain + service + segment = 3 built-in tags
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).maxTags(3)
      expect(() => c.tags()).not.toThrow()
    })

    it('throws when tag count exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).maxTags(1)
      // domain + service + segment = 3 tags — exceeds limit of 1
      expect(() => c.tags()).toThrow(/maxTags/)
    })

    it('counts built-in and rule-generated tags together', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' })
        .maxTags(3)
        .tagRule(() => ({ tier: 'standard' }))
      // domain + service + segment + tier = 4 tags — exceeds limit of 3
      expect(() => c.tags()).toThrow(/maxTags/)
    })

    it('defaults to 50 (AWS limit)', () => {
      // 3 built-in (domain, service, segment) + 47 rule tags = 50 — exactly at the limit
      const rules = Array.from({ length: 47 }, (_, i) => () => ({ [`extra-${i}`]: 'v' }))
      let c = new DerropsConventions({ domain: 'pay', service: 'api' })
      for (const rule of rules) c = c.tagRule(rule)
      expect(() => c.tags()).not.toThrow()

      const c2 = c.tagRule(() => ({ 'one-more': 'v' }))
      // 51 tags — exceeds the default limit of 50
      expect(() => c2.tags()).toThrow(/maxTags/)
    })

    it('with() inherits maxTags from parent', () => {
      const base = new DerropsConventions({ domain: 'pay', service: 'api' }).maxTags(1)
      const derived = base.with({})
      expect(() => derived.tags()).toThrow(/maxTags/)
    })

    it('maxTags on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ domain: 'pay', service: 'api' })
      const derived = base.with({}).maxTags(1)
      expect(() => base.tags()).not.toThrow()
      expect(() => derived.tags()).toThrow(/maxTags/)
    })
  })

  describe('tagAugment()', () => {
    it('merges returned tags into the output', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).tagAugment(
        () => ({ 'updated-at': '2026-01-01T00:00:00.000Z' }),
      )

      expect(c.tags()).toEqual({
        domain: 'payments',
        service: 'checkout-api',
        segment: 'domain--service',
        'updated-at': '2026-01-01T00:00:00.000Z',
      })
    })

    it('receives a snapshot of the accumulated tags at call time (includes segment)', () => {
      const received: Record<string, string>[] = []
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).tagAugment(
        (tags) => {
          received.push(tags)
          return {}
        },
      )

      c.tags()
      expect(received[0]).toEqual({
        domain: 'payments',
        service: 'checkout-api',
        segment: 'domain--service',
      })
    })

    it('receives tagRule output — runs after tagRule', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
        .tagRule(() => ({ 'cost-center': 'payments-team' }))
        .tagAugment((tags) => ({ 'resource-id': `${tags['domain']}/${tags['service']}` }))

      expect(c.tags()).toMatchObject({ 'resource-id': 'payments/checkout-api' })
    })

    it('can model an UpdatedAt tag with a dynamic timestamp', () => {
      const before = Date.now()
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).tagAugment(() => ({
        'updated-at': new Date().toISOString(),
      }))

      const result = c.tags()
      const ts = new Date(result['updated-at']!).getTime()
      expect(ts).toBeGreaterThanOrEqual(before)
      expect(ts).toBeLessThanOrEqual(Date.now())
    })

    it('multiple augmentors run in registration order, each receives previous output', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
        .tagAugment((tags) => ({ step1: tags['domain'] ?? '' }))
        .tagAugment((tags) => ({ step2: tags['step1'] + '-done' }))

      expect(c.tags()).toMatchObject({ step1: 'payments', step2: 'payments-done' })
    })

    it('later augmentor wins when two return the same key', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' })
        .tagAugment(() => ({ tier: 'standard' }))
        .tagAugment(() => ({ tier: 'premium' }))

      expect(c.tags()).toMatchObject({ tier: 'premium' })
    })

    it('augmentor can override a built-in tag value', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).tagAugment(() => ({
        service: 'overridden',
      }))

      expect(c.tags()).toMatchObject({ service: 'overridden' })
    })

    it('snapshot passed to augmentor is a copy — mutating it does not affect the result', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).tagAugment(
        (tags) => {
          tags['domain'] = 'mutated'
          return {}
        },
      )

      expect(c.tags()).toMatchObject({ domain: 'payments' })
    })

    it('augmentor output is NOT subject to tagPrefix', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' })
        .tagPrefix('slaops:')
        .tagAugment(() => ({ 'updated-at': '2026-01-01' }))

      const result = c.tags()
      expect(result).toHaveProperty('slaops:domain')
      expect(result).toHaveProperty('updated-at', '2026-01-01')
      expect(result).not.toHaveProperty('slaops:updated-at')
    })

    it('augmented tags are visible to policies', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' })
        .tagAugment(() => ({ 'updated-at': new Date().toISOString() }))
        .policy((tags) => 'updated-at' in tags, 'updated-at is required')

      expect(() => c.tags()).not.toThrow()
    })

    it('missing augmented tag is caught by policy', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' }).policy(
        (tags) => 'updated-at' in tags,
        'updated-at is required',
      )

      expect(() => c.tags()).toThrow('updated-at is required')
    })

    it('with() propagates augmentors to derived instance', () => {
      const base = new DerropsConventions({ domain: 'payments' }).tagAugment(() => ({
        'updated-at': '2026-01-01',
      }))

      const derived = base.with({ service: 'checkout-api' })
      expect(derived.tags()).toMatchObject({ 'updated-at': '2026-01-01' })
    })

    it('with() does not mutate the parent augmentors', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagAugment(() => ({ 'updated-at': '2026-01-01' }))

      expect(base.tags()).not.toHaveProperty('updated-at')
      expect(derived.tags()).toHaveProperty('updated-at')
    })

    it('augmentor added to derived instance does not affect the parent', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagAugment(() => ({ tier: 'gold' }))

      expect(base.tags()).not.toHaveProperty('tier')
    })
  })

  describe('policy()', () => {
    it('does not throw when the policy passes', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).policy(
        (tags) => 'service' in tags,
        'service tag is required',
      )

      expect(() => c.tags()).not.toThrow()
    })

    it('throws with the provided message when the policy fails', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).policy(
        (tags) => 'cost-center' in tags,
        'cost-center tag is required',
      )

      expect(() => c.tags()).toThrow('cost-center tag is required')
    })

    it('uses a default message when none is provided', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).policy(
        (tags) => 'cost-center' in tags,
      )

      expect(() => c.tags()).toThrow('Policy violation')
    })

    it('policy receives the final resolved tags including rule-generated keys', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
        .tagRule(() => ({ 'cost-center': 'payments-team' }))
        .policy((tags) => 'cost-center' in tags, 'cost-center tag is required')

      expect(() => c.tags()).not.toThrow()
    })

    it('policy fails when required tag is only added by a missing rule', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).policy(
        (tags) => 'cost-center' in tags,
        'cost-center tag is required',
      )

      expect(() => c.tags()).toThrow('cost-center tag is required')
    })

    it('multiple policies all run — first failure throws', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
        .policy((tags) => 'service' in tags, 'service required')
        .policy((tags) => 'cost-center' in tags, 'cost-center required')
        .policy((tags) => 'owner' in tags, 'owner required')

      expect(() => c.tags()).toThrow('cost-center required')
    })

    it('all policies must pass — second failure is still caught', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
        .tagRule(() => ({ 'cost-center': 'team' }))
        .policy((tags) => 'cost-center' in tags, 'cost-center required')
        .policy((tags) => 'owner' in tags, 'owner required')

      expect(() => c.tags()).toThrow('owner required')
    })

    it('policy can inspect tag values, not just key presence', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' }).policy(
        (tags) => tags['service'] !== 'unknown',
        'service tag must not be "unknown"',
      )

      expect(() => c.tags()).not.toThrow()
    })

    it('call-time segment overrides are visible via resolved tags', () => {
      const c = new DerropsConventions({ domain: 'payments' }).policy(
        (tags) => 'service' in tags,
        'service tag is required',
      )

      expect(() => c.tags()).toThrow('service tag is required')
      expect(() => c.tags({ service: 'checkout-api' })).not.toThrow()
    })

    it('policies run after limit validation — a limit error takes precedence', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'checkout-api' })
        .maxTags(1)
        .policy((tags) => 'cost-center' in tags, 'cost-center required')

      // maxTags throws before the policy is reached
      expect(() => c.tags()).toThrow(/maxTags/)
    })

    it('with() propagates policies to derived instance', () => {
      const base = new DerropsConventions({ domain: 'payments' }).policy(
        (tags) => 'service' in tags,
        'service tag is required',
      )

      const derived = base.with({ service: 'checkout-api' })
      expect(() => derived.tags()).not.toThrow()

      const derivedMissing = base.with({})
      expect(() => derivedMissing.tags()).toThrow('service tag is required')
    })

    it('with() does not mutate the parent policies', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.policy((tags) => 'cost-center' in tags, 'cost-center required')

      expect(() => base.tags()).not.toThrow()
      expect(() => derived.tags()).toThrow('cost-center required')
    })

    it('policy added to derived instance does not affect the parent', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.policy(() => false, 'always fail')

      expect(() => base.tags()).not.toThrow()
    })
  })

  describe('tagRule()', () => {
    it('adds extra keys to tags() output', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
      }).tagRule(() => ({ 'cost-center': 'payments-team' }))

      expect(c.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        segment: 'org--domain--service',
        'cost-center': 'payments-team',
      })
    })

    it('receives resolved segment values', () => {
      const c = new DerropsConventions({
        org: 'acme',
        env: 'prod',
        domain: 'auth',
        service: 'token-service',
      }).tagRule((segments) => ({
        sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
      }))

      expect(c.tags()).toEqual({
        org: 'acme',
        domain: 'auth',
        service: 'token-service',
        environment: 'prod',
        segment: 'env--org--domain--service',
        sensitive: 'true',
      })
    })

    it('returns false when condition is not met', () => {
      const c = new DerropsConventions({
        org: 'acme',
        env: 'dev',
        domain: 'auth',
        service: 'token-service',
      }).tagRule((segments) => ({
        sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
      }))

      expect(c.tags()).toMatchObject({ sensitive: 'false' })
    })

    it('call-time segment overrides are visible to rules', () => {
      const c = new DerropsConventions({
        org: 'acme',
        env: 'dev',
        domain: 'auth',
        service: 'token-service',
      }).tagRule((segments) => ({
        sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
      }))

      expect(c.tags({ env: 'prod' })).toMatchObject({ sensitive: 'true' })
    })

    it('multiple rules are merged in registration order', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })
        .tagRule(() => ({ 'cost-center': 'payments-team', tier: 'standard' }))
        .tagRule(() => ({ backup: 'true' }))

      expect(c.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        segment: 'org--domain--service',
        'cost-center': 'payments-team',
        tier: 'standard',
        backup: 'true',
      })
    })

    it('later rule wins when two rules return the same key', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
        .tagRule(() => ({ tier: 'standard' }))
        .tagRule(() => ({ tier: 'premium' }))

      expect(c.tags()).toMatchObject({ tier: 'premium' })
    })

    it('rule output is NOT subject to tagPrefix', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
        .tagPrefix('slaops:')
        .tagRule(() => ({ 'cost-center': 'payments-team' }))

      const result = c.tags()
      expect(result).toHaveProperty('slaops:domain', 'payments')
      expect(result).toHaveProperty('slaops:service', 'api')
      expect(result).toHaveProperty('cost-center', 'payments-team')
      expect(result).not.toHaveProperty('slaops:cost-center')
    })

    it('rule output is NOT subject to tagKeyCasing', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
        .tagKeyCasing('pascal')
        .tagRule(() => ({ 'cost-center': 'payments-team' }))

      const result = c.tags()
      expect(result).toHaveProperty('Domain', 'payments')
      expect(result).toHaveProperty('cost-center', 'payments-team')
      expect(result).not.toHaveProperty('Cost-center')
    })

    it('rule can override a built-in tag value', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' }).tagRule(
        () => ({ service: 'custom-override' }),
      )

      expect(c.tags()).toMatchObject({ service: 'custom-override' })
    })

    it('with() propagates tag rules to derived instance', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments' }).tagRule(() => ({
        'cost-center': 'payments-team',
      }))

      const derived = base.with({ service: 'checkout-api' })
      expect(derived.tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        segment: 'org--domain--service',
        'cost-center': 'payments-team',
      })
    })

    it('with() does not mutate the parent tag rules', () => {
      const base = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
      }).tagRule(() => ({ 'cost-center': 'payments-team' }))

      const derived = base.with({})
      derived.tagRule(() => ({ backup: 'true' }))

      expect(base.tags()).not.toHaveProperty('backup')
      expect(derived.tags()).toHaveProperty('backup', 'true')
    })

    it('rule added after with() on the derived instance does not affect the parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagRule(() => ({ tier: 'gold' }))

      expect(base.tags()).not.toHaveProperty('tier')
    })

    it('rule receiving undefined segments handles them gracefully', () => {
      const c = new DerropsConventions({ domain: 'payments' }).tagRule((segments) => ({
        'has-env': String(segments.env !== undefined),
      }))

      expect(c.tags()).toMatchObject({ 'has-env': 'false' })
    })
  })

  describe('emitSegmentValues()', () => {
    it('segment-values is absent by default', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      expect(c.tags()).not.toHaveProperty('segment-values')
    })

    it('segment-values is present after opt-in', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
      }).emitSegmentValues()
      expect(c.tags()).toHaveProperty('segment-values', 'org=acme,domain=payments,service=api')
    })

    it('segment-values uses the same active segments as the segment tag', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        env: 'prod',
      }).emitSegmentValues()
      const tags = c.tags()
      expect(tags['segment']).toBe('env--org--domain--service')
      expect(tags['segment-values']).toBe('env=prod,org=acme,domain=payments,service=api')
    })

    it('segment-values respects tagPrefix', () => {
      const c = new DerropsConventions({
        domain: 'payments',
        service: 'api',
      })
        .emitSegmentValues()
        .tagPrefix('slaops:')
      expect(c.tags()).toHaveProperty('slaops:segment-values', 'domain=payments,service=api')
    })

    it('segment-values respects pascal tagKeyCasing', () => {
      const c = new DerropsConventions({
        domain: 'payments',
        service: 'api',
      })
        .emitSegmentValues()
        .tagKeyCasing('pascal')
      expect(c.tags()).toHaveProperty('SegmentValues', 'domain=payments,service=api')
    })

    it('segment-values is omitted when no segments are set', () => {
      const c = new DerropsConventions({}).emitSegmentValues()
      expect(c.tags()).not.toHaveProperty('segment-values')
    })

    it('propagates through with()', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'platform' }).emitSegmentValues()
      const derived = base.with({ domain: 'payments', service: 'checkout-api' })
      expect(derived.tags()).toHaveProperty(
        'segment-values',
        'org=acme,domain=payments,service=checkout-api',
      )
    })

    it('does not propagate to with() when not set on parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'platform' })
      const derived = base.with({ service: 'api' })
      expect(derived.tags()).not.toHaveProperty('segment-values')
    })
  })
})
