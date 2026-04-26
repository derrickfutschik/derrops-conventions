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
  it('type suffix is appended from localId', () => {
    expect(base.resource({ type: 'dynamoDb', key: 'orders' }).logicalId).toBe(
      'SlaopsPlatformApiOrdersDynamoDBTable',
    )
  })

  it('lambdaFunction gets LambdaFunction suffix', () => {
    expect(base.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'SlaopsPlatformApiHandlerLambdaFunction',
    )
  })

  it('hyphens within a segment word are treated as word separators', () => {
    const c = new DerropsConventions({
      org: 'slaops',
      domain: 'platform',
      service: 'order-service',
    }).arnContext({ accountId: '123456789012' })
    expect(c.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'SlaopsPlatformOrderServiceHandlerLambdaFunction',
    )
  })

  it('omits missing segments naturally — only defined segments appear', () => {
    const c = new DerropsConventions({ service: 'api' }).arnContext({ accountId: '123456789012' })
    expect(c.resource({ type: 'lambdaFunction', key: 'handler' }).logicalId).toBe(
      'ApiHandlerLambdaFunction',
    )
  })

  it('DLQ name --dlq becomes Dlq in PascalCase, followed by SQSQueue suffix', () => {
    expect(base.resource({ type: 'sqsDlq', key: 'events' }).logicalId).toBe(
      'SlaopsPlatformApiEventsDlqSQSQueue',
    )
  })

  it('s3Bucket global name includes region + env, gets S3Bucket suffix', () => {
    expect(base.resource({ type: 's3Bucket', key: 'artefacts' }).logicalId).toBe(
      'ApSoutheast2ProdSlaopsPlatformApiArtefactsS3Bucket',
    )
  })

  it('scope the instance to get a shorter logical ID', () => {
    const scoped = base.with({ org: undefined, domain: undefined })
    expect(scoped.resource({ type: 'dynamoDb', key: 'orders' }).logicalId).toBe(
      'ApiOrdersDynamoDBTable',
    )
  })

  it('logicalId is stable — same resource produces same string', () => {
    const a = base.resource({ type: 'dynamoDb', key: 'sessions' }).logicalId
    const b = base.resource({ type: 'dynamoDb', key: 'sessions' }).logicalId
    expect(a).toBe(b)
  })

  it('different types produce different logicalIds even with the same key', () => {
    const table = base.resource({ type: 'dynamoDb', key: 'data' }).logicalId
    const queue = base.resource({ type: 'sqsQueue', key: 'data' }).logicalId
    expect(table).not.toBe(queue)
    expect(table).toContain('DynamoDBTable')
    expect(queue).toContain('SQSQueue')
  })
})
