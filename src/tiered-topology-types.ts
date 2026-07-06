import type { SubnetEntry } from './topology.js'

/**
 * Routing role of a workload tier — drives the tier's route table:
 * - `public`   → default route via Internet Gateway (ALB, NAT, bastion)
 * - `private`  → default route via NAT gateway (app servers, ECS, Lambda-in-VPC)
 * - `isolated` → no internet route at all (RDS/Aurora, OpenSearch, ElastiCache)
 */
export type TierRole = 'public' | 'private' | 'isolated'

/** Declares one workload tier: a named subnet group with a routing role and optional size. */
export interface TierSpec {
  /** Tier name — e.g. `'public'`, `'app'`, `'data-1'`, `'data-2'`. Appears in subnet names. */
  name: string
  /** Routing role. Multiple `isolated` tiers give per-dataset isolation. */
  role: TierRole
  /**
   * Prefix length of this tier's CIDR block (e.g. `24` for a `/24`). Overrides the default sizing
   * (`vpcPrefix + 6`). Subnets within the tier are `cidrPrefix + 2` (one `/24` per AZ from a `/22`).
   */
  cidrPrefix?: number
}

/** A domain's tier assignment — at most one tier per role. */
export interface TierAssignment {
  /** Public-tier name (role must be `public`). Holds the domain's internet-facing resources. */
  public?: string
  /** App-tier name (role must be `private`). Holds the domain's compute. */
  app?: string
  /** Data-tier name (role must be `isolated`). Holds the domain's databases. */
  data?: string
}

/** Options for `tieredTopology()`. */
export interface TieredTopologyOptions {
  vpcCidr: string
  /** AZ suffixes, e.g. `['1a','1b','1c']` — array position is the CIDR slot (≤4). */
  azs: string[]
  /** The workload tiers that own subnets. Declared order is the CIDR packing order. */
  tiers: TierSpec[]
  /** Maps each domain to at most one tier per role. Keys should be constrained domains. */
  assign: Record<string, TierAssignment>
  /**
   * Client VPN access, expressed as the domains each group may reach. Resolved to the domains'
   * tier CIDRs (default-deny; grants only). A shared-tier grant produces a `warnings[]` entry.
   */
  access?: Record<string, string[]>
  /** TCP ports the app tier may open to data tiers (NACL). Default `[5432, 3306, 6379]`. */
  dataPorts?: number[]
}

/** A generated NACL entry (NACLs are stateless — allow/deny per direction). */
export interface NaclRule {
  /** Rule number — evaluated ascending, first match wins. Denies use lower numbers than allows. */
  ruleNumber: number
  direction: 'ingress' | 'egress'
  /** Destination (egress) / source (ingress) CIDR. */
  cidr: string
  action: 'allow' | 'deny'
  /** IP protocol — `'tcp'`, `'udp'`, or `'-1'` (all). */
  protocol: string
  fromPort?: number
  toPort?: number
  description: string
}

/** All resources for one tier. */
export interface TierTopology {
  role: TierRole
  /** Tier CIDR block — e.g. `'10.0.0.0/22'`. */
  cidr: string
  /** One subnet per AZ (plus `num`-indexed expansion subnets). */
  subnets: SubnetEntry[]
  routeTable: string
  nacl: string
  /** Generated allow/deny rule bodies enforcing inter-tier isolation. */
  naclRules: NaclRule[]
}

/** Where a domain's artifacts deploy: its assigned tiers and the resolved subnets per role. */
export interface DomainTierPlacement {
  /** Assigned tier name per role. */
  tiers: TierAssignment
  /** Resolved subnets per role — the subnets a deployment artifact of that role goes into. */
  subnets: { public?: SubnetEntry[]; app?: SubnetEntry[]; data?: SubnetEntry[] }
  /** Deduplicated CIDRs of the domain's assigned tiers. */
  tierCidrs: string[]
}

/** A single Client VPN authorization rule (grant). */
export interface ClientVpnAuthRule {
  /** Group SID / SAML group name (or `'*'` for all users when authorizeAllGroups). */
  group: string
  /** Destination network the group is granted access to. */
  targetCidr: string
  description: string
}

/** The complete tier-based topology — tiers own the subnets; domains are assigned to tiers. */
export interface TieredTopology {
  vpc: { name: string; cidr: string }
  transitGateway: string
  /** Per-tier resources keyed by tier name. */
  tiers: Record<string, TierTopology>
  /** Per-domain placement keyed by domain name. */
  domains: Record<string, DomainTierPlacement>
  /** Client VPN authorization rules resolved from `access` (group → domains → tier CIDRs). */
  clientVpnAuthRules: ClientVpnAuthRule[]
  /** Shared-tier leak warnings from `access` resolution. */
  warnings: string[]
}
