import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const base = new DerropsConventions({
  org: 'slaops',
  domain: 'platform',
  service: 'api',
  region: 'ap-southeast-2',
  env: 'prod',
}).arnContext({ accountId: '123456789012' })

describe('CDK — logicalId on Resource', () => {
  it('standard name becomes PascalCase', () => {
    expect(base.resource({ type: 'dynamoDb', key: 'orders' }).logicalId).toBe(
      'SlaopsPlatformApiOrders',
    )
  })

  it('hyphens within a segment word are treated as word separators', () => {
    const c = new DerropsConventions({
      org: 'slaops',
      domain: 'platform',
      service: 'order-service',
    }).arnContext({ accountId: '123456789012' })
    expect(c.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'SlaopsPlatformOrderServiceHandler',
    )
  })

  it('key segment included when present', () => {
    expect(base.resource({ type: 'lambdaFunction', key: 'token-refresh' }).logicalId).toBe(
      'SlaopsPlatformApiTokenRefresh',
    )
  })

  it('omits missing segments naturally — only defined segments appear', () => {
    const c = new DerropsConventions({ service: 'api' }).arnContext({ accountId: '123456789012' })
    expect(c.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe('ApiHandler')
  })

  it('DLQ suffix --dlq becomes Dlq', () => {
    expect(base.resource({ type: 'sqsDlq', key: 'events' }).logicalId).toBe(
      'SlaopsPlatformApiEventsDlq',
    )
  })

  it('s3Bucket global name (region + env segments included) converts correctly', () => {
    const r = base.resource({ type: 's3Bucket', key: 'artefacts' })
    expect(r.logicalId).toBe('ApSoutheast2ProdSlaopsPlatformApiArtefacts')
  })

  it('logicalId is stable — same resource produces same string', () => {
    const a = base.resource({ type: 'dynamoDb', key: 'sessions' }).logicalId
    const b = base.resource({ type: 'dynamoDb', key: 'sessions' }).logicalId
    expect(a).toBe(b)
  })

  it('different keys produce different logicalIds', () => {
    const a = base.resource({ type: 'dynamoDb', key: 'orders' }).logicalId
    const b = base.resource({ type: 'dynamoDb', key: 'sessions' }).logicalId
    expect(a).not.toBe(b)
  })
})
