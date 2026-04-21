import type { PermissionLevel, ResourceTypeConfig, SegmentConstraints } from '../types.js'
import { RESOURCE_TYPES } from '../resource-types.js'
import type { ResourceType } from '../resource-types.js'

function getConfig(type: ResourceType): ResourceTypeConfig {
  return RESOURCE_TYPES[type] as ResourceTypeConfig
}
import { buildArn, buildPolicyArns } from './arn.js'
import type { ArnContext, PolicyDocument, PolicyStatement } from './types.js'

export interface RecordedResource {
  type: ResourceType
  name: string
  /** Canonical base ARN. `null` when the resource type has no ARN configuration — silently skipped in `buildPolicy()`. */
  arn: string | null
  /** Permission tier set at record time via `name()` `policyOptions` argument. */
  permissions?: PermissionLevel
}

function resolveActions(
  type: ResourceType,
  config: ResourceTypeConfig,
  permissions: PermissionLevel | undefined,
  actionsFor: Partial<Record<ResourceType, string[]>> | undefined,
): string[] | undefined {
  if (permissions) {
    return config.permissions?.[permissions]
  }
  return actionsFor?.[type]
}

/**
 * Records every `.name()` call and builds an IAM policy document from all recorded resources.
 *
 * Create via `conventions.dynamicPolicy(context)`.
 */
export class DynamicPolicySession<C extends SegmentConstraints = {}> {
  private readonly callName: (options: Record<string, unknown>) => string
  private readonly context: ArnContext
  private readonly recorded: RecordedResource[] = []
  private readonly seenArns = new Set<string>()

  constructor(callName: (options: Record<string, unknown>) => string, context: ArnContext) {
    this.callName = callName
    this.context = context
  }

  /**
   * Generate a resource name — identical to `DerropsConventions.name()` — and record the
   * result along with its ARN for later use in `buildPolicy()`.
   *
   * If `policyOptions.permissions` is provided, that tier's curated action set is used when
   * building the policy. Otherwise, fall back to `actionsFor` in `buildPolicy()`.
   *
   * Duplicate ARNs (same type + same resolved name) are silently deduplicated.
   */
  name(
    options: { type: ResourceType } & Record<string, unknown>,
    policyOptions?: { permissions?: PermissionLevel },
  ): string {
    const result = this.callName(options)
    const resolvedType = options.type
    const config = getConfig(resolvedType)
    const arn = config.arn ? buildArn(result, config.arn, this.context) : null

    if (arn === null || !this.seenArns.has(arn)) {
      if (arn !== null) this.seenArns.add(arn)
      this.recorded.push({ type: resolvedType, name: result, arn, permissions: policyOptions?.permissions })
    }

    return result
  }

  /** All recorded resources, including those with `arn: null`. */
  recordedResources(): RecordedResource[] {
    return [...this.recorded]
  }

  /**
   * Generate the IAM policy document from all recorded resources.
   *
   * Action resolution per resource (in order):
   * 1. `permissions` set on `.name()` call → uses `ResourceTypeConfig.permissions[level]`
   * 2. `actionsFor[type]` if provided → uses those actions
   * 3. No match → resource is silently omitted
   *
   * Resources with no ARN configuration are always skipped.
   */
  buildPolicy(options?: {
    effect?: 'Allow' | 'Deny'
    actionsFor?: Partial<Record<ResourceType, string[]>>
    additionalStatements?: PolicyStatement[]
  }): PolicyDocument {
    const effect = options?.effect ?? 'Allow'
    const statements: PolicyStatement[] = []

    for (const resource of this.recorded) {
      if (resource.arn === null) continue
      const config = getConfig(resource.type)
      const actions = resolveActions(resource.type, config, resource.permissions, options?.actionsFor)
      if (!actions || actions.length === 0) continue

      const arns = buildPolicyArns(resource.name, config.arn!, this.context)
      const resourceField = arns.length === 1 ? arns[0]! : arns
      statements.push({
        Effect: effect,
        Action: actions.length === 1 ? actions[0]! : actions,
        Resource: resourceField,
      })
    }

    if (options?.additionalStatements) {
      statements.push(...options.additionalStatements)
    }

    return { Version: '2012-10-17', Statement: statements }
  }
}
