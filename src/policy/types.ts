/**
 * A resolved pair of ARNs + actions produced by `Resource.read()`, `.write()`, `.manage()`,
 * or `.raw()`. Passed to `PolicyBuilder.allow()` / `.deny()` for statement construction.
 */
export interface GrantDescriptor {
  readonly arns: string[]
  readonly actions: string[]
}

/**
 * Context for ARN construction. Set once on a `DerropsConventions` instance via `.arnContext()`
 * and/or provided (or overridden) when calling `.staticPolicy()` / `.dynamicPolicy()`.
 *
 * Note: `partition` here is the AWS partition (`'aws'`, `'aws-cn'`, `'aws-us-gov'`) — entirely
 * separate from the naming segment `'partition'` (used for data partitions like date shards).
 */
export interface ArnContext {
  /** AWS partition — defaults to `'aws'`. */
  partition?: string
  /** AWS region — sourced from instance segments when omitted. */
  region?: string
  /** 12-digit AWS account ID. Required at ARN resolution time. */
  accountId?: string
}

export interface PolicyStatement {
  Effect: 'Allow' | 'Deny'
  Action?: string | string[]
  NotAction?: string | string[]
  Resource?: string | string[]
  NotResource?: string | string[]
  Principal?: string | string[] | Record<string, string | string[]>
  NotPrincipal?: string | string[] | Record<string, string | string[]>
  Condition?: Record<string, Record<string, string | string[]>>
  Sid?: string
}

export interface PolicyDocument {
  Version: '2012-10-17'
  Statement: PolicyStatement[]
}
