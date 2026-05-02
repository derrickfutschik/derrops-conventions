import type { CostExplorerFilter } from './types.js'
import { applyTagKeyCasing } from './conventions-constants.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildCostFilter(ctx: ConventionsContext): CostExplorerFilter {
  const tagDict = ctx.tags()
  const and = Object.entries(tagDict)
    .filter(([k]) => {
      const base = k.includes(':') ? k.split(':').pop()! : k
      const norm = base.toLowerCase().replace(/[-_]/g, '')
      return ![
        'segment',
        's3prefixsegment',
        's3objectnamesegment',
        'segmentvalues',
        's3prefixsegmentvalues',
        's3objectnamesegmentvalues',
      ].includes(norm)
    })
    .map(([key, value]) => ({
      Tags: { Key: key, Values: [value], MatchOptions: ['EQUALS'] },
    }))
  return { And: and }
}

export function buildBudgetName(ctx: ConventionsContext): string {
  const segs = ctx.segments()
  const parts = (['org', 'domain', 'service', 'env'] as const)
    .map((k) => segs[k])
    .filter((v): v is string => v !== undefined)
  return parts.join('--')
}

export function buildCostAllocationTags(ctx: ConventionsContext): string[] {
  return ctx.visibleTagKeys().map((k) => ctx.tagKeyPrefix() + applyTagKeyCasing(k, ctx.tagCasing()))
}
