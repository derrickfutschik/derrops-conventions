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
    expect(() =>
      c.name({ type: 'lambdaFunction', domain: 'payments', service: 'api' }),
    ).not.toThrow()
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
      expect(result.transitGateway).toBe('acme')
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
      expect(result.domains.payments?.subnets.public?.[0]?.name).toBe('acme--payments--public--1a')
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
      expect(result.domains.payments?.nacl).toBe('acme--payments')
    })

    it('tgwAttachment', () => {
      expect(result.domains.payments?.tgwAttachment).toBe('acme--payments')
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
        num: 1,
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

// ── CIDR stability — append-only at global level ──────────────────────────────

describe('topology() — CIDR stability', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('appending a kind to the global list does not change existing kind CIDRs', () => {
    const baseline = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      kinds: ['private', 'isolated'],
    })
    const extended = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      kinds: ['private', 'isolated', 'public'],
    })
    // position 0 (private) and position 1 (isolated) unchanged
    expect(extended.domains.payments?.subnets.private?.[0]?.cidr).toBe(
      baseline.domains.payments?.subnets.private?.[0]?.cidr,
    )
    expect(extended.domains.payments?.subnets.isolated?.[0]?.cidr).toBe(
      baseline.domains.payments?.subnets.isolated?.[0]?.cidr,
    )
    // new kind lands at position 2
    expect(extended.domains.payments?.subnets.public?.[0]?.cidr).toBe('10.0.8.0/24')
  })

  it('appending an AZ to the global list does not change existing AZ CIDRs', () => {
    const baseline = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
    const extended = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c', '1d'] })
    const b = baseline.domains.payments?.subnets.private
    const e = extended.domains.payments?.subnets.private
    expect(e?.[0]?.cidr).toBe(b?.[0]?.cidr)
    expect(e?.[1]?.cidr).toBe(b?.[1]?.cidr)
    expect(e?.[2]?.cidr).toBe(b?.[2]?.cidr)
    // new AZ at position 3
    expect(e?.[3]?.cidr).toBe('10.0.3.0/24')
    expect(e?.[3]?.az).toBe('1d')
  })

  it('domain-level slot override preserves CIDRs when inserting a kind at a specific position', () => {
    // Global uses two kinds at positions 0 and 1.
    // For payments, we want private at CIDR-slot 0 and isolated at CIDR-slot 2 (leaving a gap).
    // Later, public is inserted at slot 1 — private and isolated CIDRs stay the same.
    const initial = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        payments: {
          kinds: [
            { slot: 0, name: 'private' },
            { slot: 2, name: 'isolated' },
          ],
        },
      },
    })
    const extended = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        payments: {
          kinds: [
            { slot: 0, name: 'private' },
            { slot: 1, name: 'public' }, // inserted at slot 1 — fills the reserved gap
            { slot: 2, name: 'isolated' },
          ],
        },
      },
    })
    // CIDR positions for private and isolated must be unchanged
    expect(extended.domains.payments?.subnets.private?.[0]?.cidr).toBe(
      initial.domains.payments?.subnets.private?.[0]?.cidr,
    )
    expect(extended.domains.payments?.subnets.isolated?.[0]?.cidr).toBe(
      initial.domains.payments?.subnets.isolated?.[0]?.cidr,
    )
    // public at slot 1 → second /22 → 10.0.4.0/24
    expect(extended.domains.payments?.subnets.public?.[0]?.cidr).toBe('10.0.4.0/24')
  })
})

// ── Per-domain kind control ────────────────────────────────────────────────────

describe('topology() — per-domain kind control', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('domain with kinds override emits only those kinds', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        payments: {
          kinds: [{ slot: 0, name: 'private' }],
        },
      },
    })
    expect(Object.keys(r.domains.payments?.subnets ?? {})).toEqual(['private'])
    expect(Object.keys(r.domains.payments?.routeTables ?? {})).toEqual(['private'])
    // identity still gets defaults
    expect(Object.keys(r.domains.identity?.subnets ?? {}).sort()).toEqual([
      'isolated',
      'private',
      'public',
    ])
  })

  it('domain with additionalKinds extends defaults', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      kinds: ['private', 'isolated'],
      domains: {
        payments: {
          additionalKinds: [{ slot: 3, name: 'mgmt' }],
        },
      },
    })
    const keys = Object.keys(r.domains.payments?.subnets ?? {}).sort()
    expect(keys).toEqual(['isolated', 'mgmt', 'private'])
    // CIDR for slot 3
    expect(r.domains.payments?.subnets.mgmt?.[0]?.cidr).toBe('10.0.12.0/24')
  })

  it('two domains can have different kind sets in the same topology() call', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        payments: {
          kinds: [
            { slot: 0, name: 'private' },
            { slot: 1, name: 'public' },
          ],
        },
        identity: {
          kinds: [{ slot: 0, name: 'private' }],
        },
      },
    })
    expect(Object.keys(r.domains.payments?.subnets ?? {}).sort()).toEqual(['private', 'public'])
    expect(Object.keys(r.domains.identity?.subnets ?? {})).toEqual(['private'])
  })

  it('route tables only contain keys for allocated kinds', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        payments: {
          kinds: [{ slot: 0, name: 'private' }],
        },
      },
    })
    expect(r.domains.payments?.routeTables).toEqual({
      private: 'acme--payments--private',
    })
  })
})

// ── includeKinds filter ───────────────────────────────────────────────────────

describe('topology() — includeKinds filter', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('domain with includeKinds emits only the named tiers', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        identity: { includeKinds: ['private', 'isolated'] },
      },
    })
    expect(Object.keys(r.domains.identity?.subnets ?? {}).sort()).toEqual(['isolated', 'private'])
    expect(Object.keys(r.domains.identity?.routeTables ?? {}).sort()).toEqual([
      'isolated',
      'private',
    ])
  })

  it('slots are preserved from defaultKinds so CIDRs are unchanged', () => {
    const full = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })
    const filtered = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        identity: { includeKinds: ['private', 'isolated'] },
      },
    })
    // private at slot 0 and isolated at slot 2 must keep the same CIDRs as the full topology
    expect(filtered.domains.identity?.subnets.private?.[0]?.cidr).toBe(
      full.domains.identity?.subnets.private?.[0]?.cidr,
    )
    expect(filtered.domains.identity?.subnets.isolated?.[0]?.cidr).toBe(
      full.domains.identity?.subnets.isolated?.[0]?.cidr,
    )
  })

  it('other domains still receive the full default kinds', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      domains: {
        identity: { includeKinds: ['private'] },
      },
    })
    expect(Object.keys(r.domains.payments?.subnets ?? {}).sort()).toEqual([
      'isolated',
      'private',
      'public',
    ])
  })

  it('throws when includeKinds and kinds are both set', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            kinds: [{ slot: 0, name: 'private' }],
            includeKinds: ['private'],
          },
        },
      }),
    ).toThrow('only one of')
  })

  it('throws when includeKinds and additionalKinds are both set', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            includeKinds: ['private'],
            additionalKinds: [{ slot: 3, name: 'mgmt' }],
          },
        },
      }),
    ).toThrow('only one of')
  })
})

// ── AZ configurability ────────────────────────────────────────────────────────

describe('topology() — AZ configurability', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('per-domain azAllocations override global AZs for that domain only', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      domains: {
        payments: {
          azAllocations: [{ slot: 0, az: '1c' }],
        },
      },
    })
    // payments uses its own AZ override
    expect(r.domains.payments?.subnets.private).toHaveLength(1)
    expect(r.domains.payments?.subnets.private?.[0]?.az).toBe('1c')
    // identity still uses global AZs
    expect(r.domains.identity?.subnets.private).toHaveLength(2)
    expect(r.domains.identity?.subnets.private?.[0]?.az).toBe('1a')
    expect(r.domains.identity?.subnets.private?.[1]?.az).toBe('1b')
  })

  it('per-kind azAllocations override domain AZs for that kind only', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      domains: {
        payments: {
          kinds: [
            { slot: 0, name: 'private' },
            { slot: 1, name: 'isolated', azAllocations: [{ slot: 0, az: '1a' }] },
          ],
        },
      },
    })
    expect(r.domains.payments?.subnets.private).toHaveLength(2)
    expect(r.domains.payments?.subnets.isolated).toHaveLength(1)
    expect(r.domains.payments?.subnets.isolated?.[0]?.az).toBe('1a')
  })
})

// ── Validation errors ─────────────────────────────────────────────────────────

describe('topology() — validation errors', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments'])

  it('throws on duplicate kind slots in a domain kinds override', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            kinds: [
              { slot: 0, name: 'private' },
              { slot: 0, name: 'public' },
            ],
          },
        },
      }),
    ).toThrow('duplicate kind slots: 0')
  })

  it('throws on duplicate AZ slots in a domain azAllocations override', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            azAllocations: [
              { slot: 0, az: '1a' },
              { slot: 0, az: '1b' },
            ],
          },
        },
      }),
    ).toThrow('duplicate AZ slots: 0')
  })

  it('throws when kind slot is out of range in a domain override', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            kinds: [{ slot: 4, name: 'private' }],
          },
        },
      }),
    ).toThrow('slot 4 is out of range 0–3')
  })

  it('throws when AZ slot is out of range in a domain override', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            azAllocations: [{ slot: 4, az: '1a' }],
          },
        },
      }),
    ).toThrow('slot 4 is out of range 0–3')
  })

  it('throws when kinds and additionalKinds are both set for a domain', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            kinds: [{ slot: 0, name: 'private' }],
            additionalKinds: [{ slot: 3, name: 'mgmt' }],
          },
        },
      }),
    ).toThrow('only one of')
  })
})

// ── domainBits — configurable domain-index field width ────────────────────────

describe('topology() — domainBits', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('defaults to 4 bits — /16 VPC yields /20 domains and /24 subnets', () => {
    const result = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })
    expect(result.domains.payments?.cidr).toBe('10.0.0.0/20')
    expect(result.domains.identity?.cidr).toBe('10.0.16.0/20')
    expect(result.domains.payments?.subnets.private?.[0]?.cidr).toBe('10.0.0.0/24')
  })

  it('domainBits: 5 on a /16 VPC halves domain and subnet blocks (/21 and /25)', () => {
    const result = orgC.topology({ vpcCidr: '10.0.0.0/16', domainBits: 5, azs: ['1a'] })
    expect(result.domains.payments?.cidr).toBe('10.0.0.0/21')
    // second domain now offset by a /21 (2048 addresses) instead of a /20
    expect(result.domains.identity?.cidr).toBe('10.0.8.0/21')
    expect(result.domains.payments?.subnets.private?.[0]?.cidr).toBe('10.0.0.0/25')
  })

  it('adding a bit to both domainBits and the VPC preserves subnet sizing', () => {
    // /16 + domainBits 4  →  /15 + domainBits 5 : still /20 domains, /24 subnets
    const result = orgC.topology({ vpcCidr: '10.0.0.0/15', domainBits: 5, azs: ['1a'] })
    expect(result.domains.payments?.cidr).toBe('10.0.0.0/20')
    expect(result.domains.payments?.subnets.private?.[0]?.cidr).toBe('10.0.0.0/24')
  })

  it('domainBits: 5 provides 32 domain slots', () => {
    const many = Array.from({ length: 32 }, (_, i) => `d${i}`)
    const c = new DerropsConventions({ org: 'acme' }).domain(many)
    expect(() => c.topology({ vpcCidr: '10.0.0.0/11', domainBits: 5, azs: ['1a'] })).not.toThrow()
  })

  it('throws when the default-sized domains do not fit the VPC', () => {
    // domainBits 2 on /16 → /18 domains (4 fit); a 5th spills past the VPC
    const c = new DerropsConventions({ org: 'acme' }).domain(['a', 'b', 'c', 'd', 'e'])
    expect(() => c.topology({ vpcCidr: '10.0.0.0/16', domainBits: 2, azs: ['1a'] })).toThrow(
      'does not fit',
    )
  })

  it('throws when domainBits does not leave room for the kind and AZ fields', () => {
    // /24 VPC has only 8 host bits; 4 are reserved for tier+az, leaving max 4 for domains
    expect(() =>
      new DerropsConventions({ org: 'acme' })
        .domain(['a'])
        .topology({ vpcCidr: '10.0.0.0/24', domainBits: 5, azs: ['1a'] }),
    ).toThrow('does not fit a /24 VPC')
  })

  it('throws on a non-integer or non-positive domainBits', () => {
    const c = new DerropsConventions({ org: 'acme' }).domain(['a'])
    expect(() => c.topology({ vpcCidr: '10.0.0.0/16', domainBits: 0, azs: ['1a'] })).toThrow(
      'domainBits must be a positive integer',
    )
    expect(() => c.topology({ vpcCidr: '10.0.0.0/16', domainBits: 2.5, azs: ['1a'] })).toThrow(
      'domainBits must be a positive integer',
    )
  })
})

// ── capacityReport() ──────────────────────────────────────────────────────────

describe('capacityReport()', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('reports correct kindSlotsUsed', () => {
    const report = orgC.capacityReport({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      kinds: ['private', 'isolated'],
    })
    for (const d of report.domains) {
      expect(d.kindSlotsUsed).toBe(2)
      expect(d.kindSlotsTotal).toBe(4)
    }
  })

  it('reports correct azSlotsUsed per kind', () => {
    const report = orgC.capacityReport({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b', '1c'],
    })
    const payments = report.domains.find((d) => d.domain === 'payments')
    for (const k of payments!.perKind) {
      expect(k.azSlotsUsed).toBe(3)
      expect(k.azSlotsTotal).toBe(4)
    }
  })

  it('emits warning when >75% of kind slots are used', () => {
    const report = orgC.capacityReport({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a'],
      kinds: ['private', 'public', 'isolated', 'mgmt'],
    })
    expect(report.warnings.length).toBeGreaterThan(0)
    expect(report.warnings.some((w) => w.includes('kind slots'))).toBe(true)
  })

  it('emits warning when >75% of AZ slots are used', () => {
    const report = orgC.capacityReport({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b', '1c', '1d'],
    })
    expect(report.warnings.some((w) => w.includes('AZ slots'))).toBe(true)
  })

  it('no warnings when utilisation is under threshold', () => {
    const report = orgC.capacityReport({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      kinds: ['private', 'isolated'],
    })
    expect(report.warnings).toHaveLength(0)
  })

  it('reports domain-slot usage against 2 ** domainBits', () => {
    const report = orgC.capacityReport({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })
    expect(report.domainSlotsUsed).toBe(2)
    expect(report.domainSlotsTotal).toBe(16)
  })

  it('domainSlotsTotal tracks a custom domainBits', () => {
    const report = orgC.capacityReport({ vpcCidr: '10.0.0.0/16', domainBits: 5, azs: ['1a'] })
    expect(report.domainSlotsTotal).toBe(32)
  })

  it('emits warning when the packed domains occupy >75% of the VPC addresses', () => {
    const c = new DerropsConventions({ org: 'acme' }).domain(['a', 'b', 'c', 'd'])
    const report = c.capacityReport({ vpcCidr: '10.0.0.0/16', domainBits: 2, azs: ['1a'] })
    expect(report.warnings.some((w) => w.includes('addresses'))).toBe(true)
  })

  it('warns (without throwing) when domainBits exceeds the VPC capacity', () => {
    const c = new DerropsConventions({ org: 'acme' }).domain(['a'])
    const report = c.capacityReport({ vpcCidr: '10.0.0.0/24', domainBits: 5, azs: ['1a'] })
    expect(report.warnings.some((w) => w.includes('exceeds'))).toBe(true)
  })
})

// ── Appending allocations to an existing deployed topology ────────────────────

describe('topology() — appending to an existing deployment', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  /**
   * Helper: collect every SubnetEntry across all domains and kinds from a topology,
   * keyed by subnet name. Used to assert that previously-allocated subnets are
   * completely unchanged after extending the topology.
   */
  function collectSubnets(topo: ReturnType<typeof orgC.topology>) {
    const map: Record<string, { cidr: string; az: string }> = {}
    for (const domain of Object.values(topo.domains)) {
      for (const subnets of Object.values(domain.subnets)) {
        for (const s of subnets) {
          map[s.name] = { cidr: s.cidr, az: s.az }
        }
      }
    }
    return map
  }

  it('adding a third AZ leaves all existing subnets unchanged', () => {
    const initial = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      kinds: ['private', 'public', 'isolated'],
    })

    const extended = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b', '1c'], // new AZ appended
      kinds: ['private', 'public', 'isolated'],
    })

    const before = collectSubnets(initial)
    const after = collectSubnets(extended)

    // Every subnet from the initial topology must exist with the same CIDR and AZ
    for (const [name, entry] of Object.entries(before)) {
      expect(after[name]).toEqual(entry)
    }

    // The new subnets must be present with the expected CIDRs
    expect(after['acme--payments--private--1c']).toEqual({ cidr: '10.0.2.0/24', az: '1c' })
    expect(after['acme--payments--public--1c']).toEqual({ cidr: '10.0.6.0/24', az: '1c' })
    expect(after['acme--payments--isolated--1c']).toEqual({ cidr: '10.0.10.0/24', az: '1c' })
    expect(after['acme--identity--private--1c']).toEqual({ cidr: '10.0.18.0/24', az: '1c' })
  })

  it('adding a new kind tier leaves all existing subnets unchanged', () => {
    const initial = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      kinds: ['private', 'isolated'],
    })

    const extended = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      kinds: ['private', 'isolated', 'public'], // new kind tier appended
    })

    const before = collectSubnets(initial)
    const after = collectSubnets(extended)

    for (const [name, entry] of Object.entries(before)) {
      expect(after[name]).toEqual(entry)
    }

    // New kind at slot 2 — offset 2 × 1024 = 2048 → 10.0.8.0 within payments /20
    expect(after['acme--payments--public--1a']).toEqual({ cidr: '10.0.8.0/24', az: '1a' })
    expect(after['acme--payments--public--1b']).toEqual({ cidr: '10.0.9.0/24', az: '1b' })
  })

  it('adding a new AZ and a new kind tier simultaneously leaves all existing subnets unchanged', () => {
    const initial = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b'],
      kinds: ['private', 'isolated'],
    })

    const extended = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b', '1c'],
      kinds: ['private', 'isolated', 'public'],
    })

    const before = collectSubnets(initial)
    const after = collectSubnets(extended)

    for (const [name, entry] of Object.entries(before)) {
      expect(after[name]).toEqual(entry)
    }

    // New AZ on existing kinds
    expect(after['acme--payments--private--1c']).toEqual({ cidr: '10.0.2.0/24', az: '1c' })
    expect(after['acme--payments--isolated--1c']).toEqual({ cidr: '10.0.6.0/24', az: '1c' })
    // New kind across all AZs
    expect(after['acme--payments--public--1a']).toEqual({ cidr: '10.0.8.0/24', az: '1a' })
    expect(after['acme--payments--public--1b']).toEqual({ cidr: '10.0.9.0/24', az: '1b' })
    expect(after['acme--payments--public--1c']).toEqual({ cidr: '10.0.10.0/24', az: '1c' })
  })
})

// ── Expansion subnets — a second+ subnet in the same tier + AZ ─────────────────

describe('topology() — expansion subnets (num-indexed)', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments'])

  it('the first subnet in an AZ has num 1 and an un-indexed name', () => {
    const r = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'] })
    const s = r.domains.payments?.subnets.private?.[0]
    expect(s?.name).toBe('acme--payments--private--1a')
    expect(s?.num).toBe(1)
  })

  it('a second subnet in the same AZ gets an index and its own CIDR slot', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b', '1c'],
      domains: {
        payments: {
          azAllocations: [
            { slot: 0, az: '1a' },
            { slot: 1, az: '1b' },
            { slot: 2, az: '1c' },
            { slot: 3, az: '1a', num: 2 }, // expansion subnet in 1a
          ],
        },
      },
    })
    const priv = r.domains.payments?.subnets.private
    // primary 1a subnet is unchanged
    expect(priv?.[0]).toEqual({ name: 'acme--payments--private--1a', cidr: '10.0.0.0/24', az: '1a', num: 1 })
    // expansion subnet: indexed name, num 2, CIDR from slot 3
    expect(priv?.[3]).toEqual({
      name: 'acme--payments--private--1a--2',
      cidr: '10.0.3.0/24',
      az: '1a',
      num: 2,
    })
  })

  it('num is auto-derived from repeated AZ occurrences when omitted', () => {
    const r = orgC.topology({
      vpcCidr: '10.0.0.0/16',
      azs: ['1a', '1b', '1c'],
      domains: {
        payments: {
          azAllocations: [
            { slot: 0, az: '1a' },
            { slot: 1, az: '1b' },
            { slot: 2, az: '1c' },
            { slot: 3, az: '1a' }, // no explicit num → derived as 2
          ],
        },
      },
    })
    expect(r.domains.payments?.subnets.private?.[3]?.name).toBe('acme--payments--private--1a--2')
    expect(r.domains.payments?.subnets.private?.[3]?.num).toBe(2)
  })

  it('a repeated AZ in the global azs list produces expansion subnets across every kind', () => {
    const r = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1a'] })
    // slot 0 and slot 1 within each kind's /22, same AZ, indexed names
    expect(r.domains.payments?.subnets.private?.[0]?.name).toBe('acme--payments--private--1a')
    expect(r.domains.payments?.subnets.private?.[1]?.name).toBe('acme--payments--private--1a--2')
    expect(r.domains.payments?.subnets.private?.[1]?.cidr).toBe('10.0.1.0/24')
    expect(r.domains.payments?.subnets.public?.[1]?.name).toBe('acme--payments--public--1a--2')
  })

  it('parses an expansion subnet name back into segments including num', () => {
    const parsed = orgC.parse('acme--payments--private--1a--2', { type: 'subnet' })
    expect(parsed).toEqual({ org: 'acme', domain: 'payments', kind: 'private', az: '1a', num: '2' })
  })

  it('throws when two subnets collide on the same (AZ, num)', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: {
          payments: {
            azAllocations: [
              { slot: 0, az: '1a' },
              { slot: 1, az: '1a' }, // same az, both derive to distinct nums (1, 2) — ok
              { slot: 2, az: '1a', num: 2 }, // collides with the derived num 2 above
            ],
          },
        },
      }),
    ).toThrow('duplicate subnet (AZ, num)')
  })

  it('throws on a non-positive or non-integer num', () => {
    expect(() =>
      orgC.topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: { payments: { azAllocations: [{ slot: 0, az: '1a', num: 0 }] } },
      }),
    ).toThrow('must be a positive integer')
  })
})

// ── Variable domain sizes — per-domain cidrPrefix ──────────────────────────────

describe('topology() — per-domain CIDR sizing (cidrPrefix)', () => {
  it('a small domain takes a tighter block, and its subnets scale down with it', () => {
    // db-only domain sized /24 → /26 tiers → /28 subnets (AWS minimum, ~11 usable)
    const r = new DerropsConventions({ org: 'acme' })
      .domain(['db'])
      .topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a', '1b'],
        domains: { db: { cidrPrefix: 24, includeKinds: ['isolated'] } },
      })
    expect(r.domains.db?.cidr).toBe('10.0.0.0/24')
    // isolated is slot 2 → +2 × /26 (64 addresses) = +128 → 10.0.0.128/28
    expect(r.domains.db?.subnets.isolated?.[0]).toEqual({
      name: 'acme--db--isolated--1a',
      cidr: '10.0.0.128/28',
      az: '1a',
      num: 1,
    })
    expect(r.domains.db?.subnets.isolated?.[1]?.cidr).toBe('10.0.0.144/28')
  })

  it('domains of different sizes are packed in order, each aligned to its own block', () => {
    const r = new DerropsConventions({ org: 'acme' })
      .domain(['payments', 'db', 'identity'])
      .topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: { db: { cidrPrefix: 24 } }, // payments & identity keep default /20
      })
    // payments: default /20 at the base
    expect(r.domains.payments?.cidr).toBe('10.0.0.0/20')
    // db: /24 packed right after payments' /20 (aligned to /24)
    expect(r.domains.db?.cidr).toBe('10.0.16.0/24')
    // identity: next default /20, aligned up to a /20 boundary → skips the rest of 10.0.16.0/20
    expect(r.domains.identity?.cidr).toBe('10.0.32.0/20')
  })

  it('a larger-than-default domain reserves a bigger block', () => {
    const r = new DerropsConventions({ org: 'acme' })
      .domain(['big', 'small'])
      .topology({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: { big: { cidrPrefix: 18 } }, // /18 = 4× the default /20
      })
    expect(r.domains.big?.cidr).toBe('10.0.0.0/18')
    // small default /20 packs after the /18 block
    expect(r.domains.small?.cidr).toBe('10.0.64.0/20')
  })

  it('uniform default domains are unaffected by the packing refactor', () => {
    const r = new DerropsConventions({ org: 'acme' })
      .domain(['payments', 'identity'])
      .topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
    expect(r.domains.payments?.cidr).toBe('10.0.0.0/20')
    expect(r.domains.identity?.cidr).toBe('10.0.16.0/20')
    expect(r.domains.payments?.subnets.private?.[0]?.cidr).toBe('10.0.0.0/24')
    expect(r.domains.identity?.subnets.isolated?.[0]?.cidr).toBe('10.0.24.0/24')
  })

  it('throws when a cidrPrefix is not smaller than the VPC', () => {
    expect(() =>
      new DerropsConventions({ org: 'acme' })
        .domain(['d'])
        .topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'], domains: { d: { cidrPrefix: 16 } } }),
    ).toThrow('must be smaller than')
  })

  it('throws when a cidrPrefix leaves no room for tiers and AZs', () => {
    expect(() =>
      new DerropsConventions({ org: 'acme' })
        .domain(['d'])
        .topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'], domains: { d: { cidrPrefix: 30 } } }),
    ).toThrow('no room')
  })

  it('throws when variably-sized domains overflow the VPC', () => {
    // three /18 domains = 3 × 16384 = 49152, plus a /17 (32768) = 81920 > 65536
    expect(() =>
      new DerropsConventions({ org: 'acme' })
        .domain(['a', 'b', 'c', 'big'])
        .topology({
          vpcCidr: '10.0.0.0/16',
          azs: ['1a'],
          domains: {
            a: { cidrPrefix: 18 },
            b: { cidrPrefix: 18 },
            c: { cidrPrefix: 18 },
            big: { cidrPrefix: 17 },
          },
        }),
    ).toThrow('does not fit')
  })

  it('capacityReport reports packed address usage across mixed sizes', () => {
    const report = new DerropsConventions({ org: 'acme' })
      .domain(['payments', 'db'])
      .capacityReport({
        vpcCidr: '10.0.0.0/16',
        azs: ['1a'],
        domains: { db: { cidrPrefix: 24 } },
      })
    // payments /20 (4096) + db /24 (256) = 4352 addresses of the 65536-address VPC
    expect(report.addressesTotal).toBe(65536)
    expect(report.addressesUsed).toBe(4096 + 256)
  })
})
