import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const base = new DerropsConventions({
  org: 'slaops',
  domain: 'platform',
  service: 'api',
  region: 'ap-southeast-2',
  env: 'prod',
}).arnContext({ accountId: '123456789012' })

// ── Core properties ───────────────────────────────────────────────────────────

describe('resource() — core properties', () => {
  it('name matches what .name() returns', () => {
    const name = base.name({ type: 'lambdaFunction', key: 'handler' })
    const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
    expect(r.name).toBe(name)

    console.log(JSON.stringify(r, null, 2))
  })

  it('arn is the first entry in arns', () => {
    const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
    expect(r.arn).toBe(r.arns[0])
  })

  it('type reflects the requested resource type', () => {
    const r = base.resource({ type: 'dynamoDb', key: 'orders' })
    expect(r.type).toBe('dynamoDb')
  })

  it('tags are populated from the instance defaults', () => {
    const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
    expect(typeof r.tags).toBe('object')
    expect(Object.keys(r.tags).length).toBeGreaterThan(0)
  })
})

// ── ARN correctness per resource type ─────────────────────────────────────────

describe('resource() — ARN format', () => {
  it('lambdaFunction: regional, includes function: prefix', () => {
    const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
    expect(r.arn).toBe(
      'arn:aws:lambda:ap-southeast-2:123456789012:function:slaops--platform--api--handler',
    )
    expect(r.arns).toHaveLength(1)
  })

  it('s3Bucket: global, no region or account in ARN, emits bucket and bucket/*', () => {
    const r = base.resource({ type: 's3Bucket', key: 'data' })
    expect(r.arns).toHaveLength(2)
    expect(r.arns[0]).toBe('arn:aws:s3:::ap-southeast-2--prod--slaops--platform--api--data')
    expect(r.arns[1]).toBe('arn:aws:s3:::ap-southeast-2--prod--slaops--platform--api--data/*')
  })

  it('dynamoDb: regional, table/ prefix', () => {
    const r = base.resource({ type: 'dynamoDb', key: 'orders' })
    expect(r.arn).toBe(
      'arn:aws:dynamodb:ap-southeast-2:123456789012:table/slaops--platform--api--orders',
    )
    expect(r.arns).toHaveLength(1)
  })

  it('dynamoDbGsi: ARN targets parent table (--gsi stripped), appends /index/*', () => {
    const r = base.resource({ type: 'dynamoDbGsi', key: 'orders' })
    // name has --gsi suffix
    expect(r.name).toBe('slaops--platform--api--orders--gsi')
    // ARN must not contain --gsi and must end with /index/*
    expect(r.arn).toContain('table/slaops--platform--api--orders/index/*')
    expect(r.arn).not.toContain('--gsi')
    expect(r.arns).toHaveLength(1)
  })

  it('ssmParam: leading slash, path delimiter', () => {
    const r = base.resource({ type: 'ssmParam', key: 'db-secret' })
    expect(r.arn).toBe(
      'arn:aws:ssm:ap-southeast-2:123456789012:parameter/slaops/platform/api/db-secret',
    )
  })

  it('iamRole: no region in ARN, role/ prefix with path', () => {
    const r = base.resource({ type: 'iamRole', key: 'exec' })
    expect(r.arn).toMatch(/^arn:aws:iam::123456789012:role\//)
    expect(r.arn).not.toMatch(/ap-southeast-2/)
  })

  it('cloudwatchLogsGroup: log-group: prefix', () => {
    const r = base.resource({ type: 'cloudwatchLogsGroup', key: 'app' })
    expect(r.arn).toContain('log-group:')
    expect(r.arn).toContain('ap-southeast-2')
  })

  it('sqsQueue: regional, no resource prefix (name is the resource)', () => {
    const r = base.resource({ type: 'sqsQueue', key: 'jobs' })
    expect(r.arn).toBe('arn:aws:sqs:ap-southeast-2:123456789012:slaops--platform--api--jobs')
  })

  it('sqsFifoQueue: name ends with .fifo but ARN still includes it', () => {
    const r = base.resource({ type: 'sqsFifoQueue', key: 'events' })
    expect(r.name.endsWith('.fifo')).toBe(true)
    expect(r.arn).toContain('.fifo')
  })

  it('openSearchDomain: emits domain ARN and domain/* for index access', () => {
    const r = base.resource({ type: 'openSearchDomain' })
    expect(r.arns).toHaveLength(2)
    expect(r.arns[0]).toContain(':domain/slaops--platform--api')
    expect(r.arns[1]).toBe(r.arns[0] + '/*')
  })

  it('secretsManager: secret: prefix', () => {
    const r = base.resource({ type: 'secretsManager', key: 'jwt' })
    expect(r.arn).toContain('secret:slaops/platform/api/jwt')
  })

  it('cloudFormationStack: name includes -stack suffix, ARN ends with /*', () => {
    const r = base.resource({ type: 'cloudFormationStack', key: 'infra' })
    expect(r.name.endsWith('-stack')).toBe(true)
    expect(r.arn).toMatch(/stack\/slaops--platform--api--infra-stack\/\*$/)
  })

  it('ssmDocument: document/ prefix', () => {
    const r = base.resource({ type: 'ssmDocument', key: 'deploy' })
    expect(r.arn).toContain('document/slaops--platform--api--deploy')
  })

  it('redshiftCluster: cluster: prefix', () => {
    const r = base.resource({ type: 'redshiftCluster' })
    expect(r.arn).toContain('cluster:slaops--platform--api')
  })

  it('configRule: name includes -rule suffix, config-rule/ prefix', () => {
    const r = base.resource({ type: 'configRule', key: 'tagging' })
    expect(r.name.endsWith('-rule')).toBe(true)
    expect(r.arn).toContain('config-rule/slaops--platform--api--tagging-rule')
  })

  it('xraySamplingRule: sampling-rule/ prefix', () => {
    const r = base.resource({ type: 'xraySamplingRule', key: 'low-rate' })
    expect(r.arn).toContain('sampling-rule/slaops--platform--api--low-rate')
  })

  it('cloudFrontDistribution: no region in ARN', () => {
    const r = base.resource({ type: 'cloudFrontDistribution' })
    expect(r.arn).toMatch(/^arn:aws:cloudfront::123456789012:distribution\//)
  })

  it('ecr: repository/ prefix', () => {
    const r = base.resource({ type: 'ecr' })
    expect(r.arn).toContain('repository/')
  })

  it('mskCluster: cluster/ prefix', () => {
    const r = base.resource({ type: 'mskCluster' })
    expect(r.arn).toContain('cluster/')
  })

  it('kinesisStream: stream/ prefix', () => {
    const r = base.resource({ type: 'kinesisStream', key: 'events' })
    expect(r.arn).toContain('stream/')
  })

  it('stepFunctions: stateMachine: prefix', () => {
    const r = base.resource({ type: 'stepFunctions', key: 'order-flow' })
    expect(r.arn).toContain('stateMachine:')
  })

  it('uses non-default partition when set', () => {
    const cn = new DerropsConventions({
      org: 'slaops',
      domain: 'platform',
      service: 'api',
      region: 'cn-north-1',
    }).arnContext({ accountId: '123456789012', partition: 'aws-cn' })
    const r = cn.resource({ type: 'lambdaFunction', key: 'handler' })
    expect(r.arn.startsWith('arn:aws-cn:')).toBe(true)
  })
})

// ── Segment overrides ─────────────────────────────────────────────────────────

describe('resource() — segment overrides', () => {
  it('overriding domain changes the name and ARN', () => {
    const r = base.resource({ type: 'dynamoDb', domain: 'oaspec', key: 'specs' })
    expect(r.name).toContain('oaspec')
    expect(r.arn).toContain('slaops--oaspec--api--specs')
  })

  it('including tenant changes the name and ARN', () => {
    const r = base.resource({ type: 'ssmParam', tenant: 't-abc123', key: 'secret' })
    expect(r.name).toContain('t-abc123')
    expect(r.arn).toContain('/t-abc123/')
  })

  it('.with() instance propagates defaults to resource()', () => {
    const scoped = base.with({ service: 'worker', domain: 'jobs' })
    const r = scoped.resource({ type: 'lambdaFunction', key: 'processor' })
    expect(r.name).toBe('slaops--jobs--worker--processor')
  })

  it('default type via .with({ type }) works without passing type', () => {
    const scoped = base.with({ type: 'lambdaFunction' })
    const r = scoped.resource({ key: 'handler' })
    expect(r.type).toBe('lambdaFunction')
    expect(r.name).toContain('handler')
  })
})

// ── Error paths ───────────────────────────────────────────────────────────────

describe('resource() — error paths', () => {
  it('throws when no type and no default type', () => {
    expect(() => base.resource({} as Parameters<typeof base.resource>[0])).toThrow(
      /requires a "type"/,
    )
  })

  it('throws when resource type has no ARN config (vpc)', () => {
    expect(() => base.resource({ type: 'vpc' })).toThrow(/no ARN configuration/)
  })

  it('throws when resource type has no ARN config (subnet)', () => {
    expect(() => base.resource({ type: 'subnet' })).toThrow(/no ARN configuration/)
  })

  it('throws when resource type has no ARN config (kafkaTopic)', () => {
    expect(() => base.resource({ type: 'kafkaTopic' })).toThrow(/no ARN configuration/)
  })

  it('throws when resource type has no ARN config (apiGatewayRestApi)', () => {
    expect(() => base.resource({ type: 'apiGatewayRestApi' })).toThrow(/no ARN configuration/)
  })

  it('throws when arnContext is not set', () => {
    const bare = new DerropsConventions({ org: 'slaops', region: 'ap-southeast-2' })
    expect(() => bare.resource({ type: 'lambdaFunction', key: 'h' })).toThrow(/accountId/)
  })
})

// ── Grant methods ─────────────────────────────────────────────────────────────

describe('resource() — grant methods', () => {
  describe('.read()', () => {
    it('grant arns match resource arns', () => {
      const r = base.resource({ type: 'dynamoDb', key: 'orders' })
      expect(r.read().arns).toEqual(r.arns)
    })

    it('dynamoDb read includes Get*, Query, Scan, Describe*', () => {
      const grant = base.resource({ type: 'dynamoDb', key: 'orders' }).read()
      expect(grant.actions).toContain('dynamodb:Get*')
      expect(grant.actions).toContain('dynamodb:Query')
      expect(grant.actions).toContain('dynamodb:Scan')
      expect(grant.actions).toContain('dynamodb:Describe*')
      expect(grant.actions).not.toContain('dynamodb:Put*')
    })

    it('s3Bucket read grant carries both bucket and object ARNs', () => {
      const r = base.resource({ type: 's3Bucket', key: 'data' })
      const grant = r.read()
      expect(grant.arns).toHaveLength(2)
      expect(grant.arns[1]).toMatch(/\/\*$/)
    })

    it('lambdaFunction read: Get* and List*', () => {
      const grant = base.resource({ type: 'lambdaFunction', key: 'handler' }).read()
      expect(grant.actions).toContain('lambda:Get*')
      expect(grant.actions).toContain('lambda:List*')
    })

    it('ssmParam read: GetParameter*', () => {
      const grant = base.resource({ type: 'ssmParam', key: 'secret' }).read()
      expect(grant.actions).toContain('ssm:GetParameter*')
    })

    it('secretsManager read: GetSecretValue', () => {
      const grant = base.resource({ type: 'secretsManager', key: 'jwt' }).read()
      expect(grant.actions).toContain('secretsmanager:GetSecretValue')
    })

    it('openSearchDomain read: ESHttpGet and ESHttpHead', () => {
      const grant = base.resource({ type: 'openSearchDomain' }).read()
      expect(grant.actions).toContain('es:ESHttpGet')
      expect(grant.actions).toContain('es:ESHttpHead')
    })
  })

  describe('.write()', () => {
    it('grant arns match resource arns', () => {
      const r = base.resource({ type: 'dynamoDb', key: 'orders' })
      expect(r.write().arns).toEqual(r.arns)
    })

    it('dynamoDb write includes read actions plus Put*, Update*, Delete*, BatchWrite*', () => {
      const grant = base.resource({ type: 'dynamoDb', key: 'orders' }).write()
      expect(grant.actions).toContain('dynamodb:Get*')
      expect(grant.actions).toContain('dynamodb:Put*')
      expect(grant.actions).toContain('dynamodb:Update*')
      expect(grant.actions).toContain('dynamodb:Delete*')
      expect(grant.actions).toContain('dynamodb:BatchWrite*')
    })

    it('s3Bucket write includes Put* and Delete*', () => {
      const grant = base.resource({ type: 's3Bucket', key: 'data' }).write()
      expect(grant.actions).toContain('s3:Put*')
      expect(grant.actions).toContain('s3:Delete*')
    })

    it('lambdaFunction write includes InvokeFunction', () => {
      const grant = base.resource({ type: 'lambdaFunction', key: 'handler' }).write()
      expect(grant.actions).toContain('lambda:InvokeFunction')
    })

    it('mskCluster write includes kafka-cluster data-plane actions', () => {
      const grant = base.resource({ type: 'mskCluster' }).write()
      expect(grant.actions).toContain('kafka-cluster:Connect')
      expect(grant.actions).toContain('kafka-cluster:ReadData')
      expect(grant.actions).toContain('kafka-cluster:WriteData')
    })

    it('sqsQueue write includes SendMessage and DeleteMessage', () => {
      const grant = base.resource({ type: 'sqsQueue', key: 'jobs' }).write()
      expect(grant.actions).toContain('sqs:SendMessage')
      expect(grant.actions).toContain('sqs:DeleteMessage')
    })

    it('eventBridgeBus write includes PutEvents', () => {
      const grant = base.resource({ type: 'eventBridgeBus', key: 'main' }).write()
      expect(grant.actions).toContain('events:PutEvents')
    })
  })

  describe('.manage()', () => {
    it('grant arns match resource arns', () => {
      const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
      expect(r.manage().arns).toEqual(r.arns)
    })

    it('lambdaFunction manage: lambda:*', () => {
      const grant = base.resource({ type: 'lambdaFunction', key: 'handler' }).manage()
      expect(grant.actions).toEqual(['lambda:*'])
    })

    it('dynamoDb manage: dynamodb:*', () => {
      const grant = base.resource({ type: 'dynamoDb', key: 'orders' }).manage()
      expect(grant.actions).toEqual(['dynamodb:*'])
    })

    it('mskCluster manage: kafka:* and kafka-cluster:*', () => {
      const grant = base.resource({ type: 'mskCluster' }).manage()
      expect(grant.actions).toContain('kafka:*')
      expect(grant.actions).toContain('kafka-cluster:*')
    })

    it('redshiftCluster manage: redshift:* and redshift-data:*', () => {
      const grant = base.resource({ type: 'redshiftCluster' }).manage()
      expect(grant.actions).toContain('redshift:*')
      expect(grant.actions).toContain('redshift-data:*')
    })
  })

  describe('.raw()', () => {
    it('returns exactly the provided actions', () => {
      const grant = base
        .resource({ type: 'lambdaFunction', key: 'handler' })
        .raw('lambda:InvokeFunction')
      expect(grant.actions).toEqual(['lambda:InvokeFunction'])
    })

    it('accepts multiple actions', () => {
      const grant = base
        .resource({ type: 'dynamoDb', key: 'orders' })
        .raw('dynamodb:GetItem', 'dynamodb:PutItem')
      expect(grant.actions).toEqual(['dynamodb:GetItem', 'dynamodb:PutItem'])
    })

    it('arns still come from the resource', () => {
      const r = base.resource({ type: 'dynamoDb', key: 'orders' })
      expect(r.raw('dynamodb:GetItem').arns).toEqual(r.arns)
    })

    it('throws when called with no arguments', () => {
      const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
      expect(() => r.raw()).toThrow()
    })

    it('can be used cross-service (actions are not validated against the type)', () => {
      const r = base.resource({ type: 'lambdaFunction', key: 'handler' })
      const grant = r.raw('xray:PutTraceSegments', 'xray:PutTelemetryRecords')
      expect(grant.actions).toContain('xray:PutTraceSegments')
    })
  })
})

// ── Grant independence ────────────────────────────────────────────────────────

describe('resource() — grant independence', () => {
  it('two .read() calls return independent objects with equal contents', () => {
    const r = base.resource({ type: 'dynamoDb', key: 'orders' })
    const g1 = r.read()
    const g2 = r.read()
    expect(g1).not.toBe(g2)
    expect(g1.actions).toEqual(g2.actions)
    expect(g1.arns).toEqual(g2.arns)
  })

  it('.read() and .write() produce different action arrays', () => {
    const r = base.resource({ type: 'dynamoDb', key: 'orders' })
    expect(r.read().actions).not.toEqual(r.write().actions)
  })

  it('.read(), .write(), .manage() all reference the same arns', () => {
    const r = base.resource({ type: 'dynamoDb', key: 'orders' })
    expect(r.read().arns).toEqual(r.arns)
    expect(r.write().arns).toEqual(r.arns)
    expect(r.manage().arns).toEqual(r.arns)
  })

  it('resources from the same convention with different keys have different arns', () => {
    const r1 = base.resource({ type: 'dynamoDb', key: 'orders' })
    const r2 = base.resource({ type: 'dynamoDb', key: 'sessions' })
    expect(r1.arns).not.toEqual(r2.arns)
    expect(r1.read().actions).toEqual(r2.read().actions)
  })
})
