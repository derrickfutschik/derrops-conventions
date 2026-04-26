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
  it('org is excluded — starts from domain', () => {
    expect(base.resource({ type: 'dynamoDb', key: 'orders' }).logicalId).toBe(
      'PlatformApiOrdersDynamoDBTable',
    )
  })

  it('lambdaFunction gets LambdaFunction suffix', () => {
    expect(base.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'PlatformApiHandlerLambdaFunction',
    )
  })

  it('hyphens within a segment word are treated as word separators', () => {
    const c = new DerropsConventions({
      org: 'slaops',
      domain: 'platform',
      service: 'order-service',
    }).arnContext({ accountId: '123456789012' })
    expect(c.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'PlatformOrderServiceHandlerLambdaFunction',
    )
  })

  it('org-only instance — logicalId still works (no segments to omit)', () => {
    const c = new DerropsConventions({ org: 'slaops', service: 'api' }).arnContext({
      accountId: '123456789012',
    })
    expect(c.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'ApiHandlerLambdaFunction',
    )
  })

  it('DLQ name --dlq becomes Dlq in PascalCase, followed by SQSQueue suffix', () => {
    expect(base.resource({ type: 'sqsDlq', key: 'events' }).logicalId).toBe(
      'PlatformApiEventsDlqSQSQueue',
    )
  })

  it('s3Bucket global name: org excluded, region + env remain (global type)', () => {
    expect(base.resource({ type: 's3Bucket', key: 'artefacts' }).logicalId).toBe(
      'ApSoutheast2ProdPlatformApiArtefactsS3Bucket',
    )
  })

  it('scope to domain only for shorter logical ID', () => {
    const scoped = base.with({ domain: undefined })
    expect(scoped.resource({ type: 'dynamoDb', key: 'orders' }).logicalId).toBe(
      'ApiOrdersDynamoDBTable',
    )
  })

  it('name still includes org — logicalId is separate from name', () => {
    const r = base.resource({ type: 'dynamoDb', key: 'orders' })
    expect(r.name).toContain('slaops')
    expect(r.logicalId).not.toContain('Slaops')
  })

  it('different types produce different logicalIds even with the same key', () => {
    const table = base.resource({ type: 'dynamoDb', key: 'data' }).logicalId
    const queue = base.resource({ type: 'sqsQueue', key: 'data' }).logicalId
    expect(table).not.toBe(queue)
    expect(table).toContain('DynamoDBTable')
    expect(queue).toContain('SQSQueue')
  })
})
