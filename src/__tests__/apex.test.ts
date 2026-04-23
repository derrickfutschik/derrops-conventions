import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const makeBase = () =>
  new DerropsConventions({
    org: 'acme',
    apex: 'acme.com',
    env: 'dev',
    region: 'ap-southeast-2',
    domain: 'payments',
    service: 'checkout-api',
  })

describe('DerropsConventions — apex and apexMapping', () => {
  describe('apex without mapping — verbatim zone', () => {
    it('route53HostedZone is the apex value as-is', () => {
      expect(makeBase().with({ apex: 'dev.acme.com' }).name({ type: 'route53HostedZone' })).toBe(
        'dev.acme.com',
      )
    })

    it('route53Record prepends service to the apex zone', () => {
      expect(makeBase().with({ apex: 'dev.acme.com' }).name({ type: 'route53Record' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('route53PrivateRecord prepends service to the apex zone', () => {
      expect(makeBase().with({ apex: 'dev.acme.com' }).name({ type: 'route53PrivateRecord' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('acmCertificate prepends service to the apex zone', () => {
      expect(makeBase().with({ apex: 'dev.acme.com' }).name({ type: 'acmCertificate' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('cloudFrontAlias prepends service to the apex zone', () => {
      expect(makeBase().with({ apex: 'dev.acme.com' }).name({ type: 'cloudFrontAlias' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('apex does not appear in non-DNS resource names', () => {
      expect(makeBase().name({ type: 'lambdaFunction', key: 'handler' })).toBe(
        'acme--payments--checkout-api--handler',
      )
      expect(makeBase().name({ type: 's3Bucket', key: 'data' })).toBe(
        'ap-southeast-2--dev--acme--payments--checkout-api--data',
      )
    })
  })

  describe('apexMapping — env-qualified zones', () => {
    // prod → 'acme.com', others → '{env}.acme.com'
    const envZone = (s: { env?: string; apex?: string }) =>
      s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`

    it('dev: hosted zone gets env prefix', () => {
      expect(makeBase().apexMapping(envZone).name({ type: 'route53HostedZone' })).toBe(
        'dev.acme.com',
      )
    })

    it('dev: record prepends service then mapped zone', () => {
      expect(makeBase().apexMapping(envZone).name({ type: 'route53Record' })).toBe(
        'checkout-api.dev.acme.com',
      )
    })

    it('prod: hosted zone is bare apex (no env prefix)', () => {
      expect(
        makeBase().with({ env: 'prod' }).apexMapping(envZone).name({ type: 'route53HostedZone' }),
      ).toBe('acme.com')
    })

    it('prod: record prepends service to bare apex', () => {
      expect(
        makeBase().with({ env: 'prod' }).apexMapping(envZone).name({ type: 'route53Record' }),
      ).toBe('checkout-api.acme.com')
    })

    it('staging: hosted zone gets env prefix', () => {
      expect(
        makeBase()
          .with({ env: 'staging' })
          .apexMapping(envZone)
          .name({ type: 'route53HostedZone' }),
      ).toBe('staging.acme.com')
    })
  })

  describe('apexMapping — custom subdomain pattern', () => {
    // prod → 'app.acme.com', others → 'app-{env}.acme.com'
    const appZone = (s: { env?: string; apex?: string }) =>
      s.env === 'prod' ? `app.${s.apex}` : `app-${s.env}.${s.apex}`

    it('dev: hosted zone uses app-dev subdomain', () => {
      expect(makeBase().apexMapping(appZone).name({ type: 'route53HostedZone' })).toBe(
        'app-dev.acme.com',
      )
    })

    it('dev: record prepends service to custom zone', () => {
      expect(makeBase().apexMapping(appZone).name({ type: 'route53Record' })).toBe(
        'checkout-api.app-dev.acme.com',
      )
    })

    it('prod: hosted zone uses bare app subdomain', () => {
      expect(
        makeBase().with({ env: 'prod' }).apexMapping(appZone).name({ type: 'route53HostedZone' }),
      ).toBe('app.acme.com')
    })

    it('prod: record prepends service to app zone', () => {
      expect(
        makeBase().with({ env: 'prod' }).apexMapping(appZone).name({ type: 'route53Record' }),
      ).toBe('checkout-api.app.acme.com')
    })
  })

  describe('apexMapping — propagation through with()', () => {
    it('mapping is inherited by derived instances', () => {
      const parent = makeBase().apexMapping((s) => `${s.env}.${s.apex}`)
      const child = parent.with({ service: 'auth-service' })
      expect(child.name({ type: 'route53Record' })).toBe('auth-service.dev.acme.com')
    })

    it('derived instance can override the mapping without affecting parent', () => {
      const parent = makeBase().apexMapping((s) => `${s.env}.${s.apex}`)
      const child = parent.with({}).apexMapping((s) => `custom-${s.env}.${s.apex}`)
      expect(child.name({ type: 'route53HostedZone' })).toBe('custom-dev.acme.com')
      expect(parent.name({ type: 'route53HostedZone' })).toBe('dev.acme.com')
    })

    it('mapping is not applied to resource types that do not include apex in segments', () => {
      const withMapping = makeBase().apexMapping((s) => `${s.env}.${s.apex}`)
      expect(withMapping.name({ type: 's3Bucket', key: 'data' })).toBe(
        'ap-southeast-2--dev--acme--payments--checkout-api--data',
      )
      expect(withMapping.name({ type: 'lambdaFunction', key: 'handler' })).toBe(
        'acme--payments--checkout-api--handler',
      )
    })
  })

  describe('apex is not emitted as a tag', () => {
    it('apex is absent from tags() output by default', () => {
      const tags = makeBase()
        .apexMapping((s) => `${s.env}.${s.apex}`)
        .tags()
      expect('apex' in tags).toBe(false)
    })
  })

  describe('tenant-specific subdomains — service-first via apexMapping', () => {
    // Pattern: {service}.{tenant}.{env}.{apex} — tenant embedded in the zone via apexMapping
    const tenantZone = (s: { env?: string; apex?: string; tenant?: string }) =>
      `${s.tenant}.${s.env}.${s.apex}`

    it('hosted zone is scoped to the tenant', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(tenantZone)
          .name({ type: 'route53HostedZone' }),
      ).toBe('acme-corp.dev.acme.com')
    })

    it('record prepends service to the tenant zone', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(tenantZone)
          .name({ type: 'route53Record' }),
      ).toBe('checkout-api.acme-corp.dev.acme.com')
    })

    it('privateRecord prepends service to the tenant zone', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(tenantZone)
          .name({ type: 'route53PrivateRecord' }),
      ).toBe('checkout-api.acme-corp.dev.acme.com')
    })

    it('acmCertificate uses tenant zone', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(tenantZone)
          .name({ type: 'acmCertificate' }),
      ).toBe('checkout-api.acme-corp.dev.acme.com')
    })

    it('cloudFrontAlias uses tenant zone', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(tenantZone)
          .name({ type: 'cloudFrontAlias' }),
      ).toBe('checkout-api.acme-corp.dev.acme.com')
    })

    it('different tenants produce different zones', () => {
      const base = makeBase().apexMapping(tenantZone)
      expect(base.with({ tenant: 'acme-corp' }).name({ type: 'route53HostedZone' })).toBe(
        'acme-corp.dev.acme.com',
      )
      expect(base.with({ tenant: 'globex' }).name({ type: 'route53HostedZone' })).toBe(
        'globex.dev.acme.com',
      )
    })

    it('tenant mapping propagates through with()', () => {
      const parent = makeBase().with({ tenant: 'acme-corp' }).apexMapping(tenantZone)
      const child = parent.with({ service: 'auth-service' })
      expect(child.name({ type: 'route53Record' })).toBe('auth-service.acme-corp.dev.acme.com')
    })

    it('tenant zone does not affect non-DNS resource names', () => {
      const tenanted = makeBase().with({ tenant: 'acme-corp' }).apexMapping(tenantZone)
      expect(tenanted.name({ type: 'lambdaFunction', key: 'handler' })).toBe(
        'acme--payments--checkout-api--acme-corp--handler',
      )
      expect(tenanted.name({ type: 's3Bucket', key: 'data' })).toBe(
        'ap-southeast-2--dev--acme--payments--checkout-api--acme-corp--data',
      )
    })
  })

  describe('tenant-specific subdomains — tenant-first via tenant record types', () => {
    // Pattern: {tenant}.{service}.{effective-apex}
    // Use route53TenantRecord / route53TenantPrivateRecord / acmCertificateTenant / cloudFrontTenantAlias
    // when each tenant needs its own outermost subdomain label.
    const envZone = (s: { env?: string; apex?: string }) =>
      s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`

    it('route53TenantRecord: tenant is the outermost label', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(envZone)
          .name({ type: 'route53TenantRecord' }),
      ).toBe('acme-corp.checkout-api.dev.acme.com')
    })

    it('route53TenantPrivateRecord: same pattern in private zone', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(envZone)
          .name({ type: 'route53TenantPrivateRecord' }),
      ).toBe('acme-corp.checkout-api.dev.acme.com')
    })

    it('acmCertificateTenant: tenant-first for cert CN', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(envZone)
          .name({ type: 'acmCertificateTenant' }),
      ).toBe('acme-corp.checkout-api.dev.acme.com')
    })

    it('cloudFrontTenantAlias: tenant-first for CF alias', () => {
      expect(
        makeBase()
          .with({ tenant: 'acme-corp' })
          .apexMapping(envZone)
          .name({ type: 'cloudFrontTenantAlias' }),
      ).toBe('acme-corp.checkout-api.dev.acme.com')
    })

    it('different tenants produce different outermost labels', () => {
      const base = makeBase().apexMapping(envZone)
      expect(base.with({ tenant: 'acme-corp' }).name({ type: 'route53TenantRecord' })).toBe(
        'acme-corp.checkout-api.dev.acme.com',
      )
      expect(base.with({ tenant: 'globex' }).name({ type: 'route53TenantRecord' })).toBe(
        'globex.checkout-api.dev.acme.com',
      )
    })

    it('prod env produces bare apex zone', () => {
      expect(
        makeBase()
          .with({ env: 'prod', tenant: 'acme-corp' })
          .apexMapping(envZone)
          .name({ type: 'route53TenantRecord' }),
      ).toBe('acme-corp.checkout-api.acme.com')
    })

    it('tenant-first propagates through with()', () => {
      const parent = makeBase().with({ tenant: 'acme-corp' }).apexMapping(envZone)
      const child = parent.with({ service: 'auth-service' })
      expect(child.name({ type: 'route53TenantRecord' })).toBe(
        'acme-corp.auth-service.dev.acme.com',
      )
    })

    it('contrast: service-first vs tenant-first for same inputs', () => {
      const base = makeBase().with({ tenant: 'acme-corp' }).apexMapping(envZone)
      // service-first: checkout-api.dev.acme.com (service is outermost, tenant embedded in zone)
      // NOTE: apexMapping here returns dev.acme.com (no tenant), so service is outermost
      const serviceFirst = makeBase()
        .with({ tenant: 'acme-corp' })
        .apexMapping((s) => `${s.env}.${s.apex}`)
        .name({ type: 'route53Record' })
      expect(serviceFirst).toBe('checkout-api.dev.acme.com')

      // tenant-first: acme-corp.checkout-api.dev.acme.com
      const tenantFirst = base.name({ type: 'route53TenantRecord' })
      expect(tenantFirst).toBe('acme-corp.checkout-api.dev.acme.com')
    })
  })

  describe('apexZones — Mode A: one purchased domain per locale', () => {
    // acme.com for US/EU, acme.com.au for AU
    const makeZoned = () =>
      new DerropsConventions({
        org: 'acme',
        env: 'prod',
        domain: 'payments',
        service: 'checkout-api',
      }).apexZones({
        'acme.com': ['us-east-1', 'us-west-2', 'eu-west-1'],
        'acme.com.au': ['ap-southeast-2'],
      })

    it('us-east-1 prod → acme.com', () => {
      expect(makeZoned().with({ region: 'us-east-1' }).name({ type: 'route53HostedZone' })).toBe(
        'acme.com',
      )
    })

    it('ap-southeast-2 prod → acme.com.au', () => {
      expect(
        makeZoned().with({ region: 'ap-southeast-2' }).name({ type: 'route53HostedZone' }),
      ).toBe('acme.com.au')
    })

    it('record in ap-southeast-2 uses acme.com.au', () => {
      expect(makeZoned().with({ region: 'ap-southeast-2' }).name({ type: 'route53Record' })).toBe(
        'checkout-api.acme.com.au',
      )
    })

    it('apexMapping env qualification composes on top of zone lookup', () => {
      const c = makeZoned().apexMapping((s) => (s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`))
      expect(c.with({ region: 'us-east-1', env: 'prod' }).name({ type: 'route53HostedZone' })).toBe(
        'acme.com',
      )
      expect(c.with({ region: 'us-east-1', env: 'dev' }).name({ type: 'route53HostedZone' })).toBe(
        'dev.acme.com',
      )
      expect(
        c.with({ region: 'ap-southeast-2', env: 'prod' }).name({ type: 'route53HostedZone' }),
      ).toBe('acme.com.au')
      expect(
        c.with({ region: 'ap-southeast-2', env: 'dev' }).name({ type: 'route53HostedZone' }),
      ).toBe('dev.acme.com.au')
    })

    it('falls back to raw apex when region is not in the zone map', () => {
      expect(
        makeZoned()
          .with({ region: 'sa-east-1', apex: 'acme.com' })
          .name({ type: 'route53HostedZone' }),
      ).toBe('acme.com')
    })

    it('non-DNS resource types are unaffected', () => {
      expect(
        makeZoned()
          .with({ region: 'ap-southeast-2' })
          .name({ type: 'lambdaFunction', key: 'handler' }),
      ).toBe('acme--payments--checkout-api--handler')
    })

    it('zone map propagates through with()', () => {
      const parent = makeZoned()
      const child = parent.with({ service: 'auth-service' })
      expect(child.with({ region: 'ap-southeast-2' }).name({ type: 'route53HostedZone' })).toBe(
        'acme.com.au',
      )
    })
  })

  describe('apexZones — Mode B: single domain, region as subdomain', () => {
    // Only acme.com purchased — AU traffic goes to au.acme.com
    const makeZoned = () =>
      new DerropsConventions({
        org: 'acme',
        env: 'prod',
        domain: 'payments',
        service: 'checkout-api',
      }).apexZones({
        'acme.com': ['us-east-1', 'us-west-2', 'eu-west-1'],
        'au.acme.com': ['ap-southeast-2'],
      })

    it('us-east-1 prod → acme.com', () => {
      expect(makeZoned().with({ region: 'us-east-1' }).name({ type: 'route53HostedZone' })).toBe(
        'acme.com',
      )
    })

    it('ap-southeast-2 prod → au.acme.com', () => {
      expect(
        makeZoned().with({ region: 'ap-southeast-2' }).name({ type: 'route53HostedZone' }),
      ).toBe('au.acme.com')
    })

    it('record in ap-southeast-2 uses au.acme.com zone', () => {
      expect(makeZoned().with({ region: 'ap-southeast-2' }).name({ type: 'route53Record' })).toBe(
        'checkout-api.au.acme.com',
      )
    })

    it('apexMapping env qualification composes on top of subdomain zone', () => {
      const c = makeZoned().apexMapping((s) => (s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`))
      expect(
        c.with({ region: 'ap-southeast-2', env: 'dev' }).name({ type: 'route53HostedZone' }),
      ).toBe('dev.au.acme.com')
      expect(
        c.with({ region: 'ap-southeast-2', env: 'prod' }).name({ type: 'route53Record' }),
      ).toBe('checkout-api.au.acme.com')
    })
  })
})
