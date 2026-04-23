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
})
