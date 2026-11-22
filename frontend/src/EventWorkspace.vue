<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { readActivities } from './library'
import { compareMatches as byStart, displayMoment, statuses } from './competitions'
import { formats, kinds, roles, sections, ticketKinds } from './liveEvents'
import EventEditor from './EventEditor.vue'

const props = defineProps({ kind: String, eventId: String })
const base = computed(() => `#/events/${props.kind}`)
const data = ref(null), loading = ref(true), editing = ref(false), error = ref('')
const filters = ref({ q: '', city: '', venue: '', start: '', end: '', category: '', status: '' })
const bundle = computed(() => props.eventId ? data.value?.bundle : null)
const sessions = computed(() => [...(bundle.value?.sessions || [])].sort(byStart))
const tickets = computed(() => [...(bundle.value?.tickets || [])].sort(byStart))
const stages = computed(() => new Map((bundle.value?.stages || []).map(stage => [stage.source_id, stage])))
const people = computed(() => new Map((bundle.value?.people || []).map(person => [person.source_id, person.name])))
const sets = computed(() => {
  const bySession = new Map()
  for (const slot of [...(bundle.value?.sets || [])].sort(byStart)) {
    if (!bySession.has(slot.session_id)) bySession.set(slot.session_id, [])
    bySession.get(slot.session_id).push(slot)
  }
  return bySession
})
let requestId = 0, refreshTimer

function windowLabel(row) {
  if (!row.ends_at) return displayMoment(row.starts_at)
  return `${displayMoment(row.starts_at)} 至 ${displayMoment(row.ends_at)}`
}
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await readActivities('events', props.eventId, { ...filters.value, kind: props.kind })
    if (id !== requestId) return
    if (props.eventId && result.bundle.kind !== props.kind) throw new Error('此活动属于另一个分类，请返回列表。')
    data.value = result
  } catch (e) { if (id === requestId) error.value = e.message }
  finally { if (id === requestId) loading.value = false }
}
function saved(id) {
  editing.value = false
  if (String(id) === props.eventId) load()
  else window.location.hash = `/events/${props.kind}/${id}`
}
function refresh() {
  if (!editing.value && !loading.value && document.visibilityState !== 'hidden') load()
}
onMounted(() => {
  load()
  refreshTimer = setInterval(refresh, 30000)
  window.addEventListener('focus', refresh)
})
onUnmounted(() => {
  requestId++
  clearInterval(refreshTimer)
  window.removeEventListener('focus', refresh)
})
</script>

<template>
  <div class="events-page">
    <nav class="events-tabs" aria-label="活动类型">
      <a v-for="(title, key) in kinds" :key="key" :href="`#/events/${key}`" :aria-current="key === kind ? 'page' : undefined">{{ title }}</a>
    </nav>
    <p v-if="error" class="error" role="alert">{{ error }} <button type="button" @click="load">重读</button></p>
    <p v-if="loading && !data" role="status">正在读取活动…</p>
    <template v-if="!eventId && data">
      <h2>{{ kinds[kind] }}</h2>
      <template v-if="data.enabled">
        <form class="events-search" @submit.prevent="load">
          <label>活动、巡演或艺人<input v-model="filters.q" type="search" maxlength="100"></label>
          <label>城市<input v-model="filters.city" type="search" maxlength="100"></label>
          <label>场馆<input v-model="filters.venue" type="search" maxlength="100"></label>
          <label>起始日期<input v-model="filters.start" type="date"></label>
          <label>截止日期<input v-model="filters.end" type="date"></label>
          <label v-if="kind === 'activity'">分类
            <select v-model="filters.category"><option value="">全部</option><option v-for="c in data.categories" :key="c.code" :value="c.code">{{ c.name }}</option></select>
          </label>
          <label>状态
            <select v-model="filters.status"><option value="">全部</option><option v-for="(title, key) in statuses" :key="key" :value="key">{{ title }}</option></select>
          </label>
          <button type="submit" class="tracker-button secondary">筛选</button>
        </form>
        <details class="events-panel" :open="editing" @toggle="editing = $event.target.open">
          <summary>新增或导入{{ kinds[kind] }}</summary>
          <EventEditor :kind="kind" :categories="data.categories" @saved="saved" />
        </details>
        <p v-if="!data.items.length" class="state">暂无匹配活动。</p>
        <ul v-else class="event-cards">
          <li v-for="item in data.items" :key="item.id">
            <a :href="`${base}/${item.id}`">
              <strong>{{ item.title }}</strong>
              <span>{{ formats[item.format] || item.category_name || item.edition || kinds[item.kind] }} · {{ statuses[item.status] }}</span>
              <span>最早场次 {{ item.first_day || '待定' }}{{ item.tour_name ? ` · ${item.tour_name}` : '' }}</span>
            </a>
          </li>
        </ul>
      </template>
    </template>
    <template v-if="bundle">
      <a :href="base" class="tracker-button secondary">返回{{ kinds[kind] }}列表</a>
      <section class="events-panel">
        <h2>{{ bundle.event.title }}</h2>
        <p>{{ formats[bundle.performance?.format] || bundle.category?.name || kinds[kind] }} · {{ statuses[bundle.event.status] }}</p>
        <p v-if="bundle.performance?.tour_name">巡演 {{ bundle.performance.tour_name }}</p>
        <p v-if="bundle.festival?.edition">届次 {{ bundle.festival.edition }}</p>
        <p v-if="bundle.event.description">{{ bundle.event.description }}</p>
        <p class="muted">来源核对 {{ displayMoment(bundle.event.observed_at) }} · 版本 {{ data.version }}</p>
        <a :href="bundle.event.source_url" target="_blank" rel="noopener noreferrer" class="source-link">查看活动出处</a>
      </section>
      <details class="events-panel" :open="editing" @toggle="editing = $event.target.open">
        <summary>编辑活动资料</summary>
        <EventEditor :key="data.version" :kind="kind" :initial="data" @saved="saved" />
      </details>
      <section v-if="bundle.people.length" class="events-panel">
        <h2>艺人、嘉宾与主办方</h2>
        <ul><li v-for="p in bundle.people" :key="p.source_id">
          <a :href="p.source_url" target="_blank" rel="noopener noreferrer" class="source-link">{{ p.name }}</a> · {{ roles[p.role] }}
        </li></ul>
      </section>
      <section class="events-panel">
        <h2>{{ kind === 'festival' ? '每日舞台安排' : '场次与日程' }}</h2>
        <p v-if="!sessions.length" class="muted">暂无已录入的日程。</p>
        <article v-for="row in sessions" :key="row.source_id" class="schedule-card">
          <h3>{{ row.title }}</h3>
          <p>{{ windowLabel(row) }} · {{ statuses[row.status] }}</p>
          <p v-if="row.city || row.venue">{{ [row.city, row.venue].filter(Boolean).join(' · ') }}</p>
          <p v-if="row.observed_at" class="muted">来源核对 {{ displayMoment(row.observed_at) }}</p>
          <a :href="row.source_url" target="_blank" rel="noopener noreferrer" class="source-link">日程来源</a>
          <ul v-if="sets.get(row.source_id)?.length">
            <li v-for="slot in sets.get(row.source_id)" :key="slot.source_id">
              <strong>{{ slot.title }}</strong> · {{ stages.get(slot.stage_id)?.name }} · {{ statuses[slot.status] }}
              <p>{{ windowLabel(slot) }}<span v-if="slot.artist_ids.length"> · {{ slot.artist_ids.map(id => people.get(id)).join('、') }}</span></p>
              <a :href="slot.source_url" target="_blank" rel="noopener noreferrer" class="source-link">时段来源</a>
              <a :href="stages.get(slot.stage_id)?.source_url" target="_blank" rel="noopener noreferrer" class="source-link">舞台来源</a>
            </li>
          </ul>
        </article>
      </section>
      <section class="events-panel">
        <h2>票务与报名</h2>
        <p v-if="!tickets.length" class="muted">暂无已录入的票务信息。</p>
        <article v-for="row in tickets" :key="row.source_id" class="schedule-card">
          <h3>{{ row.title }} · {{ ticketKinds[row.kind] }}</h3>
          <p>{{ windowLabel(row) }} · {{ statuses[row.status] }}</p>
          <p>{{ (row.session_id && sessions.find(s => s.source_id === row.session_id)?.title) || '整个活动' }}{{ row.platform ? ` · ${row.platform}` : '' }}</p>
          <p v-if="row.observed_at" class="muted">来源核对 {{ displayMoment(row.observed_at) }}</p>
          <a :href="row.source_url" target="_blank" rel="noopener noreferrer" class="source-link">票务来源</a>
          <a v-if="row.purchase_url" :href="row.purchase_url" target="_blank" rel="noopener noreferrer" class="source-link">购票或报名</a>
        </article>
      </section>
      <section v-if="data.history.length" class="events-panel">
        <h2>变更历史</h2>
        <details v-for="revision in data.history" :key="revision.version">
          <summary>版本 {{ revision.version }} · {{ displayMoment(revision.saved_at) }}</summary>
          <details v-for="(change, index) in revision.changes" :key="index">
            <summary>{{ sections[change.section] }} {{ change.after.title || change.after.name || '' }}</summary>
            <pre v-if="change.before">原记录 {{ JSON.stringify(change.before, null, 2) }}</pre>
            <pre>新记录 {{ JSON.stringify(change.after, null, 2) }}</pre>
          </details>
        </details>
      </section>
    </template>
  </div>
</template>

<style scoped>
.events-page { display: grid; gap: 16px; }
.events-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.events-tabs a { display: grid; place-items: center; min-height: 44px; padding: 6px 15px; border: 1px solid #d4e1df; border-radius: 8px; }
.events-tabs a[aria-current="page"] { background: #e3f2ed; color: #075a4e; font-weight: 700; }
.events-page > .tracker-button { justify-self: start; }
.events-search { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.events-search label { display: grid; gap: 4px; font-size: 14px; }
.events-search input, .events-search select { min-height: 44px; min-width: 0; padding: 7px; border: 1px solid #cdd9db; border-radius: 7px; }
.events-panel, .event-cards li { background: #fff; border: 1px solid #e3e8ea; border-radius: 12px; padding: 14px; }
.events-panel { min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
.events-panel p { margin: 5px 0; }
.events-panel > summary { font-weight: 700; }
.event-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.event-cards li a { display: grid; gap: 4px; min-height: 44px; }
.event-cards li span { color: #53666c; font-size: 13px; }
.schedule-card { border: 1px solid #e3e8ea; background: #f7f9f9; border-radius: 8px; margin: 10px 0; padding: 12px; }
.schedule-card a { margin-right: 14px; }
details, pre { font-size: 14px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 500px) { .events-search label { width: 100%; } }
</style>
