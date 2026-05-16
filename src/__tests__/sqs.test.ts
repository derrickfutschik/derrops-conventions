import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const base = new DerropsConventions({
  org: 'derrops',
  domain: 'platform',
  service: 'api',
  region: 'ap-southeast-2',
  env: 'prod',
}).arnContext({ accountId: '123456789012' })

describe('SQS — naming', () => {
  const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

  it('sqsQueue preserves hyphens', () => {
    expect(c.name({ type: 'sqsQueue', key: 'order-events' })).toBe(
      'acme--payments--checkout-api--order-events',
    )
  })

  it('spaces in key are converted to hyphens', () => {
    expect(c.name({ type: 'sqsQueue', key: 'order events' })).toBe(
      'acme--payments--checkout-api--order-events',
    )
  })

  it('sqsFifoQueue appends .fifo', () => {
    const q = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
    expect(q.name({ type: 'sqsFifoQueue', key: 'events' })).toBe('acme--payments--api--events.fifo')
  })

  it('sqsDlq appends --dlq via segmentDelimiter', () => {
    const q = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
    expect(q.name({ type: 'sqsDlq', key: 'events' })).toBe('acme--payments--api--events--dlq')
  })

  it('sqsFifoQueue suffix appended even when other segment defaults are set', () => {
    const q = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' }).with({
      env: 'prod',
      region: 'ap-southeast-2',
    })
    expect(q.name({ type: 'sqsFifoQueue', key: 'jobs' })).toBe('acme--payments--api--jobs.fifo')
  })
})

describe('SQS — resource()', () => {
  it('sqsQueue: regional ARN with no resource prefix (queue name is the resource)', () => {
    const r = base.resource({ type: 'sqsQueue', key: 'jobs' })
    expect(r.arn).toBe('arn:aws:sqs:ap-southeast-2:123456789012:derrops--platform--api--jobs')
  })

  it('sqsFifoQueue: name ends with .fifo and ARN includes it', () => {
    const r = base.resource({ type: 'sqsFifoQueue', key: 'events' })
    expect(r.name.endsWith('.fifo')).toBe(true)
    expect(r.arn).toContain('.fifo')
  })

  it('sqsQueue write tier includes SendMessage and DeleteMessage', () => {
    const grant = base.resource({ type: 'sqsQueue', key: 'jobs' }).write()
    expect(grant.actions).toContain('sqs:SendMessage')
    expect(grant.actions).toContain('sqs:DeleteMessage')
  })

  it('sqsQueue read tier includes ReceiveMessage but not SendMessage', () => {
    const grant = base.resource({ type: 'sqsQueue', key: 'jobs' }).read()
    expect(grant.actions).toContain('sqs:ReceiveMessage')
    expect(grant.actions).not.toContain('sqs:SendMessage')
  })
})

describe('SQS — sqsPair()', () => {
  it('queue name does not have dlq suffix', () => {
    const { queue } = base.sqsPair({ key: 'ingest' })
    expect(queue.name).toBe('derrops--platform--api--ingest')
    expect(queue.name).not.toContain('dlq')
  })

  it('dlq name has --dlq suffix', () => {
    const { dlq } = base.sqsPair({ key: 'ingest' })
    expect(dlq.name).toBe('derrops--platform--api--ingest--dlq')
  })

  it('both queue and dlq share the same key prefix', () => {
    const { queue, dlq } = base.sqsPair({ key: 'events' })
    expect(dlq.name.startsWith(queue.name)).toBe(true)
  })

  it('redrivePolicyArn equals dlq.arn', () => {
    const pair = base.sqsPair({ key: 'ingest' })
    expect(pair.redrivePolicyArn).toBe(pair.dlq.arn)
  })

  it('queue ARN is a valid SQS ARN', () => {
    const { queue } = base.sqsPair({ key: 'ingest' })
    expect(queue.arn).toBe('arn:aws:sqs:ap-southeast-2:123456789012:derrops--platform--api--ingest')
  })

  it('dlq ARN is a valid SQS ARN with --dlq suffix', () => {
    const { dlq } = base.sqsPair({ key: 'ingest' })
    expect(dlq.arn).toBe(
      'arn:aws:sqs:ap-southeast-2:123456789012:derrops--platform--api--ingest--dlq',
    )
  })

  it('both resources carry SQS write permissions', () => {
    const { queue, dlq } = base.sqsPair({ key: 'jobs' })
    expect(queue.write().actions).toContain('sqs:SendMessage')
    expect(dlq.write().actions).toContain('sqs:SendMessage')
  })

  it('queue logicalId and dlq logicalId are distinct PascalCase strings', () => {
    const { queue, dlq } = base.sqsPair({ key: 'events' })
    expect(queue.logicalId).toBe('PlatformApiEventsSQSQueue')
    expect(dlq.logicalId).toBe('PlatformApiEventsDlqSQSQueue')
    expect(queue.logicalId).not.toBe(dlq.logicalId)
  })

  it('segment overrides are applied to both resources', () => {
    const { queue, dlq } = base.sqsPair({ key: 'ingest', service: 'worker' })
    expect(queue.name).toContain('worker')
    expect(dlq.name).toContain('worker')
  })
})
