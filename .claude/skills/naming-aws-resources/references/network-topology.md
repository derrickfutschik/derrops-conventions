# VPC network topology

The convention maps directly onto AWS's three-layer network hierarchy. The rule that drives everything: **segment depth encodes provisioning lifecycle**. A resource type's `segments` list stops at the layer it lives in, so its name literally tells you how often it changes.

```
Layer     Segments              Lifecycle                     Resources
────────  ────────────────────  ────────────────────────────  ───────────────────────────────────
Org       org                   Once per account              VPC, Transit Gateway
Domain    org+domain            When a domain expands          Subnets, NACL, Route Tables, TGW Attachment
Service   org+domain+service    Per service release            Security Groups, ALBs, Target Groups
```

This is why `subnet` and `networkAcl` do **not** include `service` — they are domain-scoped boundaries, not service-scoped. Security groups descend to `service`+`purpose` because they change with every deploy.

## Generating names per layer

```typescript
const orgC = new DerropsConventions({ org: 'acme' })

orgC.orgNetworkLayer()
// → { vpc: 'acme', transitGateway: 'acme--tgw' }

orgC.with({ domain: 'payments' }).domainNetworkLayer(['1a', '1b', '1c'])
// → { subnets: { private: [...], public: [...], isolated: [...] },
//     nacl: 'acme--payments', routeTables: {...}, tgwAttachment: 'acme--payments' }

orgC.with({ domain: 'payments', service: 'checkout-api' })
    .serviceNetworkLayer(['web', 'db', 'internal'])
// → { securityGroups: { web: 'acme--payments--checkout-api--web', ... } }
```

## Full plan for CDK — `.topology()`

`.topology(options)` returns names **and** stable CIDR blocks for every subnet, route table, NACL, and TGW attachment across all domains. Feed each into CDK L1 constructs and set the convention name as the CloudFormation logical ID via `overrideLogicalId()` — that stable ID is what makes the infrastructure non-destructive to redeploy.

```typescript
const plan = orgC.domain(['payments', 'identity']).topology({
  vpcCidr: '10.0.0.0/16',
  azAllocations: [{ slot: 0, az: '1a' }, { slot: 1, az: '1b' }, { slot: 2, az: '1c' }],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 1, name: 'public' },
    { slot: 2, name: 'isolated' },
  ],
})
// plan.vpc.{name,cidr}, plan.domains[d].{subnets,nacl,routeTables,tgwAttachment}
```

See the repo `README.md` "CDK — provisioning the VPC" for the full construct loop.

## Subnet kinds

| Kind | Routing | Typical residents |
|---|---|---|
| `private` | Outbound via NAT, no direct inbound | App servers, ECS tasks, Lambda-in-VPC |
| `public` | Internet Gateway, in + out | Load balancers, NAT GWs, bastion |
| `isolated` | No internet route at all | RDS/Aurora, OpenSearch, ElastiCache |

Flow is one-way: `internet ↔ public → private → isolated`. Not every domain needs all three — a data-only domain drops `public` via `includeKinds: ['private', 'isolated']`.

## Growing without downtime

`slot` numbers determine CIDR offsets, so **appending** a slot (a 4th AZ, a new kind tier) never shifts an existing subnet's CIDR. CloudFormation sees existing resources unchanged and provisions only the new ones. Capacity limit is 4 slots per axis (0–3) → up to 16 subnets per domain. Check headroom before deploying:

```typescript
const report = orgC.capacityReport({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'], /* ... */ })
if (report.warnings.length) console.warn(report.warnings.join('\n'))
```

## Cross-boundary patterns

```typescript
naming.name({ type: 'vpcPeering', target: 'globex' })   // → 'acme--globex--peer'
naming.name({ type: 'vpcEndpoint', service: 's3' })      // → 'acme--payments--s3--endpoint'
```

Use VPC peering for two-org point-to-point links; use Transit Gateway for 3+ orgs (peering grows O(n²), TGW attachments O(n)). Security-group `purpose` names the access role — `web`, `internal`, `db`, `cache`, `search`, `relay`, `bastion`, `worker`. The security group *is* the named access object: `acme--payments--checkout-api--db` = "database-tier access control for checkout-api in payments."
