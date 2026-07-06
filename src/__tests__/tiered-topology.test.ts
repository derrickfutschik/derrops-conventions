import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'
import type { TieredTopologyOptions } from '../tiered-topology-types.js'

const baseConv = () =>
  new DerropsConventions({ org: 'acme', env: 'prod' }).domain(['payments', 'ledger', 'reporting'])

const baseOptions: TieredTopologyOptions = {
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],
  tiers: [
    { name: 'public', role: 'public' },
    { name: 'app', role: 'private' },
    { name: 'data-1', role: 'isolated' },
    { name: 'data-2', role: 'isolated' },
  ],
  assign: {
    payments: { public: 'public', app: 'app', data: 'data-1' },
    ledger: { public: 'public', app: 'app', data: 'data-2' },
    reporting: { app: 'app' },
  },
  access: { 'ledger-admins': ['ledger'] },
}

const build = (overrides: Partial<TieredTopologyOptions> = {}) =>
  baseConv().tieredTopology({ ...baseOptions, ...overrides })

describe('tieredTopology() — tier subnets and CIDRs', () => {
  const plan = build()

  it('names subnets by tier: acme--{tier}--{az}', () => {
    expect(plan.tiers['public']?.subnets[0]?.name).toBe('acme--public--1a')
    expect(plan.tiers['app']?.subnets[1]?.name).toBe('acme--app--1b')
    expect(plan.tiers['data-1']?.subnets[0]?.name).toBe('acme--data-1--1a')
    expect(plan.tiers['data-2']?.subnets[2]?.name).toBe('acme--data-2--1c')
  })

  it('packs tiers into consecutive /22 blocks with /24 subnets', () => {
    expect(plan.tiers['public']?.cidr).toBe('10.0.0.0/22')
    expect(plan.tiers['app']?.cidr).toBe('10.0.4.0/22')
    expect(plan.tiers['data-1']?.cidr).toBe('10.0.8.0/22')
    expect(plan.tiers['data-2']?.cidr).toBe('10.0.12.0/22')
    expect(plan.tiers['public']?.subnets.map((s) => s.cidr)).toEqual([
      '10.0.0.0/24',
      '10.0.1.0/24',
      '10.0.2.0/24',
    ])
    expect(plan.tiers['data-1']?.subnets[0]?.cidr).toBe('10.0.8.0/24')
  })

  it('subnet count is tiers × AZs, independent of domain count', () => {
    const names = Object.values(plan.tiers).flatMap((t) => t.subnets.map((s) => s.name))
    expect(names.length).toBe(4 * 3)
    expect(new Set(names).size).toBe(12)

    // Adding more domains assigned to existing tiers creates no new subnets.
    const more = new DerropsConventions({ org: 'acme' })
      .domain(['payments', 'ledger', 'reporting', 'extra1', 'extra2'])
      .tieredTopology({
        ...baseOptions,
        assign: {
          ...baseOptions.assign,
          extra1: { app: 'app', data: 'data-1' },
          extra2: { app: 'app', data: 'data-2' },
        },
      })
    const moreNames = Object.values(more.tiers).flatMap((t) => t.subnets.map((s) => s.name))
    expect(new Set(moreNames).size).toBe(12)
  })

  it('cidrPrefix sizes a data tier down; its subnets shrink accordingly', () => {
    const plan2 = build({
      tiers: [
        { name: 'app', role: 'private' },
        { name: 'data-small', role: 'isolated', cidrPrefix: 26 }, // /26 tier → /28 subnets
      ],
      assign: { payments: { app: 'app', data: 'data-small' } },
      access: {},
    })
    expect(plan2.tiers['data-small']?.cidr).toBe('10.0.4.0/26')
    expect(plan2.tiers['data-small']?.subnets[0]?.cidr).toBe('10.0.4.0/28')
  })
})

describe('tieredTopology() — finding subnets for a deployment artifact', () => {
  const conv = baseConv()
  const plan = conv.tieredTopology(baseOptions)

  it('domains[d].subnets[role] resolves to the assigned tier subnets', () => {
    expect(plan.domains['payments']?.subnets.app).toBe(plan.tiers['app']?.subnets)
    expect(plan.domains['payments']?.subnets.data?.[0]?.name).toBe('acme--data-1--1a')
    expect(plan.domains['ledger']?.subnets.data?.[0]?.name).toBe('acme--data-2--1a')
  })

  it('conv.subnetsFor(plan, domain, role) returns the tier subnets', () => {
    expect(conv.subnetsFor(plan, 'payments', 'app')).toBe(plan.tiers['app']?.subnets)
    expect(conv.subnetsFor(plan, 'payments', 'data')[0]?.name).toBe('acme--data-1--1a')
    expect(conv.subnetsFor(plan, 'ledger', 'data')[0]?.name).toBe('acme--data-2--1a')
  })

  it('two domains on the same app tier resolve to the same subnets', () => {
    expect(conv.subnetsFor(plan, 'payments', 'app')).toBe(conv.subnetsFor(plan, 'ledger', 'app'))
  })

  it('conv.subnetsFor without a role flattens all assigned tiers', () => {
    expect(conv.subnetsFor(plan, 'payments').length).toBe(3 * 3) // public+app+data × 3 AZs
    expect(conv.subnetsFor(plan, 'reporting').length).toBe(1 * 3) // app only
  })

  it('throws when the domain has no tier for the requested role', () => {
    expect(() => conv.subnetsFor(plan, 'reporting', 'data')).toThrow('no data tier')
  })

  it('rejects an undeclared domain at compile time', () => {
    // @ts-expect-error 'nope' is not one of the constrained domains 'payments' | 'ledger' | 'reporting'
    expect(() => conv.subnetsFor(plan, 'nope', 'app')).toThrow('not in the topology')
  })

  it('an unconstrained convention accepts any domain string', () => {
    const loose = new DerropsConventions({ org: 'acme' }) // no .domain() → domain widens to string
    const loosePlan = loose.tieredTopology({
      ...baseOptions,
      assign: { anything: { app: 'app' } },
      access: {},
    })
    expect(loose.subnetsFor(loosePlan, 'anything', 'app')).toBe(loosePlan.tiers['app']?.subnets)
  })

  it('domains[d].tiers and tierCidrs reflect the assignment; unassigned roles omitted', () => {
    expect(plan.domains['reporting']?.tiers).toEqual({ app: 'app' })
    expect(plan.domains['reporting']?.subnets.public).toBeUndefined()
    expect(plan.domains['reporting']?.tierCidrs).toEqual(['10.0.4.0/22'])
    expect(plan.domains['payments']?.tierCidrs).toEqual(['10.0.0.0/22', '10.0.4.0/22', '10.0.8.0/22'])
  })
})

describe('tieredTopology() — Client VPN authorization rules (domain-expressed)', () => {
  const plan = build()

  it('resolves a group→domain grant to that domain’s tier CIDRs', () => {
    const cidrs = plan.clientVpnAuthRules.map((r) => r.targetCidr).sort()
    // ledger → public, app, data-2
    expect(cidrs).toEqual(['10.0.0.0/22', '10.0.12.0/22', '10.0.4.0/22'])
    expect(plan.clientVpnAuthRules.every((r) => r.group === 'ledger-admins')).toBe(true)
  })

  it('warns that shared public/app tiers leak, but not the dedicated data-2 tier', () => {
    expect(plan.warnings.some((w) => w.includes('"public"'))).toBe(true)
    expect(plan.warnings.some((w) => w.includes('"app"'))).toBe(true)
    expect(plan.warnings.some((w) => w.includes('"data-2"'))).toBe(false)
  })

  it('dedupes CIDRs when a group can access multiple domains sharing a tier', () => {
    const p = build({ access: { admins: ['payments', 'ledger'] } })
    const appCidrRules = p.clientVpnAuthRules.filter((r) => r.targetCidr === '10.0.4.0/22')
    expect(appCidrRules.length).toBe(1) // shared app tier appears once
  })
})

describe('tieredTopology() — generated NACL rule bodies', () => {
  const plan = build()

  it('data tier denies ingress from every other data tier', () => {
    const d1 = plan.tiers['data-1']!.naclRules
    const denyFromData2 = d1.find(
      (r) => r.direction === 'ingress' && r.action === 'deny' && r.cidr === plan.tiers['data-2']?.cidr,
    )
    expect(denyFromData2).toBeDefined()
    // within the ingress space, deny rule numbers precede allow rule numbers (evaluated first)
    const minIngressAllow = Math.min(
      ...d1.filter((r) => r.direction === 'ingress' && r.action === 'allow').map((r) => r.ruleNumber),
    )
    expect(denyFromData2!.ruleNumber).toBeLessThan(minIngressAllow)
  })

  it('data tier allows ingress from the app tier on data ports', () => {
    const d1 = plan.tiers['data-1']!.naclRules
    const allowFromApp = d1.find(
      (r) =>
        r.direction === 'ingress' &&
        r.action === 'allow' &&
        r.cidr === plan.tiers['app']?.cidr &&
        r.fromPort === 5432,
    )
    expect(allowFromApp).toBeDefined()
  })

  it('app tier allows ingress from the public tier', () => {
    const app = plan.tiers['app']!.naclRules
    expect(
      app.some((r) => r.direction === 'ingress' && r.action === 'allow' && r.cidr === plan.tiers['public']?.cidr),
    ).toBe(true)
  })

  it('custom dataPorts flow into the NACL rules', () => {
    const p = build({ dataPorts: [1521] })
    const d1 = p.tiers['data-1']!.naclRules
    expect(d1.some((r) => r.fromPort === 1521)).toBe(true)
    expect(d1.some((r) => r.fromPort === 5432)).toBe(false)
  })
})

describe('tieredTopology() — validation', () => {
  it('throws when a slot receives a tier of the wrong role', () => {
    expect(() =>
      build({ assign: { payments: { data: 'public' } } }), // public tier in the data slot
    ).toThrow('must be a "isolated" tier')
  })

  it('throws when an assignment references an undeclared tier', () => {
    expect(() => build({ assign: { payments: { data: 'data-9' } } })).toThrow('not declared in tiers')
  })

  it('throws when an access group references an unassigned domain', () => {
    expect(() => build({ access: { g: ['ghost'] } })).toThrow('no tier assignment')
  })

  it('throws when a domain is not a constrained domain', () => {
    expect(() =>
      new DerropsConventions({ org: 'acme' }).domain(['payments']).tieredTopology({
        ...baseOptions,
        assign: { payments: { app: 'app' }, stranger: { app: 'app' } },
        access: {},
      }),
    ).toThrow('not a constrained domain')
  })

  it('throws when tiers overflow the VPC', () => {
    expect(() =>
      build({
        tiers: [
          { name: 't1', role: 'private', cidrPrefix: 17 },
          { name: 't2', role: 'private', cidrPrefix: 17 },
          { name: 't3', role: 'private', cidrPrefix: 17 }, // 3rd /17 overflows a /16
        ],
        assign: { payments: { app: 't1' } },
        access: {},
      }),
    ).toThrow('does not fit')
  })

  it('throws on a duplicate tier name', () => {
    expect(() =>
      build({
        tiers: [
          { name: 'app', role: 'private' },
          { name: 'app', role: 'isolated' },
        ],
        assign: {},
        access: {},
      }),
    ).toThrow('duplicate tier name')
  })
})

describe('tieredTopology() — backward compatibility', () => {
  it('the new `tier` segment does not change existing subnet names', () => {
    const c = new DerropsConventions({ org: 'acme', env: 'prod' })
    expect(c.name({ type: 'subnet', domain: 'payments', kind: 'private', az: '1a' })).toBe(
      'acme--payments--private--1a',
    )
  })
})
