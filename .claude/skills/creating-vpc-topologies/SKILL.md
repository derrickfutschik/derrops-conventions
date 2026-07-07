---
name: creating-vpc-topologies
description: Generate a full VPC network topology — VPC, subnets, route tables, NACLs, Transit Gateway attachments, security groups — with stable names AND CIDR blocks using the derrops-conventions library, ready to wire into CDK L1 constructs. Use this whenever you need to lay out a VPC, allocate subnet CIDRs across AZs, decide subnet tiers (public/private/isolated), assign workloads to network tiers, generate NACL or Client VPN rules, or grow a VPC (add an AZ, add a tier) without shifting existing CIDRs. Do NOT hand-compute CIDR blocks or hand-name subnets — use topology() or tieredTopology().
---

# Creating VPC topologies with derrops-conventions

This repo encodes the [Derrops conventions](https://blog.derrops.com/blog/derrops-conventions) into a fluent TypeScript builder. For networking it does one job: **turn a VPC CIDR + a list of AZs + a tier layout into every subnet/route-table/NACL name and its CIDR block**, deterministically and append-stably, so you can feed the result straight into CDK L1 (`Cfn*`) constructs.

The builder computes **names and CIDRs only** — it never calls AWS. You create the CDK constructs; each convention name becomes the CloudFormation **logical ID** (`overrideLogicalId()`), which is what makes redeploys non-destructive. Each subnet is a convention **`Resource`** (`entry.resource`): use `resource.name` for the name/logical id and `resource.applyTags((k,v)=>…)` to tag it. Because subnets are Resources, the convention must carry an `.arnContext({ accountId })` before calling `topology()`/`tieredTopology()`.

**Deeper material in this skill:**
- [`examples/build-topology.ts`](examples/build-topology.ts) — runnable; prints real plans for both modes. Run it from the repo root: `npx tsx .claude/skills/creating-vpc-topologies/examples/build-topology.ts`.
- [`references/tiered-topology.md`](references/tiered-topology.md) — the tier-first model in depth: roles, `conv.subnetsFor`, generated NACL + Client VPN rules, full CDK loop.
- Repo [`README.md`](../../../README.md) "Network topology" and "Tier-based segmentation" sections — the canonical write-up.

> **Verify against the code, not memory.** When exact output matters, run the example script. Naming resources (not topology) is the sibling skill [`naming-aws-resources`](../naming-aws-resources/SKILL.md).

## The one rule

Never hand-write `` `10.0.${d*16}.0/20` `` or `` `${org}--${domain}--private--${az}` ``. Call `.topology(...)` or `.tieredTopology(...)` and read names + CIDRs off the returned plan. The library owns the CIDR arithmetic and the naming.

## Pick the mode first

Two independent generators. Choose by how subnets should be owned:

| | `topology()` — domain-first | `tieredTopology()` — tier-first |
|---|---|---|
| Who owns subnets | **each domain** nests its own public/private/isolated tiers | a **fixed set of tiers** owns subnets; domains are assigned to them |
| Subnet count | `#domains × #kinds × #AZs` (grows with domains) | `#tiers × #AZs` (flat) |
| Subnet name | `acme--payments--private--1a` | `acme--app--1a` |
| Isolation between domains | separate subnets + per-domain NACL | shared subnets; **security groups** + tier NACLs |
| Generates for you | names + CIDRs, per-domain NACL/route tables | + NACL rule bodies + Client VPN auth rules + leak warnings |
| Reach for it when | each domain needs its own CIDR block / blast-radius | many domains, AWS-recommended flat layout, least sprawl |

`tieredTopology()` is the [AWS-recommended](https://maturitymodel.security.aws.dev/en/2.-foundational/vpcs/) default for a multi-domain org. Both modes coexist — they're independent.

## The CIDR model (domain-first)

For the defaults — a `/16` VPC, `domainBits: 4`:

```
VPC:    /16  → 65,536 addrs
Domain: /20  →  4,096 per domain  (packed from VPC base, in .domain([...]) order)
Tier:   /22  →  1,024 per kind    (kind slot × 1024 within the domain)
AZ:     /24  →    256 per AZ      (AZ slot × 256 within the kind)
```

Two knobs of freedom: `domainBits` (trades domain count vs per-domain size) and per-domain `cidrPrefix` (size one domain independently — declare larger domains first for tight packing).

## Append-only stability — the load-bearing invariant

`azs` and `kinds` are **plain ordered arrays; array position IS the CIDR slot.** The `.domain([...])` order is the domain CIDR order.

- **Appending** an AZ, a kind, or a domain is safe — existing CIDRs and names are untouched, CloudFormation only provisions the new resources.
- **Inserting or reordering** shifts every following slot's CIDR → subnet replacement → downtime.

So the rule is: **only ever append.** To grow a full tier in place, add an **expansion subnet** (a second subnet in the same tier+AZ at a free slot, auto-suffixed `--2`). Capacity ceiling is 4 slots per axis (0–3) → ≤ 16 subnets per domain / ≤ 4 AZs.

## Subnet tiers (kinds / roles)

| kind / role | Routing | Residents |
|---|---|---|
| `public` | Internet Gateway | ALBs, NAT gateways, bastion |
| `private` | NAT (egress only) | app servers, ECS, Lambda-in-VPC |
| `isolated` | no internet route | RDS/Aurora, OpenSearch, ElastiCache |

Flow is one-way: `internet ↔ public → private → isolated`. Not every domain needs all three — drop one with `includeKinds: ['private','isolated']`. These three exhaust the internet-reachability axis; a genuinely new tier (e.g. `transit` routed to on-prem via TGW, or an `inspection` tier) is a new *routing role*, not another point on this axis, and needs generator changes — not just a new name.

## Procedure

1. **Choose the mode** (table above). Multi-domain org with a flat layout → `tieredTopology()`. Each domain needs its own CIDR block → `topology()`.
2. **Constrain domains**: `.domain(['payments', 'identity', ...])` — this order is the CIDR contract, so fix it early and only append later.
3. **Call the generator** with `vpcCidr` + `azs` (+ `kinds`/`tiers`/`assign`). Omit `kinds` to get the default `['private','public','isolated']`.
4. **Audit** with `.capacityReport(...)` (domain-first) or check `plan.warnings` (tier-first) before deploying.
5. **Wire into CDK**: iterate the plan, create one `Cfn*` per resource, and for each subnet call `overrideLogicalId(entry.resource.name)` and `entry.resource.applyTags((k,v)=>Tags.of(sn).add(k,v))`. For tier-first, also emit `plan.tiers[t].naclRules` as `CfnNetworkAclEntry` and `plan.clientVpnAuthRules` as `CfnClientVpnAuthorizationRule`.
6. **Resolve placement** (tier-first): `conv.subnetsFor(plan, domain, role)` gives an artifact's subnets — no CIDR math, and `domain` is type-checked against `.domain([...])`. ALB → `public`, ECS/Lambda → `app`, RDS → `data`.

## Minimal calls

```typescript
// Domain-first. `.arnContext({ accountId })` is required because subnets are Resources.
const plan = orgC
  .domain(['payments', 'identity'])
  .arnContext({ accountId: '123456789012' })
  .topology({
    vpcCidr: '10.0.0.0/16',
    azs: ['1a', '1b', '1c'],           // append only
    kinds: ['private', 'public', 'isolated'],   // the default
  })
// → plan.vpc.{name,cidr}; plan.domains[d].{cidr, subnets, routeTables, nacl, tgwAttachment}
// each subnet in plan.domains[d].subnets[kind] is { resource, cidr, az, num }


// Tier-first (see references/tiered-topology.md for the full option set)
const tiered = orgC.domain(['payments', 'ledger']).tieredTopology({
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],
  tiers: [
    { name: 'public', role: 'public' },
    { name: 'app',    role: 'private' },
    { name: 'data-1', role: 'isolated' },
  ],
  assign: { payments: { public: 'public', app: 'app', data: 'data-1' }, ledger: { app: 'app' } },
})
// → tiered.tiers[t].{cidr, subnets, routeTable, nacl, naclRules}; tiered.clientVpnAuthRules; tiered.warnings
```

## Guardrails

- **Only append** `azs` / `kinds` / domains — never insert or reorder. Reordering silently re-CIDRs every later resource. If you must resize a domain, declare larger domains first and append new ones at the end.
- **The name is the CloudFormation logical ID.** Always `overrideLogicalId(name)`; a changed name = destroy + recreate.
- **CIDRs must fit.** Both generators throw if tiers/domains overflow the VPC. Run `.capacityReport(...)` first; it warns past 75% address utilisation instead of throwing.
- **Tier-first isolation is security groups, not subnets.** Co-tenant domains share subnets. Enforce isolation with per-service security-group `purpose` names and the generated data-tier NACL denies. Treat every `plan.warnings` entry as a real cross-domain VPN exposure.
- **`az` is a suffix, not a full AZ.** `azs: ['1a']` → you build the real AZ as `` `${region}${az}` `` (`ap-southeast-2` + `1a`) at CDK time.
