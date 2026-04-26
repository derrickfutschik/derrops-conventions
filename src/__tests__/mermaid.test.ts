import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'
import { renderMermaid } from '../mermaid.js'

describe('toMermaid()', () => {
  describe('shape', () => {
    it('renders a single instance with no children as a leaf node', () => {
      const root = new DerropsConventions({ org: 'slaops', region: 'ap-southeast-2', env: 'dev' })
      const out = root.toMermaid()
      expect(out.split('\n')).toEqual([
        'flowchart TD',
        '  org_slaops["region: ap-southeast-2<br/>env: dev<br/>org: slaops"]',
      ])
    })

    it('renders a linear org → domain → service chain as nested subgraphs', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      const platform = org.with({ domain: 'platform' })
      platform.with({ service: 'vpc' })
      const out = org.toMermaid()
      expect(out).toContain('subgraph org_slaops["org: slaops"]')
      expect(out).toContain('subgraph domain_platform["domain: platform"]')
      expect(out).toContain('service_vpc["service: vpc"]')
      // Nesting check: each subgraph must be balanced by an `end`.
      const opens = (out.match(/^\s*subgraph /gm) ?? []).length
      const ends = (out.match(/^\s*end$/gm) ?? []).length
      expect(opens).toBe(ends)
      expect(opens).toBe(2)
    })

    it('renders multiple domains and services side-by-side under the org subgraph', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      const platform = org.with({ domain: 'platform' })
      platform.with({ service: 'vpc' })
      platform.with({ service: 'app-database' })
      const oaspec = org.with({ domain: 'oaspec' })
      oaspec.with({ service: 'storage' })

      const out = org.toMermaid()
      expect(out).toContain('subgraph domain_platform["domain: platform"]')
      expect(out).toContain('subgraph domain_oaspec["domain: oaspec"]')
      expect(out).toContain('service_vpc["service: vpc"]')
      expect(out).toContain('service_app_database["service: app-database"]')
      expect(out).toContain('service_storage["service: storage"]')
    })
  })

  describe('id sanitisation and collisions', () => {
    it('sanitises hyphenated values to valid Mermaid IDs while preserving the label', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform' }).with({ service: 'app-database' })
      const out = org.toMermaid()
      expect(out).toContain('service_app_database["service: app-database"]')
    })

    it('disambiguates duplicate service names under different domains', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform' }).with({ service: 'vpc' })
      org.with({ domain: 'oaspec' }).with({ service: 'vpc' })
      const out = org.toMermaid()
      expect(out).toContain('service_vpc["service: vpc"]')
      expect(out).toContain('service_vpc_2["service: vpc"]')
    })
  })

  describe('options', () => {
    it('respects a custom direction', () => {
      const root = new DerropsConventions({ org: 'slaops' })
      expect(root.toMermaid({ direction: 'LR' }).split('\n')[0]).toBe('flowchart LR')
    })

    it('shows the default resource type when set via .with({ type })', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform', type: 'lambdaFunction' })
      const out = org.toMermaid()
      expect(out).toContain('domain: platform<br/>type: lambdaFunction')
    })

    it('omits the default resource type when showDefaultType is false', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform', type: 'lambdaFunction' })
      const out = org.toMermaid({ showDefaultType: false })
      expect(out).not.toContain('type: lambdaFunction')
    })

    it('shows the ARN context account ID on the root only when enabled', () => {
      const org = new DerropsConventions({ org: 'slaops' }).arnContext({
        accountId: '123456789012',
      })
      org.with({ domain: 'platform' })
      const out = org.toMermaid({ showArnContext: true })
      // Account appears once (on root), not on the domain subgraph.
      expect((out.match(/account: 123456789012/g) ?? []).length).toBe(1)
      const rootLine = out.split('\n').find((l) => l.includes('subgraph org_slaops'))
      expect(rootLine).toContain('account: 123456789012')
    })
  })

  describe('rule compliance', () => {
    it('produces output where every subgraph is closed by an `end`', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform' }).with({ service: 'vpc' })
      org.with({ domain: 'oaspec' }).with({ service: 'storage' })
      const out = org.toMermaid()
      const opens = (out.match(/^\s*subgraph /gm) ?? []).length
      const ends = (out.match(/^\s*end$/gm) ?? []).length
      expect(opens).toBe(ends)
    })

    it('quotes every label with double quotes and contains no semicolons', () => {
      const org = new DerropsConventions({ org: 'slaops', region: 'ap-southeast-2', env: 'dev' })
      org.with({ domain: 'platform' }).with({ service: 'app-database' })
      const out = org.toMermaid()
      expect(out).not.toMatch(/;/)
      // Every node/subgraph line that has a `[` should also have a closing `"]`.
      for (const line of out.split('\n')) {
        if (line.includes('[')) {
          expect(line).toMatch(/\["[^"]*"\]/)
        }
      }
    })

    it('replaces semicolons in segment values with commas in the label', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      // Hypothetical odd segment value — should never contain `;` but we defend anyway.
      org.with({ domain: 'a;b' as string })
      const out = org.toMermaid()
      expect(out).not.toMatch(/;/)
      expect(out).toContain('domain: a,b')
    })
  })

  describe('children() accessor', () => {
    it('returns derivatives in registration order', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      const a = org.with({ domain: 'platform' })
      const b = org.with({ domain: 'oaspec' })
      expect(org.children()).toEqual([a, b])
    })

    it('does not propagate the children list to derivatives', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform' })
      const oaspec = org.with({ domain: 'oaspec' })
      expect(oaspec.children()).toEqual([])
      expect(org.children()).toHaveLength(2)
    })
  })

  describe('renderMermaid() standalone export', () => {
    it('produces identical output to the instance method', () => {
      const org = new DerropsConventions({ org: 'slaops' })
      org.with({ domain: 'platform' }).with({ service: 'vpc' })
      expect(renderMermaid(org)).toBe(org.toMermaid())
    })
  })
})
