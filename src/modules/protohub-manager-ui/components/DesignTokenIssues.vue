<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DesignTokenReport } from '../types/design-token-package'
defineProps<{ report: DesignTokenReport; label: string }>()
const { t, te } = useI18n()
</script>
<template>
  <section class="token-report" :aria-label="label">
    <div class="token-report-status">
      <strong>{{ label }}</strong
      ><span>{{ t(report.valid ? 'proto.tokenValid' : 'proto.tokenInvalid') }}</span>
    </div>
    <details v-if="report.issues.length" :open="!report.valid">
      <summary>{{ t('proto.tokenIssues', { count: report.issues.length }) }}</summary>
      <ol>
        <li
          v-for="(issue, index) in report.issues"
          :key="`${issue.pointer}:${issue.code}:${index}`"
        >
          <span
            >{{
              t(issue.severity === 'error' ? 'proto.tokenIssueError' : 'proto.tokenIssueWarning')
            }}
            ·
            {{
              te(`proto.tokenIssue_${issue.code}`)
                ? t(`proto.tokenIssue_${issue.code}`)
                : issue.code
            }}</span
          >
          <p>{{ issue.message }}</p>
          <code>{{ issue.pointer || '/' }}</code>
        </li>
      </ol>
    </details>
    <p v-if="report.truncated" role="status">{{ t('proto.tokenTruncated') }}</p>
  </section>
</template>
<style scoped>
.token-report {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.token-report-status {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.token-report-status span {
  color: var(--color-muted);
}
summary {
  cursor: pointer;
}
ol {
  margin: var(--space-3) 0 0;
  padding-inline-start: var(--space-6);
  display: grid;
  gap: var(--space-3);
}
li,
code {
  overflow-wrap: anywhere;
}
p {
  margin: var(--space-1) 0;
}
</style>
