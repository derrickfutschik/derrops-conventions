import { describe, it, expect } from '@jest/globals'
import { defineResource } from '../ResourceBuilder.js'

// ── Shared S3 builder ─────────────────────────────────────────────────────────

const buildStorage = defineResource({
  defaults: {
    region: 'ap-southeast-2',
    env: 'prod',
    org: 'derrops',
    domain: 'oaspec',
    service: 'storage',
  },
  layers: {
    bucket: { type: 's3Bucket', segments: ['region', 'env', 'org', 'domain', 'service'] as const },
    prefix: { type: 's3KeyPrefix', segments: ['tenant', 'partition'] as const },
    name: { type: 's3ObjectName', segments: ['key'] as const },
  },
})

// ── Layer output ───────────────────────────────────────────────────────────────

describe('defineResource — layer output', () => {
  const base = buildStorage({ tenant: 't-abc123', partition: '2024/01/15', key: 'log.gz' })

  it('bucket uses region/env/org/domain/service with -- delimiter', () => {
    expect(base.bucket).toBe('ap-southeast-2--prod--derrops--oaspec--storage')
  })

  it('prefix uses only tenant/partition — no org/domain/service repeated', () => {
    expect(base.prefix).toBe('t-abc123/2024/01/15')
  })

  it('name uses only the key segment', () => {
    expect(base.name).toBe('log.gz')
  })
})

// ── Default overrides ──────────────────────────────────────────────────────────

describe('defineResource — default overrides', () => {
  it('call-time segment override replaces the default', () => {
    const result = buildStorage({
      tenant: 't-abc123',
      partition: '2024/01/15',
      key: 'log.gz',
      service: 'archive',
    })
    expect(result.bucket).toBe('ap-southeast-2--prod--derrops--oaspec--archive')
  })

  it('overriding env changes bucket name', () => {
    const result = buildStorage({
      tenant: 't-abc123',
      partition: '2024/01/15',
      key: 'log.gz',
      env: 'dev',
    })
    expect(result.bucket).toBe('ap-southeast-2--dev--derrops--oaspec--storage')
  })

  it('non-overridden defaults are preserved', () => {
    const result = buildStorage({
      tenant: 't-abc123',
      partition: '2024/03/15',
      key: 'other.gz',
    })
    expect(result.bucket).toBe('ap-southeast-2--prod--derrops--oaspec--storage')
  })
})

// ── Segment variation ──────────────────────────────────────────────────────────

describe('defineResource — segment variation', () => {
  it('different partition produces different prefix', () => {
    const result = buildStorage({ tenant: 't-abc123', partition: '2024/03/15', key: 'log.gz' })
    expect(result.prefix).toBe('t-abc123/2024/03/15')
  })

  it('different tenant produces different prefix', () => {
    const result = buildStorage({ tenant: 't-xyz999', partition: '2024/01/15', key: 'log.gz' })
    expect(result.prefix).toBe('t-xyz999/2024/01/15')
  })

  it('key with hyphens is preserved as-is', () => {
    const result = buildStorage({
      tenant: 't-abc123',
      partition: '2024/01/15',
      key: 'my-report.json',
    })
    expect(result.name).toBe('my-report.json')
  })
})

// ── Single-layer resource ──────────────────────────────────────────────────────

describe('defineResource — single layer', () => {
  it('builds a simple lambda function name', () => {
    const buildFn = defineResource({
      defaults: { org: 'derrops', domain: 'payments' },
      layers: {
        fn: {
          type: 'lambdaFunction',
          segments: ['org', 'domain', 'service'] as const,
        },
      },
    })
    const result = buildFn({ service: 'checkout-api' })
    expect(result.fn).toBe('derrops--payments--checkout-api')
  })

  it('all segments are in defaults — factory takes no input', () => {
    const buildFn = defineResource({
      defaults: { org: 'derrops', domain: 'payments', service: 'checkout-api' },
      layers: {
        fn: {
          type: 'lambdaFunction',
          segments: ['org', 'domain', 'service'] as const,
        },
      },
    })
    // TypeScript: input is {} (all optional)
    const result = buildFn({})
    expect(result.fn).toBe('derrops--payments--checkout-api')
  })
})

// ── SSM-style multi-layer resource ────────────────────────────────────────────

describe('defineResource — SSM path resource', () => {
  const buildParam = defineResource({
    defaults: { org: 'derrops', env: 'prod', domain: 'payments', service: 'checkout-api' },
    layers: {
      path: { type: 'ssmParam', segments: ['org', 'domain', 'service', 'key'] as const },
    },
  })

  it('generates SSM parameter path with leading slash', () => {
    const result = buildParam({ key: 'db-password' })
    expect(result.path).toBe('/derrops/payments/checkout-api/db-password')
  })
})

// ── No defaults (all required) ─────────────────────────────────────────────────

describe('defineResource — no defaults', () => {
  it('all segments are required when defaults is empty', () => {
    const buildFn = defineResource({
      defaults: {},
      layers: {
        bucket: { type: 's3Bucket', segments: ['region', 'env', 'org'] as const },
      },
    })
    const result = buildFn({ region: 'us-east-1', env: 'staging', org: 'acme' })
    expect(result.bucket).toBe('us-east-1--staging--acme')
  })
})
