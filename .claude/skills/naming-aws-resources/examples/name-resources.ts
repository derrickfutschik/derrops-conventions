/**
 * Runnable example: naming AWS resources with derrops-conventions.
 *
 * Run from the repo root with:
 *   npx tsx .claude/skills/naming-aws-resources/examples/name-resources.ts
 *
 * (or point the import below at your build output / installed package).
 * Every `console.log` prints the generated name so you can eyeball the segments,
 * delimiters, and auto-appended suffixes the library applies per resource type.
 */
import { DerropsConventions } from 'derrops-conventions'

// One base instance carries the design-time segments. Everything else is derived
// from it with .with() so nothing is mutated.
const naming = new DerropsConventions({
  region: 'ap-southeast-2',
  env: 'prod',
  org: 'acme',
  domain: 'payments',
  service: 'checkout-api',
})

// ── Flat names ──────────────────────────────────────────────────────────────
// Global resource → region + env are included.
console.log(naming.name({ type: 's3Bucket', key: 'backups' }))
// ap-southeast-2--prod--acme--payments--checkout-api--backups

// Account-scoped → region + env omitted (the account is the namespace boundary).
console.log(naming.name({ type: 'lambdaFunction', key: 'webhook-handler' }))
// acme--payments--checkout-api--webhook-handler

// ── Native hierarchies (delimiter chosen by type, not by you) ────────────────
console.log(naming.name({ type: 'ssmParam', key: 'stripe-webhook-secret' }))
// /acme/payments/checkout-api/stripe-webhook-secret

console.log(naming.name({ type: 'ecr' }))
// acme/payments/checkout-api

// ── Auto-appended suffixes (never concatenate these yourself) ────────────────
// The library appends whatever fixed suffix the *type config* defines. Verify by
// running this file — do NOT assume from the README table (its Suffix column lists
// several suffixes, e.g. --gsi, that the current code does not actually append).
console.log(naming.name({ type: 'sqsFifoQueue', key: 'events' }))     // ...events.fifo  ✅ suffix applied
console.log(naming.name({ type: 'sqsDlq', key: 'events' }))           // ...events--dlq  ✅ suffix applied
console.log(naming.name({ type: 'dynamoDbGsi', key: 'by-user' }))     // ...by-user      (no --gsi in current code)

// ── Specialized segments (purpose / kind+az) ─────────────────────────────────
console.log(naming.name({ type: 'ec2SecurityGroup', purpose: 'db' })) // ...checkout-api--db
console.log(naming.name({ type: 'subnet', kind: 'private', az: '1a' })) // ...private--1a

// ── DNS: service-first, tenant-first, wildcard, apex ─────────────────────────
const dns = naming.with({ apex: 'acme.com' })
  .apexMapping((s) => (s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`))
console.log(dns.name({ type: 'route53Record' }))                       // checkout-api.acme.com
console.log(dns.with({ tenant: 't-a3f8b2' }).name({ type: 'route53TenantRecord' }))
// t-a3f8b2.checkout-api.acme.com

// ── Tags (the security boundary — names are only organizational) ─────────────
// Actual current output: built-in keys default to DEFAULT_TAG_KEYS *plus* any
// segment you passed in the constructor (so org/env show here because we set them),
// and a `segment` tag describing the pattern is always emitted.
console.log(naming.tags())
// { org, domain, service, env, segment: 'region--env--org--domain--service' }

// Pin the exact built-in keys you want with .tagKeys():
console.log(naming.tagKeys('domain', 'service').tags())
// { domain: 'payments', service: 'checkout-api', segment: '...' }

// ── Multi-tenant: opaque tenant ID, never a human-readable name ──────────────
const tenant = naming.with({ tenant: 't-a3f8b2' })
console.log(tenant.name({ type: 'dynamoDb', key: 'orders' }))
// acme--payments--checkout-api--t-a3f8b2--orders
console.log(tenant.name({ type: 's3Bucket', key: 'data' }))
// ap-southeast-2--prod--acme--payments--checkout-api--t-a3f8b2--data
