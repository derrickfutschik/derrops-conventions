import { describe, it, expect } from '@jest/globals'
import { conventions, DerropsConventions } from '../DerropsConventions.js'

// ── Runtime behaviour ─────────────────────────────────────────────────────────

describe('conventions() — type-safe factory', () => {
  describe('string values → segment defaults (no type narrowing)', () => {
    it('string org is stored as default', () => {
      const c = conventions({ org: 'acme' })
      expect(c.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' })).toBe(
        'acme--payments--api',
      )
    })

    it('string env is stored as default', () => {
      const c = conventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
      expect(c.name({ type: 's3Bucket', domain: 'payments', service: 'api', key: 'data' })).toBe(
        'ap-southeast-2--prod--acme--payments--api--data',
      )
    })

    it('string values produce no constraints()', () => {
      const c = conventions({ org: 'acme', env: 'prod' })
      expect(Object.keys(c.constraints())).toHaveLength(0)
    })
  })

  describe('array values → constraints (type-narrowed)', () => {
    it('domain array is stored as constraint', () => {
      const c = conventions({ domain: ['payments', 'identity'] })
      expect(c.constraints().domain).toEqual(['payments', 'identity'])
    })

    it('service array is stored as constraint', () => {
      const c = conventions({ service: ['checkout-api', 'auth-service'] })
      expect(c.constraints().service).toEqual(['checkout-api', 'auth-service'])
    })

    it('env array is stored as constraint', () => {
      const c = conventions({ env: ['dev', 'prod', 'staging'] })
      expect(c.constraints().env).toEqual(['dev', 'prod', 'staging'])
    })

    it('kind array is stored as constraint', () => {
      const c = conventions({ kind: ['private', 'public', 'isolated'] })
      expect(c.constraints().kind).toEqual(['private', 'public', 'isolated'])
    })

    it('purpose array is stored as constraint', () => {
      const c = conventions({ purpose: ['web', 'db', 'internal'] })
      expect(c.constraints().purpose).toEqual(['web', 'db', 'internal'])
    })

    it('az array is stored as constraint', () => {
      const c = conventions({ az: ['1a', '1b', '1c'] })
      expect(c.constraints().az).toEqual(['1a', '1b', '1c'])
    })

    it('multiple constraints in one call', () => {
      const c = conventions({
        org: 'acme',
        domain: ['payments', 'identity'],
        service: ['checkout-api'],
        env: ['dev', 'prod'],
      })
      expect(c.constraints().domain).toEqual(['payments', 'identity'])
      expect(c.constraints().service).toEqual(['checkout-api'])
      expect(c.constraints().env).toEqual(['dev', 'prod'])
      expect('az' in c.constraints()).toBe(false)
    })
  })

  describe('naming with constraints', () => {
    const c = conventions({
      org: 'acme',
      domain: ['payments', 'identity'],
      service: ['checkout-api', 'auth-service'],
    })

    it('produces correct names for constrained domain + service', () => {
      expect(
        c.name({
          type: 'lambdaFunction',
          domain: 'payments',
          service: 'checkout-api',
          key: 'handler',
        }),
      ).toBe('acme--payments--checkout-api--handler')
    })

    it('can call with() to derive scoped instances', () => {
      const payments = c.with({ domain: 'payments' })
      expect(
        payments.name({ type: 'lambdaFunction', service: 'checkout-api', key: 'handler' }),
      ).toBe('acme--payments--checkout-api--handler')
    })
  })

  describe('mixing string defaults and array constraints', () => {
    const c = conventions({
      org: 'acme', // string → default
      env: 'prod', // string → default (no constraint)
      region: 'ap-southeast-2', // string → default
      domain: ['payments', 'identity'], // array → constraint
    })

    it('string org and region flow into names', () => {
      expect(c.name({ type: 's3Bucket', domain: 'payments', service: 'api', key: 'data' })).toBe(
        'ap-southeast-2--prod--acme--payments--api--data',
      )
    })

    it('only domain has a constraint entry', () => {
      expect(c.constraints().domain).toEqual(['payments', 'identity'])
      expect('env' in c.constraints()).toBe(false) // string env → default, not constrained
    })
  })

  describe('with() propagates constraints', () => {
    const c = conventions({
      org: 'acme',
      domain: ['payments', 'identity'],
    })

    it('derived instance inherits domain constraint', () => {
      const child = c.with({ env: 'prod' })
      expect(child.constraints().domain).toEqual(['payments', 'identity'])
    })

    it('derived instance can add further constraints via chaining', () => {
      const child = c.with({}).service(['checkout-api', 'auth-service'])
      expect(child.constraints().service).toEqual(['checkout-api', 'auth-service'])
      // parent unaffected
      expect('service' in c.constraints()).toBe(false)
    })
  })

  describe('topology() integration', () => {
    it('conventions() with domain array feeds directly into topology()', () => {
      const c = conventions({ org: 'acme', domain: ['payments', 'identity'] })
      const plan = c.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b'] })
      expect(plan.vpc.name).toBe('acme')
      expect(plan.domains.payments?.cidr).toBe('10.0.0.0/20')
      expect(plan.domains.identity?.cidr).toBe('10.0.16.0/20')
    })
  })

  describe('DerropsConventions.create() is identical to conventions()', () => {
    it('static create() returns the same shaped instance', () => {
      const a = conventions({ org: 'acme', domain: ['payments'] })
      const b = DerropsConventions.create({ org: 'acme', domain: ['payments'] })
      expect(a.constraints()).toEqual(b.constraints())
      expect(a.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' })).toBe(
        b.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' }),
      )
    })
  })
})

// ── Compile-time type safety (verified via @ts-expect-error) ──────────────────

describe('conventions() — TypeScript type narrowing', () => {
  it('constrained domain rejects unknown values at compile time', () => {
    const c = conventions({ domain: ['payments', 'identity'] })

    // Valid — no error
    c.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' })

    // @ts-expect-error 'analytics' is not assignable to 'payments' | 'identity'
    c.name({ type: 'lambdaFunction', domain: 'analytics', service: 'api' })
  })

  it('constrained service rejects unknown values at compile time', () => {
    const c = conventions({ org: 'acme', service: ['checkout-api', 'auth-service'] })

    // Valid
    c.name({ type: 'lambdaFunction', domain: 'payments', service: 'checkout-api' })

    // @ts-expect-error 'billing' is not assignable to 'checkout-api' | 'auth-service'
    c.name({ type: 'lambdaFunction', domain: 'payments', service: 'billing' })
  })

  it('with() rejects invalid domain at compile time', () => {
    const c = conventions({ domain: ['payments', 'identity'] })

    // Valid
    c.with({ domain: 'payments' })

    // @ts-expect-error 'analytics' is not assignable to 'payments' | 'identity'
    c.with({ domain: 'analytics' })
  })

  it('string domain value is NOT constrained — allows any domain downstream', () => {
    // String → default, not a constraint; no type narrowing occurs
    const c = conventions({ org: 'acme', domain: 'payments' })

    // Both valid — domain not constrained
    c.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' })
    c.name({ type: 'lambdaFunction', domain: 'analytics', service: 'api' })
  })

  it('unconstrained segments accept any string value', () => {
    const c = conventions({ org: 'acme', domain: ['payments'] })

    // tenant, key, etc. are unconstrained → accept any string
    c.name({
      type: 'ssmParam',
      domain: 'payments',
      service: 'api',
      tenant: 'any-tenant',
      key: 'any-key',
    })
  })
})
