<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { readActivities } from './library'
import CompetitionEditor from './CompetitionEditor.vue'
import ManualAdd from './ManualAdd.vue'
import { compareMatches, displayMoment, eventTypes, outcomes, sections, statuses } from './competitions'

const props = defineProps({ kind: String, eventId: String })
const label = computed(() => props.kind === 'esports' ? '电竞赛事' : '体育赛事')
const base = computed(() => `#/competitions/${props.kind}`)
const loading = ref(true), error = ref(''), data = ref(null)
const q = ref(''), discipline = ref(''), status = ref(''), editing = ref(false)
const bundle = computed(() => props.eventId ? data.value?.bundle : null)
const matches = computed(() => [...(bundle.value?.matches || [])].sort(compareMatches))
const entrants = computed(() => new Map((bundle.value?.participants || []).map(p => [p.source_id, p.name])))
let requestId = 0, refreshTimer

async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await readActivities('competitions', props.eventId, { kind: props.kind, q: q.value.trim(), discipline: discipline.value, status: status.value })
    if (requestId !== id) return
    if (props.eventId && result.bundle.discipline.kind !== props.kind) {
      throw new Error('此赛事属于另一个分类，请返回赛事列表。')
    }
    data.value = result
  } catch (e) { if (requestId === id) error.value = e.message }
  finally { if (requestId === id) loading.value = false }
}

function saved(id) {
  editing.value = false
  if (String(id) === props.eventId) load()
  else window.location.hash = `/competitions/${props.kind}/${id}`
}
function refreshVisible() { if (!editing.value && !loading.value && document.visibilityState !== 'hidden') load() }
onMounted(() => {
  load()
  refreshTimer = setInterval(refreshVisible, 30000)
  window.addEventListener('focus', refreshVisible)
})
onUnmounted(() => {
  requestId++
  clearInterval(refreshTimer)
  window.removeEventListener('focus', refreshVisible)
})
</script>

<template>
  <div class="competition-page">
    <nav aria-label="赛事类型" class="competition-tabs">
      <a href="#/competitions/esports" :aria-current="kind === 'esports' ? 'page' : undefined">电竞</a>
      <a href="#/competitions/sports" :aria-current="kind === 'sports' ? 'page' : undefined">体育</a>
    </nav>
    <p v-if="error" class="error" role="alert">{{ error }} <button type="button" @click="load">重读</button></p>
    <p v-if="loading && !data" role="status">正在读取赛事…</p>
    <template v-if="!eventId && data">
      <h2>{{ label }}</h2>
      <template v-if="data.enabled">
        <form class="competition-search" @submit.prevent="load">
          <label>赛事或参赛者<input v-model="q" type="search" maxlength="100"></label>
          <label>{{ kind === 'esports' ? '游戏' : '体育项目' }}
            <select v-model="discipline"><option value="">全部</option><option v-for="d in data.disciplines" :key="d.code" :value="d.code">{{ d.name }}</option></select>
          </label>
          <label>赛事状态<select v-model="status"><option value="">全部</option><option v-for="(name, value) in statuses" :key="value" :value="value">{{ name }}</option></select></label>
          <button class="tracker-button secondary" type="submit">筛选</button>
        </form>
        <details class="competition-panel" :open="editing" @toggle="editing = $event.target.open">
          <summary>添加赛事</summary>
          <ManualAdd :kind="kind" @saved="saved" />
        </details>
        <p v-if="!data.items.length" class="state">暂无匹配赛事。</p>
        <ul v-else class="competition-cards">
          <li v-for="item in data.items" :key="item.id">
            <a :href="`${base}/${item.id}`"><strong>{{ item.title }}</strong>
              <span>{{ item.discipline_name }} · {{ eventTypes[item.event_type] }} · {{ statuses[item.status] }}</span>
              <span>{{ displayMoment(item.starts_at) }}{{ item.season ? ` · ${item.season}` : '' }}</span>
            </a>
          </li>
        </ul>
      </template>
    </template>
    <template v-if="bundle">
      <a :href="base" class="tracker-button secondary">返回{{ label }}列表</a>
      <section class="competition-panel">
        <h2>{{ bundle.event.title }}</h2>
        <p>{{ bundle.discipline.name }} · {{ eventTypes[bundle.event.event_type] }} · {{ statuses[bundle.event.status] }}</p>
        <p v-if="bundle.event.season">赛季 / 届次 {{ bundle.event.season }}</p>
        <p>开始 {{ displayMoment(bundle.event.starts_at) }}　结束 {{ displayMoment(bundle.event.ends_at) }}</p>
        <p class="muted">来源核对 {{ displayMoment(bundle.event.observed_at) }} · 版本 {{ data.version }}</p>
        <p v-if="bundle.event.description">{{ bundle.event.description }}</p>
        <a v-if="bundle.event.source_url" :href="bundle.event.source_url" class="source-link" rel="noopener noreferrer" target="_blank">赛事来源</a>
      </section>
      <details class="competition-panel" :open="editing" @toggle="editing = $event.target.open">
        <summary>编辑赛事、赛程和结果</summary>
        <CompetitionEditor :key="data.version" :kind="kind" :initial="data" @saved="saved" @cancelled="editing=false" />
      </details>
      <section class="competition-panel">
        <h2>参赛对象</h2>
        <ul v-if="bundle.participants.length">
          <li v-for="p in bundle.participants" :key="p.source_id">
            <a :href="p.source_url" class="source-link" target="_blank" rel="noopener noreferrer">{{ p.name }}</a>
            · {{ p.kind === 'team' ? (kind === 'esports' ? '战队' : '球队') : (kind === 'esports' ? '选手' : '运动员') }}
            <span v-if="p.team_ids.length"> · {{ p.team_ids.map(id => entrants.get(id)).join('、') }}</span>
          </li>
        </ul>
        <p v-else class="muted">暂无参赛资料。</p>
      </section>
      <section class="competition-panel">
        <h2>赛程和赛果</h2>
        <p v-if="!matches.length" class="muted">暂无赛程记录。</p>
        <article v-for="match in matches" :key="match.source_id" class="match-card">
          <h3>{{ match.title }}</h3>
          <p>{{ displayMoment(match.starts_at) }} · {{ statuses[match.status] }}{{ match.stage ? ` · ${match.stage}` : '' }}</p>
          <p v-if="match.venue">场馆 {{ match.venue }}</p>
          <ul v-if="match.entries.length">
            <li v-for="entry in match.entries" :key="entry.participant_id">
              {{ entrants.get(entry.participant_id) }} · {{ entry.score ?? '比分未知' }}
              <span v-if="entry.outcome">（{{ outcomes[entry.outcome] }}）</span>
            </li>
          </ul>
          <p class="muted">记录核对 {{ displayMoment(match.observed_at) }}</p>
          <a :href="match.source_url" target="_blank" rel="noopener noreferrer" class="source-link">赛程与比分来源</a>
          <a v-if="match.watch_url" :href="match.watch_url" target="_blank" rel="noopener noreferrer" class="source-link">打开直播入口</a>
        </article>
      </section>
      <section class="competition-panel">
        <h2>排名快照</h2>
        <p v-if="!bundle.standings.length" class="muted">暂无有来源的排名。</p>
        <details v-for="ranking in bundle.standings" :key="`${ranking.as_of}/${ranking.group_name}`">
          <summary>{{ ranking.group_name }} · {{ ranking.as_of }}</summary>
          <ul><li v-for="entry in ranking.entries" :key="entry.participant_id">
            第 {{ entry.rank }} · {{ entrants.get(entry.participant_id) }}<span v-if="entry.points != null"> · {{ entry.points }} 分</span>
          </li></ul>
          <a :href="ranking.source_url" class="source-link" target="_blank" rel="noopener noreferrer">排名来源</a>
        </details>
      </section>
      <section v-if="data.history.length" class="competition-panel">
        <h2>变更历史</h2>
        <details v-for="revision in data.history" :key="revision.version">
          <summary>版本 {{ revision.version }} · {{ displayMoment(revision.saved_at) }}</summary>
          <details v-for="(change, index) in revision.changes" :key="index">
            <summary>{{ change.before ? '修订' : '新增' }}{{ sections[change.section] }} · {{ change.after.title || change.after.name || change.after.group_name }}</summary>
            <pre v-if="change.before">原记录 {{ JSON.stringify(change.before, null, 2) }}</pre>
            <pre>新记录 {{ JSON.stringify(change.after, null, 2) }}</pre>
          </details>
        </details>
      </section>
    </template>
  </div>
</template>

<style scoped>
.competition-page { display: grid; gap: 16px; }
.competition-tabs { display: flex; gap: 8px; }
.competition-tabs a { display: grid; place-items: center; padding: 6px 18px; min-height: 44px; border: 1px solid #d4e1df; border-radius: 8px; }
.competition-tabs a[aria-current="page"] { background: #e3f2ed; color: #075a4e; font-weight: 700; }
.competition-page > .tracker-button { justify-self: start; }
.competition-search { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.competition-search label { display: grid; gap: 4px; font-size: 14px; }
.competition-search input, .competition-search select { min-height: 44px; min-width: 0; padding: 7px; border: 1px solid #cdd9db; border-radius: 7px; }
.competition-panel, .competition-cards li { background: #fff; border: 1px solid #e3e8ea; border-radius: 12px; padding: 14px; }
.competition-panel { font-size: 14px; overflow-wrap: anywhere; }
.competition-panel > summary { font-weight: 700; }
.competition-panel p { margin: 5px 0; }
.competition-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 10px; padding: 0; margin: 0; list-style: none; }
.competition-cards li a { display: grid; min-height: 44px; gap: 4px; }
.competition-cards li span { color: #53666c; font-size: 13px; }
.match-card { border: 1px solid #e3e8ea; background: #f7f9f9; border-radius: 8px; margin: 10px 0; padding: 12px; }
.match-card a { margin-right: 14px; }
details, pre { font-size: 14px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 500px) { .competition-search label { width: 100%; } }
</style>
