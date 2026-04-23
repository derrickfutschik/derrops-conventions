import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

describe('DerropsConventions — naming', () => {
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

    it('route53Record uses service + apex zone', () => {
      expect(c.name({ type: 'route53Record', apex: 'dev.acme.com' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('route53HostedZone is the apex zone verbatim', () => {
      expect(c.name({ type: 'route53HostedZone', apex: 'dev.acme.com' })).toBe('dev.acme.com')
    })

    it('route53HostedZone from instance apex default', () => {
      expect(c.with({ apex: 'dev.acme.com' }).name({ type: 'route53HostedZone' })).toBe(
        'dev.acme.com',
      )
    })

    it('acmCertificate uses service + apex zone', () => {
      expect(c.with({ apex: 'dev.acme.com' }).name({ type: 'acmCertificate' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('cloudFrontAlias uses service + apex zone', () => {
      expect(c.with({ apex: 'dev.acme.com' }).name({ type: 'cloudFrontAlias' })).toBe(
        'checkout-api.dev.acme.com',
      )
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
        '/acme/payments/checkout-api/t-a3f8b2/stripe-key',
      )
    })

    it('does not mutate the base instance', () => {
      const tenant = base.with({ tenant: 't-a3f8b2' })
      expect(base.name({ type: 'lambdaFunction', service: 'billing', key: 'invoicer' })).toBe(
        'acme--platform--billing--invoicer',
      )
      expect(tenant.name({ type: 'lambdaFunction', service: 'billing', key: 'invoicer' })).toBe(
        'acme--platform--billing--t-a3f8b2--invoicer',
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

    it('ssmParam path places tenant after service (ABAC default order)', () => {
      expect(c.name({ type: 'ssmParam', key: 'stripe-webhook-secret' })).toBe(
        '/acme/payments/checkout-api/t-a3f8b2/stripe-webhook-secret',
      )
    })

    it('s3Bucket with tenant uses default order (tenant after service)', () => {
      expect(c.name({ type: 's3Bucket', key: 'data' })).toBe(
        'ap-southeast-2--prod--acme--payments--checkout-api--t-a3f8b2--data',
      )
    })

    it('moveSegment repositions tenant before domain for S3 silo isolation', () => {
      expect(
        c.with({}).moveSegment('tenant', 'domain').name({ type: 's3Bucket', key: 'data' }),
      ).toBe('ap-southeast-2--prod--acme--t-a3f8b2--payments--checkout-api--data')
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
      expect(oaspec.name({ type: 'lambdaFunction', service: 'indexer', key: 'handler' })).toBe(
        'acme--oaspec--indexer--handler',
      )
    })

    it('with() without type preserves an existing default type', () => {
      const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
      const prod = oaspec.with({ env: 'prod' })
      expect(prod.name({})).toBe('acme--oaspec')
    })

    it('with() with a new type replaces the existing default', () => {
      const oaspec = conventions.with({ type: 'openSearchIndex' })
      const lambda = oaspec.with({ type: 'lambdaFunction' })
      expect(lambda.name({ service: 'indexer', key: 'handler' })).toBe(
        'acme--platform--indexer--handler',
      )
    })

    it('does not mutate the parent instance', () => {
      const oaspec = conventions.with({ domain: 'oaspec', type: 'openSearchIndex' })
      void oaspec
      expect(conventions.name({ type: 'lambdaFunction', service: 'api', key: 'handler' })).toBe(
        'acme--platform--api--handler',
      )
    })
  })

  describe('suffix', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })

    it('sqsFifoQueue appends .fifo', () => {
      expect(c.name({ type: 'sqsFifoQueue', key: 'events' })).toBe(
        'acme--payments--api--events.fifo',
      )
    })

    it('dynamoDbGsi appends --gsi', () => {
      expect(c.name({ type: 'dynamoDbGsi', key: 'by-user' })).toBe(
        'acme--payments--api--by-user--gsi',
      )
    })

    it('sqsDlq appends --dlq', () => {
      expect(c.name({ type: 'sqsDlq', key: 'events' })).toBe('acme--payments--api--events--dlq')
    })

    it('eventBridgeRule appends -rule', () => {
      expect(c.name({ type: 'eventBridgeRule', key: 'order-created' })).toBe(
        'acme--payments--api--order-created-rule',
      )
    })

    it('glueJob appends -job', () => {
      expect(c.name({ type: 'glueJob', key: 'transform' })).toBe(
        'acme--payments--api--transform-job',
      )
    })

    it('glueCrawler appends -crawler', () => {
      expect(c.name({ type: 'glueCrawler', key: 'raw-data' })).toBe(
        'acme--payments--api--raw-data-crawler',
      )
    })

    it('cloudFormationStack appends -stack', () => {
      expect(c.name({ type: 'cloudFormationStack', key: 'infra' })).toBe(
        'acme--payments--api--infra-stack',
      )
    })

    it('ec2ElasticIp appends --eip and ignores key segment', () => {
      expect(c.name({ type: 'ec2ElasticIp' })).toBe('acme--payments--api--eip')
    })

    it('autoScalingGroup appends --asg and ignores key segment', () => {
      expect(c.name({ type: 'autoScalingGroup' })).toBe('acme--payments--api--asg')
    })

    it('networkAcl appends --nacl', () => {
      expect(c.name({ type: 'networkAcl' })).toBe('acme--payments--api--nacl')
    })

    it('wafWebAcl appends --waf', () => {
      expect(c.name({ type: 'wafWebAcl' })).toBe('acme--payments--api--waf')
    })

    it('suffix still appended when leadingDelimiter is set', () => {
      const withEnv = c.with({ env: 'prod', region: 'ap-southeast-2' })
      expect(withEnv.name({ type: 'sqsFifoQueue', key: 'jobs' })).toBe(
        'acme--payments--api--jobs.fifo',
      )
    })
  })

  describe('new segment keys — kind, az, purpose, num, consumer, target, version', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })

    it('subnet uses kind and az segments', () => {
      expect(c.name({ type: 'subnet', kind: 'private', az: '1a' })).toBe(
        'acme--payments--api--private--1a',
      )
    })

    it('subnet omits az when not supplied', () => {
      expect(c.name({ type: 'subnet', kind: 'public' })).toBe('acme--payments--api--public')
    })

    it('ec2Instance uses kind and num segments', () => {
      expect(c.name({ type: 'ec2Instance', kind: 'web', num: '01' })).toBe(
        'acme--payments--api--web--01',
      )
    })

    it('ec2SecurityGroup uses purpose segment', () => {
      expect(c.name({ type: 'ec2SecurityGroup', purpose: 'web' })).toBe('acme--payments--api--web')
    })

    it('targetGroup uses purpose segment', () => {
      expect(c.name({ type: 'targetGroup', purpose: 'checkout' })).toBe(
        'acme--payments--api--checkout',
      )
    })

    it('apiGatewayKey uses consumer segment', () => {
      expect(c.name({ type: 'apiGatewayKey', consumer: 'partner-a' })).toBe(
        'acme--payments--api--partner-a',
      )
    })

    it('appSyncDataSource uses target segment', () => {
      expect(c.name({ type: 'appSyncDataSource', target: 'user-table' })).toBe(
        'acme--payments--api--user-table',
      )
    })

    it('version segment can be used with ecr via segmentOrder', () => {
      const c2 = new DerropsConventions({
        org: 'acme',
        domain: 'payments',
        service: 'api',
      }).segmentOrder('org', 'domain', 'service', 'version')
      expect(c2.name({ type: 'ecr', version: '1.2.3' })).toBe('acme/payments/api/1.2.3')
    })
  })

  describe('error path — missing type', () => {
    it('throws when no type passed and no default set', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(() => c.name({} as Parameters<typeof c.name>[0])).toThrow('name() requires a "type"')
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

    it('entity segment appended when provided', () => {
      expect(c.name({ type: 'openSearchIndex', entity: 'transactions' })).toBe(
        'acme--payments--transactions',
      )
    })

    it('tenant appended after entity (entity is design-time, tenant is runtime)', () => {
      expect(c.with({ tenant: 't-a3f8b2' }).name({ type: 'openSearchIndex' })).toBe(
        'acme--payments--t-a3f8b2',
      )
    })

    it('entity before tenant when both provided', () => {
      expect(
        c.with({ tenant: 't-a3f8b2' }).name({ type: 'openSearchIndex', entity: 'transactions' }),
      ).toBe('acme--payments--transactions--t-a3f8b2')
    })
  })
})
