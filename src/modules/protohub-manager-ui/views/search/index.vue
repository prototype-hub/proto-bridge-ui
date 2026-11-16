<script setup lang="ts">
defineOptions({ name: 'PrototypeSearchView' })
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  Button as AButton,
  Input as AInput,
  Pagination as APagination,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Result as AResult,
  Spin as ASpin,
  Tag as ATag,
  theme,
} from 'ant-design-vue'
import { SearchOutlined, ExportOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import PageContainer from '@/shared/components/PageContainer.vue'
import { usePrototypeSearch } from '../../hooks/usePrototypeSearch'
import { searchScope, searchSourceLocation, searchHighlights } from '../../utils/search'
import type { SearchType } from '../../types/search'

const { token: designToken } = theme.useToken()
const route = useRoute(),
  { t, locale } = useI18n()
const scope = computed(() => searchScope(route.query))
const state = usePrototypeSearch(scope)
const { keyword, submitted, invalid, type, pageIndex, pageSize, canQuery, resource } = state
const data = resource.data,
  loading = resource.loading,
  error = resource.error
const input = ref<{ focus: () => void }>(),
  resultHeading = ref<HTMLElement>()
const types: SearchType[] = ['COPY', 'MATERIAL', 'FEEDBACK']
const hasScope = computed(() => scope.value && Object.keys(scope.value).length > 0)
const scopeLabel = computed(() =>
  t(
    scope.value?.revisionId
      ? 'proto.searchRevisionScope'
      : scope.value?.versionId
        ? 'proto.searchVersionScope'
        : scope.value?.projectId
          ? 'proto.searchProjectScope'
          : 'proto.searchAllScope',
  ),
)
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const date = (value: number) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
async function search() {
  if (!state.submit()) {
    await nextTick()
    input.value?.focus()
  }
}
async function paginate(page: number, size: number) {
  state.paginate(page, size)
  await nextTick()
  resultHeading.value?.focus()
}
</script>
<template>
  <page-container class="content-search" :title="t('proto.searchTitle')">
    <section class="panel search-controls" :aria-label="t('proto.searchTitle')">
      <div class="search-scope">
        <strong>{{ scopeLabel }}</strong>
        <router-link v-if="hasScope || scope === null" :to="{ name: 'PrototypeHub-search' }">{{
          t('proto.searchClearScope')
        }}</router-link>
      </div>
      <details v-if="hasScope" class="search-scope-identity">
        <summary>{{ t('proto.searchScopeDetails') }}</summary>
        <dl>
          <template v-for="(value, key) in scope" :key="key"
            ><dt>{{ t(`proto.searchScope_${key}`) }}</dt>
            <dd>{{ value }}</dd></template
          >
        </dl>
      </details>
      <form class="search-form" @submit.prevent="search">
        <label for="prototype-content-keyword">{{ t('proto.searchKeyword') }}</label>
        <div class="search-input-row">
          <a-input
            id="prototype-content-keyword"
            ref="input"
            v-model:value="keyword"
            name="keyword"
            type="search"
            autocomplete="off"
            :maxlength="100"
            :placeholder="t('proto.searchPlaceholder')"
            :aria-invalid="!!invalid"
            :aria-describedby="invalid ? 'prototype-search-invalid' : 'prototype-search-hint'"
          />
          <a-button
            type="primary"
            html-type="submit"
            :loading="loading"
            :disabled="!canQuery || scope === null"
            ><search-outlined aria-hidden="true" />{{ t('proto.searchSubmit') }}</a-button
          >
        </div>
        <p v-if="invalid" id="prototype-search-invalid" class="search-invalid" role="alert">
          {{ invalid }}
        </p>
      </form>
      <a-radio-group v-model:value="type" class="search-types" :aria-label="t('proto.searchType')">
        <a-radio-button v-for="item in types" :key="item" :value="item">{{
          t(`proto.search${item}`)
        }}</a-radio-button>
      </a-radio-group>
      <p id="prototype-search-hint" class="search-coverage">{{ t(`proto.searchHint${type}`) }}</p>
    </section>
    <a-result
      v-if="!canQuery"
      status="403"
      :title="t('proto.searchNoAccess')"
      :sub-title="t('proto.searchNoAccessHint')"
    />
    <a-result
      v-else-if="scope === null"
      status="warning"
      :title="t('proto.searchInvalidScope')"
      :sub-title="t('proto.searchInvalidScopeHint')"
    />
    <section
      v-else
      class="panel search-results"
      :aria-busy="loading"
      aria-labelledby="prototype-search-results"
    >
      <header class="search-result-header">
        <div>
          <h2 id="prototype-search-results" ref="resultHeading" tabindex="-1">
            {{ t('proto.searchResults') }}
          </h2>
          <p v-if="submitted" class="search-submitted">
            {{ t('proto.searchFor', { keyword: submitted }) }}
          </p>
        </div>
        <span v-if="data" class="search-count" role="status">{{
          t('proto.searchCount', { count: number(data.total) }, data.total)
        }}</span>
      </header>
      <div v-if="loading" class="search-loading" role="status" :aria-label="t('common.loading')">
        <a-spin /><span>{{ t('common.loading') }}</span>
      </div>
      <a-result v-else-if="error" status="error" :title="t('proto.searchFailed')" :sub-title="error"
        ><template #extra
          ><a-button @click="resource.load">{{ t('proto.searchRetry') }}</a-button></template
        ></a-result
      >
      <div v-else-if="!submitted" class="search-empty">
        <search-outlined aria-hidden="true" />
        <h3>{{ t('proto.searchStart') }}</h3>
        <p>{{ t('proto.searchStartHint') }}</p>
      </div>
      <div v-else-if="data && !data.total" class="search-empty">
        <h3>{{ t('proto.searchNoMatches') }}</h3>
        <p>{{ t('proto.searchNoMatchesHint') }}</p>
      </div>
      <template v-else-if="data">
        <ol class="search-result-list">
          <li v-for="row in data.data" :key="`${row.type}:${row.sourceId}`">
            <div class="search-result-context">
              <span>{{ row.projectName }}</span
              ><span aria-hidden="true">/</span><span>{{ row.versionName }}</span
              ><a-tag v-if="row.visibility === 'internal'" color="orange">{{
                t('proto.searchInternal')
              }}</a-tag
              ><a-tag v-else-if="row.visibility === 'public'">{{ t('proto.searchPublic') }}</a-tag>
            </div>
            <h3>
              <router-link
                :to="searchSourceLocation(row)"
                target="_blank"
                rel="noopener"
                :title="t('proto.searchNewWindow')"
                >{{ row.title }}</router-link
              >
            </h3>
            <p class="search-snippet">
              <template
                v-for="(part, index) in searchHighlights(row.snippet, submitted)"
                :key="index"
                ><mark v-if="part.match">{{ part.text }}</mark
                ><template v-else>{{ part.text }}</template></template
              >
            </p>
            <dl class="search-result-meta">
              <div>
                <dt>{{ t('proto.searchFixedRevision') }}</dt>
                <dd>
                  <time
                    :datetime="new Date(row.revisionCreatedAt).toISOString()"
                    :title="row.revisionId"
                    >{{ date(row.revisionCreatedAt) }}</time
                  >
                  <details class="search-revision-id">
                    <summary>
                      {{ row.revisionId.slice(0, 12) }}{{ row.revisionId.length > 12 ? '…' : '' }}
                    </summary>
                    <span>{{ row.revisionId }}</span>
                  </details>
                </dd>
              </div>
              <div v-if="row.pagePath">
                <dt>{{ t('proto.searchPage') }}</dt>
                <dd>{{ row.pagePath }}</dd>
              </div>
              <div>
                <dt>{{ t(`proto.searchField_${row.matchField}`) }}</dt>
                <dd>{{ t('proto.searchUpdated') }} {{ date(row.updatedAt) }}</dd>
              </div>
            </dl>
            <div class="search-result-actions">
              <router-link
                :to="searchSourceLocation(row)"
                target="_blank"
                rel="noopener"
                :aria-label="`${t(`proto.searchOpen${row.type}`)}: ${row.title} · ${t('proto.searchNewWindow')}`"
                >{{ t(`proto.searchOpen${row.type}`)
                }}<export-outlined aria-hidden="true" /></router-link
              ><router-link
                v-if="scope?.projectId !== row.projectId"
                :to="{ name: 'PrototypeHub-search', query: { projectId: row.projectId } }"
                >{{ t('proto.searchScopeProject') }}</router-link
              >
            </div>
          </li>
        </ol>
        <div class="search-pagination">
          <a-pagination
            :current="pageIndex + 1"
            :page-size="pageSize"
            :total="data.total"
            :show-size-changer="true"
            :page-size-options="['10', '20', '50']"
            :show-less-items="true"
            @change="paginate"
          />
        </div>
      </template>
    </section>
    <details class="search-about">
      <summary>{{ t('proto.searchAbout') }}</summary>
      <p>{{ t('proto.searchAboutCOPY') }}</p>
      <p>{{ t('proto.searchAboutMATERIAL') }}</p>
      <p>{{ t('proto.searchAboutFEEDBACK') }}</p>
    </details>
  </page-container>
</template>
<style scoped>
.content-search {
  min-width: 0;
}
.search-controls {
  margin-bottom: var(--space-4);
}
.search-scope,
.search-result-header,
.search-input-row,
.search-result-context,
.search-result-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.search-scope,
.search-result-header {
  justify-content: space-between;
  flex-wrap: wrap;
}
.search-scope {
  margin-bottom: var(--space-4);
  font-size: var(--text-small);
}
.search-scope strong {
  color: var(--color-muted);
  font-weight: 500;
}
.search-scope-identity {
  margin-bottom: var(--space-4);
  color: var(--color-muted);
  font-size: var(--text-small);
}
.search-scope-identity summary,
.search-revision-id summary {
  cursor: pointer;
  width: fit-content;
  padding-block: var(--space-1);
}
.search-scope-identity dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  margin: var(--space-2) 0;
}
.search-scope-identity dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.search-revision-id span {
  display: block;
  overflow-wrap: anywhere;
  max-width: 50ch;
}
.search-form label {
  display: block;
  font-weight: 500;
  margin-bottom: var(--space-2);
}
.search-input-row :deep(.ant-input) {
  min-height: 40px;
  min-width: 0;
}
.search-input-row :deep(.ant-btn) {
  min-height: 40px;
}
.search-types {
  display: flex;
  flex-wrap: wrap;
  margin-top: var(--space-4);
}
.search-types :deep(.ant-radio-button-wrapper) {
  height: auto;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  white-space: normal;
}
.search-coverage,
.search-submitted,
.search-result-meta,
.search-about {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.search-coverage {
  margin: var(--space-3) 0 0;
  line-height: 1.6;
}
.search-invalid {
  color: v-bind('designToken.colorErrorTextActive');
  margin: var(--space-2) 0 0;
}
.search-result-header {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
h2 {
  font-size: 17px;
  margin: 0;
  scroll-margin-top: var(--space-4);
}
.search-submitted {
  margin: var(--space-2) 0 0;
  overflow-wrap: anywhere;
}
.search-count {
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
.search-result-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.search-result-list li {
  padding: var(--space-6) 0;
  border-bottom: 1px solid var(--color-border);
  min-width: 0;
}
.search-result-context {
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-muted);
  font-size: var(--text-small);
  overflow-wrap: anywhere;
}
.search-result-list h3 {
  font-size: 16px;
  font-weight: 600;
  margin: var(--space-2) 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.search-snippet {
  margin: var(--space-2) 0 var(--space-3);
  max-width: 75ch;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
mark {
  color: var(--color-text);
  background: v-bind('designToken.colorPrimaryBg');
  font-weight: 600;
  padding-inline: 1px;
}
.search-result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-6);
  margin: 0;
}
.search-result-meta div {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}
.search-result-meta dt {
  flex: none;
}
.search-result-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.search-result-actions {
  margin-top: var(--space-3);
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-6);
}
.search-result-actions a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
}
.search-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-6);
}
.search-empty {
  text-align: center;
  padding: var(--space-8) var(--space-4);
}
.search-empty > :deep(.anticon) {
  font-size: 26px;
  color: var(--color-muted);
}
.search-empty h3 {
  margin: var(--space-3) 0 var(--space-2);
  font-size: 17px;
}
.search-empty p {
  max-width: 64ch;
  margin: 0 auto;
  line-height: 1.7;
  color: var(--color-muted);
}
.search-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-3);
  min-height: 220px;
  color: var(--color-muted);
}
.search-about {
  margin-top: var(--space-4);
  line-height: 1.7;
}
.search-about summary {
  cursor: pointer;
  width: fit-content;
  padding-block: var(--space-2);
}
.search-about p {
  max-width: 75ch;
  margin: var(--space-2) 0;
}
@media (max-width: 600px) {
  .search-controls,
  .search-results {
    padding: var(--space-4);
  }
  .search-types {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
  }
  .search-types :deep(.ant-radio-button-wrapper) {
    justify-content: center;
    text-align: center;
    padding: var(--space-2);
    line-height: 1.4;
    min-height: 48px;
  }
  .search-input-row {
    gap: var(--space-2);
  }
  .search-input-row :deep(.ant-input),
  .search-input-row :deep(.ant-btn) {
    min-height: 44px;
  }
  .search-result-meta {
    display: grid;
    gap: var(--space-2);
  }
  .search-result-actions a {
    min-height: 44px;
  }
  .search-result-list li {
    padding-block: var(--space-4);
  }
  .search-pagination {
    flex-wrap: wrap;
  }
}
</style>
