import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions', () => {
  describe('basic naming — no defaults', () => {
    const c = new DerropsConventions()

    it('s3Bucket with explicit segments only', () => {
      expect(
        c.name({ type: 's3Bucket', domain: 'sales', service: 'email', key: 'mail list' }),
      ).toBe('sales--email--mail-list')
    })

    it('ssmParam with explicit segments only', () => {
      expect(
        c.name({
          type: 'ssmParam',
          org: 'acme',
          domain: 'payments',
          service: 'checkout-api',
          key: 'stripe-key',
        }),
      ).toBe('/acme/payments/checkout-api/stripe-key')
    })

    it('kafkaTopic uses dot delimiter', () => {
      expect(
        c.name({
          type: 'kafkaTopic',
          org: 'acme',
          domain: 'payments',
          service: 'checkout-api',
          key: 'events',
        }),
      ).toBe('acme.payments.checkout-api.events')
    })

    it('rdsDbName uses underscore delimiters', () => {
      expect(
        c.name({ type: 'rdsDbName', org: 'acme', domain: 'payments', service: 'checkout-api' }),
      ).toBe('acme_payments_checkout-api')
    })
  })

  describe('with defaults', () => {
    const c = new DerropsConventions({
      region: 'ap-southeast-2',
      env: 'dev',
      org: 'acme',
      domain: 'payments',
      service: 'checkout-api',
    })

    it('s3Bucket includes region + env because global:true', () => {
      expect(c.name({ type: 's3Bucket', key: 'backups' })).toBe(
        'ap-southeast-2--dev--acme--payments--checkout-api--backups',
      )
    })

    it('lambdaFunction omits region + env because global:false', () => {
      expect(c.name({ type: 'lambdaFunction', key: 'webhook-handler' })).toBe(
        'acme--payments--checkout-api--webhook-handler',
      )
    })

    it('ssmParam omits region + env and adds leading slash', () => {
      expect(c.name({ type: 'ssmParam', key: 'stripe-webhook-secret' })).toBe(
        '/acme/payments/checkout-api/stripe-webhook-secret',
      )
    })

    it('cloudwatchMetricNamespace only uses org + domain', () => {
      expect(c.name({ type: 'cloudwatchMetricNamespace' })).toBe('acme/payments')
    })

    it('route53Record uses reversed DNS hierarchy', () => {
      expect(c.name({ type: 'route53Record', org: 'acme.com' })).toBe('checkout-api.dev.acme.com')
    })

    it('route53HostedZone uses env + org', () => {
      expect(c.name({ type: 'route53HostedZone', org: 'acme.com' })).toBe('dev.acme.com')
    })
  })

  describe('segment overrides', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

    it('override domain for a specific name call', () => {
      expect(
        c.name({
          type: 'lambdaFunction',
          domain: 'identity',
          service: 'auth-service',
          key: 'token-refresh',
        }),
      ).toBe('acme--identity--auth-service--token-refresh')
    })

    it('normalises spaces to word delimiter', () => {
      expect(c.name({ type: 'sqsQueue', key: 'order events' })).toBe(
        'acme--payments--checkout-api--order-events',
      )
    })

    it('lowercases values', () => {
      expect(c.name({ type: 'dynamoDb', key: 'Transactions' })).toBe(
        'acme--payments--checkout-api--transactions',
      )
    })
  })

  describe('segmentOrder()', () => {
    it('custom order is respected', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout' })
      c.segmentOrder('domain', 'org', 'service', 'key')
      expect(c.name({ type: 'lambdaFunction', key: 'handler' })).toBe(
        'payments--acme--checkout--handler',
      )
    })

    it('segments not in custom order are excluded', () => {
      const c = new DerropsConventions({
        org: 'acme',
        region: 'ap-southeast-2',
        domain: 'payments',
        service: 'api',
      })
      c.segmentOrder('org', 'domain', 'service')
      expect(c.name({ type: 'lambdaFunction' })).toBe('acme--payments--api')
    })

    it('global resource uses full custom order including region+env', () => {
      const c = new DerropsConventions({
        org: 'acme',
        env: 'prod',
        region: 'us-east-1',
        domain: 'data',
        service: 'store',
      })
      c.segmentOrder('env', 'region', 'org', 'domain', 'service', 'key')
      expect(c.name({ type: 's3Bucket', key: 'logs' })).toBe(
        'prod--us-east-1--acme--data--store--logs',
      )
    })
  })

  describe('with()', () => {
    const base = new DerropsConventions({ org: 'acme', domain: 'platform' })

    it('creates derived instance with merged defaults', () => {
      const tenant = base.with({ tenant: 't-a3f8b2', domain: 'payments', service: 'checkout-api' })
      expect(tenant.name({ type: 'ssmParam', key: 'stripe-key' })).toBe(
        '/acme/t-a3f8b2/payments/checkout-api/stripe-key',
      )
    })

    it('does not mutate the base instance', () => {
      const tenant = base.with({ tenant: 't-a3f8b2' })
      expect(base.name({ type: 'lambdaFunction', service: 'billing', key: 'invoicer' })).toBe(
        'acme--platform--billing--invoicer',
      )
      expect(tenant.name({ type: 'lambdaFunction', service: 'billing', key: 'invoicer' })).toBe(
        'acme--t-a3f8b2--platform--billing--invoicer',
      )
    })
  })

  describe('tenant (silo model)', () => {
    const c = new DerropsConventions({
      region: 'ap-southeast-2',
      env: 'prod',
      org: 'acme',
      tenant: 't-a3f8b2',
      domain: 'payments',
      service: 'checkout-api',
    })

    it('ssmParam path includes tenant', () => {
      expect(c.name({ type: 'ssmParam', key: 'stripe-webhook-secret' })).toBe(
        '/acme/t-a3f8b2/payments/checkout-api/stripe-webhook-secret',
      )
    })

    it('s3Bucket with tenant includes all global segments', () => {
      expect(c.name({ type: 's3Bucket', key: 'data' })).toBe(
        'ap-southeast-2--prod--acme--t-a3f8b2--payments--checkout-api--data',
      )
    })

    it('s3Bucket with tenant includes all global segments', () => {
      expect(c.name({ type: 's3Bucket', key: 'data' })).toBe(
        'ap-southeast-2--prod--acme--t-a3f8b2--payments--checkout-api--data',
      )
    })
  })

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

  describe('default type via with({ type })', () => {
    const conventions = new DerropsConventions({ org: 'acme', env: 'dev', domain: 'platform' })

    it('omits type from name() when default is set', () => {
      const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
      expect(oaspec.name({})).toBe('acme--oaspec')
    })

    it('type in name() overrides the default', () => {
      const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
      expect(oaspec.name({ type: 'lambdaFunction', service: 'indexer', key: 'handler' }))
        .toBe('acme--oaspec--indexer--handler')
    })

    it('with() without type preserves an existing default type', () => {
      const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
      const prod = oaspec.with({ env: 'prod' })
      expect(prod.name({})).toBe('acme--oaspec')
    })

    it('with() with a new type replaces the existing default', () => {
      const oaspec = conventions.with({ type: 'openSearchIndex' })
      const lambda = oaspec.with({ type: 'lambdaFunction' })
      expect(lambda.name({ service: 'indexer', key: 'handler' })).toBe('acme--platform--indexer--handler')
    })

    it('does not mutate the parent instance', () => {
      const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
      void oaspec
      // parent still requires type
      expect(conventions.name({ type: 'lambdaFunction', service: 'api', key: 'handler' }))
        .toBe('acme--platform--api--handler')
    })
  })

  describe('openSearchIndex', () => {
    const c = new DerropsConventions({
      org: 'acme',
      domain: 'payments',
      service: 'checkout-api',
    })

    it('uses org + domain segments with -- delimiter', () => {
      expect(c.name({ type: 'openSearchIndex' })).toBe('acme--payments')
    })

    it('service and key are excluded — fixed segments list is org + domain only', () => {
      expect(c.name({ type: 'openSearchIndex', key: 'transactions' })).toBe('acme--payments')
    })

    it('omits region and env regardless of defaults', () => {
      const withEnv = c.with({ region: 'ap-southeast-2', env: 'prod' })
      expect(withEnv.name({ type: 'openSearchIndex' })).toBe('acme--payments')
    })

    it('includes tenant between org and domain in silo model', () => {
      expect(c.with({ tenant: 't-a3f8b2' }).name({ type: 'openSearchIndex' })).toBe(
        'acme--t-a3f8b2--payments',
      )
    })
  })

  describe('openSearchIndexSavings', () => {
    const c = new DerropsConventions({
      org: 'acme',
      domain: 'payments',
      service: 'checkout-api',
    })

    it('uses org + domain segments with -- entity, delimiter', () => {
      expect(c.name({ type: 'openSearchIndex', entity: 'transactions' })).toBe(
        'acme--payments--transactions',
      )
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

  describe('DerropsConventions.resourceTypes()', () => {
    it('returns sorted list of type keys', () => {
      const types = DerropsConventions.resourceTypes()
      expect(types).toContain('s3Bucket')
      expect(types).toContain('ssmParam')
      expect(types).toContain('lambdaFunction')
      expect(types).toEqual([...types].sort())
    })
  })
})
