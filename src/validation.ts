import type { ValidationResult, LintReport, ParsedSegments, SegmentKey } from './types.js'
import type { ResourceType } from './resource-types.js'
import { parseResourceName } from './parsing.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildValidate(
  ctx: ConventionsContext,
  name: string,
  type: ResourceType,
): ValidationResult {
  let parsed: ParsedSegments = {}
  const errors: string[] = []

  try {
    parsed = parseResourceName(name, type)
  } catch (e) {
    errors.push(`parse error: ${(e as Error).message}`)
    return { valid: false, errors, parsed, type }
  }

  for (const [key, knownValue] of Object.entries(ctx.segments()) as [
    keyof typeof parsed,
    string,
  ][]) {
    const parsedValue = parsed[key as SegmentKey]
    if (parsedValue !== undefined && parsedValue !== knownValue) {
      errors.push(`segment "${key}": expected "${knownValue}", got "${parsedValue}"`)
    }
  }

  return { valid: errors.length === 0, errors, parsed, type }
}

export function buildLint(
  ctx: ConventionsContext,
  names: Partial<Record<ResourceType, string>>,
): LintReport {
  const passed: ValidationResult[] = []
  const failed: ValidationResult[] = []
  for (const [type, name] of Object.entries(names) as [ResourceType, string][]) {
    const result = buildValidate(ctx, name, type)
    ;(result.valid ? passed : failed).push(result)
  }
  return { passed, failed, summary: `${passed.length}/${passed.length + failed.length} passed` }
}
