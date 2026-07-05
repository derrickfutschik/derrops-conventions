# Resource types reference (generated from code)

> **Source of truth.** This table is generated directly from the library's `RESOURCE_TYPES`
> registry and verified against actual `.name()` output — it does **not** depend on the repo
> README. Regenerate after changing resource types. Total types: 125.

## How a name is assembled

For each type the library joins its **segments** with the type's **segment delimiter**, prepends
`region`/`env` only when **Global** is set, and appends a **Suffix** if the type defines one.
You supply segment values; the library never concatenates strings for you.

**Delimiters** (chosen by the type, never guess):

| Context | Delimiter |
| --- | --- |
| Between segments (flat names) | `--` |
| Between words within a segment (`checkout-api`) | `-` |
| Path-native (SSM, IAM path, S3 key, CloudWatch Logs, ECR, KMS alias, Secrets Manager) | `/` |
| DNS-native (Route53, CloudFront alias, ACM, Kafka topic, Cloud Map) | `.` |
| DB-internal (RDS db name, Glue db, Redshift db) | `_` |

**Global** (`✅`) types include `region` + `env` (globally-unique namespaces, e.g. S3);
account-scoped types omit them because the AWS account provides isolation.

**Suffix** — only **four** types append a fixed suffix: `sqsFifoQueue` → `.fifo` (AWS-required),
`sqsDlq` → `--dlq` (avoids collision with the primary queue), `iamPath` → trailing `/`,
`cloudMapNamespace` → `.local`. No other type appends a suffix (an earlier design did; those
suffixes were removed in commit `142a932` — don't reintroduce them by hand).

**Segments** — `default` = the default order (`region`→`env`→`org`→`domain`→`service`→`tenant`→`key`,
minus `region`/`env` for non-global). Otherwise the type declares a **fixed** segment list and
ignores anything else you pass. Note which types are **domain-scoped** (no `service`: `subnet`,
`networkAcl`, `routeTable`, `serviceCatalogPortfolio`, `transitGatewayAttachment`, `clientVpnEndpoint`)
or **org-scoped** (`vpc`, `transitGateway`).

## Placeholder values used in the Example column

Base instance: `{ region:'ap-southeast-2', env:'prod', org:'acme', domain:'payments', service:'checkout-api' }`.
Specialized segments use placeholders: `key=orders`, `purpose=web`, `kind=private`, `az=1a`, `num=01`,
`entity=transactions`, `tenant=t-a3f8b2`, `apex=acme.com`, `consumer=partner-a`, `target=user-table`,
`partition=2024/01/15/14`. (`target` doubles as a remote-org name for `vpcPeering`.)

## All resource types

| Type key | Delim | Global | Suffix | Segments | Example |
| --- | --- | --- | --- | --- | --- |
| `acmCertificate` | `.` |  |  | service+apex | `checkout-api.acme.com` |
| `acmCertificateTenant` | `.` |  |  | tenant+service+apex | `t-a3f8b2.checkout-api.acme.com` |
| `alb` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `apiGatewayHttpApi` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `apiGatewayKey` | `--` |  |  | org+domain+service+consumer | `acme--payments--checkout-api--partner-a` |
| `apiGatewayRestApi` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `apiGatewayStage` | `--` |  |  | env | `prod` |
| `appConfigApplication` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `appConfigEnvironment` | `--` |  |  | env | `prod` |
| `appConfigProfile` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `appSyncApi` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `appSyncDataSource` | `--` |  |  | org+domain+service+target | `acme--payments--checkout-api--user-table` |
| `athenaWorkgroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `autoScalingGroup` | `--` |  |  | org+domain+service | `acme--payments--checkout-api` |
| `backupPlan` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `backupVault` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `clientVpnEndpoint` | `--` |  |  | org+domain | `acme--payments` |
| `cloudFormationStack` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cloudFrontAlias` | `.` |  |  | service+apex | `checkout-api.acme.com` |
| `cloudFrontDistribution` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cloudFrontTenantAlias` | `.` |  |  | tenant+service+apex | `t-a3f8b2.checkout-api.acme.com` |
| `cloudFrontWildcardAlias` | `.` |  |  | apex | `*.acme.com` |
| `cloudMapNamespace` | `.` |  | `.local` | domain+org | `payments.acme.local` |
| `cloudMapService` | `-` |  |  | service | `checkout-api` |
| `cloudwatchAlarm` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cloudwatchCompositeAlarm` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cloudwatchDashboard` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cloudwatchLogMetricFilter` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cloudwatchLogsGroup` | `/` |  |  | default | `/acme/payments/checkout-api/orders` |
| `cloudwatchMetricNamespace` | `/` |  |  | org+domain | `acme/payments` |
| `cognitoIdentityPool` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cognitoUserPool` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `cognitoUserPoolClient` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `configAggregator` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `configRule` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `dynamoDb` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `dynamoDbGsi` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `ec2ElasticIp` | `--` |  |  | org+domain+service | `acme--payments--checkout-api` |
| `ec2Instance` | `--` |  |  | org+domain+service+kind+num | `acme--payments--checkout-api--private--01` |
| `ec2SecurityGroup` | `--` |  |  | org+domain+service+purpose | `acme--payments--checkout-api--web` |
| `ec2Volume` | `--` |  |  | org+domain+service+purpose | `acme--payments--checkout-api--web` |
| `ecr` | `/` |  |  | default | `acme/payments/checkout-api/orders` |
| `ecsCluster` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `ecsService` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `ecsTaskDefinition` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `eksAddon` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `eksCluster` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `eksFargateProfile` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `eksNodeGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `elastiCacheCluster` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `elastiCacheParameterGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `elastiCacheReplicationGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `eventBridgeBus` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `eventBridgeRule` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `glueCrawler` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `glueDatabase` | `_` |  |  | default | `acme_payments_checkout_api_orders` |
| `glueJob` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `iamPath` | `/` |  | `trailing /` | default | `/acme/payments/checkout-api/orders/` |
| `iamPolicy` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `iamRole` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `iamUser` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `k8sConfigMap` | `-` |  |  | service+key | `checkout-api-orders` |
| `k8sDeployment` | `-` |  |  | service | `checkout-api` |
| `k8sNamespace` | `-` |  |  | domain | `payments` |
| `k8sSecret` | `-` |  |  | service+key | `checkout-api-orders` |
| `k8sService` | `-` |  |  | service | `checkout-api` |
| `kafkaTopic` | `.` |  |  | default | `acme.payments.checkout-api.orders` |
| `kinesisStream` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `kmsAlias` | `/` |  |  | default | `acme/payments/checkout-api/orders` |
| `kmsKey` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `lambdaAlias` | `--` |  |  | env | `prod` |
| `lambdaFunction` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `lambdaLayer` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `launchTemplate` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `mskCluster` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `networkAcl` | `--` |  |  | org+domain | `acme--payments` |
| `openSearchDomain` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `openSearchIndex` | `--` |  |  | org+domain+entity+tenant | `acme--payments--transactions--t-a3f8b2` |
| `quickSightAnalysis` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `quickSightDashboard` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `quickSightDataset` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `rdsDbName` | `_` |  |  | default | `acme_payments_checkout_api_orders` |
| `rdsInstance` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `rdsParameterGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `rdsProxy` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `rdsSubnetGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `redshiftCluster` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `redshiftDatabase` | `_` |  |  | default | `acme_payments_checkout_api_orders` |
| `redshiftSubnetGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `route53ApexRecord` | `.` |  |  | apex | `acme.com` |
| `route53HostedZone` | `.` |  |  | apex | `acme.com` |
| `route53PrivateRecord` | `.` |  |  | service+apex | `checkout-api.acme.com` |
| `route53Record` | `.` |  |  | service+apex | `checkout-api.acme.com` |
| `route53TenantPrivateRecord` | `.` |  |  | tenant+service+apex | `t-a3f8b2.checkout-api.acme.com` |
| `route53TenantRecord` | `.` |  |  | tenant+service+apex | `t-a3f8b2.checkout-api.acme.com` |
| `route53WildcardRecord` | `.` |  |  | apex | `*.acme.com` |
| `routeTable` | `--` |  |  | org+domain+kind | `acme--payments--private` |
| `s3Bucket` | `--` | ✅ |  | default | `ap-southeast-2--prod--acme--payments--checkout-api--orders` |
| `s3KeyPrefix` | `/` |  |  | org+domain+service+tenant+partition | `acme/payments/checkout-api/t-a3f8b2/2024/01/15/14` |
| `s3LogKey` | `/` |  |  | default | `acme/payments/checkout-api/orders` |
| `s3ObjectKey` | `/` |  |  | default | `acme/payments/checkout-api/orders` |
| `s3ObjectName` | `--` |  |  | key | `orders` |
| `secretsManager` | `/` |  |  | default | `acme/payments/checkout-api/orders` |
| `securityHubInsight` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `serviceCatalogPortfolio` | `--` |  |  | org+domain | `acme--payments` |
| `serviceCatalogProduct` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `snsTopic` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `sqsDlq` | `--` |  | `--dlq` | default | `acme--payments--checkout-api--orders--dlq` |
| `sqsFifoQueue` | `--` |  | `.fifo` | default | `acme--payments--checkout-api--orders.fifo` |
| `sqsQueue` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `ssmDocument` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `ssmMaintenanceWindow` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `ssmParam` | `/` |  |  | default | `/acme/payments/checkout-api/orders` |
| `stepFunctions` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `subnet` | `--` |  |  | org+domain+kind+az | `acme--payments--private--1a` |
| `targetGroup` | `--` |  |  | org+domain+service+purpose | `acme--payments--checkout-api--web` |
| `transitGateway` | `--` |  |  | org | `acme` |
| `transitGatewayAttachment` | `--` |  |  | org+domain | `acme--payments` |
| `vpc` | `--` |  |  | org | `acme` |
| `vpcEndpoint` | `--` |  |  | org+domain+service | `acme--payments--checkout-api` |
| `vpcPeering` | `--` |  |  | org+target | `acme--user-table` |
| `wafIpSet` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `wafRuleGroup` | `--` |  |  | default | `acme--payments--checkout-api--orders` |
| `wafWebAcl` | `--` |  |  | org+domain+service | `acme--payments--checkout-api` |
| `xraySamplingRule` | `--` |  |  | default | `acme--payments--checkout-api--orders` |

## Registering a custom type

If a type isn't listed, register it instead of hand-building the string:

```typescript
DerropsConventions.registerResourceType('myQueue', {
  global: false, segmentDelimiter: '--', wordDelimiter: '-',
  iamService: 'sqs',
  arn: { service: 'sqs', includeRegion: true, includeAccount: true },
  permissions: { read: ['sqs:ReceiveMessage'], readWrite: ['sqs:ReceiveMessage','sqs:SendMessage'], manage: ['sqs:*'] },
})
```

