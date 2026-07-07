# Tier-first topology (`tieredTopology()`)

The AWS-[recommended model](https://maturitymodel.security.aws.dev/en/2.-foundational/vpcs/): a small **fixed** set of tiers (public / app / data-N) own the subnets, and workloads are **assigned** to tiers. Subnet count is `#tiers × #AZs`, independent of how many domains you run — the opposite of `topology()`, where subnets grow `#domains × #kinds × #AZs`.

Use this when many domains share the same subnet layout and isolation is enforced by security groups + NACLs (not by giving every domain its own subnets). Use domain-first `topology()` when each domain genuinely needs its own CIDR block.

## Tier roles — the routing axis

`role` drives the tier's route table. There are exactly three internet-reachability roles:

| role | Default route | Residents |
|---|---|---|
| `public` | Internet Gateway | ALBs, NAT gateways, bastion |
| `private` | NAT gateway (egress only) | ECS, app servers, Lambda-in-VPC |
| `isolated` | none | RDS/Aurora, OpenSearch, ElastiCache |

Multiple `isolated` tiers (`data-1`, `data-2`) give per-dataset isolation — the NACL generator emits an explicit cross-data **deny** between them.

## Options

```typescript
// Subnets are convention Resources, so the convention needs an ARN context (accountId).
conv
  .domain(['payments', 'ledger', 'reporting'])
  .arnContext({ accountId: '123456789012' })
  .tieredTopology({
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],           // array position is the CIDR slot; ≤ 4 AZs
  tiers: [                            // declared order is the CIDR packing order
    { name: 'public', role: 'public' },
    { name: 'app',    role: 'private' },
    { name: 'data-1', role: 'isolated' },
    { name: 'data-2', role: 'isolated', cidrPrefix: 24 }, // optional per-tier size override
  ],
  assign: {                           // at most one tier per role per domain
    payments: { public: 'public', app: 'app', data: 'data-1' },
    ledger:   { public: 'public', app: 'app', data: 'data-2' },
    reporting:{ app: 'app' },         // omit slots the domain doesn't use
  },
  access:    { 'ledger-admins': ['ledger'] }, // Client VPN: group → domains it may reach
  dataPorts: [5432, 3306, 6379],      // TCP ports app→data (NACL). This is the default.
})
```

The three assignment slots are fixed — `public` (role `public`), `app` (role `private`), `data` (role `isolated`). A slot must reference a tier of the matching role or `tieredTopology()` throws.

## What comes back

```
plan.vpc                    { name, cidr }
plan.transitGateway         string
plan.tiers[name]            { role, cidr, subnets[], routeTable, nacl, naclRules[] }
plan.domains[domain]        { tiers, subnets:{public?,app?,data?}, tierCidrs[] }
plan.clientVpnAuthRules     [{ group, targetCidr, description }]
plan.warnings              string[]   — shared-tier VPN leak notices

Each SubnetEntry = { resource, cidr, az, num }  — `resource` is the convention `subnet` Resource
(`resource.name` = the subnet name, `resource.applyTags(fn)` tags it, `resource.logicalId` for CDK).
```

Subnets are named by **tier**, not domain: `acme--app--1a` (a single `subnet` resource type serves
both models — the tier occupies the `domain` segment slot, so the name still round-trips through
`parse()`). Two domains assigned the same `app` tier resolve to the **same** subnets — that is the
sprawl reduction. Their isolation comes from per-service security groups.

## Resolving where an artifact deploys — `conv.subnetsFor`

`subnetsFor` is a **method on the convention** (not a standalone import). Because `conv` carries the
`.domain([...])` constraint, the `domain` argument is type-checked against the declared domains —
a typo or an unassigned domain is a compile error, not just a runtime throw.

```typescript
const conv = new DerropsConventions({ org: 'acme' })
  .domain(['payments', 'ledger', 'reporting'])
  .arnContext({ accountId: '123456789012' })
const plan = conv.tieredTopology({ /* ... */ })

conv.subnetsFor(plan, 'payments', 'app')    // → SubnetEntry[] for payments' app tier (one per AZ)
conv.subnetsFor(plan, 'payments', 'data')   // → SubnetEntry[] for its data tier (data-1)
conv.subnetsFor(plan, 'reporting', 'data')  // throws — reporting has no data tier assigned
conv.subnetsFor(plan, 'payments')           // → every assigned tier's subnets, flattened
conv.subnetsFor(plan, 'nope', 'app')        // ✗ compile error — not a declared domain
```

Map artifact → role: ALB → `public`, ECS/ASG/Lambda-in-VPC → `app`, RDS/Aurora subnet group → `data`.

## Generated isolation

- **`plan.tiers[t].naclRules`** — ready-to-apply `CfnNetworkAclEntry` bodies. Each **data tier explicitly denies ingress from every other data tier's CIDR** (lower rule numbers, evaluated first) and allows only the app tier on `dataPorts`. Public↔app and NAT egress allows are generated too. NACLs are stateless, so allows appear in both directions with an ephemeral return-traffic range.
- **`plan.clientVpnAuthRules`** — `{ group, targetCidr }` grants resolved from `access` (a group's domains → their tier CIDRs). AWS Client VPN is default-deny, so these are grants only.
- **`plan.warnings`** — because tiers are shared, granting a group access to a domain whose tier is shared surfaces a leak notice. Domain-expressed VPN access is exact only for a domain's dedicated (data) tier; treat a warning as "this grant also exposes the co-tenants named here."

## CDK wiring sketch

```typescript
const vpc = new ec2.CfnVPC(this, plan.vpc.name, { cidrBlock: plan.vpc.cidr })
vpc.overrideLogicalId(plan.vpc.name)

for (const [tierName, tier] of Object.entries(plan.tiers)) {
  const rt = new ec2.CfnRouteTable(this, tier.routeTable, { vpcId: vpc.ref })
  rt.overrideLogicalId(tier.routeTable)
  const nacl = new ec2.CfnNetworkAcl(this, tier.nacl, { vpcId: vpc.ref })
  nacl.overrideLogicalId(tier.nacl)
  for (const rule of tier.naclRules) {
    new ec2.CfnNetworkAclEntry(this, `${tier.nacl}--${rule.direction}--${rule.ruleNumber}`, {
      networkAclId: nacl.ref, ruleNumber: rule.ruleNumber, egress: rule.direction === 'egress',
      protocol: rule.protocol === 'tcp' ? 6 : rule.protocol === 'udp' ? 17 : -1,
      ruleAction: rule.action, cidrBlock: rule.cidr,
      portRange: rule.fromPort ? { from: rule.fromPort, to: rule.toPort } : undefined,
    })
  }
  // Each subnet is a convention Resource: `.resource.name` is the logical id, `.resource.applyTags` tags it.
  for (const { resource, cidr, az } of tier.subnets) {
    const sn = new ec2.CfnSubnet(this, resource.name, {
      vpcId: vpc.ref, cidrBlock: cidr,
      availabilityZone: `ap-southeast-2${az}`,
      mapPublicIpOnLaunch: tier.role === 'public',
    })
    sn.overrideLogicalId(resource.name)
    resource.applyTags((k, v) => Tags.of(sn).add(k, v))
    // ...associate sn with rt and nacl
  }
}

for (const r of plan.clientVpnAuthRules) {
  new ec2.CfnClientVpnAuthorizationRule(this, `cvpn--${r.group}--${r.targetCidr}`, {
    clientVpnEndpointId: endpoint.ref, targetNetworkCidr: r.targetCidr, accessGroupId: r.group,
  })
}
```
