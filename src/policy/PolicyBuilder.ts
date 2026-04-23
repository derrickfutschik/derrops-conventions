import type { GrantDescriptor, IamCondition, PolicyDocument, PolicyStatement } from './types.js'

type Effect = 'Allow' | 'Deny'

interface PendingGrant {
  effect: Effect
  descriptor: GrantDescriptor
}

// ── Condition helpers ─────────────────────────────────────────────────────────

/**
 * Attach an IAM condition to an existing `GrantDescriptor`. Returns a new descriptor;
 * the original is not mutated.
 *
 * Multiple conditions on the same operator key are merged (keys within an operator are
 * combined, later values win on key conflicts). Conditions with different operators are
 * additive — IAM ANDs them.
 *
 * @example
 * .allow(withCondition(table.read(), tagCondition('aws:ResourceTag/slaops:tenant', tenantId)))
 */
export function withCondition(grant: GrantDescriptor, condition: IamCondition): GrantDescriptor {
  const merged: Record<string, Record<string, string | string[]>> = {}
  for (const [op, vals] of Object.entries(grant.condition ?? {})) {
    merged[op] = { ...vals }
  }
  for (const [op, vals] of Object.entries(condition)) {
    merged[op] = { ...(merged[op] ?? {}), ...vals }
  }
  return { arns: grant.arns, actions: grant.actions, condition: merged }
}

/**
 * Build an IAM `StringEquals` condition that matches a specific tag key/value pair.
 *
 * Use `'aws:ResourceTag/...'` to restrict based on the resource's tags,
 * `'aws:PrincipalTag/...'` to restrict based on the caller's session tags,
 * or a bare key for service-specific condition keys.
 *
 * @example
 * // Only allow access when the resource has slaops:tenant = 't-abc123'
 * withCondition(domain.read(), tagCondition('aws:ResourceTag/slaops:tenant', 't-abc123'))
 */
export function tagCondition(tagKey: string, value: string): IamCondition {
  return { StringEquals: { [tagKey]: value } }
}

/**
 * Build an IAM `StringEquals` condition for attribute-based access control (ABAC):
 * the resource's tag must equal the caller's principal session tag of the same key.
 *
 * When attached to a policy for a role that has a session tag `slaops:tenant = t-abc123`,
 * only resources tagged `slaops:tenant = t-abc123` are accessible — no per-tenant policy
 * needed.
 *
 * @example
 * // Lambda role tagged slaops:tenant=t-abc123 can only access tables tagged the same way
 * withCondition(table.read(), sessionTagCondition('slaops:tenant'))
 * // → Condition: StringEquals { 'aws:ResourceTag/slaops:tenant': '${aws:PrincipalTag/slaops:tenant}' }
 */
export function sessionTagCondition(tagKey: string): IamCondition {
  return {
    StringEquals: {
      [`aws:ResourceTag/${tagKey}`]: `\${aws:PrincipalTag/${tagKey}}`,
    },
  }
}

/**
 * Build an IAM `StringLike` condition that restricts S3 access to a specific key prefix.
 * Emits two patterns: the exact prefix itself and `prefix/*` to cover all objects beneath it.
 *
 * Attach to a grant on an S3 bucket resource to scope access to a tenant's data in a
 * pool-model (shared) bucket.
 *
 * @example
 * // Tenant can only list/get/put objects under their own prefix
 * withCondition(bucket.write(), s3PrefixCondition('t-abc123'))
 * // → Condition: StringLike { 's3:prefix': ['t-abc123', 't-abc123/*'] }
 */
export function s3PrefixCondition(prefix: string): IamCondition {
  return { StringLike: { 's3:prefix': [prefix, `${prefix}/*`] } }
}

// ── Raw grant ─────────────────────────────────────────────────────────────────

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

// ── PolicyBuilder ─────────────────────────────────────────────────────────────

/**
 * Builds IAM policy documents from `GrantDescriptor` objects produced by
 * `Resource.read()`, `.write()`, `.manage()`, or `.raw()`.
 *
 * Grants with **identical resolved action lists, the same effect, and the same condition**
 * are automatically merged into a single `Statement` with multiple `Resource` entries.
 * Grants with different conditions always produce separate statements.
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
   * Add one or more Allow grants. Grants with the same action list and condition are
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
   * Generate the IAM policy document. Grants with identical action sets, the same effect,
   * and the same condition are combined into one statement. Order of statements follows
   * insertion order of unique groups.
   */
  build(options?: { additionalStatements?: PolicyStatement[] }): PolicyDocument {
    const groups = new Map<
      string,
      {
        effect: Effect
        actions: string[]
        condition: IamCondition | undefined
        arns: string[]
        seenArns: Set<string>
      }
    >()

    for (const { effect, descriptor } of this.pending) {
      const sortedActions = [...descriptor.actions].sort()
      const conditionKey = descriptor.condition
        ? JSON.stringify(sortedObjectKeys(descriptor.condition))
        : ''
      const key = `${effect}::${JSON.stringify(sortedActions)}::${conditionKey}`

      if (!groups.has(key)) {
        groups.set(key, {
          effect,
          actions: sortedActions,
          condition: descriptor.condition,
          arns: [],
          seenArns: new Set(),
        })
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

    for (const { effect, actions, condition, arns } of groups.values()) {
      const stmt: PolicyStatement = {
        Effect: effect,
        Action: actions.length === 1 ? actions[0]! : actions,
        Resource: arns.length === 1 ? arns[0]! : arns,
      }
      if (condition) stmt.Condition = condition
      statements.push(stmt)
    }

    if (options?.additionalStatements) {
      statements.push(...options.additionalStatements)
    }

    return { Version: '2012-10-17', Statement: statements }
  }
}

function sortObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

function sortedObjectKeys(
  condition: IamCondition,
): Record<string, Record<string, string | string[]>> {
  return Object.fromEntries(
    Object.entries(condition)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([op, vals]) => [op, sortObjectKeys(vals)]),
  )
}
