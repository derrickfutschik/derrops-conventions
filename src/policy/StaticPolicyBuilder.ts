import type { PermissionLevel, ResourceTypeConfig, SegmentConstraints, Segments } from '../types.js'
import { RESOURCE_TYPES } from '../resource-types.js'
import type { ResourceType } from '../resource-types.js'

function getConfig(type: ResourceType): ResourceTypeConfig {
  return RESOURCE_TYPES[type] as ResourceTypeConfig
}
import { buildArn, buildPolicyArns } from './arn.js'
import type { ArnContext, PolicyDocument, PolicyStatement } from './types.js'

type Effect = 'Allow' | 'Deny'

interface IncludedResource {
  type: ResourceType
  arn: string
  arns: string[]
  permissions?: PermissionLevel
  effect?: Effect
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
 * Builds IAM policy documents by declaring which resource types to include, using the
 * convention's segments to generate ARNs.
 *
 * Create via `conventions.staticPolicy(context)`.
 */
export class StaticPolicyBuilder<C extends SegmentConstraints = {}> {
  private readonly getArn: (type: ResourceType, nameOptions: Record<string, unknown>) => string
  private readonly context: ArnContext
  private readonly defaults: Segments
  private readonly included: IncludedResource[] = []
  private readonly seenArns = new Set<string>()
  private conditions: Record<string, Record<string, string | string[]>> = {}

  constructor(
    getArn: (type: ResourceType, nameOptions: Record<string, unknown>) => string,
    context: ArnContext,
    defaults: Segments = {},
  ) {
    this.getArn = getArn
    this.context = context
    this.defaults = defaults
  }

  /**
   * Add a condition block applied to every statement in the generated policy.
   * Multiple calls are merged — later calls win on key conflicts within the same operator.
   */
  withCondition(condition: Record<string, Record<string, string | string[]>>): this {
    for (const [op, kvs] of Object.entries(condition)) {
      this.conditions[op] = { ...(this.conditions[op] ?? {}), ...kvs }
    }
    return this
  }

  /**
   * Scope all policy statements to resources tagged with the tenant ID already set on the
   * convention instance. Pass an explicit `tenantId` only to override.
   *
   * Reads `tenant` from the convention's segment defaults so the value never needs to be
   * repeated at the call site. Throws if no tenant is resolvable.
   *
   * Requires that every resource is tagged with `tenant: {tenantId}` at provisioning time.
   */
  withTenantAbac(tenantId?: string): this {
    const id = tenantId ?? this.defaults.tenant
    if (!id)
      throw new Error(
        'withTenantAbac: no tenant value found — set one via .with({ tenant }) or pass it explicitly',
      )
    return this.withCondition({ StringEquals: { 'aws:ResourceTag/tenant': id } })
  }

  /**
   * Declare a resource type to include in the policy. The convention's segments are used
   * to generate the ARN; `options` can supply additional or overriding segment values.
   *
   * If `policyOptions.permissions` is set, the curated action set from the resource type's
   * metadata is used in `buildPolicy()`. Otherwise, fall back to `actionsFor` in `buildPolicy()`.
   *
   * `policyOptions.effect` overrides the global `effect` in `buildPolicy()` for this resource.
   *
   * Throws if the resource type has no ARN configuration.
   * Duplicate ARNs (same type + same resolved name) are silently deduplicated.
   */
  include<TType extends ResourceType>(
    type: TType,
    options?: Record<string, unknown>,
    policyOptions?: { permissions?: PermissionLevel; effect?: Effect },
  ): this {
    const config = getConfig(type)
    if (!config.arn) {
      throw new Error(
        `Resource type "${type}" has no ARN configuration and cannot be used as a policy target.`,
      )
    }
    const nameOptions = { ...(options ?? {}), type }
    const resourceName = this.getArn(type, nameOptions)
    const arn = buildArn(resourceName, config.arn, this.context)
    if (!this.seenArns.has(arn)) {
      this.seenArns.add(arn)
      const arns = buildPolicyArns(resourceName, config.arn, this.context)
      this.included.push({
        type,
        arn,
        arns,
        permissions: policyOptions?.permissions,
        effect: policyOptions?.effect,
      })
    }
    return this
  }

  /**
   * Generate the IAM policy document from all declared resources.
   *
   * Action resolution per resource (in order):
   * 1. `permissions` set on `.include()` → uses `ResourceTypeConfig.permissions[level]`
   * 2. `actionsFor[type]` if provided → uses those actions
   * 3. No match → resource is omitted; throws when `strict: true`
   *
   * `effect` applies to all statements; per-resource `effect` from `.include()` takes precedence.
   */
  buildPolicy(options?: {
    effect?: Effect
    actionsFor?: Partial<Record<ResourceType, string[]>>
    additionalStatements?: PolicyStatement[]
    strict?: boolean
  }): PolicyDocument {
    const effect: Effect = options?.effect ?? 'Allow'
    const statements: PolicyStatement[] = []

    for (const resource of this.included) {
      const config = getConfig(resource.type)
      const actions = resolveActions(
        resource.type,
        config,
        resource.permissions,
        options?.actionsFor,
      )
      if (!actions || actions.length === 0) {
        if (options?.strict) {
          throw new Error(
            `Resource type "${resource.type}" (ARN: ${resource.arn}) has no resolvable actions. ` +
              `Set permissions on .include() or provide actionsFor["${resource.type}"] in buildPolicy().`,
          )
        }
        continue
      }

      const resourceField = resource.arns.length === 1 ? resource.arns[0]! : resource.arns
      const stmt: PolicyStatement = {
        Effect: resource.effect ?? effect,
        Action: actions.length === 1 ? actions[0]! : actions,
        Resource: resourceField,
      }
      if (Object.keys(this.conditions).length > 0) {
        stmt.Condition = { ...this.conditions }
      }
      statements.push(stmt)
    }

    if (options?.additionalStatements) {
      statements.push(...options.additionalStatements)
    }

    return { Version: '2012-10-17', Statement: statements }
  }
}
