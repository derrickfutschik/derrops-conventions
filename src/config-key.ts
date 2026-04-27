/**
 * Strongly-typed config key generator.
 *
 * Segments join with `.` — no org, env, or region prefix. The return type is
 * a template literal string type, so computed property keys built from `cfgKey`
 * preserve their literal types through `ReturnType<typeof makeConfig>`.
 *
 * @example
 * cfgKey('oaspec', 'dynamodb-cache', 'ttl-seconds')
 * // → 'oaspec.dynamodb-cache.ttl-seconds'  (type: literal, not string)
 *
 * // As a computed property key — the literal flows into the object type:
 * const cfg = { [cfgKey('relay', 'queue', 'message-retention-seconds')]: 345600 }
 * // cfg: { 'relay.queue.message-retention-seconds': number }
 */

/** Business domains recognised as valid first segments in config keys. */
export type ConfigDomain =
  | 'app'
  | 'aws'
  | 'db'
  | 'dynamodb'
  | 'node'
  | 'oaspec'
  | 'openapi'
  | 'opensearch'
  | 'relay'
  | 'tenant'

export function cfgKey<D extends ConfigDomain>(domain: D): D
export function cfgKey<D extends ConfigDomain, S extends string>(domain: D, service: S): `${D}.${S}`
export function cfgKey<D extends ConfigDomain, S extends string, K extends string>(
  domain: D,
  service: S,
  key: K,
): `${D}.${S}.${K}`
export function cfgKey(domain: string, service?: string, key?: string): string {
  return [domain, service, key].filter(Boolean).join('.')
}
