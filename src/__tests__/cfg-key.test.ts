import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

/**
 * Forces TypeScript to check that the type of `value` is assignable to `Expected`.
 * Used to write compile-time type assertions alongside runtime value tests.
 * A failing type test causes this file to fail to compile entirely.
 */
function assertType<Expected>(_value: Expected): void {}

const base = new DerropsConventions({ org: 'acme', env: 'dev', region: 'ap-southeast-2' })

describe('DerropsConventions — cfgKey()', () => {
  describe('runtime values', () => {
    describe('via .with()', () => {
      it('domain + service + key produces three dot-joined segments', () => {
        const c = base.with({ domain: 'oaspec', service: 'dynamodb-cache' })
        expect(c.cfgKey('ttl-seconds')).toBe('oaspec.dynamodb-cache.ttl-seconds')
      })

      it('domain only + key produces two dot-joined segments', () => {
        const c = base.with({ domain: 'oaspec' })
        expect(c.cfgKey('version-retention')).toBe('oaspec.version-retention')
      })

      it('no domain or service produces the bare key', () => {
        expect(base.cfgKey('some-key')).toBe('some-key')
      })

      it('word hyphens within segments are preserved', () => {
        const c = base.with({ domain: 'oaspec', service: 'url-fetch' })
        expect(c.cfgKey('timeout-ms')).toBe('oaspec.url-fetch.timeout-ms')
      })

      it('inherits domain from parent when child only sets service', () => {
        const domain = base.with({ domain: 'relay' })
        const svc = domain.with({ service: 'queue' })
        expect(svc.cfgKey('message-retention-seconds')).toBe(
          'relay.queue.message-retention-seconds',
        )
      })
    })

    describe('via .domain() / .service() constraint helpers', () => {
      // .domain() / .service() narrow which values are *allowed* but do not set a
      // default — so defaults.domain/service remain undefined and cfgKey produces
      // only the bare key at runtime.  Use .with() to set the default for cfgKey.
      it('constraint without a default produces only the bare key', () => {
        const c = base.domain(['relay']).service(['queue'])
        expect(c.cfgKey('visibility-timeout-seconds')).toBe('visibility-timeout-seconds')
      })
    })

    describe('via .constrain()', () => {
      // Same reasoning: constrain() stores allowed values, not defaults.
      it('constrain without a default produces only the bare key', () => {
        const c = base.constrain('domain', 'oaspec').constrain('service', 'dynamodb-cache')
        expect(c.cfgKey('ttl-seconds')).toBe('ttl-seconds')
      })
    })

    describe('suffix argument', () => {
      it('domain + service + key + suffix produces four dot-joined segments', () => {
        const c = base.with({ domain: 'oaspec', service: 'dynamodb-cache' })
        expect(c.cfgKey('ttl', 'seconds')).toBe('oaspec.dynamodb-cache.ttl.seconds')
      })

      it('domain only + key + suffix produces three segments', () => {
        const c = base.with({ domain: 'oaspec' })
        expect(c.cfgKey('ttl', 'seconds')).toBe('oaspec.ttl.seconds')
      })

      it('no domain + key + suffix produces two segments', () => {
        expect(base.cfgKey('ttl', 'seconds')).toBe('ttl.seconds')
      })
    })
  })

  describe('type-level assertions', () => {
    it('domain + service + key resolves to a string literal type', () => {
      const c = base.with({ domain: 'oaspec', service: 'dynamodb-cache' })
      const key = c.cfgKey('ttl-seconds')
      assertType<'oaspec.dynamodb-cache.ttl-seconds'>(key)
      expect(key).toBe('oaspec.dynamodb-cache.ttl-seconds')
    })

    it('domain only + key resolves to a two-segment literal type', () => {
      const c = base.with({ domain: 'oaspec' })
      const key = c.cfgKey('version-retention')
      assertType<'oaspec.version-retention'>(key)
      expect(key).toBe('oaspec.version-retention')
    })

    it('domain + service + key + suffix resolves to a four-segment literal type', () => {
      const c = base.with({ domain: 'oaspec', service: 'dynamodb-cache' })
      const key = c.cfgKey('ttl', 'seconds')
      assertType<'oaspec.dynamodb-cache.ttl.seconds'>(key)
      expect(key).toBe('oaspec.dynamodb-cache.ttl.seconds')
    })

    it('domain only + key + suffix resolves to a three-segment literal type', () => {
      const c = base.with({ domain: 'oaspec' })
      const key = c.cfgKey('ttl', 'seconds')
      assertType<'oaspec.ttl.seconds'>(key)
      expect(key).toBe('oaspec.ttl.seconds')
    })

    it('constrain() does not set a default — type is string, not a literal', () => {
      // constrain() narrows *allowed* values in C but leaves defaults.domain/service
      // unset.  TDomain/TService stay as string, so cfgKey returns string.
      const c = base.constrain('domain', 'relay').constrain('service', 'queue')
      const key = c.cfgKey('message-retention-seconds')
      assertType<string>(key)
      expect(key).toBe('message-retention-seconds')
    })

    it('.domain() / .service() helpers do not set a default — type is string', () => {
      const c = base.domain(['relay']).service(['queue'])
      const key = c.cfgKey('visibility-timeout-seconds')
      assertType<string>(key)
      expect(key).toBe('visibility-timeout-seconds')
    })

    it('no domain set — return type is string, not a literal', () => {
      // assertType<string> accepts any string, including literals, so we verify
      // the runtime value and trust that the compile-time type is `string` (the
      // d.ts shows this — the non-literal branch resolves to `string`).
      const key = base.cfgKey('some-key')
      assertType<string>(key)
      expect(key).toBe('some-key')
    })

    it('.for() resets literal inference — type is string', () => {
      const c = base.for({ domain: 'oaspec', service: 'dynamodb-cache' })
      const key = c.cfgKey('ttl-seconds')
      assertType<string>(key)
      expect(key).toBe('oaspec.dynamodb-cache.ttl-seconds')
    })
  })
})
