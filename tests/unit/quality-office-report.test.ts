import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createQualityOfficeReport } from '../../src/modules/protohub-manager-ui/views/project/utils/qualityOfficeReport'
import { fixtureQuality } from '../fixtures/quality'
import type { Revision } from '../../src/modules/protohub-manager-ui/types'

const revision: Revision = {
  id: 'fixed-revision',
  projectId: 'project-中文',
  versionId: 'version-1',
  versionName: '交付版本 Delivery version',
  entryFile: '页面/首页.html',
  manifestSha256: 'abcd'.repeat(16),
  fileCount: 60,
  totalBytes: 5000,
  createdBy: 'test-author',
  createdAt: 0,
}
const ss = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const wp = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
async function bytes(blob: Blob) {
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    }),
  )
}
function xml(parts: Record<string, Uint8Array>, part: string) {
  const parsed = new DOMParser().parseFromString(strFromU8(parts[part]!), 'application/xml')
  expect(parsed.querySelector('parsererror')).toBeNull()
  return parsed
}
function workbook(parts: Record<string, Uint8Array>) {
  const strings = [...xml(parts, 'xl/sharedStrings.xml').getElementsByTagNameNS(ss, 'si')].map(
    (entry) =>
      (entry.textContent ?? '').replace(/_x([0-9a-f]{4})_/gi, (_, hex) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
  )
  return [1, 2, 3].map((sheet) => {
    const document = xml(parts, `xl/worksheets/sheet${sheet}.xml`)
    expect(document.getElementsByTagNameNS(ss, 'f')).toHaveLength(0)
    expect(document.getElementsByTagNameNS(ss, 'hyperlink')).toHaveLength(0)
    return [...document.getElementsByTagNameNS(ss, 'row')].map((row) =>
      [...row.getElementsByTagNameNS(ss, 'c')].map((cell) => {
        const value = cell.getElementsByTagNameNS(ss, 'v')[0]?.textContent ?? ''
        return cell.getAttribute('t') === 's' ? strings[Number(value)] : Number(value)
      }),
    )
  })
}
function externalParts(parts: Record<string, Uint8Array>) {
  return Object.entries(parts).filter(
    ([name, value]) => name.endsWith('.rels') && strFromU8(value).includes('TargetMode="External"'),
  )
}

describe('quality Office report', () => {
  it.each(['zh', 'en'] as const)(
    'writes all findings and all scope counters as text-safe real XLSX in %s',
    async (language) => {
      const report = fixtureQuality(revision)
      report.complete = false
      report.summary.omittedFindings = 42
      report.summary.skippedDocuments = 2
      report.summary.findingsTotal = 94
      const hostile = '=HYPERLINK("https://example.invalid", "中文<&>")'
      report.findings[0] = {
        code: 'invalid_reference',
        severity: 'warning',
        sourcePath: hostile,
        targetPath: "+cmd|' /C calc'!A0",
        reference: '@SUM(A1:A2) -路径/_x0041_\r\n尾部',
      }
      report.findings[1]!.sourcePath = '-1+2'
      const blob = await createQualityOfficeReport('xlsx', report, { revision, language })
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      const parts = unzipSync(await bytes(blob))
      expect(parts['[Content_Types].xml']).toBeDefined()
      expect(externalParts(parts)).toHaveLength(0)
      const [overview, findings, scope] = workbook(parts)
      expect(findings).toHaveLength(53)
      expect(findings![1]!.slice(-3)).toEqual([
        hostile,
        report.findings[0]!.targetPath,
        report.findings[0]!.reference,
      ])
      expect(findings![2]![5]).toBe('-1+2')
      expect(findings![52]!.slice(-2)).toEqual(['images/missing-50.png', 'images/missing-50.png'])
      expect(overview!.map((row) => row[1])).toEqual([
        language === 'zh' ? '值' : 'Value',
        revision.projectId,
        revision.versionName,
        report.versionId,
        report.revisionId,
        report.manifestSha256,
        report.entryFile,
        expect.any(String),
        'false',
        51,
        1,
        94,
        52,
      ])
      expect(scope!.slice(2).map((row) => row[1])).toEqual([
        60, 3, 1024, 55, 42, 2, 1, 2, 3, 4, 2097152, 33554432, 100000, 1000,
      ])
      expect(xml(parts, 'xl/workbook.xml').getElementsByTagNameNS(ss, 'sheet')).toHaveLength(3)
    },
  )

  it.each(['zh', 'en'] as const)(
    'writes a paginated plain-text DOCX with all diagnostic values in %s',
    async (language) => {
      const report = fixtureQuality(revision)
      report.complete = false
      report.summary.omittedFindings = 42
      report.summary.skippedDocuments = 2
      const hostile = '<script src="https://example.invalid/remote.js">alert(1)</script>&中文'
      report.findings[0]!.sourcePath = hostile
      report.findings[0]!.reference = '=1+2'
      const blob = await createQualityOfficeReport('docx', report, { revision, language })
      expect(blob.type).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      const parts = unzipSync(await bytes(blob))
      const document = xml(parts, 'word/document.xml')
      const text = [...document.getElementsByTagNameNS(wp, 't')].map((node) => node.textContent)
      expect(text).toContain(hostile)
      for (const value of [
        revision.projectId,
        revision.versionName,
        report.revisionId,
        report.manifestSha256,
        '=1+2',
      ])
        expect(text).toContain(value)
      const tables = document.getElementsByTagNameNS(wp, 'tbl')
      expect(tables).toHaveLength(3)
      expect(tables[1]!.getElementsByTagNameNS(wp, 'tr')).toHaveLength(53)
      expect(
        [...document.getElementsByTagNameNS(wp, 'tblHeader')].filter(
          (element) => !['false', '0'].includes(element.getAttributeNS(wp, 'val') ?? ''),
        ),
      ).toHaveLength(3)
      expect(document.getElementsByTagNameNS(wp, 'hyperlink')).toHaveLength(0)
      expect(document.getElementsByTagNameNS(wp, 'altChunk')).toHaveLength(0)
      expect(externalParts(parts)).toHaveLength(0)
      expect(tables[2]!.textContent).toContain('42')
      expect(tables[2]!.textContent).toContain('33554432')
      expect(tables[2]!.textContent).toContain(
        language === 'zh' ? '不运行脚本' : 'Scripts and external requests are not run',
      )
    },
  )

  it('retains an incomplete empty scan and does not replace it with a passed conclusion', async () => {
    const report = fixtureQuality(revision)
    report.complete = false
    report.findings = []
    Object.assign(report.summary, { errors: 0, warnings: 0, findingsTotal: 0 })
    const parts = unzipSync(
      await bytes(await createQualityOfficeReport('xlsx', report, { revision, language: 'en' })),
    )
    const [overview, findings] = workbook(parts)
    expect(findings).toHaveLength(1)
    expect(overview![7]![1]).toContain('incomplete')
    expect(overview![8]![1]).toBe('false')
  })

  it('rejects unsupported Office characters and Excel overlong cells without silent data loss', async () => {
    const report = fixtureQuality(revision)
    report.findings[0]!.reference = 'before\u0000after'
    for (const format of ['xlsx', 'docx'] as const)
      await expect(
        createQualityOfficeReport(format, report, { revision, language: 'en' }),
      ).rejects.toThrow('Download JSON')
    report.findings[0]!.reference = 'x'.repeat(32768)
    await expect(
      createQualityOfficeReport('xlsx', report, { revision, language: 'en' }),
    ).rejects.toThrow('32,767')
    const word = unzipSync(
      await bytes(await createQualityOfficeReport('docx', report, { revision, language: 'en' })),
    )
    expect(xml(word, 'word/document.xml').documentElement.textContent).toContain('x'.repeat(32768))
  })
})
