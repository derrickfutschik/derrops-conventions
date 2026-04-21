import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions — constraints', () => {
  describe('domain() / service() helpers', () => {
    it('narrows domain and service via array helpers', () => {
      const c = new DerropsConventions({ org: 'acme', env: 'prod' })
        .domain(['payments', 'identity', 'platform'])
        .service(['checkout-api', 'auth-service'])

      expect(
        c.name({
          type: 'lambdaFunction',
          domain: 'payments',
          service: 'checkout-api',
          key: 'handler',
        }),
      ).toBe('acme--payments--checkout-api--handler')
    })

    it('chaining domain() on the same key replaces the previous constraint', () => {
      const c = new DerropsConventions({ org: 'acme' })
        .domain(['payments', 'identity'])
        .domain(['analytics'])

      expect(
        c.name({ type: 'lambdaFunction', domain: 'analytics', service: 'etl', key: 'job' }),
      ).toBe('acme--analytics--etl--job')
    })

    it('with() preserves constraint type after helper', () => {
      const base = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])
      const prod = base.with({ env: 'prod' })

      expect(
        prod.name({
          type: 'lambdaFunction',
          domain: 'payments',
          service: 'checkout-api',
          key: 'handler',
        }),
      ).toBe('acme--payments--checkout-api--handler')
    })

    it('all segment helpers are available', () => {
      const c = new DerropsConventions()
        .region(['ap-southeast-2', 'us-east-1'])
        .env(['dev', 'prod'])
        .org(['acme'])
        .tenant(['t-a3f8b2'])
        .domain(['payments'])
        .service(['checkout-api'])
        .partition(['2024/01'])
        .key(['stripe-key'])

      expect(
        c.name({
          type: 's3Bucket',
          region: 'ap-southeast-2',
          env: 'prod',
          org: 'acme',
          domain: 'payments',
          service: 'checkout-api',
          key: 'stripe-key',
        }),
      ).toBe('ap-southeast-2--prod--acme--payments--checkout-api--stripe-key')
    })
  })

  describe('constrain()', () => {
    it('variadic form still works for dynamic segment lists', () => {
      const segments = ['payments', 'identity'] as const
      const c = new DerropsConventions({ org: 'acme' }).constrain('domain', ...segments)

      expect(
        c.name({ type: 'lambdaFunction', domain: 'payments', service: 'api', key: 'handler' }),
      ).toBe('acme--payments--api--handler')
    })

    it('helper and constrain() produce identical runtime output', () => {
      const viaHelper = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
      }).domain(['payments', 'identity'])
      const viaConstrain = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
      }).constrain('domain', 'payments', 'identity')

      const opts = { type: 'lambdaFunction' as const, key: 'handler' }
      expect(viaHelper.name(opts)).toBe(viaConstrain.name(opts))
    })
  })

  describe('registerResourceType()', () => {
    it('custom type is usable after registration', () => {
      DerropsConventions.registerResourceType('myCustomQueue', {
        global: false,
        segmentDelimiter: '::',
        wordDelimiter: '-',
      })
      const c = new DerropsConventions({ org: 'acme', domain: 'ops' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(c.name({ type: 'myCustomQueue' as any, service: 'notifier', key: 'alerts' })).toBe(
        'acme::ops::notifier::alerts',
      )
    })
  })

  describe('resourceTypes()', () => {
    it('returns sorted list of type keys', () => {
      const types = DerropsConventions.resourceTypes()
      expect(types).toContain('s3Bucket')
      expect(types).toContain('ssmParam')
      expect(types).toContain('lambdaFunction')
      expect(types).toEqual([...types].sort())
    })
  })
})
