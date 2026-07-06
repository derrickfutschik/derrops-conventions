/**
 * Runnable example: generating VPC topologies with derrops-conventions.
 *
 * Run from the repo root with:
 *   npx tsx .claude/skills/creating-vpc-topologies/examples/build-topology.ts
 *
 * Nothing here touches AWS — the builder only computes NAMES and CIDR blocks.
 * You feed those into CDK L1 (`Cfn*`) constructs yourself (see the bottom of this file).
 * Every console.log prints a real plan fragment so you can eyeball the CIDR math.
 */
import { DerropsConventions } from 'derrops-conventions'

const orgC = new DerropsConventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
  .domain(['payments', 'identity'])

// ── Mode A — domain-first `topology()` ────────────────────────────────────────
// Tiers (kinds) are nested INSIDE every domain. Subnet count grows
// #domains × #kinds × #AZs. Best when each domain wants its own isolated subnets.
//
// `azs` and `kinds` are plain ordered arrays — ARRAY POSITION IS THE CIDR SLOT.
// Append only; never insert or reorder (that shifts every following slot's CIDR).
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],
  kinds: ['private', 'public', 'isolated'], // this is also the default if omitted
})

console.log('VPC:', plan.vpc) // { name, cidr }
console.log('payments CIDR:', plan.domains.payments!.cidr)
console.log('payments private subnets:', plan.domains.payments!.subnets.private)
console.log('payments route tables:', plan.domains.payments!.routeTables)

// Drop a tier per domain with includeKinds — identity has no public-facing LB.
// The kept kinds retain their CIDR slots, so no other subnet moves.
const plan2 = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],
  kinds: ['private', 'public', 'isolated'],
  domains: {
    identity: { includeKinds: ['private', 'isolated'] },
  },
})
console.log('identity kinds:', Object.keys(plan2.domains.identity!.subnets)) // no 'public'

// Audit CIDR headroom before deploying — warns past 75% utilisation.
const report = orgC.capacityReport({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
console.log('capacity warnings:', report.warnings)

// ── Mode B — tier-first `tieredTopology()` (AWS-recommended) ──────────────────
// A small FIXED set of tiers own the subnets; domains are ASSIGNED to tiers.
// Subnet count collapses to #tiers × #AZs regardless of domain count. NACL rule
// bodies and Client VPN authorization rules are generated for you.
const tieredConv = new DerropsConventions({ org: 'acme', env: 'prod', region: 'ap-southeast-2' })
  .domain(['payments', 'ledger', 'reporting'])

const tiered = tieredConv.tieredTopology({
    vpcCidr: '10.0.0.0/16',
    azs: ['1a', '1b', '1c'],
    tiers: [
      { name: 'public', role: 'public' }, //   IGW route — ALBs, NAT, bastion
      { name: 'app', role: 'private' }, //      NAT route — ECS, app servers, Lambda-in-VPC
      { name: 'data-1', role: 'isolated' }, //  no internet — databases
      { name: 'data-2', role: 'isolated' }, //  2nd data tier, isolated from data-1 by NACL
    ],
    assign: {
      payments: { public: 'public', app: 'app', data: 'data-1' },
      ledger: { public: 'public', app: 'app', data: 'data-2' },
      reporting: { app: 'app' }, // no public, no data
    },
    access: { 'ledger-admins': ['ledger'] }, // Client VPN: group → domains it may reach
  })

console.log('tier CIDRs:', Object.fromEntries(Object.entries(tiered.tiers).map(([k, t]) => [k, t.cidr])))

// Resolve where a deployment artifact goes — by (domain, role), no CIDR math.
// conv.subnetsFor type-checks the domain against .domain([...]) — a typo is a compile error.
console.log('payments app subnets:', tieredConv.subnetsFor(tiered, 'payments', 'app').map((s) => s.name))
console.log('data-1 NACL rules:', tiered.tiers['data-1']!.naclRules.length, 'rules')
console.log('Client VPN grants:', tiered.clientVpnAuthRules)
console.log('leak warnings:', tiered.warnings)

// ── Wiring a plan into CDK (sketch — no CDK dependency in this file) ──────────
// The convention name is used as the CloudFormation LOGICAL ID via
// overrideLogicalId() — that stable ID is what makes redeploys non-destructive.
//
//   const vpc = new ec2.CfnVPC(this, plan.vpc.name, { cidrBlock: plan.vpc.cidr })
//   vpc.overrideLogicalId(plan.vpc.name)
//   for (const [tierName, tier] of Object.entries(tiered.tiers)) {
//     for (const s of tier.subnets) {
//       const sn = new ec2.CfnSubnet(this, s.name, {
//         vpcId: vpc.ref, cidrBlock: s.cidr,
//         availabilityZone: `ap-southeast-2${s.az}`,
//         mapPublicIpOnLaunch: tier.role === 'public',
//       })
//       sn.overrideLogicalId(s.name)
//     }
//   }
