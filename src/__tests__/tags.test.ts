import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions — tags', () => {
  describe('tags()', () => {
    it('returns only domain + service by default', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        env: 'prod',
      })
      expect(c.tags()).toEqual({ domain: 'payments', service: 'checkout-api' })
    })

    it('org and environment are hidden by default even when segments are set', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
        env: 'prod',
      })
      expect(c.tags()).not.toHaveProperty('org')
      expect(c.tags()).not.toHaveProperty('environment')
    })

    it('call-time overrides merge with instance defaults', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })
      expect(c.tags({ domain: 'identity', service: 'auth-service' })).toEqual({
        domain: 'identity',
        service: 'auth-service',
      })
    })

    it('omits tags whose segments are absent', () => {
      const c = new DerropsConventions({ domain: 'payments' })
      expect(c.tags()).toEqual({ domain: 'payments' })
    })

    it('never includes region, tenant, key, or partition', () => {
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
      })
    })

    it('with() derived instance reflects merged defaults', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'platform', env: 'dev' })
      const scoped = base.with({ domain: 'payments', service: 'checkout-api' })
      expect(scoped.tags()).toEqual({ domain: 'payments', service: 'checkout-api' })
    })

    it('does not mutate instance defaults', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      c.tags({ service: 'checkout-api' })
      expect(c.tags()).toEqual({ domain: 'payments' })
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
      })
    })

    it('show only org', () => {
      expect(c.tagKeys('org').tags()).toEqual({ org: 'acme' })
    })

    it('show only environment', () => {
      expect(c.tagKeys('environment').tags()).toEqual({ environment: 'prod' })
    })

    it('empty tagKeys produces no tags', () => {
      expect(c.tagKeys().tags()).toEqual({})
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
      })
    })

    it('tagKeys on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagKeys('org', 'domain', 'service', 'environment')
      expect(base.tags()).toEqual({ domain: 'payments', service: 'api' })
    })
  })

  describe('tagPrefix()', () => {
    const defaults = { org: 'acme', domain: 'payments', service: 'checkout-api', env: 'prod' }

    it('prepends prefix to default tag keys', () => {
      const c = new DerropsConventions(defaults)
      expect(c.tagPrefix('slaops:').tags()).toEqual({
        'slaops:domain': 'payments',
        'slaops:service': 'checkout-api',
      })
    })

    it('works with slash separator', () => {
      const c = new DerropsConventions(defaults)
      expect(c.tagPrefix('my-app/').tags()).toEqual({
        'my-app/domain': 'payments',
        'my-app/service': 'checkout-api',
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
      })
    })

    it('empty prefix has no effect', () => {
      const c = new DerropsConventions(defaults)
      expect(c.tagPrefix('').tags()).toEqual({ domain: 'payments', service: 'checkout-api' })
    })

    it('with() inherits prefix from parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments' }).tagPrefix('slaops:')
      const scoped = base.with({ service: 'checkout-api' })
      expect(scoped.tags()).toEqual({
        'slaops:domain': 'payments',
        'slaops:service': 'checkout-api',
      })
    })

    it('tagPrefix on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagPrefix('slaops:')
      expect(base.tags()).toEqual({ domain: 'payments', service: 'api' })
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
      })
    })

    it('snake — single-word keys unchanged, multi-word hyphen replaced with underscore', () => {
      expect(c.tagKeyCasing('snake').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
      })
    })

    it('camel — single-word keys unchanged', () => {
      expect(c.tagKeyCasing('camel').tags()).toEqual({
        org: 'acme',
        domain: 'payments',
        service: 'checkout-api',
        environment: 'prod',
      })
    })

    it('pascal — each word title-cased', () => {
      expect(c.tagKeyCasing('pascal').tags()).toEqual({
        Org: 'acme',
        Domain: 'payments',
        Service: 'checkout-api',
        Environment: 'prod',
      })
    })

    it('pascal + prefix — casing applied before prefix', () => {
      expect(c.tagKeyCasing('pascal').tagPrefix('MyApp_').tags()).toEqual({
        MyApp_Org: 'acme',
        MyApp_Domain: 'payments',
        MyApp_Service: 'checkout-api',
        MyApp_Environment: 'prod',
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
      })
    })

    it('with() inherits casing from parent', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments' }).tagKeyCasing(
        'pascal',
      )
      const scoped = base.with({ service: 'checkout-api' })
      expect(scoped.tags()).toEqual({ Domain: 'payments', Service: 'checkout-api' })
    })

    it('tagKeyCasing on derived instance does not affect parent', () => {
      const base = new DerropsConventions({ domain: 'payments', service: 'api' })
      const derived = base.with({})
      derived.tagKeyCasing('pascal')
      expect(base.tags()).toEqual({ domain: 'payments', service: 'api' })
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
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).valueMax(10)
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
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).maxTags(2)
      expect(() => c.tags()).not.toThrow()
    })

    it('throws when tag count exceeds the limit', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' }).maxTags(1)
      // two visible tags (domain + service) exceeds limit of 1
      expect(() => c.tags()).toThrow(/maxTags/)
    })

    it('counts built-in and rule-generated tags together', () => {
      const c = new DerropsConventions({ domain: 'pay', service: 'api' })
        .maxTags(2)
        .tagRule(() => ({ tier: 'standard' }))
      // 3 tags total — exceeds limit of 2
      expect(() => c.tags()).toThrow(/maxTags/)
    })

    it('defaults to 50 (AWS limit)', () => {
      const rules = Array.from({ length: 48 }, (_, i) => () => ({ [`extra-${i}`]: 'v' }))
      let c = new DerropsConventions({ domain: 'pay', service: 'api' })
      for (const rule of rules) c = c.tagRule(rule)
      // 2 built-in + 48 rule tags = 50 — exactly at the limit
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

  describe('tagRule()', () => {
    it('adds extra keys to tags() output', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })
        .tagRule(() => ({ 'cost-center': 'payments-team' }))

      expect(c.tags()).toEqual({
        domain: 'payments',
        service: 'checkout-api',
        'cost-center': 'payments-team',
      })
    })

    it('receives resolved segment values', () => {
      const c = new DerropsConventions({
        org: 'acme',
        env: 'prod',
        domain: 'auth',
        service: 'token-service',
      }).tagRule(segments => ({
        sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
      }))

      expect(c.tags()).toEqual({
        domain: 'auth',
        service: 'token-service',
        sensitive: 'true',
      })
    })

    it('returns false when condition is not met', () => {
      const c = new DerropsConventions({
        org: 'acme',
        env: 'dev',
        domain: 'auth',
        service: 'token-service',
      }).tagRule(segments => ({
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
      }).tagRule(segments => ({
        sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
      }))

      expect(c.tags({ env: 'prod' })).toMatchObject({ sensitive: 'true' })
    })

    it('multiple rules are merged in registration order', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })
        .tagRule(() => ({ 'cost-center': 'payments-team', tier: 'standard' }))
        .tagRule(() => ({ backup: 'true' }))

      expect(c.tags()).toEqual({
        domain: 'payments',
        service: 'checkout-api',
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
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
        .tagRule(() => ({ service: 'custom-override' }))

      expect(c.tags()).toMatchObject({ service: 'custom-override' })
    })

    it('with() propagates tag rules to derived instance', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments' })
        .tagRule(() => ({ 'cost-center': 'payments-team' }))

      const derived = base.with({ service: 'checkout-api' })
      expect(derived.tags()).toEqual({
        domain: 'payments',
        service: 'checkout-api',
        'cost-center': 'payments-team',
      })
    })

    it('with() does not mutate the parent tag rules', () => {
      const base = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
        .tagRule(() => ({ 'cost-center': 'payments-team' }))

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
      const c = new DerropsConventions({ domain: 'payments' }).tagRule(segments => ({
        'has-env': String(segments.env !== undefined),
      }))

      expect(c.tags()).toMatchObject({ 'has-env': 'false' })
    })
  })
})
