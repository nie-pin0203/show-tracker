<script setup>
import { sourceLabel } from './importing'
import { releaseKinds, releaseStatuses } from './releases'

defineProps({ rows: Array, showTitles: Boolean })
</script>

<template>
  <ul class="release-list">
    <li v-for="row in rows" :key="row.id">
      <a v-if="showTitles" :href="`#/media/${row.show_id}`"><strong>{{ row.title }}</strong></a>
      <p><strong>{{ releaseKinds[row.release_kind] }} · {{ releaseStatuses[row.release_status] }}</strong></p>
      <p>{{ row.release_date || '日期待定' }} · {{ row.release_region || '地区未注明' }} · {{ row.release_channel || '渠道未注明' }}</p>
      <p class="muted">{{ row.platform }} · {{ sourceLabel(row.source_kind) }} · {{ row.captured_at }}</p>
      <p v-if="row.source_note" class="muted">{{ row.source_note }}</p>
      <a :href="row.release_url" target="_blank" rel="noopener noreferrer" class="source-link">查看发行出处</a>
    </li>
  </ul>
</template>

<style scoped>
.release-list { display: grid; gap: 10px; padding: 0; list-style: none; }
.release-list li { background: #fff; border: 1px solid #e3e8ea; border-radius: 10px; padding: 14px; overflow-wrap: anywhere; }
.release-list li > a { color: #12695d; text-decoration: underline; }
</style>
