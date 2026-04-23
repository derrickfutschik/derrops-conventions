import type { ResourceType } from './resource-types.js'

export interface ConsoleUrlContext {
  name: string
  region?: string
  accountId?: string
  arn: string
}

const enc = encodeURIComponent

/**
 * Build the AWS Console deep-link URL for a resource.
 * Returns `undefined` for resource types without a well-known console URL pattern.
 */
export function buildConsoleUrl(type: ResourceType, ctx: ConsoleUrlContext): string | undefined {
  const { name, region, accountId, arn } = ctx
  const r = region ?? ''
  const a = accountId ?? ''

  switch (type) {
    // ── Compute ────────────────────────────────────────────────────────────
    case 'lambdaFunction':
      return `https://console.aws.amazon.com/lambda/home?region=${r}#/functions/${enc(name)}`

    case 'lambdaLayer':
      return `https://console.aws.amazon.com/lambda/home?region=${r}#/layers/${enc(name)}`

    case 'ecsCluster':
      return `https://console.aws.amazon.com/ecs/v2/clusters/${enc(name)}/services?region=${r}`

    case 'ecsService':
      return `https://console.aws.amazon.com/ecs/v2/services?region=${r}`

    case 'ecsTaskDefinition':
      return `https://console.aws.amazon.com/ecs/v2/task-definitions/${enc(name)}?region=${r}`

    case 'ecr':
      return `https://console.aws.amazon.com/ecr/repositories/private/${a}/${enc(name)}?region=${r}`

    // ── Storage / Databases ────────────────────────────────────────────────
    case 's3Bucket':
      return `https://s3.console.aws.amazon.com/s3/buckets/${enc(name)}`

    case 'dynamoDb':
    case 'dynamoDbGsi':
      // GSI shares the table ARN — strip the --gsi suffix the name carries
      return `https://console.aws.amazon.com/dynamodbv2/home?region=${r}#table?name=${enc(name.replace(/--gsi$/, ''))}`

    case 'rdsInstance':
      return `https://console.aws.amazon.com/rds/home?region=${r}#database:id=${enc(name)}`

    case 'rdsParameterGroup':
      return `https://console.aws.amazon.com/rds/home?region=${r}#parameter-groups-detail:ids=${enc(name)}`

    case 'rdsSubnetGroup':
      return `https://console.aws.amazon.com/rds/home?region=${r}#db-subnet-group:id=${enc(name)}`

    case 'rdsProxy':
      return `https://console.aws.amazon.com/rds/home?region=${r}#proxy:id=${enc(name)}`

    case 'elastiCacheCluster':
      return `https://console.aws.amazon.com/elasticache/home?region=${r}#/redis/${enc(name)}`

    case 'elastiCacheReplicationGroup':
      return `https://console.aws.amazon.com/elasticache/home?region=${r}#/redis/${enc(name)}`

    case 'openSearchDomain':
      return `https://console.aws.amazon.com/aos/home?region=${r}#/opensearch/domains/${enc(name)}`

    case 'redshiftCluster':
      return `https://console.aws.amazon.com/redshiftv2/home?region=${r}#/clusters/${enc(name)}`

    // ── Messaging / Eventing ───────────────────────────────────────────────
    case 'snsTopic':
      return `https://console.aws.amazon.com/sns/v3/home?region=${r}#/topic/${enc(arn)}`

    case 'sqsQueue':
    case 'sqsFifoQueue':
    case 'sqsDlq':
      return `https://console.aws.amazon.com/sqs/v2/home?region=${r}#/queues/${enc(`https://sqs.${r}.amazonaws.com/${a}/${name}`)}`

    case 'kinesisStream':
      return `https://console.aws.amazon.com/kinesis/home?region=${r}#/streams/details/${enc(name)}/details`

    case 'eventBridgeBus':
      return `https://console.aws.amazon.com/events/home?region=${r}#/event-bus/${enc(name)}`

    case 'eventBridgeRule':
      return `https://console.aws.amazon.com/events/home?region=${r}#/rules/${enc(name)}`

    case 'mskCluster':
      return `https://console.aws.amazon.com/msk/home?region=${r}#/clusters/${enc(name)}`

    // ── Integration ────────────────────────────────────────────────────────
    case 'stepFunctions':
      return `https://console.aws.amazon.com/states/home?region=${r}#/statemachines/view/${enc(arn)}`

    // ── Config / Secrets ───────────────────────────────────────────────────
    case 'ssmParam':
      return `https://console.aws.amazon.com/systems-manager/parameters/${enc(name)}/description?region=${r}`

    case 'ssmDocument':
      return `https://console.aws.amazon.com/systems-manager/documents/${enc(name)}/description?region=${r}`

    case 'secretsManager':
      return `https://console.aws.amazon.com/secretsmanager/secret?name=${enc(name)}&region=${r}`

    case 'appConfigApplication':
      return `https://console.aws.amazon.com/appconfig/home?region=${r}#/applications`

    // ── Identity ───────────────────────────────────────────────────────────
    case 'iamRole':
      // IAM role name is the last path segment of the name (path format /org/domain/service/roleName)
      return `https://console.aws.amazon.com/iamv2/home#/roles/${enc(name.split('/').filter(Boolean).pop() ?? name)}`

    case 'iamPolicy':
      return `https://console.aws.amazon.com/iamv2/home#/policies/${enc(arn)}`

    case 'iamUser':
      return `https://console.aws.amazon.com/iamv2/home#/users/${enc(name)}`

    // ── Observability ──────────────────────────────────────────────────────
    case 'cloudwatchLogsGroup':
      return `https://console.aws.amazon.com/cloudwatch/home?region=${r}#logsV2:log-groups/log-group/${enc(enc(name))}`

    case 'xraySamplingRule':
      return `https://console.aws.amazon.com/xray/home?region=${r}#/sampling-rules`

    // ── Data / Analytics ───────────────────────────────────────────────────
    case 'glueDatabase':
      return `https://console.aws.amazon.com/glue/home?region=${r}#/v2/data-catalog/databases/${enc(name)}`

    case 'glueJob':
      return `https://console.aws.amazon.com/glue/home?region=${r}#/v2/etl-jobs/${enc(name)}`

    case 'glueCrawler':
      return `https://console.aws.amazon.com/glue/home?region=${r}#/v2/data-catalog/crawlers/${enc(name)}`

    case 'athenaWorkgroup':
      return `https://console.aws.amazon.com/athena/home?region=${r}#/workgroups/${enc(name)}`

    // ── Networking / CDN ───────────────────────────────────────────────────
    case 'cloudFrontDistribution':
      return `https://console.aws.amazon.com/cloudfront/v4/home#/distributions`

    // ── Operations ─────────────────────────────────────────────────────────
    case 'cloudFormationStack':
      return `https://console.aws.amazon.com/cloudformation/home?region=${r}#/stacks?filteringStatus=active`

    case 'configRule':
      return `https://console.aws.amazon.com/config/home?region=${r}#/rules/rule-details/${enc(name)}`

    case 'wafWebAcl':
      return `https://console.aws.amazon.com/wafv2/homev2/web-acls/${enc(name)}?region=${r}`

    case 'backupVault':
      return `https://console.aws.amazon.com/backup/home?region=${r}#/vaults/${enc(name)}`

    default:
      return undefined
  }
}
