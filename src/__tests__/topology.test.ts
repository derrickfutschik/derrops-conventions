import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

// ── constraints() ─────────────────────────────────────────────────────────────

describe('constraints() — runtime constraint store', () => {
  it('returns empty object when nothing constrained', () => {
    const c = new DerropsConventions({ org: 'acme' })
    expect(c.constraints()).toEqual({})
  })

  it('domain() stores values accessible via constraints()', () => {
    const c = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])
    expect(c.constraints().domain).toEqual(['payments', 'identity'])
  })

  it('service() stores values', () => {
    const c = new DerropsConventions({ org: 'acme' }).service(['checkout-api', 'auth-service'])
    expect(c.constraints().service).toEqual(['checkout-api', 'auth-service'])
  })

  it('constrain() stores values for any segment key', () => {
    const c = new DerropsConventions({ org: 'acme' }).constrain('key', 'stripe-key', 'db-password')
    expect(c.constraints().key).toEqual(['stripe-key', 'db-password'])
  })

  it('unconstrained segments are absent from the result', () => {
    const c = new DerropsConventions({ org: 'acme' }).domain(['payments'])
    expect('tenant' in c.constraints()).toBe(false)
    expect('service' in c.constraints()).toBe(false)
  })

  it('multiple constraints accumulate independently', () => {
    const c = new DerropsConventions({ org: 'acme' })
      .domain(['payments', 'identity'])
      .service(['checkout-api'])
    expect(c.constraints().domain).toEqual(['payments', 'identity'])
    expect(c.constraints().service).toEqual(['checkout-api'])
  })

  it('later call to same segment replaces earlier constraint', () => {
    const c = new DerropsConventions({ org: 'acme' })
      .domain(['payments'])
      .domain(['payments', 'identity'])
    expect(c.constraints().domain).toEqual(['payments', 'identity'])
  })

  it('constraints() returns a copy — mutations do not affect the instance', () => {
    const c = new DerropsConventions({ org: 'acme' }).domain(['payments'])
    const snapshot = c.constraints()
    ;(snapshot as Record<string, unknown>).domain = ['mutated']
    expect(c.constraints().domain).toEqual(['payments'])
  })

  it('with() inherits constraints from parent', () => {
    const parent = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])
    const child = parent.with({ env: 'prod' })
    expect(child.constraints().domain).toEqual(['payments', 'identity'])
  })

  it('constraint added on derived instance does not affect parent', () => {
    const parent = new DerropsConventions({ org: 'acme' }).domain(['payments'])
    const child = parent.with({}).service(['checkout-api'])
    expect('service' in parent.constraints()).toBe(false)
    expect(child.constraints().service).toEqual(['checkout-api'])
  })

  it('existing domain() type-narrowing behaviour is unchanged', () => {
    // Compile-time check: no runtime assertion needed, but calling it must not throw
    const c = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])
    expect(() => c.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' })).not.toThrow()
  })
})

// ── topology() ────────────────────────────────────────────────────────────────

describe('topology() — names and CIDRs', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  const result = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })

  describe('VPC and Transit Gateway', () => {
    it('vpc name and cidr', () => {
      expect(result.vpc).toEqual({ name: 'acme', cidr: '10.0.0.0/16' })
    })

    it('transitGateway name', () => {
      expect(result.transitGateway).toBe('acme--tgw')
    })
  })

  describe('domain CIDR allocation — order is the contract', () => {
    it('first domain gets first /20 block', () => {
      expect(result.domains.payments?.cidr).toBe('10.0.0.0/20')
    })

    it('second domain gets second /20 block (+4096 addresses)', () => {
      expect(result.domains.identity?.cidr).toBe('10.0.16.0/20')
    })

    it('all constrained domains are present', () => {
      expect(Object.keys(result.domains).sort()).toEqual(['identity', 'payments'])
    })
  })

  describe('subnet names match convention', () => {
    it('private subnet names follow acme--{domain}--private--{az}', () => {
      expect(result.domains.payments?.subnets.private?.[0]?.name).toBe(
        'acme--payments--private--1a',
      )
      expect(result.domains.payments?.subnets.private?.[1]?.name).toBe(
        'acme--payments--private--1b',
      )
      expect(result.domains.payments?.subnets.private?.[2]?.name).toBe(
        'acme--payments--private--1c',
      )
    })

    it('public subnet names', () => {
      expect(result.domains.payments?.subnets.public?.[0]?.name).toBe(
        'acme--payments--public--1a',
      )
    })

    it('isolated subnet names', () => {
      expect(result.domains.payments?.subnets.isolated?.[0]?.name).toBe(
        'acme--payments--isolated--1a',
      )
    })

    it('identity domain subnet names', () => {
      expect(result.domains.identity?.subnets.private?.[0]?.name).toBe(
        'acme--identity--private--1a',
      )
    })
  })

  describe('subnet CIDRs follow /24 per AZ allocation', () => {
    it('private tier: consecutive /24 blocks per AZ', () => {
      expect(result.domains.payments?.subnets.private?.[0]?.cidr).toBe('10.0.0.0/24')
      expect(result.domains.payments?.subnets.private?.[1]?.cidr).toBe('10.0.1.0/24')
      expect(result.domains.payments?.subnets.private?.[2]?.cidr).toBe('10.0.2.0/24')
    })

    it('public tier: starts at +1024 addresses (second /22 within /20)', () => {
      expect(result.domains.payments?.subnets.public?.[0]?.cidr).toBe('10.0.4.0/24')
      expect(result.domains.payments?.subnets.public?.[1]?.cidr).toBe('10.0.5.0/24')
    })

    it('isolated tier: starts at +2048 addresses (third /22 within /20)', () => {
      expect(result.domains.payments?.subnets.isolated?.[0]?.cidr).toBe('10.0.8.0/24')
      expect(result.domains.payments?.subnets.isolated?.[1]?.cidr).toBe('10.0.9.0/24')
    })

    it('identity domain starts at its /20 block base', () => {
      expect(result.domains.identity?.subnets.private?.[0]?.cidr).toBe('10.0.16.0/24')
      expect(result.domains.identity?.subnets.isolated?.[0]?.cidr).toBe('10.0.24.0/24')
    })
  })

  describe('SubnetEntry includes az field', () => {
    it('az is the AZ suffix string', () => {
      expect(result.domains.payments?.subnets.private?.[0]?.az).toBe('1a')
      expect(result.domains.payments?.subnets.private?.[1]?.az).toBe('1b')
      expect(result.domains.payments?.subnets.private?.[2]?.az).toBe('1c')
    })
  })

  describe('other domain fields', () => {
    it('nacl', () => {
      expect(result.domains.payments?.nacl).toBe('acme--payments--nacl')
    })

    it('tgwAttachment', () => {
      expect(result.domains.payments?.tgwAttachment).toBe('acme--payments--tgw-attach')
    })

    it('routeTables for each tier', () => {
      expect(result.domains.payments?.routeTables).toEqual({
        private: 'acme--payments--private',
        public: 'acme--payments--public',
        isolated: 'acme--payments--isolated',
      })
    })
  })

  describe('custom kinds — order determines CIDR offset', () => {
    it('only requested kinds appear in subnets', () => {
      const r = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'], kinds: ['private'] })
      expect(Object.keys(r.domains.payments?.subnets ?? {})).toEqual(['private'])
    })

    it('second kind in custom list gets offset 1 × tierSize (not 2 × tierSize)', () => {
      const r = orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        kinds: ['private', 'isolated'],
      })
      // private = kinds[0] → offset 0
      expect(r.domains.payments?.subnets.private?.[0]?.cidr).toBe('10.0.0.0/24')
      // isolated = kinds[1] → offset 1 × 1024 = 10.0.4.0/24 (not 10.0.8.0/24)
      expect(r.domains.payments?.subnets.isolated?.[0]?.cidr).toBe('10.0.4.0/24')
    })

    it('single AZ produces one subnet per kind', () => {
      const r = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })
      expect(r.domains.payments?.subnets.private).toHaveLength(1)
      expect(r.domains.payments?.subnets.public).toHaveLength(1)
    })
  })

  describe('single domain', () => {
    it('works with a single domain and single AZ', () => {
      const r = new DerropsConventions({ org: 'acme' })
        .domain(['platform'])
        .topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })
      expect(r.domains.platform?.cidr).toBe('10.0.0.0/20')
      expect(r.domains.platform?.subnets.private?.[0]).toEqual({
        name: 'acme--platform--private--1a',
        cidr: '10.0.0.0/24',
        az: '1a',
      })
    })
  })

  describe('error handling', () => {
    it('throws when domain has not been constrained', () => {
      const c = new DerropsConventions({ org: 'acme' })
      expect(() => c.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })).toThrow('.domain([')
    })
  })
})
