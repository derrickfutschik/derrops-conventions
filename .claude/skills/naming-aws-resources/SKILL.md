---
name: naming-aws-resources
description: Generate consistent AWS resource names, tags, DNS records, IAM policies, and VPC network topology using the derrops-conventions library. Use this whenever you need to name an AWS resource (S3 bucket, Lambda, DynamoDB table, SSM param, security group, Route53 record, etc.), pick which segments a name should contain, or wire naming into CDK/IAM. Do NOT hand-concatenate AWS names with template strings — use this instead.
---

# Naming AWS resources with derrops-conventions

This repo (`derrops-conventions`) encodes the [Derrops naming conventions](https://blog.derrops.com/blog/derrops-conventions) into a fluent TypeScript builder. The goal: **every AWS resource name is generated from an ordered set of segments, never hand-assembled**, so names stay consistent, parseable, and stable across a whole org.

The full reference is [`README.md`](../../../README.md) at the repo root — read it for the complete resource-type table, tagging pipeline, and CDK topology examples. This skill is the fast path for the common task: "name this thing correctly."

**Deeper references in this skill:**
- [`examples/name-resources.ts`](examples/name-resources.ts) — runnable script; every line prints a real generated name. Run it with `npx tsx .claude/skills/naming-aws-resources/examples/name-resources.ts` from the repo root to see actual output.
- [`references/iam-policies.md`](references/iam-policies.md) — the three ways to generate IAM policy documents (static / dynamic / grant-builder) and tenant-tag conditions.
- [`references/network-topology.md`](references/network-topology.md) — VPC/subnet/security-group naming and stable-CIDR topology generation for CDK.

> **Verify against the code, not just the README.** The README is slightly ahead of the current build in places (e.g. its "Suffix" column lists suffixes like `--gsi` that the code does not append, and `tags()` emits an extra `segment` tag). When exact output matters, run the example script or the library rather than trusting the table.

## The one rule

Never write `` `${org}--${domain}--${service}--${key}` ``. Build a `DerropsConventions` instance and call `.name({ type, ... })`. The library decides the delimiter, which segments to include, and any fixed suffix per resource type.

## The mental model: segments

Every name is an ordered subset of these segments. Stability decreases left → right (`org` changes ~never; `key` changes constantly):

```
{region} -- {env} -- {org} -- {domain} -- {service} -- {tenant} -- {key}
```

| Segment | What it is | Example |
|---|---|---|
| `region` | AWS region — **only** on globally-unique resources (S3) | `ap-southeast-2` |
| `env` | Deployment environment — only on global resources + DNS | `prod`, `dev` |
| `org` | Top-level org boundary | `acme` |
| `domain` | Bounded business capability | `payments` |
| `service` | Deployable service unit | `checkout-api` |
| `tenant` | **Opaque** runtime tenant ID (never a human name) | `t-a3f8b2` |
| `key` | The specific resource / config value / filename | `stripe-webhook-secret` |

Specialized segments used only by certain types: `entity` (OpenSearch indexes), `purpose` (security groups, volumes, target groups: `web`/`db`/`cache`…), `kind` (subnets/EC2: `private`/`public`/`isolated`), `az`, `num`, `consumer` (API keys), `target` (AppSync / VPC peering), `version` (ECR), `partition` (time-series S3).

Key insight — **why `tenant` sits far right, not left**: `org`/`domain`/`service` are known at *design time* (in your CDK/IAM). `tenant` is provisioned at *runtime*, per customer. Putting runtime segments right of design-time ones keeps prefix queries (`/acme/payments/checkout-api/*`) predictable.

## Basic usage

Import from `derrops-conventions` (the package name in `package.json` — the source of truth).

```typescript
import { DerropsConventions } from 'derrops-conventions'

const naming = new DerropsConventions({
  region: 'ap-southeast-2',
  env: 'prod',
  org: 'acme',
  domain: 'payments',
  service: 'checkout-api',
})

naming.name({ type: 's3Bucket', key: 'backups' })
// → 'ap-southeast-2--prod--acme--payments--checkout-api--backups'  (global: gets region+env)

naming.name({ type: 'lambdaFunction', key: 'webhook-handler' })
// → 'acme--payments--checkout-api--webhook-handler'  (account-scoped: no region/env)

naming.name({ type: 'ssmParam', key: 'stripe-webhook-secret' })
// → '/acme/payments/checkout-api/stripe-webhook-secret'  (native path hierarchy)

naming.name({ type: 'sqsFifoQueue', key: 'events' })
// → 'acme--payments--checkout-api--events.fifo'  (.fifo suffix added automatically)
```

Key builder methods:
- `.with(overrides)` → new instance with merged defaults (immutable; also sets a default `type`).
- `.name({ type, ...segments })` → the name string. Per-call segments override instance defaults.
- `.tags(overrides?)` / `.applyTags(fn)` → standard resource tags (see README "Tagging").
- Constraint helpers `.domain([...])`, `.service([...])`, `.kind([...])` etc. narrow the TypeScript literal union so an out-of-list value is a compile error.

## How to name something — decision procedure

1. **Find the `type` key.** Look it up in the README "Resource types reference" table (there are ~100). It fixes the delimiter, global-ness, and suffix. If it doesn't exist, use `DerropsConventions.registerResourceType(name, config)`.
2. **Supply the segments that type needs**, from instance defaults + call args. Most types want `org`/`domain`/`service`/`key`. Global types (S3) also need `region`+`env`. Specialized types need their own segment (`purpose`, `kind`+`az`, `entity`, …) — the README example column tells you which.
3. **Do NOT append suffixes yourself.** If a type config defines a fixed suffix (e.g. `sqsFifoQueue` → `.fifo`, `sqsDlq` → `--dlq`), the library appends it. Verify with the example script rather than assuming from the README's Suffix column, which is partly aspirational.
4. **Never guess a delimiter.** `--` between segments, `-` within a segment word, `/` for path-native services (SSM/IAM/S3 keys/ECR/Logs), `.` for DNS (Route53/CloudFront/ACM/Kafka), `_` for DB-internal names (RDS db name, Glue db).

## Delimiter cheat sheet

| Context | Delimiter |
|---|---|
| Between segments (flat names) | `--` |
| Between words inside a segment (`checkout-api`) | `-` |
| Path-native (SSM, IAM path, S3 key, CloudWatch Logs, ECR) | `/` |
| DNS-native (Route53, CloudFront alias, ACM, Kafka topic) | `.` |
| DB-internal (RDS db name, Glue db) | `_` |

## Common areas (see README for full detail)

- **Tags are the security boundary, names are organizational.** A tenant ID in a name does *not* prevent cross-tenant access — enforce with `aws:ResourceTag/tenant` IAM conditions. See README "Multi-tenancy".
- **IAM policy generation** — `.staticPolicy()` / `.dynamicPolicy()` build IAM docs with correct ARNs + curated `read`/`readWrite`/`manage` action tiers directly from the convention. See README "IAM policy generation".
- **VPC network topology** — `.topology(...)`, `.orgNetworkLayer()`, `.domainNetworkLayer()`, `.serviceNetworkLayer()` generate stable subnet/route-table/NACL names + CIDRs for CDK. Subnets are domain-scoped (no `service`); security groups are service-scoped. See README "Network topology".
- **DNS patterns** — service-first / tenant-first / wildcard / apex, each with Route53 + CloudFront + ACM variants; use `.apexMapping()` to derive the zone per env. See README "DNS subdomain patterns".
- **CloudWatch** — `cloudwatchMetricNamespace` is org/domain only; distinguishers go in `.dimensions()`. See README "CloudWatch Dimensions".

## Guardrails

- **Tenant IDs must be opaque** (`t-a3f8b2`), never human-readable names — human names in global namespaces (S3, CloudFront) are squattable and unstable across rebrands.
- When unsure which segments a specific type includes, check its row in the README reference table (the italic note in the Example column, e.g. `_(purpose)_`, `_(kind + az)_`, `_(env only)_`) rather than assuming.
- If asked to name a resource type not in the table, propose `registerResourceType(...)` with an explicit `segmentDelimiter`/`wordDelimiter` rather than free-forming the string.
