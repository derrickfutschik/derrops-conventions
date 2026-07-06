import type { DerropsConventions, NameOptions } from './DerropsConventions.js'
import {
  parseCidr,
  intToIp,
  computeDomainLayout,
  resolveAzNums,
  validateDomainPrefix,
  MAX_SLOT,
  type SubnetEntry,
} from './topology.js'
import type {
  TieredTopologyOptions,
  TieredTopology,
  TierTopology,
  TierSpec,
  TierRole,
  NaclRule,
  ClientVpnAuthRule,
  DomainTierPlacement,
} from './tiered-topology-types.js'

// ── Constants ───────────────────────────────────────────────────────────────

/** Default tier block width below the VPC prefix — `/22` in a `/16` (→ `/24` subnets, 4 AZs). */
const DEFAULT_TIER_BITS = 6
/** Ephemeral TCP port range for stateless NACL return traffic. */
const EPHEMERAL: [number, number] = [1024, 65535]
/** Default TCP ports the app tier may open to data tiers. */
const DEFAULT_DATA_PORTS = [5432, 3306, 6379]
/** Which tier role each assignment slot requires. */
const SLOT_ROLE = { public: 'public', app: 'private', data: 'isolated' } as const
const SLOTS = ['public', 'app', 'data'] as const

// ── NACL rule generation ──────────────────────────────────────────────────────

/**
 * Generate NACL rule bodies for a tier from the tier graph. NACLs are stateless, so allows are
 * emitted in both directions with an ephemeral range for return traffic. Data (isolated) tiers get
 * an **explicit deny** for every other data tier's CIDR (evaluated first via a lower rule number),
 * which is the isolation that makes multiple data tiers meaningful.
 */
function buildTierNaclRules(
  tier: TierSpec,
  cidrByTier: Record<string, string>,
  publicTiers: TierSpec[],
  appTiers: TierSpec[],
  dataTiers: TierSpec[],
  dataPorts: number[],
): NaclRule[] {
  const rules: NaclRule[] = []
  let inDeny = 100
  let inAllow = 200
  let egNum = 100
  const ing = (
    cidr: string,
    action: 'allow' | 'deny',
    protocol: string,
    ports: [number, number] | undefined,
    description: string,
  ) =>
    rules.push({
      ruleNumber: action === 'deny' ? inDeny++ : inAllow++,
      direction: 'ingress',
      cidr,
      action,
      protocol,
      fromPort: ports?.[0],
      toPort: ports?.[1],
      description,
    })
  const egr = (
    cidr: string,
    protocol: string,
    ports: [number, number] | undefined,
    description: string,
  ) =>
    rules.push({
      ruleNumber: egNum++,
      direction: 'egress',
      cidr,
      action: 'allow',
      protocol,
      fromPort: ports?.[0],
      toPort: ports?.[1],
      description,
    })

  if (tier.role === 'public') {
    ing('0.0.0.0/0', 'allow', 'tcp', [80, 80], 'HTTP from internet')
    ing('0.0.0.0/0', 'allow', 'tcp', [443, 443], 'HTTPS from internet')
    ing('0.0.0.0/0', 'allow', 'tcp', EPHEMERAL, 'Ephemeral return traffic')
    egr('0.0.0.0/0', '-1', undefined, 'All outbound')
  } else if (tier.role === 'private') {
    for (const p of publicTiers)
      ing(cidrByTier[p.name]!, 'allow', '-1', undefined, `From public tier ${p.name}`)
    for (const d of dataTiers)
      ing(cidrByTier[d.name]!, 'allow', 'tcp', EPHEMERAL, `Ephemeral responses from data tier ${d.name}`)
    for (const d of dataTiers)
      for (const port of dataPorts)
        egr(cidrByTier[d.name]!, 'tcp', [port, port], `To data tier ${d.name}:${port}`)
    for (const p of publicTiers)
      egr(cidrByTier[p.name]!, 'tcp', EPHEMERAL, `Ephemeral back to public tier ${p.name}`)
    egr('0.0.0.0/0', 'tcp', [443, 443], 'HTTPS egress via NAT')
  } else {
    // isolated (data): deny other data tiers first, then allow only the app tier on data ports.
    for (const d of dataTiers)
      if (d.name !== tier.name)
        ing(cidrByTier[d.name]!, 'deny', '-1', undefined, `Deny cross-data-tier traffic from ${d.name}`)
    for (const a of appTiers)
      for (const port of dataPorts)
        ing(cidrByTier[a.name]!, 'allow', 'tcp', [port, port], `From app tier ${a.name}:${port}`)
    for (const a of appTiers)
      egr(cidrByTier[a.name]!, 'tcp', EPHEMERAL, `Ephemeral responses to app tier ${a.name}`)
  }
  return rules
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Generate a tier-first VPC topology: tiers (public / app / data-N) own the subnets, domains are
 * assigned one tier per role, and the isolation artifacts (per-tier NACL rule bodies, Client VPN
 * authorization rules keyed to the domains a group may reach) are generated. Subnet count is
 * `#tiers × AZs`, independent of the number of domains.
 *
 * @throws if a tier name is duplicated, a role is invalid, an assignment references an undeclared
 *   tier, a slot's tier role does not match, an `access` domain is unassigned, or the tiers overflow the VPC.
 */
export function buildTieredTopology(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convention: DerropsConventions<any, any, any, any, any>,
  options: TieredTopologyOptions,
): TieredTopology {
  const { vpcCidr, azs, tiers, assign, access = {}, dataPorts = DEFAULT_DATA_PORTS } = options
  const { base: vpcBase, prefix: vpcPrefix } = parseCidr(vpcCidr)

  // ── Validate tiers ──
  if (!tiers?.length) throw new Error('tieredTopology() requires at least one tier')
  const seenTier = new Set<string>()
  for (const t of tiers) {
    if (seenTier.has(t.name)) throw new Error(`tieredTopology(): duplicate tier name "${t.name}"`)
    seenTier.add(t.name)
    if (t.role !== 'public' && t.role !== 'private' && t.role !== 'isolated') {
      throw new Error(`tier "${t.name}": invalid role "${t.role}" (expected public|private|isolated)`)
    }
    if (t.cidrPrefix !== undefined) validateDomainPrefix(t.name, t.cidrPrefix, vpcPrefix)
  }
  const tierByName = new Map(tiers.map((t) => [t.name, t]))

  // ── Validate AZs ──
  if (!azs?.length) throw new Error('tieredTopology() requires at least one AZ')
  if (azs.length > MAX_SLOT + 1) {
    throw new Error(`tieredTopology(): at most ${MAX_SLOT + 1} AZs are supported, got ${azs.length}`)
  }

  // ── Validate assignment ──
  const constrainedDomains = convention.constraints().domain as string[] | undefined
  for (const [domain, a] of Object.entries(assign)) {
    if (constrainedDomains && !constrainedDomains.includes(domain)) {
      throw new Error(`tieredTopology(): domain "${domain}" is not a constrained domain`)
    }
    for (const slot of SLOTS) {
      const tierName = a[slot]
      if (tierName === undefined) continue
      const tier = tierByName.get(tierName)
      if (!tier) {
        throw new Error(`domain "${domain}": ${slot} tier "${tierName}" is not declared in tiers`)
      }
      if (tier.role !== SLOT_ROLE[slot]) {
        throw new Error(
          `domain "${domain}": ${slot} slot must be a "${SLOT_ROLE[slot]}" tier, but "${tierName}" is "${tier.role}"`,
        )
      }
    }
  }
  for (const [group, domains] of Object.entries(access)) {
    for (const d of domains) {
      if (!(d in assign)) {
        throw new Error(`access group "${group}": domain "${d}" has no tier assignment`)
      }
    }
  }

  // ── Pack tiers into the VPC ──
  const defaultTierPrefix = vpcPrefix + DEFAULT_TIER_BITS
  const prefixFor = (name: string): number => tierByName.get(name)!.cidrPrefix ?? defaultTierPrefix
  const { layout, firstOverflow } = computeDomainLayout(
    vpcBase,
    vpcPrefix,
    tiers.map((t) => t.name),
    prefixFor,
  )
  if (firstOverflow !== null) {
    throw new Error(
      `tieredTopology(): tier "${firstOverflow}" (/${prefixFor(firstOverflow)}) does not fit — the ` +
        `tiers' combined size exceeds the /${vpcPrefix} VPC. Use smaller tiers (larger cidrPrefix), ` +
        `fewer tiers, or a larger VPC.`,
    )
  }
  const layoutByName = new Map(layout.map((l) => [l.domain, l]))

  const orgLayer = convention.orgNetworkLayer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object): string => convention.name(opts as NameOptions<any, any>)

  // ── Build each tier's subnets / route table / NACL name ──
  const tierTopos: Record<string, TierTopology> = {}
  const cidrByTier: Record<string, string> = {}
  for (const t of tiers) {
    const { base, domainPrefix: tierPrefix } = layoutByName.get(t.name)!
    const azPrefix = tierPrefix + 2
    const azSize = 2 ** (32 - azPrefix)
    const azAllocs = azs.map((az, i) => ({ slot: i, az }))
    const azNums = resolveAzNums(azAllocs)
    const subnets: SubnetEntry[] = azAllocs.map((a, i) => {
      const num = azNums[i]!
      return {
        // num renders into the name only when > 1 (expansion subnet), matching the domain model.
        name: n({ type: 'tierSubnet', tier: t.name, az: a.az, ...(num > 1 ? { num: String(num) } : {}) }),
        cidr: `${intToIp(base + a.slot * azSize)}/${azPrefix}`,
        az: a.az,
        num,
      }
    })
    const cidr = `${intToIp(base)}/${tierPrefix}`
    cidrByTier[t.name] = cidr
    tierTopos[t.name] = {
      role: t.role,
      cidr,
      subnets,
      routeTable: n({ type: 'tierRouteTable', tier: t.name }),
      nacl: n({ type: 'tierNetworkAcl', tier: t.name }),
      naclRules: [],
    }
  }

  // ── Generate NACL rule bodies ──
  const publicTiers = tiers.filter((t) => t.role === 'public')
  const appTiers = tiers.filter((t) => t.role === 'private')
  const dataTiers = tiers.filter((t) => t.role === 'isolated')
  for (const t of tiers) {
    tierTopos[t.name]!.naclRules = buildTierNaclRules(
      t,
      cidrByTier,
      publicTiers,
      appTiers,
      dataTiers,
      dataPorts,
    )
  }

  // ── Resolve each domain's per-role subnets + tier CIDRs ──
  const domainPlacements: Record<string, DomainTierPlacement> = {}
  const domainsByTier = new Map<string, string[]>()
  for (const [domain, a] of Object.entries(assign)) {
    const subnets: DomainTierPlacement['subnets'] = {}
    const tierCidrs: string[] = []
    for (const slot of SLOTS) {
      const tierName = a[slot]
      if (!tierName) continue
      subnets[slot] = tierTopos[tierName]!.subnets
      tierCidrs.push(tierTopos[tierName]!.cidr)
      if (!domainsByTier.has(tierName)) domainsByTier.set(tierName, [])
      domainsByTier.get(tierName)!.push(domain)
    }
    domainPlacements[domain] = { tiers: { ...a }, subnets, tierCidrs: [...new Set(tierCidrs)] }
  }

  // ── Client VPN authorization rules (domain-expressed) + leak warnings ──
  const clientVpnAuthRules: ClientVpnAuthRule[] = []
  const warnings: string[] = []
  for (const [group, domains] of Object.entries(access)) {
    const allowed = new Set(domains)
    const seenCidr = new Set<string>()
    for (const d of domains) {
      const a = assign[d]!
      for (const slot of SLOTS) {
        const tierName = a[slot]
        if (!tierName) continue
        const cidr = tierTopos[tierName]!.cidr
        if (!seenCidr.has(cidr)) {
          seenCidr.add(cidr)
          clientVpnAuthRules.push({
            group,
            targetCidr: cidr,
            description: `${group} → ${d} ${slot} tier (${tierName})`,
          })
        }
        const leaked = (domainsByTier.get(tierName) ?? []).filter((x) => !allowed.has(x))
        if (leaked.length) {
          warnings.push(
            `Client VPN: granting "${group}" access to "${d}" exposes shared tier "${tierName}" ` +
              `(${cidr}) also used by: ${[...new Set(leaked)].join(', ')}.`,
          )
        }
      }
    }
  }

  return {
    vpc: { name: orgLayer.vpc, cidr: vpcCidr },
    transitGateway: orgLayer.transitGateway,
    tiers: tierTopos,
    domains: domainPlacements,
    clientVpnAuthRules,
    warnings,
  }
}
