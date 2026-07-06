import type { DerropsConventions, NameOptions } from './DerropsConventions.js'
import type {
  AzAllocation,
  KindAllocation,
  DomainAllocationConfig,
  TopologyOptions,
  DomainCapacityReport,
  TopologyCapacityReport,
} from './topology-types.js'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Standard subnet tier kinds used by the Derrops network topology convention.
 *
 * | Kind       | Routing                          | Typical residents                   |
 * | ---------- | -------------------------------- | ----------------------------------- |
 * | `private`  | Outbound via NAT gateway         | Application services, ECS tasks     |
 * | `public`   | Direct internet gateway route    | Load balancers, NAT gateways        |
 * | `isolated` | No internet route (inbound or out) | Databases, OpenSearch, ElastiCache |
 *
 * Custom kind names beyond these three are also supported via the `KindAllocation` API.
 */
export type SubnetKind = 'private' | 'public' | 'isolated'

/** A single subnet with its convention name, CIDR block, and availability zone. */
export interface SubnetEntry {
  /** Convention name — e.g. `'acme--payments--private--1a'` (or `'…--1a--2'` for an expansion subnet) */
  name: string
  /** CIDR block — e.g. `'10.0.0.0/24'` */
  cidr: string
  /** Availability zone suffix — e.g. `'1a'` */
  az: string
  /**
   * Ordinal within the tier + AZ. `1` for the first (and usually only) subnet; `2`, `3`, … for
   * additional expansion subnets sharing the same AZ. The name carries this index only when > 1.
   */
  num: number
}

/** All networking resources for one domain. */
export interface DomainNetworkTopology {
  /** Domain CIDR block (one /20 per domain by default) — e.g. `'10.0.0.0/20'` */
  cidr: string
  /** Network ACL name — e.g. `'acme--payments'` */
  nacl: string
  /** Transit Gateway attachment name — e.g. `'acme--payments'` */
  tgwAttachment: string
  /** Route table name per tier — e.g. `{ private: 'acme--payments--private', ... }` */
  routeTables: Record<string, string>
  /**
   * Subnets per tier. Keys are kind names (`'private'`, `'public'`, `'isolated'`, or custom).
   * Only kinds explicitly allocated for this domain are present — there are no phantom entries
   * for kinds that were not requested.
   */
  subnets: Record<string, SubnetEntry[]>
}

/** The complete org network topology — VPC, Transit Gateway, and all domain resources. */
export interface OrgNetworkTopology {
  /** VPC name and CIDR — e.g. `{ name: 'acme', cidr: '10.0.0.0/16' }` */
  vpc: { name: string; cidr: string }
  /** Transit Gateway name — e.g. `'acme--tgw'` */
  transitGateway: string
  /** Per-domain topology keyed by domain name */
  domains: Record<string, DomainNetworkTopology>
}

// ── CIDR arithmetic ───────────────────────────────────────────────────────────

function ipToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number)
  return a! * 16777216 + b! * 65536 + c! * 256 + d!
}

export function intToIp(n: number): string {
  return [
    Math.floor(n / 16777216) % 256,
    Math.floor(n / 65536) % 256,
    Math.floor(n / 256) % 256,
    n % 256,
  ].join('.')
}

export function parseCidr(cidr: string): { base: number; prefix: number } {
  const [ip, prefix] = cidr.split('/')
  return { base: ipToInt(ip!), prefix: Number(prefix) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const MAX_SLOT = 3

function findDuplicates<T>(items: T[]): T[] {
  const seen = new Set<T>()
  const dupes = new Set<T>()
  for (const n of items) {
    if (seen.has(n)) dupes.add(n)
    seen.add(n)
  }
  return [...dupes]
}

/**
 * Resolve the ordinal `num` for each AZ allocation in a kind's list. An explicit `num` is used
 * as-is; otherwise it defaults to the 1-based occurrence count of that AZ within the list, so a
 * second allocation for the same AZ becomes the expansion subnet `num` 2.
 */
export function resolveAzNums(azs: AzAllocation[]): number[] {
  const occurrences = new Map<string, number>()
  return azs.map((a) => {
    const occ = (occurrences.get(a.az) ?? 0) + 1
    occurrences.set(a.az, occ)
    return a.num ?? occ
  })
}

function validateAzAllocations(context: string, azs: AzAllocation[]): void {
  for (const { az, num } of azs) {
    if (num !== undefined && (!Number.isInteger(num) || num < 1)) {
      throw new Error(`${context}: AZ "${az}" num ${num} must be a positive integer`)
    }
  }
  const dupes = findDuplicates(azs.map((a) => a.slot))
  if (dupes.length) {
    throw new Error(`${context}: duplicate AZ slots: ${dupes.join(', ')}`)
  }
  for (const { slot } of azs) {
    if (slot < 0 || slot > MAX_SLOT) {
      throw new Error(`${context}: AZ slot ${slot} is out of range 0–${MAX_SLOT}`)
    }
  }
  // Multiple subnets may share an AZ for capacity expansion, but each must have a unique name —
  // i.e. a unique (az, num) pair. Otherwise two subnets would collide on the same name.
  const nums = resolveAzNums(azs)
  const nameDupes = findDuplicates(azs.map((a, i) => `${a.az}#${nums[i]}`))
  if (nameDupes.length) {
    throw new Error(
      `${context}: duplicate subnet (AZ, num): ${nameDupes.join(', ')}. ` +
        `Give the additional subnet in that AZ a distinct "num".`,
    )
  }
}

function validateKindAllocations(
  context: string,
  kinds: KindAllocation[],
  fallbackAzs: AzAllocation[],
): void {
  const dupes = findDuplicates(kinds.map((k) => k.slot))
  if (dupes.length) {
    throw new Error(`${context}: duplicate kind slots: ${dupes.join(', ')}`)
  }
  for (const kind of kinds) {
    if (kind.slot < 0 || kind.slot > MAX_SLOT) {
      throw new Error(
        `${context}: kind "${kind.name}" slot ${kind.slot} is out of range 0–${MAX_SLOT}`,
      )
    }
    if (kind.azAllocations) {
      validateAzAllocations(`${context} kind "${kind.name}"`, kind.azAllocations)
    } else {
      validateAzAllocations(context, fallbackAzs)
    }
  }
}

/** Default domain-index field width — 16 domains, the historical fixed value. */
const DEFAULT_DOMAIN_BITS = 4

/** Bits consumed below the domain block by the kind tier (2) and AZ (2). */
const TIER_AND_AZ_BITS = 4

/** Convert the flat global arrays into the internal slot-based form. */
function normalizeTopologyOptions(options: TopologyOptions): {
  vpcCidr: string
  domainBits: number
  globalAzAllocations: AzAllocation[]
  defaultKinds: KindAllocation[]
  domainConfigs: Record<string, DomainAllocationConfig>
} {
  const {
    vpcCidr,
    domainBits = DEFAULT_DOMAIN_BITS,
    azs,
    kinds = ['private', 'public', 'isolated'],
    domains = {},
  } = options
  return {
    vpcCidr,
    domainBits,
    globalAzAllocations: azs.map((az, i) => ({ slot: i, az })),
    defaultKinds: kinds.map((name, i) => ({ slot: i, name })),
    domainConfigs: domains,
  }
}

/**
 * Validate `domainBits` against the VPC prefix. Ensures the default domain block, plus its
 * kind and AZ fields, fits inside the VPC. Whether the domains *collectively* fit is decided
 * by the packing pass ({@link computeDomainLayout}), which also accounts for per-domain sizes.
 */
function validateDomainBits(domainBits: number, vpcPrefix: number): void {
  if (!Number.isInteger(domainBits) || domainBits < 1) {
    throw new Error(`domainBits must be a positive integer, got ${domainBits}`)
  }
  const maxDomainBits = 32 - TIER_AND_AZ_BITS - vpcPrefix
  if (domainBits > maxDomainBits) {
    throw new Error(
      `domainBits ${domainBits} does not fit a /${vpcPrefix} VPC: ${TIER_AND_AZ_BITS} bits are ` +
        `reserved for the kind tier and AZ, leaving at most ${maxDomainBits} for domains. ` +
        `Widen the VPC (lower the prefix) or lower domainBits.`,
    )
  }
}

/** Validate a per-domain `cidrPrefix` — it must be smaller than the VPC and leave room for tiers/AZs. */
export function validateDomainPrefix(domain: string, cidrPrefix: number, vpcPrefix: number): void {
  if (!Number.isInteger(cidrPrefix)) {
    throw new Error(`domain "${domain}": cidrPrefix must be an integer, got ${cidrPrefix}`)
  }
  if (cidrPrefix <= vpcPrefix) {
    throw new Error(
      `domain "${domain}": cidrPrefix /${cidrPrefix} must be smaller than the /${vpcPrefix} VPC.`,
    )
  }
  const maxPrefix = 32 - TIER_AND_AZ_BITS
  if (cidrPrefix > maxPrefix) {
    throw new Error(
      `domain "${domain}": cidrPrefix /${cidrPrefix} leaves no room for the kind tier and AZ ` +
        `(${TIER_AND_AZ_BITS} bits) — the maximum is /${maxPrefix}.`,
    )
  }
}

/** Round an address up to the next multiple of `size` (CIDR blocks must be size-aligned). */
export function alignUp(value: number, size: number): number {
  return Math.ceil(value / size) * size
}

/**
 * Pack domains into the VPC in declared order. Each domain takes a block sized by its own
 * `cidrPrefix` (or `defaultDomainPrefix`), aligned up to that block's boundary — so mixing sizes
 * may leave alignment gaps. Returns each domain's base address and prefix, the end cursor, and
 * the first domain (if any) that spills past the VPC. Never throws — callers decide.
 */
export function computeDomainLayout(
  vpcBase: number,
  vpcPrefix: number,
  domains: string[],
  prefixFor: (domain: string) => number,
): {
  layout: Array<{ domain: string; domainPrefix: number; base: number; size: number }>
  endCursor: number
  firstOverflow: string | null
} {
  const vpcEnd = vpcBase + 2 ** (32 - vpcPrefix)
  let cursor = vpcBase
  let firstOverflow: string | null = null
  const layout = domains.map((domain) => {
    const domainPrefix = prefixFor(domain)
    const size = 2 ** (32 - domainPrefix)
    const base = alignUp(cursor, size)
    cursor = base + size
    if (firstOverflow === null && cursor > vpcEnd) firstOverflow = domain
    return { domain, domainPrefix, base, size }
  })
  return { layout, endCursor: cursor, firstOverflow }
}

function resolveKindsForDomain(
  domain: string,
  defaultKinds: KindAllocation[],
  domainConfig: DomainAllocationConfig | undefined,
): KindAllocation[] {
  if (!domainConfig) return defaultKinds
  const { kinds, includeKinds, additionalKinds } = domainConfig
  const setCount = [kinds, includeKinds, additionalKinds].filter(Boolean).length
  if (setCount > 1) {
    throw new Error(
      `Domain "${domain}": only one of "kinds", "includeKinds", or "additionalKinds" may be set`,
    )
  }
  if (kinds) return kinds
  if (includeKinds) return defaultKinds.filter((k) => includeKinds.includes(k.name))
  if (additionalKinds) return [...defaultKinds, ...additionalKinds]
  return defaultKinds
}

function resolveAzsForKind(
  kind: KindAllocation,
  domainConfig: DomainAllocationConfig | undefined,
  globalAzAllocations: AzAllocation[],
): AzAllocation[] {
  return kind.azAllocations ?? domainConfig?.azAllocations ?? globalAzAllocations
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Generate the full network topology — names and CIDR blocks — for the org and all
 * constrained domains.
 *
 * CIDR allocation scheme (generalises to any VPC prefix and `domainBits`, shown for the
 * defaults — a /16 VPC with `domainBits: 4`):
 * ```
 * VPC:    /16  →  65,536 addresses
 * Domain: /20  →   4,096 per domain  (packed in order from VPC base; 2**domainBits domains)
 * Tier:   /22  →   1,024 per tier    (kindAllocation.slot × 1024 within domain)
 * AZ:     /24  →     256 per AZ      (azAllocation.slot × 256 within tier)
 * ```
 *
 * The default domain block is `vpcPrefix + domainBits` wide, so `domainBits` trades domain count
 * against per-domain (and per-subnet) size. Widen the VPC by the same number of bits to add
 * domains without shrinking subnets.
 *
 * Domains may also be sized individually via `domains[name].cidrPrefix` — e.g. a database-only
 * domain can take a tight `/24` while others keep the default. Domains are then packed into the
 * VPC in declared order, each aligned to its own block size, so mixing sizes can leave alignment
 * gaps; declare larger domains first for tight packing.
 *
 * Domain ordering in `.domain([...])` is the CIDR allocation contract — domain 0 is placed first,
 * domain 1 next, etc. Changing the order (or an earlier domain's size) shifts later domains' CIDRs.
 *
 * Kind and AZ positions are determined by their explicit `slot` numbers, not array positions.
 * This means new kinds or AZs can be appended with higher slot numbers without disturbing
 * existing CIDR allocations.
 *
 * @throws if the convention has no constrained domain values
 * @throws if slot numbers are out of range (0–3) or duplicated within a domain/kind
 * @throws if `domainBits` or a domain's `cidrPrefix` is invalid or too wide for the VPC
 * @throws if the domains' combined size does not fit in the VPC
 * @throws if two subnets collide on the same (AZ, num) within a tier
 */
export function buildNetworkTopology(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convention: DerropsConventions<any, any, any, any, any>,
  options: TopologyOptions,
): OrgNetworkTopology {
  const { vpcCidr, domainBits, globalAzAllocations, defaultKinds, domainConfigs } =
    normalizeTopologyOptions(options)

  const domains = convention.constraints().domain as string[] | undefined

  if (!domains?.length) {
    throw new Error(
      "topology() requires domain to be constrained — call .domain(['payments', 'identity', ...]) first",
    )
  }

  const { base: vpcBase, prefix: vpcPrefix } = parseCidr(vpcCidr)
  const defaultDomainPrefix = vpcPrefix + domainBits
  validateDomainBits(domainBits, vpcPrefix)

  // Validate all allocations up-front so errors surface before any CIDR is computed.
  validateAzAllocations('global', globalAzAllocations)
  validateKindAllocations('default kinds', defaultKinds, globalAzAllocations)

  for (const [domain, config] of Object.entries(domainConfigs)) {
    const setCount = [config.kinds, config.includeKinds, config.additionalKinds].filter(
      Boolean,
    ).length
    if (setCount > 1) {
      throw new Error(
        `Domain "${domain}": only one of "kinds", "includeKinds", or "additionalKinds" may be set`,
      )
    }
    if (config.cidrPrefix !== undefined) {
      validateDomainPrefix(domain, config.cidrPrefix, vpcPrefix)
    }
    if (config.azAllocations) {
      validateAzAllocations(`domain "${domain}"`, config.azAllocations)
    }
    const effectiveKinds = resolveKindsForDomain(domain, defaultKinds, config)
    validateKindAllocations(
      `domain "${domain}"`,
      effectiveKinds,
      config.azAllocations ?? globalAzAllocations,
    )
  }

  // Pack domains into the VPC, each sized by its own cidrPrefix or the default.
  const prefixFor = (domain: string): number =>
    domainConfigs[domain]?.cidrPrefix ?? defaultDomainPrefix
  const { layout, firstOverflow } = computeDomainLayout(vpcBase, vpcPrefix, domains, prefixFor)
  if (firstOverflow !== null) {
    throw new Error(
      `topology(): domain "${firstOverflow}" (/${prefixFor(firstOverflow)}) does not fit — the ` +
        `domains' combined size exceeds the /${vpcPrefix} VPC. Use smaller domain blocks ` +
        `(larger cidrPrefix), fewer domains, order larger domains first, or a larger VPC.`,
    )
  }
  const layoutByDomain = new Map(layout.map((d) => [d.domain, d]))

  const orgLayer = convention.orgNetworkLayer()

  const n = (domain: string, opts: object): string =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    convention.name({ ...opts, domain } as NameOptions<any, any>)

  const resultDomains: Record<string, DomainNetworkTopology> = {}

  domains.forEach((domain) => {
    const { domainPrefix, base: domainBase } = layoutByDomain.get(domain)!
    const tierPrefix = domainPrefix + 2
    const azPrefix = tierPrefix + 2
    const tierSize = 2 ** (32 - tierPrefix)
    const azSize = 2 ** (32 - azPrefix)
    const domainConfig = domainConfigs[domain]
    const resolvedKinds = resolveKindsForDomain(domain, defaultKinds, domainConfig)

    const routeTables: Record<string, string> = {}
    const subnets: Record<string, SubnetEntry[]> = {}

    resolvedKinds.forEach((kindAlloc) => {
      const tierBase = domainBase + kindAlloc.slot * tierSize
      const resolvedAzs = resolveAzsForKind(kindAlloc, domainConfig, globalAzAllocations)

      const azNums = resolveAzNums(resolvedAzs)

      routeTables[kindAlloc.name] = n(domain, { type: 'routeTable', kind: kindAlloc.name })
      subnets[kindAlloc.name] = resolvedAzs.map((azAlloc, azIdx) => {
        const num = azNums[azIdx]!
        return {
          // num is rendered into the name only when > 1, keeping first-subnet names unchanged.
          name: n(domain, {
            type: 'subnet',
            kind: kindAlloc.name,
            az: azAlloc.az,
            ...(num > 1 ? { num: String(num) } : {}),
          }),
          cidr: `${intToIp(tierBase + azAlloc.slot * azSize)}/${azPrefix}`,
          az: azAlloc.az,
          num,
        }
      })
    })

    resultDomains[domain] = {
      cidr: `${intToIp(domainBase)}/${domainPrefix}`,
      nacl: n(domain, { type: 'networkAcl' }),
      tgwAttachment: n(domain, { type: 'transitGatewayAttachment' }),
      routeTables,
      subnets,
    }
  })

  return {
    vpc: { name: orgLayer.vpc, cidr: vpcCidr },
    transitGateway: orgLayer.transitGateway,
    domains: resultDomains,
  }
}

/**
 * Returns a capacity report describing slot utilisation for all domains without throwing.
 * Use this to audit CIDR space before deployment.
 *
 * A warning is emitted for any domain where more than 75 % of kind slots are used,
 * and for any kind where more than 75 % of AZ slots are used.
 */
export function buildCapacityReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convention: DerropsConventions<any, any, any, any, any>,
  options: TopologyOptions,
): TopologyCapacityReport {
  const { vpcCidr, domainBits, globalAzAllocations, defaultKinds, domainConfigs } =
    normalizeTopologyOptions(options)
  const domains = (convention.constraints().domain as string[] | undefined) ?? []

  const TOTAL_SLOTS = MAX_SLOT + 1
  const WARN_THRESHOLD = 0.75

  const warnings: string[] = []
  const domainReports: DomainCapacityReport[] = []

  const { base: vpcBase, prefix: vpcPrefix } = parseCidr(vpcCidr)
  const domainSlotsTotal = 2 ** domainBits
  const domainSlotsUsed = domains.length

  // Address utilisation from the actual packed layout — correct for uniform and mixed sizes.
  const defaultDomainPrefix = vpcPrefix + domainBits
  const prefixFor = (domain: string): number =>
    domainConfigs[domain]?.cidrPrefix ?? defaultDomainPrefix
  const addressesTotal = 2 ** (32 - vpcPrefix)
  const { endCursor, firstOverflow } = computeDomainLayout(vpcBase, vpcPrefix, domains, prefixFor)
  const addressesUsed = Math.min(endCursor - vpcBase, addressesTotal)
  if (firstOverflow !== null) {
    warnings.push(
      `VPC: domains do not fit — "${firstOverflow}" spills past the /${vpcPrefix} VPC. topology() will throw.`,
    )
  } else if (addressesUsed / addressesTotal > WARN_THRESHOLD) {
    warnings.push(
      `VPC: domains occupy ${addressesUsed} of ${addressesTotal} addresses ` +
        `(${Math.round((addressesUsed / addressesTotal) * 100)}%). Free space is limited before more domains fit.`,
    )
  }
  const maxDomainBits = 32 - TIER_AND_AZ_BITS - vpcPrefix
  if (domainBits > maxDomainBits) {
    warnings.push(
      `domainBits ${domainBits} exceeds the ${maxDomainBits} that fit a /${vpcPrefix} VPC — topology() will throw.`,
    )
  }

  for (const domain of domains) {
    const domainConfig = domainConfigs[domain]
    const resolvedKinds = resolveKindsForDomain(domain, defaultKinds, domainConfig)

    const kindSlotsUsed = resolvedKinds.length
    const kindUtil = kindSlotsUsed / TOTAL_SLOTS
    if (kindUtil > WARN_THRESHOLD) {
      warnings.push(
        `Domain "${domain}": ${kindSlotsUsed} of ${TOTAL_SLOTS} kind slots used (${Math.round(kindUtil * 100)}%)`,
      )
    }

    const perKind: DomainCapacityReport['perKind'] = resolvedKinds.map((kindAlloc) => {
      const azs = resolveAzsForKind(kindAlloc, domainConfig, globalAzAllocations)
      const azSlotsUsed = azs.length
      const azUtil = azSlotsUsed / TOTAL_SLOTS
      if (azUtil > WARN_THRESHOLD) {
        warnings.push(
          `Domain "${domain}" kind "${kindAlloc.name}": ${azSlotsUsed} of ${TOTAL_SLOTS} AZ slots used (${Math.round(azUtil * 100)}%)`,
        )
      }
      return {
        name: kindAlloc.name,
        slot: kindAlloc.slot,
        azSlotsUsed,
        azSlotsTotal: TOTAL_SLOTS as 4,
      }
    })

    domainReports.push({
      domain,
      kindSlotsUsed,
      kindSlotsTotal: TOTAL_SLOTS as 4,
      perKind,
    })
  }

  return {
    domainSlotsUsed,
    domainSlotsTotal,
    addressesUsed,
    addressesTotal,
    domains: domainReports,
    warnings,
  }
}
