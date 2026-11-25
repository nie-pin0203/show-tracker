<script setup>
import { computed, ref, watch } from 'vue'
import { reviewActivity, commitActivity } from './library'
import { statuses } from './competitions'
import { formats, kinds, roles, sections, ticketKinds } from './liveEvents'
import { useOfflineForm } from './useOfflineForm'

const props = defineProps({ kind: String, initial: Object, categories: Array })
const emit = defineEmits(['saved', 'cancelled'])
const fresh = () => ({
  kind: props.kind,
  event: { source_id: '', title: '', description: '', status: 'expected', source_url: '', observed_at: new Date().toISOString() },
  performance: props.kind === 'performance' ? { format: 'concert', tour_name: '' } : null,
  festival: props.kind === 'festival' ? { edition: '' } : null,
  category: props.kind === 'activity' ? { code: '', name: '' } : null,
  people: [], sessions: [], stages: [], sets: [], tickets: [],
})
const bundle = ref(props.initial ? JSON.parse(JSON.stringify(props.initial.bundle)) : fresh())
const { previous, restored, restore, clear } = useOfflineForm(bundle,
  `event/${props.kind}/${props.initial?.id || 0}`, props.initial?.version || 0,
  draft => draft?.kind === props.kind && draft.event
    && ['people', 'sessions', 'stages', 'sets', 'tickets'].every(key => Array.isArray(draft[key])))
const preview = ref(null), approved = ref(false)
const busy = ref(false), error = ref('')
const span = [
  ['source_id', '来源标识'], ['title', '名称'], ['starts_at', '开始日期或时间'], ['ends_at', '结束日期或时间'],
  ['status', '状态', 'state'], ['source_url', '来源链接', 'url'], ['observed_at', '来源核对时间（可选）'],
]
const fields = {
  people: [['source_id', '来源标识'], ['name', '名称'], ['role', '角色', 'role'], ['source_url', '来源链接', 'url']],
  sessions: [...span, ['city', '城市'], ['venue', '场馆']],
  stages: [['source_id', '舞台标识'], ['name', '舞台名称'], ['source_url', '来源链接', 'url']],
  sets: [...span, ['session_id', '关联日程', 'session'], ['stage_id', '关联舞台', 'stage']],
  tickets: [...span, ['kind', '票务类型', 'ticket'], ['session_id', '适用场次', 'session'],
    ['platform', '票务平台'], ['purchase_url', '购票或报名链接', 'url']],
}
const displayed = computed(() => props.kind === 'festival'
  ? ['people', 'sessions', 'stages', 'sets', 'tickets'] : ['people', 'sessions', 'tickets'])
const artists = computed(() => bundle.value.people.filter(p => p.source_id && p.role !== 'organizer'))
function options(type) {
  if (type === 'session') return Object.fromEntries(bundle.value.sessions.filter(r => r.source_id).map(r => [r.source_id, r.title || r.source_id]))
  if (type === 'stage') return Object.fromEntries(bundle.value.stages.filter(r => r.source_id).map(r => [r.source_id, r.name || r.source_id]))
  return { state: statuses, role: roles, ticket: ticketKinds }[type] || null
}
function addRow(section) {
  const row = Object.fromEntries(fields[section].map(([key]) => [key, '']))
  if ('status' in row) row.status = 'expected'
  if (section === 'people') row.role = 'artist'
  if (section === 'sets') row.artist_ids = []
  if (section === 'tickets') Object.assign(row, { kind: 'general', session_id: null })
  bundle.value[section].push(row)
}
function savedRow(section, index) { return index < (props.initial?.bundle[section]?.length || 0) }
function chooseCategory(event) {
  const category = props.categories?.find(value => value.code === event.target.value)
  if (category) bundle.value.category = { ...category }
}
watch(bundle, () => { preview.value = null; approved.value = false }, { deep: true })

async function run(action) {
  busy.value = true
  error.value = ''
  try {
    const content = JSON.parse(JSON.stringify(bundle.value, (_, v) => v === '' ? null : v))
    if (!content) throw new Error('请先选择文件')
    const base = props.initial ? { event_id: props.initial.id, version: props.initial.version } : {}
    const write = action === 'commit' ? commitActivity : reviewActivity
    const result = await write('events', {
      bundle: content, ...base, ...(action === 'commit' ? { preview_token: preview.value.preview_token } : {}),
    })
    if (result.committed) { clear(); emit('saved', result.id) }
    else { preview.value = result; approved.value = false }
  } catch (e) {
    error.value = e.message
    if (action === 'commit') { preview.value = null; approved.value = false }
  } finally { busy.value = false }
}
</script>

<template>
  <form class="event-editor" novalidate @submit.prevent="run('preview')">
    <p v-if="restored" role="status">已恢复本机草稿，请核对后提交。</p>
    <p v-if="previous">草稿基于较旧版本。
      <button type="button" @click="restore">载入草稿并重新核对差异</button>
    </p>
    <fieldset :disabled="busy">
      <template>
        <div class="event-editor-grid">
          <label>活动来源标识<input v-model="bundle.event.source_id" :readonly="!!initial" maxlength="100"></label>
          <label>名称<input v-model="bundle.event.title" maxlength="200"></label>
          <label>状态<select v-model="bundle.event.status"><option v-for="(name, key) in statuses" :key="key" :value="key">{{ name }}</option></select></label>
          <label>活动来源链接<input v-model="bundle.event.source_url" type="url" maxlength="1000"></label>
          <label>来源核对时间<input v-model="bundle.event.observed_at"></label>
          <template v-if="bundle.performance">
            <label>演出类型<select v-model="bundle.performance.format"><option v-for="(name, key) in formats" :key="key" :value="key">{{ name }}</option></select></label>
            <label>巡演名称<input v-model="bundle.performance.tour_name" maxlength="200"></label>
          </template>
          <label v-if="bundle.festival">届次<input v-model="bundle.festival.edition" maxlength="200"></label>
          <template v-if="bundle.category">
            <label v-if="categories?.length">使用已有分类
              <select @change="chooseCategory"><option value="">自定义或选择</option><option v-for="c in categories" :key="c.code" :value="c.code">{{ c.name }}</option></select>
            </label>
            <label>分类代码<input v-model="bundle.category.code" maxlength="50" placeholder="例如 exhibition"></label>
            <label>分类名称<input v-model="bundle.category.name" maxlength="200"></label>
          </template>
        </div>
        <label>补充说明<textarea v-model="bundle.event.description" maxlength="1000" rows="2"></textarea></label>
        <p class="muted">只有日期时填写 YYYY-MM-DD。已知时刻或来源核对时间填写带时区的 ISO 时间，例如 2026-11-22T19:00+08:00。</p>
        <details v-for="section in displayed" :key="section" :open="section === 'sessions'">
          <summary>{{ sections[section] }}（{{ bundle[section].length }}）</summary>
          <div v-for="(row, index) in bundle[section]" :key="index" class="event-editor-grid subrecord">
            <label v-for="[key, label, type] in fields[section]" :key="key">{{ label }}
              <select v-if="options(type)" v-model="row[key]">
                <option v-if="type === 'session' || type === 'stage'" :value="section === 'tickets' ? null : ''">{{ section === 'tickets' ? '整个活动' : '请选择' }}</option>
                <option v-for="(text, value) in options(type)" :key="value" :value="value">{{ text }}</option>
              </select>
              <input v-else v-model="row[key]" :type="type || 'text'" maxlength="1000"
                :readonly="key === 'source_id' && savedRow(section, index)">
            </label>
            <div v-if="section === 'sets' && artists.length">
              <span>上场艺人</span>
              <label v-for="(artist, a) in artists" :key="a" class="event-check">
                <input v-model="row.artist_ids" type="checkbox" :value="artist.source_id"> {{ artist.name || artist.source_id }}
              </label>
            </div>
            <button v-if="!savedRow(section, index)" type="button" @click="bundle[section].splice(index, 1)">移除草稿</button>
          </div>
          <button type="button" @click="addRow(section)">添加{{ sections[section] }}</button>
        </details>
      </template>
      <button class="tracker-button" type="submit">{{ busy ? '处理中…' : '核对修改预览' }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <section v-if="preview">
        <p v-if="!preview.changes.length" role="status">内容与当前版本一致，无需重复保存。</p>
        <template v-else>
          <p>基础版本 {{ preview.version }} · 新增 {{ preview.changes.filter(c => !c.before).length }} · 更新 {{ preview.changes.filter(c => c.before).length }}</p>
          <details v-for="(change, index) in preview.changes" :key="index">
            <summary>{{ sections[change.section] }} {{ change.after.title || change.after.name || '' }}</summary>
            <pre v-if="change.before">原记录 {{ JSON.stringify(change.before, null, 2) }}</pre>
            <pre>新记录 {{ JSON.stringify(change.after, null, 2) }}</pre>
          </details>
          <label class="event-check"><input v-model="approved" type="checkbox">我已核对来源和差异</label>
          <button class="tracker-button" type="button" :disabled="!approved" @click="run('commit')">确认保存</button>
        </template>
      </section>
    <button type="button" class="tracker-button secondary" @click="bundle=JSON.parse(JSON.stringify(initial.bundle));preview=null;emit('cancelled')">取消</button>
    </fieldset>
  </form>
</template>

<style scoped>
fieldset { min-width: 0; padding: 0; margin: 0; border: 0; }
.event-editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 205px), 1fr)); gap: 10px; }
label { display: grid; gap: 4px; margin: 4px 0; }
input:not([type=checkbox]), select, textarea { width: 100%; min-width: 0; min-height: 44px; padding: 7px; border: 1px solid #cdd9db; border-radius: 7px; font: inherit; }
.event-check { display: flex; align-items: center; gap: 8px; min-height: 36px; }
.subrecord { padding: 12px; background: #f7f9f9; border-radius: 9px; margin: 8px 0; }
details { margin: 12px 0; font-size: 14px; }
button:not(.tracker-button) { padding: 6px 12px; margin-top: 4px; color: #075a4e; background: #e3f2ed; border-radius: 7px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
