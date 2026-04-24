import type { DerropsConventions, NameOptions } from './DerropsConventions.js'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  /** Network ACL name — e.g. `'acme--payments--nacl'` */
  nacl: string
  /** Transit Gateway attachment name — e.g. `'acme--payments--tgw-attach'` */
  tgwAttachment: string
  /** Route table name per tier — e.g. `{ private: 'acme--payments--private', ... }` */
  routeTables: Record<string, string>
  /** Subnets per tier, each with name, CIDR, and AZ — e.g. `{ private: [{...}, ...] }` */
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
  return (a! * 16777216) + (b! * 65536) + (c! * 256) + d!
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

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Generate the full network topology — names and CIDR blocks — for the org and all
 * constrained domains.
 *
 * CIDR allocation scheme (generalises to any VPC prefix):
 * ```
 * VPC:    /16  →  65,536 addresses
 * Domain: /20  →   4,096 per domain  (domainIndex × 4096 from VPC base)
 * Tier:   /22  →   1,024 per tier    (tierIndex × 1024 within domain)
 * AZ:     /24  →     256 per AZ      (azIndex × 256 within tier)
 * ```
 *
 * Domain ordering in `.domain([...])` is the CIDR allocation contract — domain 0
 * receives the first /20 block, domain 1 the second, etc. Changing the order changes CIDRs.
 *
 * @throws if the convention has no constrained domain values
 */
export function buildNetworkTopology(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convention: DerropsConventions<any, any>,
  options: { vpcCidr: string; azs: string[]; kinds?: string[] },
): OrgNetworkTopology {
  const { vpcCidr, azs, kinds = ['private', 'public', 'isolated'] } = options
  const domains = convention.constraints().domain as string[] | undefined

  if (!domains?.length) {
    throw new Error(
      "topology() requires domain to be constrained — call .domain(['payments', 'identity', ...]) first",
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

  // Helper that merges a domain override into each name() call, overriding whatever
  // domain is set as a default on the convention instance.
  const n = (domain: string, opts: object): string =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    convention.name({ ...opts, domain } as NameOptions<any, any>)

  const resultDomains: Record<string, DomainNetworkTopology> = {}

  domains.forEach((domain, di) => {
    const domainBase = vpcBase + di * domainSize
    const routeTables: Record<string, string> = {}
    const subnets: Record<string, SubnetEntry[]> = {}

    kinds.forEach((kind, ki) => {
      const tierBase = domainBase + ki * tierSize
      routeTables[kind] = n(domain, { type: 'routeTable', kind })
      subnets[kind] = azs.map((az, ai) => ({
        name: n(domain, { type: 'subnet', kind, az }),
        cidr: `${intToIp(tierBase + ai * azSize)}/${azPrefix}`,
        az,
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
