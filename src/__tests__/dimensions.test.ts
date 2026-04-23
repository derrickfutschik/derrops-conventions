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
        { Name: 'Service', Value: 'checkout-api' },
      ])

      console.log(makeBase().dimensions())
    })

    it('omits dimensions whose segments are absent', () => {
      const c = new DerropsConventions({ domain: 'payments', service: 'api' })
      expect(c.dimensions()).toEqual([{ Name: 'Service', Value: 'api' }])
    })

    it('returns empty array when service is absent', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      expect(c.dimensions()).toEqual([])
    })
  })

  describe('dimensionKeys()', () => {
    it('includes all requested keys that have values', () => {
      expect(makeBase().dimensionKeys('service', 'environment').dimensions()).toEqual([
        { Name: 'Service', Value: 'checkout-api' },
        { Name: 'Environment', Value: 'prod' },
      ])
    })

    it('includes all five keys', () => {
      const c = makeBase().with({ tenant: 't-a3f8b2' })
      expect(
        c.dimensionKeys('org', 'domain', 'service', 'environment', 'tenant').dimensions(),
      ).toEqual([
        { Name: 'Org', Value: 'acme' },
        { Name: 'Domain', Value: 'payments' },
        { Name: 'Service', Value: 'checkout-api' },
        { Name: 'Environment', Value: 'prod' },
        { Name: 'Tenant', Value: 't-a3f8b2' },
      ])
    })

    it('empty dimensionKeys produces no dimensions', () => {
      expect(makeBase().dimensionKeys().dimensions()).toEqual([])
    })

    it('with() inherits dimensionKeys from parent', () => {
      const base = makeBase().dimensionKeys('service', 'environment')
      const child = base.with({ service: 'auth-service' })
      expect(child.dimensions()).toEqual([
        { Name: 'Service', Value: 'auth-service' },
        { Name: 'Environment', Value: 'prod' },
      ])
    })

    it('dimensionKeys on derived instance does not affect parent', () => {
      const base = makeBase()
      const derived = base.with({}).dimensionKeys('service', 'environment')
      expect(base.dimensions()).toEqual([{ Name: 'Service', Value: 'checkout-api' }])
      expect(derived.dimensions()).toHaveLength(2)
    })
  })

  describe('call-time segment overrides', () => {
    it('override service at call time', () => {
      expect(makeBase().dimensions({ service: 'auth-service' })).toEqual([
        { Name: 'Service', Value: 'auth-service' },
      ])
    })

    it('override environment at call time when included', () => {
      expect(
        makeBase().dimensionKeys('service', 'environment').dimensions({ env: 'staging' }),
      ).toEqual([
        { Name: 'Service', Value: 'checkout-api' },
        { Name: 'Environment', Value: 'staging' },
      ])
    })
  })

  describe('dimension names use PascalCase', () => {
    it('org → Org', () => {
      expect(makeBase().dimensionKeys('org').dimensions()).toEqual([{ Name: 'Org', Value: 'acme' }])
    })

    it('environment → Environment (multi-word)', () => {
      expect(makeBase().dimensionKeys('environment').dimensions()).toEqual([
        { Name: 'Environment', Value: 'prod' },
      ])
    })

    it('tenant → Tenant', () => {
      expect(makeBase().with({ tenant: 't-a3f8b2' }).dimensionKeys('tenant').dimensions()).toEqual([
        { Name: 'Tenant', Value: 't-a3f8b2' },
      ])
    })
  })

  describe('pairing with cloudwatchMetricNamespace', () => {
    it('namespace captures org/domain; default dimensions capture service', () => {
      const c = makeBase()
      expect(c.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')
      expect(c.dimensions()).toEqual([{ Name: 'Service', Value: 'checkout-api' }])
    })

    it('multi-tenant: namespace is shared, tenant dimension separates metric series', () => {
      const base = makeBase()
      const tenantA = base.with({ tenant: 't-aaaa' }).dimensionKeys('service', 'tenant')
      const tenantB = base.with({ tenant: 't-bbbb' }).dimensionKeys('service', 'tenant')

      expect(tenantA.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')
      expect(tenantB.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')

      expect(tenantA.dimensions()).toEqual([
        { Name: 'Service', Value: 'checkout-api' },
        { Name: 'Tenant', Value: 't-aaaa' },
      ])
      expect(tenantB.dimensions()).toEqual([
        { Name: 'Service', Value: 'checkout-api' },
        { Name: 'Tenant', Value: 't-bbbb' },
      ])
    })
  })
})
