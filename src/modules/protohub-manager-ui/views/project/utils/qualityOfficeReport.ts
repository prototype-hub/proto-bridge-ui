import type { Cell, SheetData } from 'write-excel-file/browser'
import type { Revision, RevisionQuality } from '@/modules/protohub-manager-ui/types'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'

type Context = { revision: Revision; language: 'zh' | 'en' }
type Pair = [string, string | number]

const labels = {
  zh: {
    title: '原型包质量报告',
    overview: '概览',
    findings: '问题明细',
    scope: '检查范围与限制',
    field: '字段',
    value: '值',
    project: '项目 ID',
    versionName: '版本名称',
    version: '版本 ID',
    revision: '固定修订 ID',
    hash: '清单 SHA-256',
    conclusion: '检查结论',
    complete: '完整扫描 complete',
    errors: '错误',
    warnings: '提醒',
    total: '发现问题总数',
    retained: '报告收录问题数',
    files: '包内文件数',
    documents: '已读取文档数',
    bytes: '已读取字节数',
    checked: '已检查本地引用数',
    omitted: '未收录问题数',
    skipped: '跳过文档数',
    external: '未检查 外部引用',
    root: '未检查 根绝对路径',
    fragment: '未检查 页内锚点',
    scheme: '未检查 其他协议',
    perDocument: '单文档字节上限',
    totalBytes: '累计文档字节上限',
    references: '引用检查上限',
    maxFindings: '收录问题上限',
    boundary: '检查边界',
    code: '问题代码',
    number: '序号',
    invalidText: '报告包含 Office 无法保留的控制字符，请下载 JSON 报告。',
    excelTextLimit: '报告文本超过 Excel 单元格的 32,767 字符上限，请下载 JSON 或 Word 报告。',
  },
  en: {
    title: 'Prototype package quality report',
    overview: 'Overview',
    findings: 'Findings',
    scope: 'Scope and limits',
    field: 'Field',
    value: 'Value',
    project: 'Project ID',
    versionName: 'Version name',
    version: 'Version ID',
    revision: 'Fixed revision ID',
    hash: 'Manifest SHA-256',
    conclusion: 'Conclusion',
    complete: 'Complete scan (complete)',
    errors: 'Errors',
    warnings: 'Warnings',
    total: 'Total findings',
    retained: 'Recorded findings',
    files: 'Package files',
    documents: 'Documents read',
    bytes: 'Bytes read',
    checked: 'Local references checked',
    omitted: 'Omitted findings',
    skipped: 'Skipped documents',
    external: 'Unchecked external references',
    root: 'Unchecked root absolute references',
    fragment: 'Unchecked page fragments',
    scheme: 'Unchecked other schemes',
    perDocument: 'Bytes per document limit',
    totalBytes: 'Total document bytes limit',
    references: 'References limit',
    maxFindings: 'Recorded findings limit',
    boundary: 'Check boundary',
    code: 'Finding code',
    number: 'No.',
    invalidText:
      'This report contains control characters that Office cannot retain. Download JSON instead.',
    excelTextLimit:
      'Report text exceeds Excel’s 32,767-character cell limit. Download JSON or Word instead.',
  },
}

/** Serialize the loaded scan only. The caller owns current authorization and target validity. */
export async function createQualityOfficeReport(
  format: 'xlsx' | 'docx',
  report: RevisionQuality,
  context: Context,
): Promise<Blob> {
  const copy = labels[context.language]
  const locale = protoLocales[context.language]
  const overview: Pair[] = [
    [copy.project, context.revision.projectId],
    [copy.versionName, context.revision.versionName],
    [copy.version, report.versionId],
    [copy.revision, report.revisionId],
    [copy.hash, report.manifestSha256],
    [locale.qualityEntry, report.entryFile],
    [copy.conclusion, report.complete ? locale.qualityComplete : locale.qualityIncomplete],
    [copy.complete, String(report.complete)],
    [copy.errors, report.summary.errors],
    [copy.warnings, report.summary.warnings],
    [copy.total, report.summary.findingsTotal],
    [copy.retained, report.findings.length],
  ]
  const scope: Pair[] = [
    [copy.boundary, locale.qualityScope],
    [copy.files, report.summary.files],
    [copy.documents, report.summary.scannedDocuments],
    [copy.bytes, report.summary.scannedBytes],
    [copy.checked, report.summary.checkedReferences],
    [copy.omitted, report.summary.omittedFindings],
    [copy.skipped, report.summary.skippedDocuments],
    [copy.external, report.summary.uncheckedReferences.external],
    [copy.root, report.summary.uncheckedReferences.rootAbsolute],
    [copy.fragment, report.summary.uncheckedReferences.fragment],
    [copy.scheme, report.summary.uncheckedReferences.unsupportedScheme],
    [copy.perDocument, report.limits.maxTextBytes],
    [copy.totalBytes, report.limits.maxTotalTextBytes],
    [copy.references, report.limits.maxReferences],
    [copy.maxFindings, report.limits.maxFindings],
  ]
  const findings = report.findings.map((finding, index) => [
    index + 1,
    locale.qualitySeverities[finding.severity],
    finding.severity,
    finding.code,
    locale.qualityCodes[finding.code],
    finding.sourcePath,
    finding.targetPath ?? '',
    finding.reference ?? '',
  ])
  const allValues = [...overview, ...scope, ...findings].flat()
  // Office XML cannot represent these values; fail visibly rather than let a library strip them.
  for (const value of allValues) {
    if (typeof value !== 'string') continue
    for (const character of value) {
      const point = character.codePointAt(0)!
      if (
        (point < 32 && point !== 9 && point !== 10 && point !== 13) ||
        (point >= 0xd800 && point <= 0xdfff) ||
        point === 0xfffe ||
        point === 0xffff
      )
        throw new Error(copy.invalidText)
    }
    if (format === 'xlsx' && value.length > 32767) throw new Error(copy.excelTextLimit)
  }

  if (format === 'xlsx') {
    const { default: writeXlsxFile } = await import('write-excel-file/browser')
    const cell = (value: string | number, heading = false): Cell => ({
      // String is explicit: uploaded paths beginning with = + - @ never become formulas.
      type: typeof value === 'number' ? Number : String,
      value:
        typeof value === 'string'
          ? value.replace(/_x([0-9a-f]{4})_/gi, '_x005F_x$1_').replace(/\r/g, '_x000D_')
          : value,
      wrap: true,
      alignVertical: 'top',
      ...(heading ? { fontWeight: 'bold', backgroundColor: '#E8EDF3' } : {}),
    })
    const pairsSheet = (title: string, pairs: Pair[]): SheetData => [
      [cell(title, true), cell(copy.value, true)],
      ...pairs.map((row) => row.map((value) => cell(value))),
    ]
    return writeXlsxFile(
      [
        {
          sheet: copy.overview,
          data: pairsSheet(copy.title, overview),
          columns: [{ width: 30 }, { width: 100 }],
          stickyRowsCount: 1,
        },
        {
          sheet: copy.findings,
          data: [
            [
              copy.number,
              locale.qualitySeverity,
              'severity',
              copy.code,
              locale.qualityType,
              locale.qualitySource,
              locale.qualityTarget,
              locale.qualityReference,
            ].map((title) => cell(title, true)),
            ...findings.map((row) => row.map((value) => cell(value))),
          ],
          columns: [8, 14, 12, 24, 32, 60, 60, 60].map((width) => ({ width })),
          stickyRowsCount: 1,
          orientation: 'landscape',
        },
        {
          sheet: copy.scope,
          data: pairsSheet(copy.scope, scope),
          columns: [{ width: 36 }, { width: 100 }],
          stickyRowsCount: 1,
        },
      ],
      { fontFamily: 'Arial', fontSize: 11 },
    ).toBlob()
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableCell,
    TableRow,
    WidthType,
    TableLayoutType,
    HeadingLevel,
    PageOrientation,
  } = await import('docx')
  const paragraph = (text: string | number, bold = false) =>
    new Paragraph({
      children: String(text)
        .split(/\r\n|\r|\n/)
        .map((line, index) => new TextRun({ text: line, bold, break: index ? 1 : 0 })),
      spacing: { after: 80 },
      widowControl: true,
      wordWrap: true,
    })
  const table = (rows: (string | number)[][], widths: number[]) =>
    new Table({
      width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: widths,
      margins: { top: 90, bottom: 90, left: 100, right: 100 },
      rows: rows.map(
        (row, index) =>
          new TableRow({
            ...(index === 0 ? { tableHeader: true } : {}),
            cantSplit: true,
            children: row.map(
              (value, column) =>
                new TableCell({
                  width: { size: widths[column]!, type: WidthType.DXA },
                  ...(index === 0 ? { shading: { fill: 'E8EDF3' } } : {}),
                  children: [paragraph(value, index === 0)],
                }),
            ),
          }),
      ),
    })
  const heading = (text: string, pageBreakBefore = false) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_1, pageBreakBefore })
  const document = new Document({
    creator: 'PrototypeHub',
    title: copy.title,
    styles: {
      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          run: { color: '000000', size: 36, bold: true },
          paragraph: { spacing: { after: 180 }, keepNext: true },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          run: { color: '000000', size: 26, bold: true },
          paragraph: { spacing: { before: 260, after: 160 }, keepNext: true },
        },
      ],
      default: {
        document: {
          run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' }, size: 20 },
          paragraph: { spacing: { after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          new Paragraph({ text: copy.title, heading: HeadingLevel.TITLE }),
          paragraph(report.complete ? locale.qualityComplete : locale.qualityIncomplete),
          paragraph(locale.qualityScope),
          heading(copy.overview),
          table([[copy.field, copy.value], ...overview], [3000, 12300]),
          heading(copy.findings, true),
          ...(report.findings.length
            ? [
                table(
                  [
                    [
                      locale.qualityType,
                      locale.qualitySource,
                      locale.qualityTarget,
                      locale.qualityReference,
                    ],
                    ...report.findings.map((finding, index) => [
                      `${index + 1}. ${locale.qualitySeverities[finding.severity]} (${finding.severity})\n${locale.qualityCodes[finding.code]}\n${finding.code}`,
                      finding.sourcePath,
                      finding.targetPath ?? '',
                      finding.reference ?? '',
                    ]),
                  ],
                  [3300, 4000, 4000, 4000],
                ),
              ]
            : [paragraph(locale.qualityNoFindings)]),
          heading(copy.scope),
          table([[copy.field, copy.value], ...scope], [4200, 11100]),
        ],
      },
    ],
  })
  return Packer.toBlob(document)
}
