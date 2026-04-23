export { StaticPolicyBuilder } from './StaticPolicyBuilder.js'
export { DynamicPolicySession } from './DynamicPolicySession.js'
export type { RecordedResource } from './DynamicPolicySession.js'
export type {
  ArnContext,
  PolicyDocument,
  PolicyStatement,
  GrantDescriptor,
  IamCondition,
} from './types.js'
export type { Resource } from './Resource.js'
export {
  PolicyBuilder,
  rawGrant,
  withCondition,
  tagCondition,
  sessionTagCondition,
  s3PrefixCondition,
} from './PolicyBuilder.js'
export { buildArn, buildPolicyArns } from './arn.js'
