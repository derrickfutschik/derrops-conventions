import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const base = new DerropsConventions({
  org: 'slaops',
  domain: 'platform',
  service: 'api',
})

describe('eventSource()', () => {
  it('returns org.domain.service by default', () => {
    expect(base.eventSource()).toBe('slaops.platform.api')
  })

  it('level: domain returns org.domain', () => {
    expect(base.eventSource({ level: 'domain' })).toBe('slaops.platform')
  })

  it('level: org returns org only', () => {
    expect(base.eventSource({ level: 'org' })).toBe('slaops')
  })

  it('level: service is the default and returns full path', () => {
    expect(base.eventSource({ level: 'service' })).toBe('slaops.platform.api')
  })

  it('missing service falls back gracefully to defined segments only', () => {
    const c = new DerropsConventions({ org: 'slaops', domain: 'platform' })
    expect(c.eventSource()).toBe('slaops.platform')
  })

  it('only org set returns org only', () => {
    const c = new DerropsConventions({ org: 'slaops' })
    expect(c.eventSource()).toBe('slaops')
  })

  it('can be used directly as an EventBridge source filter value', () => {
    const filter = { source: [base.eventSource()] }
    expect(filter).toEqual({ source: ['slaops.platform.api'] })
  })

  it('domain-level source forms a valid EventBridge prefix routing pattern', () => {
    const pattern = { source: [{ prefix: base.eventSource({ level: 'domain' }) }] }
    expect(pattern).toEqual({ source: [{ prefix: 'slaops.platform' }] })
  })

  it('different services under same domain share the domain-level prefix', () => {
    const auth = new DerropsConventions({ org: 'slaops', domain: 'platform', service: 'auth' })
    const api = new DerropsConventions({ org: 'slaops', domain: 'platform', service: 'api' })
    expect(auth.eventSource({ level: 'domain' })).toBe(api.eventSource({ level: 'domain' }))
    expect(auth.eventSource()).not.toBe(api.eventSource())
  })
})

describe('detailType()', () => {
  it('PascalCases a hyphenated string', () => {
    expect(base.detailType('request-logged')).toBe('RequestLogged')
  })

  it('PascalCases a space-separated string', () => {
    expect(base.detailType('user signed in')).toBe('UserSignedIn')
  })

  it('is idempotent on already-PascalCase input', () => {
    expect(base.detailType('RequestLogged')).toBe('RequestLogged')
  })

  it('handles single-word actions', () => {
    expect(base.detailType('created')).toBe('Created')
  })

  it('handles mixed separators', () => {
    expect(base.detailType('api_key--rotated')).toBe('ApiKeyRotated')
  })

  it('is independent of the convention instance segments', () => {
    const other = new DerropsConventions({ org: 'acme', domain: 'payments' })
    expect(other.detailType('order-placed')).toBe('OrderPlaced')
    expect(base.detailType('order-placed')).toBe('OrderPlaced')
  })
})
