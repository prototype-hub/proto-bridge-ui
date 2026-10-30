import type { PrototypeStatistics } from '../../src/modules/protohub-manager-ui/types'

/** Standalone UI fixture only; persistence and authorization are checked against the backend. */
export function fixtureStatistics(days: 7 | 30, time: number): PrototypeStatistics {
  const today = new Date(time + 8 * 3600000).toISOString().slice(0, 10)
  const date = new Date(`${today}T00:00:00Z`)
  const collectedSince = date.getTime() - 2 * 86400000 - 8 * 3600000
  const trend = Array.from({ length: days }, (_, index) => {
    const offset = index - days + 1
    return {
      date: new Date(date.getTime() + offset * 86400000).toISOString().slice(0, 10),
      visits: offset < -2 ? null : [4, 9, 5][offset + 2]!,
    }
  })
  return {
    timeZone: 'Asia/Shanghai',
    fromDate: trend[0]!.date,
    toDate: today,
    collectedSince,
    retentionDays: 35,
    projectCount: 1,
    versionCount: 1,
    shareCount: 2,
    visits: 18,
    trend,
    ranking: [{ projectId: 'p1', projectName: 'Contract project', visits: 18 }],
  }
}
