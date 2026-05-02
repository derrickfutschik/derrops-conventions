import type { TenantManifest, TenantResource } from './types.js'
import type { ResourceType } from './resource-types.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildTenantManifest(
  ctx: ConventionsContext,
  tenantId: string,
  resourceTypes: ResourceType[],
): TenantManifest {
  const tenanted = ctx.for({ tenant: tenantId })
  const resources: TenantResource[] = resourceTypes.map((type) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = tenanted.name({ type } as any)
    let arn: string | undefined
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      arn = tenanted.resource({ type } as any).arn
    } catch {
      arn = undefined
    }
    const tags = tenanted.tags()
    return { type, name, arn, tags }
  })

  return {
    tenantId,
    resources,
    diff(existing: TenantManifest) {
      const existingByType = new Map(existing.resources.map((r) => [r.type, r]))
      const currentByType = new Map(resources.map((r) => [r.type, r]))
      const added: TenantResource[] = []
      const removed: TenantResource[] = []
      const unchanged: TenantResource[] = []
      for (const r of resources) {
        if (!existingByType.has(r.type)) added.push(r)
        else unchanged.push(r)
      }
      for (const r of existing.resources) {
        if (!currentByType.has(r.type)) removed.push(r)
      }
      return { added, removed, unchanged }
    },
  }
}
