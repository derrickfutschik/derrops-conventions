import type { Segments, ResourceTypeConfig } from './types.js'
import { RESOURCE_TYPES } from './resource-types.js'
import type { ResourceType } from './resource-types.js'
import { StaticPolicyBuilder } from './policy/StaticPolicyBuilder.js'
import { DynamicPolicySession } from './policy/DynamicPolicySession.js'
import { ResourceImpl } from './policy/Resource.js'
import type { Resource } from './policy/Resource.js'
import { buildPolicyArns } from './policy/arn.js'
import type { ArnContext } from './policy/types.js'
import { buildConsoleUrl } from './console.js'
import type { ConventionsContext } from './conventions-context.js'
import { applyTagKeyCasing } from './conventions-constants.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNameOptions = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildStaticPolicy(
  ctx: ConventionsContext,
  context: Partial<ArnContext> | undefined,
  nameForType: (type: ResourceType, nameOptions: AnyNameOptions) => string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): StaticPolicyBuilder<any> {
  const resolved = ctx.resolveArnCtx(context)
  return new StaticPolicyBuilder(nameForType, resolved, ctx.segments() as Segments)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildDynamicPolicy(
  ctx: ConventionsContext,
  context: Partial<ArnContext> | undefined,
  nameFn: (options: AnyNameOptions) => string,
  defaultTypeFn: () => ResourceType | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): DynamicPolicySession<any> {
  const resolved = ctx.resolveArnCtx(context)
  return new DynamicPolicySession(nameFn, resolved, ctx.segments() as Segments, defaultTypeFn)
}

export function buildResource(
  ctx: ConventionsContext,
  options: AnyNameOptions,
): Resource<ResourceType> {
  const { type: explicitType, ...segmentOverrides } = options as { type?: ResourceType } & Segments
  const resolvedType = explicitType ?? ctx.defaultResourceType()
  if (!resolvedType) {
    throw new Error(
      'resource() requires a "type" — either pass it directly or set a default via .with({ type })',
    )
  }
  const config: ResourceTypeConfig = RESOURCE_TYPES[resolvedType]
  const arnContext = ctx.resolveArnCtx()
  const resourceName = ctx.name(options)
  const logicalName = ctx.name({ ...options, org: undefined })
  const arns = config.arn ? buildPolicyArns(resourceName, config.arn, arnContext) : []
  const usedSegments = ctx.namedSegments(options)
  const tags = ctx.tags({ type: resolvedType, ...segmentOverrides })

  // Emit a tag for every segment that went into the name, not just TagKey ones.
  // Skip segments already tagged (TagKey ones set by buildTags) so tagRule overrides win.
  const prefix = ctx.tagKeyPrefix()
  const casing = ctx.tagCasing()
  for (const [key, value] of Object.entries(usedSegments)) {
    const tagKey = prefix + applyTagKeyCasing(key, casing)
    if (!(tagKey in tags)) tags[tagKey] = value
  }
  // Override segment tag with the exact keys from the name — ground truth.
  const segmentTagKey = prefix + applyTagKeyCasing('segment', casing)
  tags[segmentTagKey] = Object.keys(usedSegments).join(config.segmentDelimiter)

  const merged: Segments = { ...ctx.segments(), ...segmentOverrides }
  const zone = ctx.resolveApex(merged)
  const dns =
    zone && config.consoleLabel
      ? [merged.key, merged.service]
          .filter((v): v is string => Boolean(v))
          .concat(config.consoleLabel, zone)
          .join('.')
      : undefined
  const consoleUrl = arns[0]
    ? buildConsoleUrl(resolvedType, {
        name: resourceName,
        region: merged.region ?? arnContext.region,
        accountId: arnContext.accountId,
        arn: arns[0],
      })
    : undefined

  return new ResourceImpl(
    resourceName,
    logicalName,
    arns,
    resolvedType,
    tags,
    config,
    dns,
    consoleUrl,
    usedSegments,
  )
}
