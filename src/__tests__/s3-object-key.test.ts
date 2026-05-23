import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'
import type { DatePartitionGranularity } from '../DerropsConventions.js'

describe('DerropsConventions — s3ObjectKey and s3LogKey', () => {
  // ── s3ObjectKey ────────────────────────────────────────────────────────────

  describe('s3ObjectKey', () => {
    describe('basic segment composition', () => {
      const c = new DerropsConventions({ org: 'derrops', domain: 'logs', service: 'ingest' })

      it('org + domain + service + key', () => {
        expect(c.name({ type: 's3ObjectKey', key: 'schema.json' })).toBe(
          'derrops/logs/ingest/schema.json',
        )
      })

      it('omits segments that are not set', () => {
        expect(
          new DerropsConventions({ domain: 'logs', service: 'ingest' }).name({
            type: 's3ObjectKey',
            key: 'config.json',
          }),
        ).toBe('logs/ingest/config.json')
      })

      it('key only — no other segments', () => {
        expect(new DerropsConventions().name({ type: 's3ObjectKey', key: 'manifest.json' })).toBe(
          'manifest.json',
        )
      })

      it('path prefix (no key) — stops at service', () => {
        expect(c.name({ type: 's3ObjectKey' })).toBe('derrops/logs/ingest')
      })
    })

    describe('with tenant', () => {
      const base = new DerropsConventions({ org: 'derrops', domain: 'api', service: 'collector' })

      it('tenant appears between service and key', () => {
        expect(base.name({ type: 's3ObjectKey', tenant: 't-a3f8b2', key: 'data.json' })).toBe(
          'derrops/api/collector/t-a3f8b2/data.json',
        )
      })

      it('tenant default on instance', () => {
        expect(
          base.with({ tenant: 't-a3f8b2' }).name({ type: 's3ObjectKey', key: 'events.json' }),
        ).toBe('derrops/api/collector/t-a3f8b2/events.json')
      })

      it('tenant call-time override wins over instance default', () => {
        expect(
          base
            .with({ tenant: 't-a3f8b2' })
            .name({ type: 's3ObjectKey', tenant: 't-xyz999', key: 'events.json' }),
        ).toBe('derrops/api/collector/t-xyz999/events.json')
      })
    })

    describe('segment delimiter is / — not --', () => {
      it('uses forward-slash between all segments', () => {
        const name = new DerropsConventions({
          org: 'acme',
          domain: 'billing',
          service: 'api',
        }).name({ type: 's3ObjectKey', key: 'invoice.pdf' })
        expect(name).not.toContain('--')
        expect(name).toBe('acme/billing/api/invoice.pdf')
      })
    })

    describe('global:false — never includes region or env', () => {
      it('region and env are excluded even when set on the instance', () => {
        const name = new DerropsConventions({
          region: 'ap-southeast-2',
          env: 'prod',
          org: 'derrops',
          domain: 'logs',
          service: 'ingest',
        }).name({ type: 's3ObjectKey', key: 'file.gz' })
        expect(name).not.toContain('ap-southeast-2')
        expect(name).not.toContain('prod')
        expect(name).toBe('derrops/logs/ingest/file.gz')
      })
    })

    describe('instance defaults', () => {
      it('type default via with({ type }) avoids repeating type on each call', () => {
        const objKey = new DerropsConventions({
          org: 'derrops',
          domain: 'portal',
          service: 'assets',
        }).with({ type: 's3ObjectKey' })
        expect(objKey.name({ key: 'logo.png' })).toBe('derrops/portal/assets/logo.png')
        expect(objKey.name({ key: 'styles.css' })).toBe('derrops/portal/assets/styles.css')
      })
    })
  })

  // ── s3LogKey ───────────────────────────────────────────────────────────────

  describe('s3LogKey — time-partitioned log paths', () => {
    describe('partition segment carries the date path', () => {
      const c = new DerropsConventions({ org: 'derrops', domain: 'logs', service: 'ingest' })

      it('full date-hour partition: yyyy/mm/dd/hh', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024/03/15/14', key: 'log-001.gz' })).toBe(
          'derrops/logs/ingest/2024/03/15/14/log-001.gz',
        )
      })

      it('date-only partition: yyyy/mm/dd', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024/03/15', key: 'summary.json' })).toBe(
          'derrops/logs/ingest/2024/03/15/summary.json',
        )
      })

      it('month partition: yyyy/mm', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024/03', key: 'monthly.parquet' })).toBe(
          'derrops/logs/ingest/2024/03/monthly.parquet',
        )
      })

      it('year partition: yyyy', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024', key: 'annual.parquet' })).toBe(
          'derrops/logs/ingest/2024/annual.parquet',
        )
      })

      it('partition without key produces a prefix path', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024/03/15/14' })).toBe(
          'derrops/logs/ingest/2024/03/15/14',
        )
      })

      it('no partition — partition segment is simply absent', () => {
        expect(c.name({ type: 's3LogKey', key: 'unpartitioned.gz' })).toBe(
          'derrops/logs/ingest/unpartitioned.gz',
        )
      })
    })

    describe('multi-tenant log paths — tenant before partition', () => {
      const c = new DerropsConventions({ org: 'derrops', domain: 'logs', service: 'ingest' })

      it('tenant + full date-hour partition + filename', () => {
        expect(
          c.name({
            type: 's3LogKey',
            tenant: 't-a3f8b2',
            partition: '2024/03/15/14',
            key: 'log-001.gz',
          }),
        ).toBe('derrops/logs/ingest/t-a3f8b2/2024/03/15/14/log-001.gz')
      })

      it('tenant appears before partition in default order', () => {
        const name = c.name({
          type: 's3LogKey',
          tenant: 't-abc',
          partition: '2024/06',
          key: 'events.gz',
        })
        const tenantIdx = name.indexOf('t-abc')
        const partitionIdx = name.indexOf('2024/06')
        expect(tenantIdx).toBeLessThan(partitionIdx)
      })

      it('tenant default on instance + runtime partition', () => {
        const tenantC = c.with({ tenant: 't-a3f8b2' })
        expect(
          tenantC.name({ type: 's3LogKey', partition: '2024/03/15/14', key: 'chunk-000.gz' }),
        ).toBe('derrops/logs/ingest/t-a3f8b2/2024/03/15/14/chunk-000.gz')
      })

      it('tenant prefix path — no filename', () => {
        expect(c.name({ type: 's3LogKey', tenant: 't-xyz', partition: '2024/01/01/00' })).toBe(
          'derrops/logs/ingest/t-xyz/2024/01/01/00',
        )
      })
    })

    describe('slashes in partition pass through seamlessly', () => {
      it('partition slashes merge into the / delimiter stream naturally', () => {
        const name = new DerropsConventions({
          org: 'acme',
          domain: 'data',
          service: 'firehose',
        }).name({ type: 's3LogKey', partition: '2025/12/31/23', key: 'record.gz' })
        expect(name).toBe('acme/data/firehose/2025/12/31/23/record.gz')
        expect(name.split('/')).toEqual([
          'acme',
          'data',
          'firehose',
          '2025',
          '12',
          '31',
          '23',
          'record.gz',
        ])
      })
    })

    describe('real-world log file names', () => {
      const c = new DerropsConventions({ org: 'derrops', domain: 'http', service: 'gateway' })

      it('Kinesis Firehose delivery key format', () => {
        expect(
          c.name({
            type: 's3LogKey',
            partition: '2024/03/15/14',
            key: 'derrops-1-2024-03-15-14-00-00-abc123',
          }),
        ).toBe('derrops/http/gateway/2024/03/15/14/derrops-1-2024-03-15-14-00-00-abc123')
      })

      it('gzipped log file', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024/03/15', key: 'access.log.gz' })).toBe(
          'derrops/http/gateway/2024/03/15/access.log.gz',
        )
      })

      it('parquet file for analytics', () => {
        expect(c.name({ type: 's3LogKey', partition: '2024/03', key: 'requests.parquet' })).toBe(
          'derrops/http/gateway/2024/03/requests.parquet',
        )
      })
    })
  })

  // ── Shared behaviour ───────────────────────────────────────────────────────

  describe('shared behaviour — normalization', () => {
    const c = new DerropsConventions({ org: 'DERROPS', domain: 'Logs', service: 'Ingest' })

    it('segment values are lowercased for s3ObjectKey', () => {
      expect(c.name({ type: 's3ObjectKey', key: 'FILE.JSON' })).toBe(
        'derrops/logs/ingest/file.json',
      )
    })

    it('segment values are lowercased for s3LogKey', () => {
      expect(c.name({ type: 's3LogKey', partition: '2024/03/15', key: 'LOG.GZ' })).toBe(
        'derrops/logs/ingest/2024/03/15/log.gz',
      )
    })

    it('spaces in key are converted to hyphens (wordDelimiter is -)', () => {
      expect(
        new DerropsConventions({ org: 'acme', service: 'api' }).name({
          type: 's3ObjectKey',
          key: 'my file name.json',
        }),
      ).toBe('acme/api/my-file-name.json')
    })

    it('hyphens in segments are preserved (wordDelimiter is -, so no conversion)', () => {
      expect(
        new DerropsConventions({
          org: 'derrops',
          domain: 'http-logs',
          service: 'api-gateway',
        }).name({ type: 's3LogKey', key: 'access-log.gz' }),
      ).toBe('derrops/http-logs/api-gateway/access-log.gz')
    })
  })

  describe('shared behaviour — with() immutability', () => {
    const base = new DerropsConventions({ org: 'derrops', domain: 'logs' })

    it('with() does not mutate base for s3ObjectKey', () => {
      const scoped = base.with({ service: 'ingest' })
      expect(base.name({ type: 's3ObjectKey', key: 'root.json' })).toBe('derrops/logs/root.json')
      expect(scoped.name({ type: 's3ObjectKey', key: 'root.json' })).toBe(
        'derrops/logs/ingest/root.json',
      )
    })

    it('with() does not mutate base for s3LogKey', () => {
      const scoped = base.with({ service: 'ingest', tenant: 't-abc' })
      expect(base.name({ type: 's3LogKey', partition: '2024/01' })).toBe('derrops/logs/2024/01')
      expect(scoped.name({ type: 's3LogKey', partition: '2024/01' })).toBe(
        'derrops/logs/ingest/t-abc/2024/01',
      )
    })
  })

  // ── datePartition() ────────────────────────────────────────────────────────

  describe('DerropsConventions.datePartition()', () => {
    // 2024-03-15 14:07:05 UTC  (a Friday afternoon — unambiguous reference point)
    const ref = new Date('2024-03-15T14:07:05Z')

    describe('granularity outputs', () => {
      it("'year' → yyyy", () => {
        expect(DerropsConventions.datePartition(ref, 'year')).toBe('2024')
      })

      it("'month' → yyyy/mm", () => {
        expect(DerropsConventions.datePartition(ref, 'month')).toBe('2024/03')
      })

      it("'day' → yyyy/mm/dd", () => {
        expect(DerropsConventions.datePartition(ref, 'day')).toBe('2024/03/15')
      })

      it("'hour' → yyyy/mm/dd/hh", () => {
        expect(DerropsConventions.datePartition(ref, 'hour')).toBe('2024/03/15/14')
      })
    })

    describe('zero-padding', () => {
      // 2024-01-05 09:00:00 UTC — single-digit month, day, and hour
      const early = new Date('2024-01-05T09:03:00Z')

      it('month is zero-padded to two digits', () => {
        expect(DerropsConventions.datePartition(early, 'month')).toBe('2024/01')
      })

      it('day is zero-padded to two digits', () => {
        expect(DerropsConventions.datePartition(early, 'day')).toBe('2024/01/05')
      })

      it('hour is zero-padded to two digits', () => {
        expect(DerropsConventions.datePartition(early, 'hour')).toBe('2024/01/05/09')
      })

      it('midnight hour is 00', () => {
        expect(DerropsConventions.datePartition(new Date('2024-06-01T00:00:00Z'), 'hour')).toBe(
          '2024/06/01/00',
        )
      })
    })

    describe('UTC — not local time', () => {
      // A timestamp that is 23:30 on the 14th in UTC+0 but 09:30 on the 15th in UTC+10.
      // datePartition must always use UTC, so day should be '14' not '15'.
      const lateNight = new Date('2024-03-14T23:30:00Z')

      it('day boundary uses UTC date', () => {
        expect(DerropsConventions.datePartition(lateNight, 'day')).toBe('2024/03/14')
      })

      it('hour boundary uses UTC hour', () => {
        expect(DerropsConventions.datePartition(lateNight, 'hour')).toBe('2024/03/14/23')
      })
    })

    describe('edge dates', () => {
      it('year boundary — 31 Dec 23:59 UTC stays in the correct year', () => {
        expect(DerropsConventions.datePartition(new Date('2023-12-31T23:59:59Z'), 'hour')).toBe(
          '2023/12/31/23',
        )
      })

      it('new year — 1 Jan 00:00 UTC is in the new year', () => {
        expect(DerropsConventions.datePartition(new Date('2024-01-01T00:00:00Z'), 'hour')).toBe(
          '2024/01/01/00',
        )
      })

      it('leap day', () => {
        expect(DerropsConventions.datePartition(new Date('2024-02-29T12:00:00Z'), 'day')).toBe(
          '2024/02/29',
        )
      })
    })

    describe('composes directly with name()', () => {
      const c = new DerropsConventions({ org: 'derrops', domain: 'logs', service: 'ingest' })

      it('datePartition result passed as partition to name()', () => {
        const partition = DerropsConventions.datePartition(ref, 'hour')
        expect(c.name({ type: 's3LogKey', partition, key: 'log-001.gz' })).toBe(
          'derrops/logs/ingest/2024/03/15/14/log-001.gz',
        )
      })

      it('all four granularities produce valid name() inputs', () => {
        const granularities: DatePartitionGranularity[] = ['year', 'month', 'day', 'hour']
        const expected = [
          'derrops/logs/ingest/2024/log.gz',
          'derrops/logs/ingest/2024/03/log.gz',
          'derrops/logs/ingest/2024/03/15/log.gz',
          'derrops/logs/ingest/2024/03/15/14/log.gz',
        ]
        for (const [i, g] of granularities.entries()) {
          expect(
            c.name({
              type: 's3LogKey',
              partition: DerropsConventions.datePartition(ref, g),
              key: 'log.gz',
            }),
          ).toBe(expected[i])
        }
      })
    })
  })

  // ── s3Prefix() ─────────────────────────────────────────────────────────────

  describe('s3Prefix()', () => {
    const c = new DerropsConventions({ org: 'derrops', domain: 'logs', service: 'ingest' })
    const ref = new Date('2024-03-15T14:07:05Z')

    describe('always returns a trailing-slash path', () => {
      it('no args → service-scoped prefix', () => {
        expect(c.s3Prefix()).toBe('derrops/logs/ingest/')
      })

      it('with date + granularity: hour', () => {
        expect(c.s3Prefix({ date: ref, granularity: 'hour' })).toBe(
          'derrops/logs/ingest/2024/03/15/14/',
        )
      })

      it('with date + granularity: day', () => {
        expect(c.s3Prefix({ date: ref, granularity: 'day' })).toBe(
          'derrops/logs/ingest/2024/03/15/',
        )
      })

      it('with date + granularity: month', () => {
        expect(c.s3Prefix({ date: ref, granularity: 'month' })).toBe('derrops/logs/ingest/2024/03/')
      })

      it('with date + granularity: year', () => {
        expect(c.s3Prefix({ date: ref, granularity: 'year' })).toBe('derrops/logs/ingest/2024/')
      })

      it('raw partition escape hatch', () => {
        expect(c.s3Prefix({ partition: 'custom/layout/v2' })).toBe(
          'derrops/logs/ingest/custom/layout/v2/',
        )
      })
    })

    describe('tenant handling', () => {
      it('tenant from options appears before date partition', () => {
        const prefix = c.s3Prefix({ tenant: 't-a3f8b2', date: ref, granularity: 'hour' })
        expect(prefix).toBe('derrops/logs/ingest/t-a3f8b2/2024/03/15/14/')
      })

      it('tenant from options without date', () => {
        expect(c.s3Prefix({ tenant: 't-a3f8b2' })).toBe('derrops/logs/ingest/t-a3f8b2/')
      })

      it('tenant from instance default is inherited', () => {
        const tenantC = c.with({ tenant: 't-a3f8b2' })
        expect(tenantC.s3Prefix({ date: ref, granularity: 'day' })).toBe(
          'derrops/logs/ingest/t-a3f8b2/2024/03/15/',
        )
      })

      it('tenant from options overrides instance default', () => {
        const tenantC = c.with({ tenant: 't-a3f8b2' })
        expect(tenantC.s3Prefix({ tenant: 't-xyz999', date: ref, granularity: 'hour' })).toBe(
          'derrops/logs/ingest/t-xyz999/2024/03/15/14/',
        )
      })
    })

    describe('date without granularity (or vice-versa) falls back to raw partition', () => {
      it('date without granularity → no partition in path', () => {
        // Without granularity the date cannot be formatted — partition is omitted
        expect(c.s3Prefix({ date: ref })).toBe('derrops/logs/ingest/')
      })

      it('granularity without date → no partition in path', () => {
        expect(c.s3Prefix({ granularity: 'hour' })).toBe('derrops/logs/ingest/')
      })
    })

    describe('prefix is valid for AWS S3 ListObjectsV2', () => {
      it('prefix ends with / so it acts as a folder boundary', () => {
        const prefix = c.s3Prefix({ date: ref, granularity: 'hour' })
        expect(prefix.endsWith('/')).toBe(true)
      })

      it('prefix does not start with /', () => {
        const prefix = c.s3Prefix({ date: ref, granularity: 'hour' })
        expect(prefix.startsWith('/')).toBe(false)
      })

      it('full keys written at this granularity start with the prefix', () => {
        const prefix = c.s3Prefix({ date: ref, granularity: 'hour' })
        const key = c.name({
          type: 's3LogKey',
          partition: DerropsConventions.datePartition(ref, 'hour'),
          key: 'log-001.gz',
        })
        expect(key.startsWith(prefix)).toBe(true)
      })

      it('coarser prefix contains finer prefix', () => {
        const dayPrefix = c.s3Prefix({ date: ref, granularity: 'day' })
        const hourPrefix = c.s3Prefix({ date: ref, granularity: 'hour' })
        expect(hourPrefix.startsWith(dayPrefix)).toBe(true)
      })
    })

    describe('with() immutability', () => {
      it('s3Prefix does not mutate the base instance', () => {
        const scoped = c.with({ service: 'other' })
        expect(c.s3Prefix()).toBe('derrops/logs/ingest/')
        expect(scoped.s3Prefix()).toBe('derrops/logs/other/')
      })
    })
  })
})
