import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const makeBase = () =>
  new DerropsConventions({
    org: 'acme',
    env: 'prod',
    region: 'ap-southeast-2',
    domain: 'payments',
    service: 'checkout-api',
  })

describe('DerropsConventions — dimensions()', () => {
  describe('default output', () => {
    it('returns Service only by default', () => {
      expect(makeBase().with({ tenant: 't-a3f8b2' }).dimensions()).toEqual([
        { Name: 'service', Value: 'checkout-api' },
      ])

      console.log(makeBase().dimensions())
    })

    it('omits dimensions whose segments are absent', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' })
      expect(c.dimensions()).toEqual([{ Name: 'service', Value: 'api' }])
    })

    it('returns empty array when service is absent', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      expect(c.dimensions()).toEqual([])
    })
  })

  describe('dimensionKeys()', () => {
    it('includes all requested keys that have values', () => {
      expect(makeBase().dimensionKeys('service', 'env').dimensions()).toEqual([
        { Name: 'service', Value: 'checkout-api' },
        { Name: 'env', Value: 'prod' },
      ])
    })

    it('includes all five keys', () => {
      const c = makeBase().with({ tenant: 't-a3f8b2' })
      expect(c.dimensionKeys('org', 'domain', 'service', 'env', 'tenant').dimensions()).toEqual([
        { Name: 'org', Value: 'acme' },
        { Name: 'domain', Value: 'payments' },
        { Name: 'service', Value: 'checkout-api' },
        { Name: 'env', Value: 'prod' },
        { Name: 'tenant', Value: 't-a3f8b2' },
      ])
    })

    it('empty dimensionKeys produces no dimensions', () => {
      expect(makeBase().dimensionKeys().dimensions()).toEqual([])
    })

    it('with() inherits dimensionKeys from parent', () => {
      const base = makeBase().dimensionKeys('service', 'env')
      const child = base.with({ service: 'auth-service' })
      expect(child.dimensions()).toEqual([
        { Name: 'service', Value: 'auth-service' },
        { Name: 'env', Value: 'prod' },
      ])
    })

    it('dimensionKeys on derived instance does not affect parent', () => {
      const base = makeBase()
      const derived = base.with({}).dimensionKeys('service', 'env')
      expect(base.dimensions()).toEqual([{ Name: 'service', Value: 'checkout-api' }])
      expect(derived.dimensions()).toHaveLength(2)
    })
  })

  describe('call-time segment overrides', () => {
    it('override service at call time', () => {
      expect(makeBase().dimensions({ service: 'auth-service' })).toEqual([
        { Name: 'service', Value: 'auth-service' },
      ])
    })

    it('override env at call time when included', () => {
      expect(makeBase().dimensionKeys('service', 'env').dimensions({ env: 'staging' })).toEqual([
        { Name: 'service', Value: 'checkout-api' },
        { Name: 'env', Value: 'staging' },
      ])
    })
  })

  describe('dimension names are lowercase', () => {
    it('org → org', () => {
      expect(makeBase().dimensionKeys('org').dimensions()).toEqual([{ Name: 'org', Value: 'acme' }])
    })

    it('env → env', () => {
      expect(makeBase().dimensionKeys('env').dimensions()).toEqual([{ Name: 'env', Value: 'prod' }])
    })

    it('tenant → tenant', () => {
      expect(makeBase().with({ tenant: 't-a3f8b2' }).dimensionKeys('tenant').dimensions()).toEqual([
        { Name: 'tenant', Value: 't-a3f8b2' },
      ])
    })
  })

  describe('pairing with cloudwatchMetricNamespace', () => {
    it('namespace captures org/domain; default dimensions capture service', () => {
      const c = makeBase()
      expect(c.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')
      expect(c.dimensions()).toEqual([{ Name: 'service', Value: 'checkout-api' }])
    })

    it('multi-tenant: namespace is shared, tenant dimension separates metric series', () => {
      const base = makeBase()
      const tenantA = base.with({ tenant: 't-aaaa' }).dimensionKeys('service', 'tenant')
      const tenantB = base.with({ tenant: 't-bbbb' }).dimensionKeys('service', 'tenant')

      expect(tenantA.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')
      expect(tenantB.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')

      expect(tenantA.dimensions()).toEqual([
        { Name: 'service', Value: 'checkout-api' },
        { Name: 'tenant', Value: 't-aaaa' },
      ])
      expect(tenantB.dimensions()).toEqual([
        { Name: 'service', Value: 'checkout-api' },
        { Name: 'tenant', Value: 't-bbbb' },
      ])
    })
  })
})
