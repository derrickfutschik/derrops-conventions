import type { Segments } from './types.js'
import type { SqsPair } from './policy/Resource.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildEksResource(
  ctx: ConventionsContext,
  options?: {
    nodeGroupPurpose?: string
    key?: string
  },
): {
  cluster: string
  namespace: string
  deployment: string
  service: string
  nodeGroup: string | undefined
  configMap: string | undefined
  secret: string | undefined
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object) => ctx.name(opts as any)
  return {
    cluster: n({ type: 'eksCluster' }),
    namespace: n({ type: 'k8sNamespace' }),
    deployment: n({ type: 'k8sDeployment' }),
    service: n({ type: 'k8sService' }),
    nodeGroup: options?.nodeGroupPurpose
      ? n({ type: 'eksNodeGroup', purpose: options.nodeGroupPurpose })
      : undefined,
    configMap: options?.key ? n({ type: 'k8sConfigMap', key: options.key }) : undefined,
    secret: options?.key ? n({ type: 'k8sSecret', key: options.key }) : undefined,
  }
}

export function buildCloudMapResource(ctx: ConventionsContext): {
  namespace: string
  service: string
  fqdn: string
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object) => ctx.name(opts as any)
  const namespace = n({ type: 'cloudMapNamespace' })
  const service = n({ type: 'cloudMapService' })
  return { namespace, service, fqdn: `${service}.${namespace}` }
}

export function buildSqsPair(ctx: ConventionsContext, options: Segments): SqsPair {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = ctx.resource({ ...options, type: 'sqsQueue' } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dlq = ctx.resource({ ...options, type: 'sqsDlq' } as any)
  return { queue, dlq, redrivePolicyArn: dlq.arn }
}

export function buildCfnExport(ctx: ConventionsContext, exportKey: string): string {
  const segs = ctx.segments()
  const parts = (['org', 'domain', 'service'] as const)
    .map((k) => segs[k])
    .filter((v): v is string => v !== undefined && v.length > 0)
  parts.push(exportKey.toLowerCase().replace(/\s+/g, '-'))
  return parts.join('--')
}
