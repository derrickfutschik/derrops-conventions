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

    it('rdsDbName uses underscore delimiters and converts hyphens', () => {
      expect(
        c.name({ type: 'rdsDbName', org: 'acme', domain: 'payments', service: 'checkout-api' }),
      ).toBe('acme_payments_checkout_api')
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

    it('iamPath adds trailing slash for valid IAM path format', () => {
      expect(c.name({ type: 'iamPath' })).toBe('/acme/payments/checkout-api/')
    })

    it('iamRole does not produce a leading -- delimiter', () => {
      expect(c.name({ type: 'iamRole' })).toBe('acme--payments--checkout-api')
    })

    it('iamRole with purpose does not produce a leading -- delimiter', () => {
      expect(c.name({ type: 'iamRole', purpose: 'sqs-publish' })).toBe(
        'acme--payments--checkout-api--sqs-publish',
      )
    })

    it('name() strips accidental leading segment delimiter from joined segments', () => {
      // ssmParam intentionally adds a leading '/' via leadingDelimiter — verify the
      // sanitisation of joined does not double-up the slash
      expect(c.name({ type: 'ssmParam', key: 'stripe-key' })).toBe(
        '/acme/payments/checkout-api/stripe-key',
      )
    })

    it('name() strips accidental trailing segment delimiter and intentional suffix is preserved', () => {
      // iamPath has suffix:'/' — verify sanitisation of joined leaves the suffix intact
      expect(c.name({ type: 'iamPath' })).toBe('/acme/payments/checkout-api/')
    })

    it('glueDatabase converts hyphens to underscores', () => {
      expect(c.name({ type: 'glueDatabase' })).toBe('acme_payments_checkout_api')
    })
  })

  describe('new DNS record types', () => {
    const c = new DerropsConventions({
      org: 'acme',
      apex: 'dev.acme.com',
      domain: 'payments',
      service: 'checkout-api',
    })

    it('route53ApexRecord is the zone verbatim — no service prefix', () => {
      expect(c.name({ type: 'route53ApexRecord' })).toBe('dev.acme.com')
    })

    it('route53WildcardRecord prepends *. to the zone', () => {
      expect(c.name({ type: 'route53WildcardRecord' })).toBe('*.dev.acme.com')
    })

    it('cloudFrontWildcardAlias prepends *. to the zone', () => {
      expect(c.name({ type: 'cloudFrontWildcardAlias' })).toBe('*.dev.acme.com')
    })

    it('route53TenantRecord puts tenant before service', () => {
      expect(c.with({ tenant: 'acme-corp' }).name({ type: 'route53TenantRecord' })).toBe(
        'acme-corp.checkout-api.dev.acme.com',
      )
    })

    it('route53TenantPrivateRecord puts tenant before service', () => {
      expect(c.with({ tenant: 'acme-corp' }).name({ type: 'route53TenantPrivateRecord' })).toBe(
        'acme-corp.checkout-api.dev.acme.com',
      )
    })

    it('acmCertificateTenant puts tenant before service', () => {
      expect(c.with({ tenant: 'acme-corp' }).name({ type: 'acmCertificateTenant' })).toBe(
        'acme-corp.checkout-api.dev.acme.com',
      )
    })

    it('cloudFrontTenantAlias puts tenant before service', () => {
      expect(c.with({ tenant: 'acme-corp' }).name({ type: 'cloudFrontTenantAlias' })).toBe(
        'acme-corp.checkout-api.dev.acme.com',
      )
    })

    it('wildcard + apexMapping resolves correctly', () => {
      const mapped = c
        .with({ apex: 'acme.com', env: 'staging' })
        .apexMapping((s) => `${s.env}.${s.apex}`)
      expect(mapped.name({ type: 'route53WildcardRecord' })).toBe('*.staging.acme.com')
    })

    it('tenant-first + apexMapping resolves correctly', () => {
      const mapped = c
        .with({ apex: 'acme.com', env: 'prod', tenant: 'globex' })
        .apexMapping((s) => (s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`))
      expect(mapped.name({ type: 'route53TenantRecord' })).toBe('globex.checkout-api.acme.com')
    })
  })

  describe('normalize() — word-delimiter conversion', () => {
    // wordDelimiter: '_' types must convert both spaces AND hyphens so output is valid
    // for PostgreSQL identifiers, Glue catalog names, and Redshift database names.
    // wordDelimiter: '-' types must leave hyphens untouched.

    describe('rdsDbName (wordDelimiter: _)', () => {
      const c = new DerropsConventions()

      it('hyphens in service converted to underscores', () => {
        expect(
          c.name({ type: 'rdsDbName', org: 'acme', domain: 'payments', service: 'checkout-api' }),
        ).toBe('acme_payments_checkout_api')
      })

      it('hyphens in org and domain also converted', () => {
        expect(
          c.name({ type: 'rdsDbName', org: 'my-org', domain: 'order-management', service: 'api' }),
        ).toBe('my_org_order_management_api')
      })

      it('spaces converted to underscores', () => {
        expect(
          c.name({ type: 'rdsDbName', org: 'acme', domain: 'payments', service: 'checkout api' }),
        ).toBe('acme_payments_checkout_api')
      })

      it('mixed hyphens and spaces both become underscores', () => {
        expect(
          c.name({ type: 'rdsDbName', org: 'acme', domain: 'pay ments', service: 'check-out' }),
        ).toBe('acme_pay_ments_check_out')
      })

      it('multiple consecutive hyphens each become a single underscore', () => {
        expect(c.name({ type: 'rdsDbName', org: 'acme', domain: 'a--b', service: 'api' })).toBe(
          'acme_a__b_api',
        )
      })

      it('already-underscore values are left unchanged', () => {
        expect(
          c.name({ type: 'rdsDbName', org: 'acme', domain: 'payments', service: 'checkout_v2' }),
        ).toBe('acme_payments_checkout_v2')
      })
    })

    describe('glueDatabase (wordDelimiter: _)', () => {
      const c = new DerropsConventions({
        org: 'acme',
        domain: 'analytics',
        service: 'data-pipeline',
      })

      it('hyphens in service converted to underscores', () => {
        expect(c.name({ type: 'glueDatabase' })).toBe('acme_analytics_data_pipeline')
      })

      it('hyphens in key converted to underscores', () => {
        expect(c.name({ type: 'glueDatabase', key: 'raw-events' })).toBe(
          'acme_analytics_data_pipeline_raw_events',
        )
      })
    })

    describe('redshiftDatabase (wordDelimiter: _)', () => {
      const c = new DerropsConventions()

      it('hyphens in all segments converted to underscores', () => {
        expect(
          c.name({
            type: 'redshiftDatabase',
            org: 'acme',
            domain: 'data-warehouse',
            service: 'reporting-api',
          }),
        ).toBe('acme_data_warehouse_reporting_api')
      })

      it('spaces also converted to underscores', () => {
        expect(
          c.name({
            type: 'redshiftDatabase',
            org: 'acme',
            domain: 'data warehouse',
            service: 'api',
          }),
        ).toBe('acme_data_warehouse_api')
      })
    })

    describe('wordDelimiter: - types must NOT convert hyphens', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

      it('lambdaFunction preserves hyphens', () => {
        expect(c.name({ type: 'lambdaFunction', key: 'webhook-handler' })).toBe(
          'acme--payments--checkout-api--webhook-handler',
        )
      })

      it('s3Bucket preserves hyphens (global)', () => {
        expect(
          c
            .with({ region: 'ap-southeast-2', env: 'prod' })
            .name({ type: 's3Bucket', key: 'raw-data' }),
        ).toBe('ap-southeast-2--prod--acme--payments--checkout-api--raw-data')
      })

      it('ssmParam preserves hyphens', () => {
        expect(c.name({ type: 'ssmParam', key: 'stripe-webhook-secret' })).toBe(
          '/acme/payments/checkout-api/stripe-webhook-secret',
        )
      })
    })
  })

  describe('space as word separator — input convention', () => {
    // The canonical input convention: segment values use spaces to separate words.
    // normalize() converts spaces → wordDelimiter at name()-build time, regardless of
    // whether the segment was set via with() or passed directly to name().

    describe('wordDelimiter: - (all standard resource types)', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

      it('space in key passed to name() becomes hyphen', () => {
        expect(c.name({ type: 'lambdaFunction', key: 'order events' })).toBe(
          'acme--payments--checkout-api--order-events',
        )
      })

      it('space in service passed to name() becomes hyphen', () => {
        expect(
          new DerropsConventions({ org: 'acme', domain: 'payments' }).name({
            type: 'lambdaFunction',
            service: 'checkout api',
            key: 'handler',
          }),
        ).toBe('acme--payments--checkout-api--handler')
      })

      it('space in key set via with() becomes hyphen', () => {
        expect(c.with({ key: 'order events' }).name({ type: 'lambdaFunction' })).toBe(
          'acme--payments--checkout-api--order-events',
        )
      })

      it('space in service set via with() becomes hyphen', () => {
        expect(
          new DerropsConventions({ org: 'acme', domain: 'payments' })
            .with({ service: 'checkout api' })
            .name({ type: 'lambdaFunction', key: 'handler' }),
        ).toBe('acme--payments--checkout-api--handler')
      })

      it('multi-word segments work across types with dot segmentDelimiter (kafkaTopic)', () => {
        expect(
          new DerropsConventions({ org: 'acme', domain: 'payments' }).name({
            type: 'kafkaTopic',
            service: 'checkout api',
            key: 'order events',
          }),
        ).toBe('acme.payments.checkout-api.order-events')
      })
    })

    describe('wordDelimiter: _ (rdsDbName, glueDatabase, redshiftDatabase)', () => {
      const c = new DerropsConventions()

      it('space in service passed to name() becomes underscore', () => {
        expect(
          c.name({ type: 'rdsDbName', org: 'acme', domain: 'payments', service: 'checkout api' }),
        ).toBe('acme_payments_checkout_api')
      })

      it('space in service set via with() becomes underscore', () => {
        expect(
          new DerropsConventions({ org: 'acme', domain: 'payments' })
            .with({ service: 'checkout api' })
            .name({ type: 'rdsDbName' }),
        ).toBe('acme_payments_checkout_api')
      })

      it('multi-word domain set via with() becomes underscore', () => {
        expect(
          new DerropsConventions({ org: 'acme' })
            .with({ domain: 'order management', service: 'api' })
            .name({ type: 'rdsDbName' }),
        ).toBe('acme_order_management_api')
      })
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
      expect(c.name({ type: 'lambdaFunction', key: 'order events' })).toBe(
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

  describe('suffix — AWS-mandated and same-service collision prevention only', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })

    it('sqsFifoQueue appends .fifo via suffixDelimiter', () => {
      expect(c.name({ type: 'sqsFifoQueue', key: 'events' })).toBe('acme--payments--api--events.fifo')
    })

    it('sqsDlq appends --dlq via segmentDelimiter', () => {
      expect(c.name({ type: 'sqsDlq', key: 'events' })).toBe('acme--payments--api--events--dlq')
    })

    it('iamPath appends trailing / with no extra separator', () => {
      expect(c.name({ type: 'iamPath' })).toBe('/acme/payments/api/')
    })

    it('cloudMapNamespace appends .local via segmentDelimiter', () => {
      expect(
        new DerropsConventions({ org: 'acme', domain: 'payments' }).name({ type: 'cloudMapNamespace' }),
      ).toBe('payments.acme.local')
    })

    it('dynamoDbGsi has no suffix — use key to distinguish from table', () => {
      expect(c.name({ type: 'dynamoDbGsi', key: 'by-user' })).toBe('acme--payments--api--by-user')
    })

    it('eventBridgeRule has no suffix', () => {
      expect(c.name({ type: 'eventBridgeRule', key: 'order-created' })).toBe(
        'acme--payments--api--order-created',
      )
    })

    it('cloudFormationStack has no suffix', () => {
      expect(c.name({ type: 'cloudFormationStack', key: 'infra' })).toBe(
        'acme--payments--api--infra',
      )
    })

    it('ec2ElasticIp has no suffix', () => {
      expect(c.name({ type: 'ec2ElasticIp' })).toBe('acme--payments--api')
    })

    it('networkAcl has no suffix', () => {
      expect(c.name({ type: 'networkAcl' })).toBe('acme--payments')
    })

    it('wafWebAcl has no suffix', () => {
      expect(c.name({ type: 'wafWebAcl' })).toBe('acme--payments--api')
    })
  })

  describe('new segment keys — kind, az, purpose, num, consumer, target, version', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })

    it('subnet uses kind and az segments (service not included — domain-scoped)', () => {
      expect(c.name({ type: 'subnet', kind: 'private', az: '1a' })).toBe(
        'acme--payments--private--1a',
      )
    })

    it('subnet omits az when not supplied', () => {
      expect(c.name({ type: 'subnet', kind: 'public' })).toBe('acme--payments--public')
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

  describe('networking topology — boundary-aligned naming', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

    describe('vpc (org boundary)', () => {
      it('name is org-only', () => {
        expect(c.name({ type: 'vpc' })).toBe('acme')
      })

      it('domain and service are not included even when set on instance', () => {
        expect(c.name({ type: 'vpc' })).not.toContain('payments')
        expect(c.name({ type: 'vpc' })).not.toContain('checkout-api')
      })
    })

    describe('subnet (domain boundary, no service)', () => {
      it('private subnet with az', () => {
        expect(c.name({ type: 'subnet', kind: 'private', az: '1a' })).toBe(
          'acme--payments--private--1a',
        )
      })

      it('public subnet with az', () => {
        expect(c.name({ type: 'subnet', kind: 'public', az: '1c' })).toBe(
          'acme--payments--public--1c',
        )
      })

      it('isolated subnet without az', () => {
        expect(c.name({ type: 'subnet', kind: 'isolated' })).toBe('acme--payments--isolated')
      })

      it('service is absent even when set on instance', () => {
        expect(c.name({ type: 'subnet', kind: 'private', az: '1a' })).not.toContain('checkout-api')
      })
    })

    describe('networkAcl (domain boundary control)', () => {
      it('name is org + domain', () => {
        expect(c.name({ type: 'networkAcl' })).toBe('acme--payments')
      })

      it('service is absent even when set on instance', () => {
        expect(c.name({ type: 'networkAcl' })).not.toContain('checkout-api')
      })

      it('different domains produce different NACLs', () => {
        expect(c.with({ domain: 'identity' }).name({ type: 'networkAcl' })).toBe('acme--identity')
      })
    })

    describe('routeTable (domain + tier)', () => {
      it('private route table', () => {
        expect(c.name({ type: 'routeTable', kind: 'private' })).toBe('acme--payments--private')
      })

      it('public route table', () => {
        expect(c.name({ type: 'routeTable', kind: 'public' })).toBe('acme--payments--public')
      })
    })

    describe('ec2SecurityGroup (service-scoped access object)', () => {
      it('web purpose', () => {
        expect(c.name({ type: 'ec2SecurityGroup', purpose: 'web' })).toBe(
          'acme--payments--checkout-api--web',
        )
      })

      it('db purpose', () => {
        expect(c.name({ type: 'ec2SecurityGroup', purpose: 'db' })).toBe(
          'acme--payments--checkout-api--db',
        )
      })

      it('internal purpose', () => {
        expect(c.name({ type: 'ec2SecurityGroup', purpose: 'internal' })).toBe(
          'acme--payments--checkout-api--internal',
        )
      })
    })

    describe('transitGateway (org hub)', () => {
      it('name is org only', () => {
        expect(c.name({ type: 'transitGateway' })).toBe('acme')
      })

      it('domain and service are not included', () => {
        expect(c.name({ type: 'transitGateway' })).not.toContain('payments')
      })
    })

    describe('transitGatewayAttachment (domain → org TGW)', () => {
      it('name is org + domain', () => {
        expect(c.name({ type: 'transitGatewayAttachment' })).toBe('acme--payments')
      })

      it('different domains produce different attachments', () => {
        expect(c.with({ domain: 'identity' }).name({ type: 'transitGatewayAttachment' })).toBe(
          'acme--identity',
        )
      })
    })

    describe('vpcPeering (cross-org)', () => {
      it('uses target segment for remote org name', () => {
        expect(c.name({ type: 'vpcPeering', target: 'globex' })).toBe('acme--globex')
      })

      it('domain does not appear — peering is org-level', () => {
        expect(c.name({ type: 'vpcPeering', target: 'globex' })).not.toContain('payments')
      })

      it('different remote orgs produce different peer names', () => {
        expect(c.name({ type: 'vpcPeering', target: 'acme-partner' })).toBe('acme--acme-partner')
      })
    })

    describe('vpcEndpoint (domain → AWS service)', () => {
      it('s3 endpoint', () => {
        expect(c.name({ type: 'vpcEndpoint', service: 's3' })).toBe('acme--payments--s3')
      })

      it('dynamodb endpoint', () => {
        expect(c.name({ type: 'vpcEndpoint', service: 'dynamodb' })).toBe('acme--payments--dynamodb')
      })

      it('ecr-api endpoint (hyphen preserved — wordDelimiter is -)', () => {
        expect(c.name({ type: 'vpcEndpoint', service: 'ecr-api' })).toBe('acme--payments--ecr-api')
      })
    })

    describe('clientVpnEndpoint (employee VPN entry point)', () => {
      const platform = new DerropsConventions({ org: 'acme', domain: 'platform' })

      it('name is org + domain', () => {
        expect(platform.name({ type: 'clientVpnEndpoint' })).toBe('acme--platform')
      })

      it('different domains produce different endpoint names', () => {
        expect(
          new DerropsConventions({ org: 'acme', domain: 'ops' }).name({
            type: 'clientVpnEndpoint',
          }),
        ).toBe('acme--ops')
      })

      // Resource-level access control (OpenSearch vs RDS) is achieved by placing each
      // resource type in a different domain — each domain has its own CIDR block, so
      // authorization rules (group → CIDR) can target them independently without
      // requiring multiple endpoints (which incur per-endpoint AWS charges).
      it('endpoint SG is shared across all users — authorization rules enforce per-group CIDR access', () => {
        const endpointSg = platform.with({ service: 'client-vpn' }).name({
          type: 'ec2SecurityGroup',
          purpose: 'all',
        })
        // Coarse allow — authorization rules narrow access per AD/Cognito group
        expect(endpointSg).toBe('acme--platform--client-vpn--all')
      })
    })
  })

  describe('networkLayer() — topology generation', () => {
    const orgC = new DerropsConventions({ org: 'acme' })
    const domainC = orgC.with({ domain: 'payments' })
    const serviceC = domainC.with({ service: 'checkout-api' })

    describe('orgNetworkLayer()', () => {
      it('returns vpc and transitGateway names', () => {
        expect(orgC.orgNetworkLayer()).toEqual({
          vpc: 'acme',
          transitGateway: 'acme',
        })
      })

      it('works on a domain-scoped instance too (org segment still present)', () => {
        expect(domainC.orgNetworkLayer()).toEqual({
          vpc: 'acme',
          transitGateway: 'acme',
        })
      })
    })

    describe('domainNetworkLayer()', () => {
      it('returns subnets, nacl, routeTables, tgwAttachment for two AZs', () => {
        const layer = domainC.domainNetworkLayer(['1a', '1b'])
        expect(layer.nacl).toBe('acme--payments')
        expect(layer.tgwAttachment).toBe('acme--payments')
        expect(layer.subnets).toEqual({
          private: ['acme--payments--private--1a', 'acme--payments--private--1b'],
          public: ['acme--payments--public--1a', 'acme--payments--public--1b'],
          isolated: ['acme--payments--isolated--1a', 'acme--payments--isolated--1b'],
        })
        expect(layer.routeTables).toEqual({
          private: 'acme--payments--private',
          public: 'acme--payments--public',
          isolated: 'acme--payments--isolated',
        })
      })

      it('default kinds are private, public, isolated', () => {
        const layer = domainC.domainNetworkLayer(['1a'])
        expect(Object.keys(layer.subnets)).toEqual(['private', 'public', 'isolated'])
      })

      it('custom kinds subset', () => {
        const layer = domainC.domainNetworkLayer(['1a', '1b', '1c'], ['private'])
        expect(Object.keys(layer.subnets)).toEqual(['private'])
        expect(layer.subnets.private).toHaveLength(3)
      })

      it('three AZs produce three subnets per kind', () => {
        const layer = domainC.domainNetworkLayer(['1a', '1b', '1c'])
        expect(layer.subnets.private).toHaveLength(3)
        expect(layer.subnets['private']![2]).toBe('acme--payments--private--1c')
      })

      it('different domains produce different topology', () => {
        const identityLayer = orgC.with({ domain: 'identity' }).domainNetworkLayer(['1a'])
        expect(identityLayer.nacl).toBe('acme--identity')
        expect(identityLayer.subnets['private']![0]).toBe('acme--identity--private--1a')
      })
    })

    describe('serviceNetworkLayer()', () => {
      it('returns security group names keyed by purpose', () => {
        expect(serviceC.serviceNetworkLayer(['web', 'db', 'internal'])).toEqual({
          securityGroups: {
            web: 'acme--payments--checkout-api--web',
            db: 'acme--payments--checkout-api--db',
            internal: 'acme--payments--checkout-api--internal',
          },
        })
      })

      it('single purpose', () => {
        expect(serviceC.serviceNetworkLayer(['web'])).toEqual({
          securityGroups: { web: 'acme--payments--checkout-api--web' },
        })
      })

      it('empty purposes returns empty securityGroups', () => {
        expect(serviceC.serviceNetworkLayer([])).toEqual({ securityGroups: {} })
      })

      it('different services produce different security groups', () => {
        const authLayer = domainC.with({ service: 'auth-service' }).serviceNetworkLayer(['web'])
        expect(authLayer.securityGroups.web).toBe('acme--payments--auth-service--web')
      })
    })
  })
})
