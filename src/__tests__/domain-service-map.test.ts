import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const MAP = {
  platform: ['vpc', 'api-gateway', 'app-database'] as const,
  'user-management': ['cognito', 'identity-pool'] as const,
}

describe('DerropsConventions — .domains()', () => {
  // ── Runtime tests ──────────────────────────────────────────────────────────

  it('allows valid domain+service combinations at runtime', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    expect(() =>
      conv.with({ domain: 'platform', service: 'vpc' }).name({ type: 'lambdaFunction' }),
    ).not.toThrow()

    expect(() =>
      conv.with({ domain: 'user-management', service: 'cognito' }).name({ type: 'lambdaFunction' }),
    ).not.toThrow()
  })

  it('stores domain and service constraints that can be read back', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)
    const constraints = conv.constraints()

    // All domains from the map should be constrained
    expect(constraints.domain).toEqual(expect.arrayContaining(['platform', 'user-management']))
    expect(constraints.domain).toHaveLength(2)

    // All services from the map should be constrained
    expect(constraints.service).toEqual(
      expect.arrayContaining(['vpc', 'api-gateway', 'app-database', 'cognito', 'identity-pool']),
    )
  })

  it('unknown domain is rejected by TypeScript (type-level enforcement only)', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    // The constraint is type-level — runtime still produces a name, TS will error at compile time
    // @ts-expect-error: 'unknown-domain' is not a valid domain in the map
    void conv.with({ domain: 'unknown-domain', service: 'vpc' })
  })

  it('mismatched service is rejected by TypeScript (type-level enforcement only)', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    // The constraint is type-level — runtime still produces a name, TS will error at compile time
    // @ts-expect-error: 'bad-service' is not a registered service in the map
    void conv.with({ domain: 'platform', service: 'bad-service' })
  })

  it('.with({ domain }) produces a derived instance where .name() works for valid services', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)
    const platformConv = conv.with({ domain: 'platform', service: 'vpc' })

    const name = platformConv.name({ type: 'lambdaFunction', key: 'handler' })
    expect(name).toContain('platform')
    expect(name).toContain('vpc')
  })

  it('propagates the map through .with() so derived instances still enforce domain-service pairing', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)
    const derived = conv.with({ domain: 'platform', service: 'vpc' })

    // derived should still enforce the constraint map — valid call should not throw
    expect(() =>
      derived
        .with({ domain: 'user-management', service: 'cognito' })
        .name({ type: 'lambdaFunction' }),
    ).not.toThrow()
  })

  it('produces correct names with .domains()', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    const name = conv
      .with({ domain: 'platform', service: 'api-gateway', key: 'main' })
      .name({ type: 'lambdaFunction' })

    expect(name).toBe('acme--platform--api-gateway--main')
  })

  // ── Type-level tests (verified by tsc, enforced via @ts-expect-error) ──────

  it('type: valid domain+service is NOT a type error', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    // These should compile without error
    conv.with({ domain: 'platform', service: 'vpc' })
    conv.with({ domain: 'user-management', service: 'cognito' })
  })

  it('type: service without domain is NOT a type error (any registered service is allowed)', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    // No domain specified — any registered service should be allowed
    conv.with({ service: 'vpc' })
    conv.with({ service: 'cognito' })
  })

  it('type: mismatched domain+service IS a type error', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    // 'cognito' belongs to 'user-management', not 'platform'
    // @ts-expect-error: 'cognito' is not a valid service for domain 'platform'
    void conv.with({ domain: 'platform', service: 'cognito' })
  })

  it('type: nonexistent domain IS a type error (domain constraint catches it)', () => {
    const conv = new DerropsConventions({ org: 'acme', env: 'prod' }).domains(MAP)

    // @ts-expect-error: 'nonexistent' is not a key of the map
    void conv.with({ domain: 'nonexistent', service: 'vpc' })
  })
})
