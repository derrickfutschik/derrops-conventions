import { RESOURCE_TYPES } from './resource-types.js'
import type { ResourceType } from './resource-types.js'
import type { ResourceTypeConfig } from './types.js'
import { PolicyBuilder } from './policy/PolicyBuilder.js'
import type { ConventionsContext } from './conventions-context.js'

export function buildDependencies(ctx: ConventionsContext): {
  nodes: ConventionsContext[]
  edges: Array<{
    from: ConventionsContext
    owner: ConventionsContext
    resources: ResourceType[]
  }>
} {
  const visited = new Set<ConventionsContext>()
  const queue: ConventionsContext[] = [ctx]
  const nodes: ConventionsContext[] = []
  const edges: Array<{
    from: ConventionsContext
    owner: ConventionsContext
    resources: ResourceType[]
  }> = []

  while (queue.length > 0) {
    const node = queue.shift()!
    if (visited.has(node)) continue
    visited.add(node)
    nodes.push(node)
    for (const dep of node._getDeps()) {
      edges.push({ from: node, owner: dep.owner, resources: dep.resources })
      if (!visited.has(dep.owner)) queue.push(dep.owner)
    }
  }

  return { nodes, edges }
}

export function buildPolicyFor(ctx: ConventionsContext, caller: ConventionsContext): PolicyBuilder {
  const callerDeps = caller._getDeps().filter((d) => d.owner === ctx)
  const builder = new PolicyBuilder()

  for (const dep of callerDeps) {
    for (const type of dep.resources) {
      const config = RESOURCE_TYPES[type]
      if (
        !(config as ResourceTypeConfig | undefined)?.arn ||
        !(config as ResourceTypeConfig | undefined)?.permissions
      )
        continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = ctx.resource({ type } as any)
        builder.allow(res.read())
      } catch {
        // Skip resource types that cannot be resolved (missing required segments)
      }
    }
  }

  return builder
}
