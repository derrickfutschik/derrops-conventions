import type { ArnConfig } from '../types.js'
import type { ArnContext } from './types.js'

/**
 * Construct an AWS ARN from a resource name, ARN config, and context.
 *
 * Always produces exactly 5 colons (6 components). When `includeRegion` or `includeAccount`
 * is false the corresponding component is an empty string — yielding the correct AWS format
 * for global services (e.g. `arn:aws:s3:::bucket-name` or `arn:aws:iam::123:role/path`).
 */
export function buildArn(resourceName: string, arnConfig: ArnConfig, context: ArnContext): string {
  const partition = context.partition ?? 'aws'
  const region = arnConfig.includeRegion ? (context.region ?? '') : ''
  const account = arnConfig.includeAccount ? (context.accountId ?? '') : ''
  const resource = `${arnConfig.resourcePrefix ?? ''}${resourceName}${arnConfig.resourceSuffix ?? ''}`
  return `arn:${partition}:${arnConfig.service}:${region}:${account}:${resource}`
}

/**
 * Build all ARNs needed for a policy `Resource` field.
 *
 * Returns `[arn]` in the common case. When `arnConfig.policyResourceSuffix` is set, returns
 * `[arn, arn + policyResourceSuffix]` — used for S3 buckets where `s3:ListBucket` targets
 * the bucket ARN and `s3:GetObject` / `s3:PutObject` target `bucket/*`.
 */
export function buildPolicyArns(
  resourceName: string,
  arnConfig: ArnConfig,
  context: ArnContext,
): string[] {
  const base = buildArn(resourceName, arnConfig, context)
  if (arnConfig.policyResourceSuffix) {
    return [base, `${base}${arnConfig.policyResourceSuffix}`]
  }
  return [base]
}
