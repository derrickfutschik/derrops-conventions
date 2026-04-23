import type { GrantDescriptor, PolicyDocument, PolicyStatement } from './types.js'

type Effect = 'Allow' | 'Deny'

interface PendingGrant {
  effect: Effect
  descriptor: GrantDescriptor
}

/**
 * Produces a `GrantDescriptor` for use with `PolicyBuilder.allow()` / `.deny()` when the
 * resource cannot be expressed as a `Resource` object — e.g. wildcard targets for services
 * like CloudWatch metrics where the IAM resource must be `'*'`.
 *
 * @example
 * policy.allow(rawGrant(['cloudwatch:PutMetricData', 'cloudwatch:PutMetricAlarm'], '*'))
 */
export function rawGrant(actions: string[], ...arns: string[]): GrantDescriptor {
  if (actions.length === 0) throw new Error('rawGrant() requires at least one action.')
  if (arns.length === 0) throw new Error('rawGrant() requires at least one ARN (or "*").')
  return { arns, actions }
}

/**
 * Builds IAM policy documents from `GrantDescriptor` objects produced by
 * `Resource.read()`, `.write()`, `.manage()`, or `.raw()`.
 *
 * Grants with **identical resolved action lists and the same effect** are automatically merged
 * into a single `Statement` with multiple `Resource` entries — e.g. two DynamoDB tables with
 * `.read()` produce one statement, not two.
 *
 * Create via `conventions.policyBuilder()` or `new PolicyBuilder()` directly.
 *
 * @example
 * const table1 = c.resource({ type: 'dynamoDb', key: 'orders' })
 * const table2 = c.resource({ type: 'dynamoDb', key: 'sessions' })
 * const bucket = c.resource({ type: 's3Bucket', key: 'uploads' })
 *
 * const doc = c.policyBuilder()
 *   .allow(table1.read(), table2.read())  // merged into one statement
 *   .allow(bucket.write())
 *   .deny(table1.manage())
 *   .build()
 */
export class PolicyBuilder {
  private readonly pending: PendingGrant[] = []

  /**
   * Add one or more Allow grants. Multiple grants with the same resolved action list are
   * merged into a single statement at `build()` time.
   */
  allow(...grants: GrantDescriptor[]): this {
    for (const descriptor of grants) {
      this.pending.push({ effect: 'Allow', descriptor })
    }
    return this
  }

  /**
   * Add one or more Deny grants. Deny grants are merged separately from Allow grants
   * even when the action lists are identical.
   */
  deny(...grants: GrantDescriptor[]): this {
    for (const descriptor of grants) {
      this.pending.push({ effect: 'Deny', descriptor })
    }
    return this
  }

  /**
   * Generate the IAM policy document. Grants with identical action sets and the same effect
   * are combined into one statement. Order of statements follows insertion order of unique
   * action groups.
   */
  build(options?: { additionalStatements?: PolicyStatement[] }): PolicyDocument {
    // Preserve insertion order of unique groups via a Map keyed by effect + sorted actions.
    const groups = new Map<
      string,
      { effect: Effect; actions: string[]; arns: string[]; seenArns: Set<string> }
    >()

    for (const { effect, descriptor } of this.pending) {
      const sortedActions = [...descriptor.actions].sort()
      const key = `${effect}::${JSON.stringify(sortedActions)}`

      if (!groups.has(key)) {
        groups.set(key, { effect, actions: sortedActions, arns: [], seenArns: new Set() })
      }

      const group = groups.get(key)!
      for (const arn of descriptor.arns) {
        if (!group.seenArns.has(arn)) {
          group.seenArns.add(arn)
          group.arns.push(arn)
        }
      }
    }

    const statements: PolicyStatement[] = []

    for (const { effect, actions, arns } of groups.values()) {
      statements.push({
        Effect: effect,
        Action: actions.length === 1 ? actions[0]! : actions,
        Resource: arns.length === 1 ? arns[0]! : arns,
      })
    }

    if (options?.additionalStatements) {
      statements.push(...options.additionalStatements)
    }

    return { Version: '2012-10-17', Statement: statements }
  }
}
