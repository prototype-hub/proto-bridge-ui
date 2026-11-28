import type {
  Study,
  StudyScope,
  OwnStudyResponse,
  StudyAggregate,
} from '@/modules/protohub-manager-ui/types/usability-study'
import { ownerProjectAccess } from './project-access'
export const studyScope: StudyScope = {
  kind: 'member',
  actorId: 'member',
  project: {
    id: 'p1',
    name: 'P',
    createdBy: 'member',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
  revision: {
    id: 'r1',
    projectId: 'p1',
    versionId: 'v1',
    versionName: 'V1',
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 1,
    totalBytes: 5,
    createdBy: 'member',
    createdAt: 1,
  },
  context: {
    revisionId: 'r1',
    title: 'P',
    versionName: 'V1',
    runtimeBaseUrl: '/api/prototype-hub/runtime/grant',
    entryFile: 'index.html',
    pages: [
      { name: 'Home', pageId: 'home', path: 'index.html' },
      { name: 'Folder', pageId: 'folder', folder: true },
    ],
  },
}
export const study: Study = {
  id: 'study1',
  projectId: 'p1',
  versionId: 'v1',
  revisionId: 'r1',
  title: 'Find a product',
  introduction: 'Try the prototype.',
  consentText: 'I agree to share my feedback for this study.',
  tasks: [
    {
      id: 'task1',
      title: 'Find product',
      objective: 'Use search',
      prerequisites: '',
      resetNote: '',
      steps: [{ id: 'step1', pageId: 'home', narration: 'Start at Home' }],
    },
  ],
  questions: [
    {
      id: 'choice',
      prompt: 'Was the label clear?',
      type: 'singleChoice',
      required: true,
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    },
    { id: 'rate', prompt: 'Ease', type: 'rating', required: false, options: [] },
    { id: 'text', prompt: 'What could improve?', type: 'text', required: false, options: [] },
  ],
  state: 'draft',
  contentVersion: null,
  configVersion: 0,
  createdBy: 'member',
  updatedBy: 'member',
  createdAt: 1,
  updatedAt: 1,
}
export const ownStudyResponse: OwnStudyResponse = {
  id: 'own',
  contentVersion: 1,
  configVersion: 0,
  status: 'draft',
  taskAnswers: [],
  answers: [],
  feedback: '',
}
export const studyAggregate: StudyAggregate = {
  submittedCount: 1,
  tasks: [{ title: 'Find product', completed: 1, notCompleted: 0, skipped: 0, missing: 0 }],
  questions: [
    {
      prompt: 'Was the label clear?',
      type: 'singleChoice',
      answered: 1,
      missing: 0,
      options: [
        { label: 'Yes', count: 1 },
        { label: 'No', count: 0 },
      ],
    },
  ],
  excludedTextQuestionCount: 1,
}

// Jackson's HTTP Answer record includes every nullable field; requests and editor state remain sparse.
export const submittedStudyWireResponse = {
  ...ownStudyResponse,
  status: 'submitted' as const,
  configVersion: 2,
  taskAnswers: [
    { taskId: 'task1', outcome: 'completed' as const, feedback: 'Synthetic task feedback' },
  ],
  answers: [
    { questionId: 'choice', optionId: 'yes', rating: null, text: null },
    { questionId: 'rate', optionId: null, rating: 4, text: null },
    { questionId: 'text', optionId: null, rating: null, text: 'Synthetic text feedback' },
  ],
  feedback: '',
}
