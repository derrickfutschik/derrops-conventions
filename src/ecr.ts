import type { ConventionsContext } from './conventions-context.js'

export function buildImageTag(ctx: ConventionsContext): string {
  const { env, version, key } = ctx.segments()
  return [env, version, key].filter((v): v is string => v !== undefined && v.length > 0).join('--')
}

export function buildEcrUri(ctx: ConventionsContext): string {
  const arnCtx = ctx.arnContextValue()
  const accountId = arnCtx?.accountId
  const segs = ctx.segments()
  const region = segs.region
  if (!accountId) {
    throw new Error('ecrUri() requires accountId — set it via .arnContext({ accountId })')
  }
  if (!region) {
    throw new Error(
      'ecrUri() requires region — set it as a segment default via .with({ region }) or in the constructor',
    )
  }
  const { org, domain, service } = segs
  const repo = [org, domain, service]
    .filter((v): v is string => v !== undefined && v.length > 0)
    .join('/')
  const tag = buildImageTag(ctx)
  const registry = `${accountId}.dkr.ecr.${region}.amazonaws.com`
  return tag ? `${registry}/${repo}:${tag}` : `${registry}/${repo}`
}
