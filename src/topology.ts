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
  /** Convention name — e.g. `'acme--payments--private--1a'` */
  name: string
  /** CIDR block — e.g. `'10.0.0.0/24'` */
  cidr: string
  /** Availability zone suffix — e.g. `'1a'` */
  az: string
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

function intToIp(n: number): string {
  return [
    Math.floor(n / 16777216) % 256,
    Math.floor(n / 65536) % 256,
    Math.floor(n / 256) % 256,
    n % 256,
  ].join('.')
}

function parseCidr(cidr: string): { base: number; prefix: number } {
  const [ip, prefix] = cidr.split('/')
  return { base: ipToInt(ip!), prefix: Number(prefix) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_SLOT = 3

function findDuplicates(nums: number[]): number[] {
  const seen = new Set<number>()
  const dupes = new Set<number>()
  for (const n of nums) {
    if (seen.has(n)) dupes.add(n)
    seen.add(n)
  }
  return [...dupes]
}

function validateAzAllocations(context: string, azs: AzAllocation[]): void {
  const dupes = findDuplicates(azs.map((a) => a.slot))
  if (dupes.length) {
    throw new Error(`${context}: duplicate AZ slots: ${dupes.join(', ')}`)
  }
  for (const { slot } of azs) {
    if (slot < 0 || slot > MAX_SLOT) {
      throw new Error(`${context}: AZ slot ${slot} is out of range 0–${MAX_SLOT}`)
    }
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

/** Convert the flat global arrays into the internal slot-based form. */
function normalizeTopologyOptions(options: TopologyOptions): {
  vpcCidr: string
  globalAzAllocations: AzAllocation[]
  defaultKinds: KindAllocation[]
  domainConfigs: Record<string, DomainAllocationConfig>
} {
  const { vpcCidr, azs, kinds = ['private', 'public', 'isolated'], domains = {} } = options
  return {
    vpcCidr,
    globalAzAllocations: azs.map((az, i) => ({ slot: i, az })),
    defaultKinds: kinds.map((name, i) => ({ slot: i, name })),
    domainConfigs: domains,
  }
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
 * CIDR allocation scheme (generalises to any VPC prefix):
 * ```
 * VPC:    /16  →  65,536 addresses
 * Domain: /20  →   4,096 per domain  (domainIndex × 4096 from VPC base)
 * Tier:   /22  →   1,024 per tier    (kindAllocation.slot × 1024 within domain)
 * AZ:     /24  →     256 per AZ      (azAllocation.slot × 256 within tier)
 * ```
 *
 * Domain ordering in `.domain([...])` is the CIDR allocation contract — domain 0
 * receives the first /20 block, domain 1 the second, etc. Changing the order changes CIDRs.
 *
 * Kind and AZ positions are determined by their explicit `slot` numbers, not array positions.
 * This means new kinds or AZs can be appended with higher slot numbers without disturbing
 * existing CIDR allocations.
 *
 * @throws if the convention has no constrained domain values
 * @throws if slot numbers are out of range (0–3) or duplicated within a domain/kind
 */
export function buildNetworkTopology(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convention: DerropsConventions<any, any, any, any, any>,
  options: TopologyOptions,
): OrgNetworkTopology {
  const { vpcCidr, globalAzAllocations, defaultKinds, domainConfigs } =
    normalizeTopologyOptions(options)

  const domains = convention.constraints().domain as string[] | undefined

  if (!domains?.length) {
    throw new Error(
      "topology() requires domain to be constrained — call .domain(['payments', 'identity', ...]) first",
    )
  }

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

  const { base: vpcBase, prefix: vpcPrefix } = parseCidr(vpcCidr)
  const domainPrefix = vpcPrefix + 4
  const tierPrefix = domainPrefix + 2
  const azPrefix = tierPrefix + 2
  const domainSize = 2 ** (32 - domainPrefix)
  const tierSize = 2 ** (32 - tierPrefix)
  const azSize = 2 ** (32 - azPrefix)

  const orgLayer = convention.orgNetworkLayer()

  const n = (domain: string, opts: object): string =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    convention.name({ ...opts, domain } as NameOptions<any, any>)

  const resultDomains: Record<string, DomainNetworkTopology> = {}

  domains.forEach((domain, di) => {
    const domainBase = vpcBase + di * domainSize
    const domainConfig = domainConfigs[domain]
    const resolvedKinds = resolveKindsForDomain(domain, defaultKinds, domainConfig)

    const routeTables: Record<string, string> = {}
    const subnets: Record<string, SubnetEntry[]> = {}

    resolvedKinds.forEach((kindAlloc) => {
      const tierBase = domainBase + kindAlloc.slot * tierSize
      const resolvedAzs = resolveAzsForKind(kindAlloc, domainConfig, globalAzAllocations)

      routeTables[kindAlloc.name] = n(domain, { type: 'routeTable', kind: kindAlloc.name })
      subnets[kindAlloc.name] = resolvedAzs.map((azAlloc) => ({
        name: n(domain, { type: 'subnet', kind: kindAlloc.name, az: azAlloc.az }),
        cidr: `${intToIp(tierBase + azAlloc.slot * azSize)}/${azPrefix}`,
        az: azAlloc.az,
      }))
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
  const { globalAzAllocations, defaultKinds, domainConfigs } = normalizeTopologyOptions(options)
  const domains = (convention.constraints().domain as string[] | undefined) ?? []

  const TOTAL_SLOTS = MAX_SLOT + 1
  const WARN_THRESHOLD = 0.75

  const warnings: string[] = []
  const domainReports: DomainCapacityReport[] = []

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

  return { domains: domainReports, warnings }
}
