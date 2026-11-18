import { searchableCopy } from './copy-inventory'
import { searchableMaterials } from './revision-material'
import { searchableFeedback } from './review-thread'
import type { Project, Revision, Version } from '../../src/modules/protohub-manager-ui/types'
import type { PrototypeSearchResult } from '../../src/modules/protohub-manager-ui/types/search'

// UI fixture combines existing source records. Real permissions and SQL paging are backend evidence.
export function searchResponse(
  input: Record<string, unknown>,
  revisions: Map<string, Revision>,
  project: (id: string) => Project | undefined,
  version: (id: string) => Version | undefined,
  readonly: boolean,
) {
  const keyword = String(input.keyword || '').trim(),
    type = input.type
  const pageIndex = Number(input.pageIndex ?? 0),
    pageSize = Number(input.pageSize ?? 20)
  if (
    !keyword ||
    keyword.length > 100 ||
    !['COPY', 'MATERIAL', 'FEEDBACK'].includes(String(type)) ||
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex > 10000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  )
    return undefined
  const candidates: PrototypeSearchResult[] = []
  function add(
    revisionId: string,
    fields: Record<string, string | null | undefined>,
    value: Partial<PrototypeSearchResult>,
  ) {
    const revision = revisions.get(revisionId),
      p = revision && project(revision.projectId),
      v = revision && version(revision.versionId)
    if (
      !revision ||
      !p ||
      !v ||
      ['projectId', 'versionId', 'revisionId'].some(
        (key) =>
          input[key] &&
          input[key] !==
            ({ projectId: p.id, versionId: v.id, revisionId } as Record<string, string>)[key],
      )
    )
      return
    const match = Object.entries(fields).find(([, text]) =>
      text?.toLowerCase().includes(keyword.toLowerCase()),
    )
    if (!match) return
    candidates.push({
      type: type as PrototypeSearchResult['type'],
      sourceId: '',
      projectId: p.id,
      projectName: p.name,
      versionId: v.id,
      versionName: v.versionName,
      revisionId,
      revisionCreatedAt: revision.createdAt,
      pageId: null,
      pagePath: null,
      threadId: null,
      title: '',
      snippet: [...(match[1] || '')].slice(0, 240).join(''),
      matchField: match[0],
      visibility: null,
      materialType: null,
      updatedAt: revision.createdAt,
      ...value,
    })
  }
  if (type === 'COPY')
    for (const row of searchableCopy())
      add(
        row.revisionId,
        { text: row.text, businessTerm: row.businessTerm, note: row.note, pagePath: row.pagePath },
        {
          sourceId: row.id,
          title: [...row.text].slice(0, 160).join(''),
          pageId: row.pageId,
          pagePath: row.pagePath,
          updatedAt: row.updatedAt,
        },
      )
  if (type === 'MATERIAL')
    for (const row of searchableMaterials())
      add(
        row.revisionId,
        {
          fileName: row.fileName,
          sourceTool: row.sourceTool,
          sourceName: row.sourceName,
          sourceNotes: row.sourceNotes,
          textContent: row.textStatus === 'READY' ? row.textContent : undefined,
        },
        {
          sourceId: row.id,
          title: row.fileName,
          materialType: row.materialType,
          updatedAt: row.updatedAt,
        },
      )
  if (type === 'FEEDBACK' && !readonly)
    for (const row of searchableFeedback())
      add(
        row.thread.revisionId,
        { text: row.text },
        {
          sourceId: row.id,
          title: row.thread.summary,
          pageId: row.thread.pageId,
          pagePath: row.thread.pagePath,
          threadId: row.thread.id,
          visibility: row.visibility,
          updatedAt: row.createdAt,
        },
      )
  candidates.sort((a, b) => b.updatedAt - a.updatedAt || a.sourceId.localeCompare(b.sourceId))
  return {
    data: candidates.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    total: candidates.length,
    pageIndex,
    pageSize,
  }
}
