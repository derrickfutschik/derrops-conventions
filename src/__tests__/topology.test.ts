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

// ── CIDR stability — append-only at global level ──────────────────────────────

describe('topology() — CIDR stability', () => {
  const orgC = new DerropsConventions({ org: 'acme' }).domain(['payments', 'identity'])

  it('appending a kind to the global list does not change existing kind CIDRs', () => {
    const baseline = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'], kinds: ['private', 'isolated'] })
    const extended = orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a'], kinds: ['private', 'isolated', 'public'] })
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
            { slot: 1, name: 'public' },   // inserted at slot 1 — fills the reserved gap
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
          kinds: [{ slot: 0, name: 'private' }, { slot: 1, name: 'public' }],
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
    expect(Object.keys(r.domains.identity?.routeTables ?? {}).sort()).toEqual(['isolated', 'private'])
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
      azs: ['1a', '1b', '1c'],   // new AZ appended
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
      kinds: ['private', 'isolated', 'public'],   // new kind tier appended
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
