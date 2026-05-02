import type { ConventionsContext } from './conventions-context.js'

export function buildOrgNetworkLayer(ctx: ConventionsContext): {
  vpc: string
  transitGateway: string
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object) => ctx.name(opts as any)
  return {
    vpc: n({ type: 'vpc' }),
    transitGateway: n({ type: 'transitGateway' }),
  }
}

export function buildDomainNetworkLayer(
  ctx: ConventionsContext,
  azs: string[],
  kinds: string[] = ['private', 'public', 'isolated'],
): {
  subnets: Record<string, string[]>
  nacl: string
  routeTables: Record<string, string>
  tgwAttachment: string
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object) => ctx.name(opts as any)
  const subnets: Record<string, string[]> = {}
  const routeTables: Record<string, string> = {}
  for (const kind of kinds) {
    subnets[kind] = azs.map((az) => n({ type: 'subnet', kind, az }))
    routeTables[kind] = n({ type: 'routeTable', kind })
  }
  return {
    subnets,
    nacl: n({ type: 'networkAcl' }),
    routeTables,
    tgwAttachment: n({ type: 'transitGatewayAttachment' }),
  }
}

export function buildServiceNetworkLayer(
  ctx: ConventionsContext,
  purposes: string[],
): { securityGroups: Record<string, string> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = (opts: object) => ctx.name(opts as any)
  const securityGroups: Record<string, string> = {}
  for (const purpose of purposes) {
    securityGroups[purpose] = n({ type: 'ec2SecurityGroup', purpose })
  }
  return { securityGroups }
}
