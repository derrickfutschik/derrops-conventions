import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'

const base = new DerropsConventions({
  org: 'slaops',
  domain: 'platform',
  service: 'api',
  region: 'ap-southeast-2',
}).arnContext({ accountId: '123456789012' })

describe('imageTag()', () => {
  it('env only', () => {
    expect(base.with({ env: 'prod' }).imageTag()).toBe('prod')
  })

  it('env + version', () => {
    expect(base.with({ env: 'prod', version: 'v1.2.3' }).imageTag()).toBe('prod--v1.2.3')
  })

  it('env + version + key (git SHA)', () => {
    expect(base.with({ env: 'prod', version: 'v1.2.3', key: 'abc123f' }).imageTag()).toBe(
      'prod--v1.2.3--abc123f',
    )
  })

  it('env + key (CI build tag without semver)', () => {
    expect(base.with({ env: 'prod', key: 'abc123f' }).imageTag()).toBe('prod--abc123f')
  })

  it('key as numeric build number', () => {
    expect(base.with({ env: 'prod', key: '42' }).imageTag()).toBe('prod--42')
  })

  it('returns empty string when no env/version/key are set', () => {
    expect(base.imageTag()).toBe('')
  })

  it('version only (no env — e.g. library image)', () => {
    expect(base.with({ version: 'v2.0.0' }).imageTag()).toBe('v2.0.0')
  })
})

describe('ecrUri()', () => {
  it('full URI with env + version + key tag', () => {
    expect(base.with({ env: 'prod', version: 'v1.2.3', key: 'abc123f' }).ecrUri()).toBe(
      '123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/slaops/platform/api:prod--v1.2.3--abc123f',
    )
  })

  it('repo path uses / delimiter from ecr resource type', () => {
    const uri = base.with({ env: 'prod' }).ecrUri()
    expect(uri).toContain('/slaops/platform/api:')
  })

  it('omits tag portion (no colon) when no tag segments are set', () => {
    const uri = base.ecrUri()
    expect(uri).toBe('123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/slaops/platform/api')
    expect(uri).not.toContain(':')
  })

  it('tag portion changes with .with() overrides — repo path stays stable', () => {
    const prodUri = base.with({ env: 'prod', key: 'sha1' }).ecrUri()
    const stagingUri = base.with({ env: 'staging', key: 'sha2' }).ecrUri()
    const [prodRepo, prodTag] = prodUri.split(':')
    const [stagingRepo, stagingTag] = stagingUri.split(':')
    expect(prodRepo).toBe(stagingRepo)
    expect(prodTag).toBe('prod--sha1')
    expect(stagingTag).toBe('staging--sha2')
  })

  it('throws when accountId not set', () => {
    const c = new DerropsConventions({ org: 'slaops', region: 'ap-southeast-2' })
    expect(() => c.ecrUri()).toThrow('accountId')
  })

  it('throws when region not set', () => {
    const c = new DerropsConventions({ org: 'slaops' }).arnContext({ accountId: '123456789012' })
    expect(() => c.ecrUri()).toThrow('region')
  })

  it('registry hostname encodes the correct region', () => {
    const c = base.with({ region: 'us-east-1' })
    const uri = c.ecrUri()
    expect(uri).toContain('.dkr.ecr.us-east-1.amazonaws.com/')
  })
})
