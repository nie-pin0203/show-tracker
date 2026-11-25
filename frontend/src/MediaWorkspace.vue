<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import { readToday, readWeek, listShows, saveWatchState } from './library'
import { addDays, beijingDate, untilBeijingMidnight, scheduleStats, scheduleSummary, scheduleText, scheduleLabels, audienceLabels } from './calendar'
import MediaEditor from './MediaEditor.vue'
import ManualAdd from './ManualAdd.vue'
import { videoPlatforms } from './manualForms'
import ReleaseList from './ReleaseList.vue'
import { progressDraft, saveProgressDraft } from './offline'
const props = defineProps({ route: Object })
const page = computed(() => props.route.page)
import { sourceLabel, platformLatest } from './importing'

const labels = { drama: '国产电视剧', variety: '综艺', animation: '国漫', movie: '电影' }
const today = ref(null), calendar = ref([]), shows = ref([]), activeDate = ref('')
const category = ref(''), audience = ref('vip'), query = ref(''), platform = ref('')
const favoritesOnly = ref(false), weekOffset = ref(0), customStart = ref(''), scheduleStatus = ref('expected')
const loading = ref(true), error = ref(''), syncError = ref(''), saving = ref({}), drafts = ref({}), saveErrors = ref({})
const draftVersions = ref({}), progressConflicts = ref({})
const brokenPosters = ref({})
const mutationBusy = computed(() => Object.values(saving.value).some(Boolean))
const platforms = computed(() => videoPlatforms)
const showMap = computed(() => new Map(shows.value.map(s => [s.id, s])))
const visibleShows = computed(() => shows.value.filter(s => matches(s, s.platforms.map(p => p.platform))))
const selected = computed(() => calendar.value.find(day => day.date === activeDate.value)?.items ?? [])
const filteredToday = computed(() => filter(today.value?.items ?? []))
const filteredSelected = computed(() => filter(selected.value))
const releasesOn = rows => (rows ?? []).filter(row => matches(
  { ...row, category: 'movie', is_favorite: showMap.value.get(row.show_id)?.is_favorite }, [row.platform],
))
const todaysReleases = computed(() => releasesOn(today.value?.releases))
const selectedReleases = computed(() => releasesOn(calendar.value.find(day => day.date === activeDate.value)?.releases))
const value = n => n === null || n === undefined || n === '' ? '暂无数据' : n
const dayLabel = date => new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(`${date}T00:00:00+08:00`))
const episodeText = scheduleText
const countWorks = items => scheduleSummary(items).showCount
const countText = items => {
  const stats = scheduleSummary(items)
  return `${value(stats.episodeCount)} 集 · ${value(stats.periodCount)} 期`
}
function statusToday(status, tier) {
  return (today.value?.items ?? []).filter(item => item.audience === tier && (item.schedule_status ?? 'expected') === status
    && matches({ ...item, is_favorite: showMap.value.get(item.show_id)?.is_favorite }, [item.platform]))
}
function matches(show, names) {
  return (!category.value || show.category === category.value)
    && (!platform.value || names.includes(platform.value))
    && (!(page.value === 'watchlist' || favoritesOnly.value) || !!show.is_favorite)
    && show.title.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
}
function filter(items) {
  return items.filter(item => item.audience === audience.value && (item.schedule_status ?? 'expected') === scheduleStatus.value
    && matches({ ...item, is_favorite: showMap.value.get(item.show_id)?.is_favorite }, [item.platform]))
}
function latest(show) {
  const observations = show.platforms.filter(p => !platform.value || p.platform === platform.value)
    .map(p => show.is_mock ? p.observations[audience.value] : platformLatest(p, audience.value)).filter(Boolean)
  return observations.sort((a, b) => (b.latest_episode ?? -1) - (a.latest_episode ?? -1))[0] ?? {}
}
function remaining(show) {
  if (!show.is_mock && !show.platforms.some(p => p.observations[audience.value]?.latest_episode != null)) return null
  const episode = latest(show).latest_episode
  return episode == null ? null : Math.max(0, episode - show.watched_episodes)
}
let loadVersion = 0, calendarVersion = 0, midnightTimer, retryTimer, disposed = false
async function loadData() {
  const version = ++loadVersion
  const calVersion = ++calendarVersion
  try {
    const todayData = await readToday()
    const start = customStart.value || addDays(todayData.today, weekOffset.value * 7)
    const [calendarData, showData] = await Promise.all([readWeek(start), listShows()])
    if (disposed || version !== loadVersion) return
    const crossedDay = today.value?.today !== todayData.today
    today.value = todayData
    shows.value = showData
    if (calVersion === calendarVersion) {
      calendar.value = calendarData.days
      if (crossedDay || !calendar.value.some(d => d.date === activeDate.value)) activeDate.value = start
    }
    error.value = ''; syncError.value = ''
  } catch (e) {
    if (version === loadVersion && !disposed) {
      if (!today.value) error.value = `${e.message}`
      else syncError.value = `自动刷新失败：${e.message}，当前保留上次读取的资料。`
    }
  } finally { if (version === loadVersion) loading.value = false }
}
async function changeWeek(delta, chosenDate = null) {
  const version = ++calendarVersion
  const offset = delta === 0 ? 0 : weekOffset.value + delta
  try {
    const start = chosenDate || (delta === 0 ? today.value.today : addDays(customStart.value || calendar.value[0]?.date || today.value.today, delta * 7))
    const data = await readWeek(start)
    if (version !== calendarVersion || disposed) return
    weekOffset.value = offset
    customStart.value = chosenDate || (delta === 0 ? '' : start)
    calendar.value = data.days
    activeDate.value = start
    syncError.value = ''
  } catch (e) { if (version === calendarVersion) syncError.value = `日历加载失败：${e.message}` }
}
function editProgress(show, value) {
  draftVersions.value[show.id] ??= show.version
  drafts.value[show.id] = value
  saveProgressDraft(drafts.value, draftVersions.value)
}
function discardProgress(show) {
  delete drafts.value[show.id]
  delete draftVersions.value[show.id]
  delete progressConflicts.value[show.id]
  delete saveErrors.value[show.id]
  saveProgressDraft(drafts.value, draftVersions.value)
}
function refreshProgressVersion(show) {
  draftVersions.value[show.id] = show.version
  delete progressConflicts.value[show.id]
  updateShow(show, 'progress')
}
function applyWatchState(id, state) {
  const current = showMap.value.get(id)
  if (current && (state.version == null || state.version >= current.version)) {
    Object.assign(current, {
      is_favorite: state.is_favorite,
      watched_episodes: state.watched_episodes,
      version: state.version ?? current.version,
    })
  }
}
async function updateShow(show, kind) {
  if (saving.value[show.id]) return
  if (kind === 'progress' && progressConflicts.value[show.id]) return
  saveErrors.value[show.id] = ''
  const watched = drafts.value[show.id] ?? show.watched_episodes
  if (kind === 'progress' && (watched === '' || !Number.isInteger(Number(watched)) || Number(watched) < 0 || (show.total_episodes != null && Number(watched) > show.total_episodes))) {
    saveErrors.value[show.id] = '请输入不超过总集数的非负整数'; return
  }
  saving.value[show.id] = true
  ++loadVersion // An older read must not overwrite this user's saved progress.
  try {
    const change = kind === 'favorite'
      ? { is_favorite: !show.is_favorite, version: show.version }
      : { watched_episodes: Number(watched), version: draftVersions.value[show.id] ?? show.version }
    const data = await saveWatchState(show.id, change)
    ++loadVersion
    applyWatchState(show.id, data)
    if (kind === 'progress') discardProgress(show)
  } catch (e) {
    saveErrors.value[show.id] = e.message
    if (e.current) {
      ++loadVersion
      applyWatchState(show.id, e.current)
      if (kind === 'progress') progressConflicts.value[show.id] = true
    }
  }
  finally { saving.value[show.id] = false }
}
function checkDay() {
  if (document.visibilityState === 'hidden' || mutationBusy.value) return
  if (!today.value || today.value.today !== beijingDate()) loadData()
}
function armMidnight() {
  midnightTimer = setTimeout(() => { checkDay(); armMidnight() }, untilBeijingMidnight() + 100)
}
function refreshVisible() {
  if (document.visibilityState !== 'hidden' && !mutationBusy.value) loadData()
}
watch([() => props.route.anchor, loading], async ([anchor, waiting]) => {
  if (anchor && !waiting) {
    await nextTick()
    document.getElementById(anchor)?.scrollIntoView()
  }
}, { immediate: true })
onMounted(() => {
  for (const [id, draft] of Object.entries(progressDraft())) {
    if (/^\d+$/.test(id) && typeof draft?.value === 'string' && Number.isSafeInteger(draft.version)) {
      drafts.value[id] = draft.value
      draftVersions.value[id] = draft.version
    }
  }
  loadData()
  armMidnight()
  retryTimer = setInterval(refreshVisible, 30000)
  window.addEventListener('focus', refreshVisible)
  window.addEventListener('tracker-library-changed', refreshVisible)
  document.addEventListener('visibilitychange', refreshVisible)
})
onUnmounted(() => {
  disposed = true
  clearTimeout(midnightTimer); clearInterval(retryTimer)
  window.removeEventListener('focus', refreshVisible)
  window.removeEventListener('tracker-library-changed', refreshVisible)
  document.removeEventListener('visibilitychange', refreshVisible)
})
</script>

<template>
  <div class="media-workspace">
    <div v-if="page === 'media'">
      <div class="notice"><span>来源说明</span>作品与排期由你手动填写，保存在当前浏览器。</div>
      <details class="import-panel" open><summary>添加作品</summary><ManualAdd kind="media" @saved="loadData" /></details>
      <MediaEditor :shows="shows" @changed="loadData" />

    </div>
    <div v-show="['home', 'media', 'film-calendar', 'watchlist'].includes(page)">
      <div v-show="page === 'home'" class="section-head workspace-date"><span class="muted">今日 · 北京时间</span><time>{{ today?.today ?? '—' }}</time></div>
      <p v-if="loading" class="state" role="status">正在读取数据…</p>
      <p v-else-if="error" class="state error" role="alert">{{ error }}</p>
      <template v-else>
        <p v-if="syncError" class="error" role="alert">{{ syncError }}</p>
        <div class="filters"><label>播出平台 <select v-model="platform"><option value="">全部平台</option><option v-for="name in platforms" :key="name">{{ name }}</option></select></label><label><input v-model="favoritesOnly" type="checkbox"> 我的追更</label><input v-model="query" type="search" aria-label="搜索作品名称" placeholder="搜索作品名称" maxlength="100"></div>
        <div class="toolbar"><div class="tabs" aria-label="作品分类"><button v-for="(label, key) in { '': '全部作品', ...labels }" :key="key" :class="{ active: category === key }" :aria-pressed="category === key" @click="category = key">{{ label }}</button></div><div v-if="category !== 'movie'" class="audience" aria-label="观看身份"><button v-for="(label,key) in audienceLabels" :key="key" :class="{active:audience===key}" :aria-pressed="audience===key" @click="audience=key">{{ label }}</button></div></div>
        <div v-if="category !== 'movie'" class="tabs" aria-label="排期状态"><button v-for="(label,key) in scheduleLabels" :key="key" :class="{active:scheduleStatus===key}" :aria-pressed="scheduleStatus===key" @click="scheduleStatus=key">{{ label }}</button></div>
        <section v-show="page === 'home' && category !== 'movie'" aria-label="今日分层统计"><h2>今日更新统计</h2><div class="table-wrap"><table><thead><tr><th>会员层级</th><th v-for="label in scheduleLabels" :key="label">{{ label }}</th></tr></thead><tbody><tr v-for="(tierLabel,tier) in audienceLabels" :key="tier"><td>{{ tierLabel }}</td><td v-for="(label,status) in scheduleLabels" :key="status">{{ countWorks(statusToday(status,tier)) }}部 · {{ countText(statusToday(status,tier)) }}</td></tr></tbody></table></div><p class="muted">无记录不代表确认停更；未知数量显示暂无数据。上下期按同一期去重，跨平台编号一致才去重，监测区间增量不进入本表。</p></section>
        <section v-show="page === 'home' && category !== 'movie'">
          <div class="section-head"><h2><i></i>今日更新 <span>{{ countWorks(filteredToday) }} 部作品 · {{ countText(filteredToday) }}</span></h2><span class="muted">{{ audienceLabels[audience] }} · {{ scheduleLabels[scheduleStatus] }}</span></div>
          <div class="cards">
            <article v-for="item in filteredToday" :key="item.id" class="show-card">
              <img v-if="item.poster_url && !brokenPosters[item.show_id]" class="poster-image" :src="item.poster_url" :alt="`${item.title}海报`" @error="brokenPosters[item.show_id] = true"><div v-else class="poster" :class="item.category"><span>{{ labels[item.category] }}</span><div class="poster-title">{{ item.title.replace('（模拟）', '') }}</div><small>海报暂无数据</small></div>
              <div class="card-body"><div class="card-title"><h3>{{ item.title }}</h3><b class="score">{{ value(item.score) }}<small>{{ value(item.rating_source) }}</small></b></div><p class="platform">{{ item.platform }}{{item.platform_status==='停用平台'?'（停用平台）':''}}</p><div class="update"><strong>{{ episodeText(item) }}</strong><span>{{ scheduleLabels[item.schedule_status] }} · {{ value(item.planned_count) }}{{ item.category === 'variety' ? '期内容' : '集' }}</span></div><dl><div><dt>开播日期</dt><dd>{{ value(item.premiere_date) }}</dd></div><div><dt>更新日期</dt><dd>{{ item.update_date }}</dd></div><div><dt>最近有效快照</dt><dd>{{ value(item.latest_episode) }} / {{ value(item.total_episodes) }} 集</dd></div></dl><details><summary>数据来源与状态</summary><p>{{ item.is_mock ? "模拟数据" : sourceLabel(item.source_kind) }} · {{ item.source_note }}</p><p>排期出处：{{ item.source }} · {{ item.captured_at }}</p><p>有效快照：{{ value(item.latest_as_of) }}</p></details></div>
            </article>
          </div>
          <p class="muted">按所选状态展示有明确日期的排期；来源由提供者声明，预计不等于已确认，排期不等于实际更新。</p>
          <p v-if="!filteredToday.length" class="state">暂无今日排期记录，不代表确认停更。</p>
        </section>
        <section v-if="page === 'home' && (todaysReleases.length || (category === 'movie'))">
          <h2>今日电影发行</h2>
          <ReleaseList v-if="todaysReleases.length" :rows="todaysReleases" show-titles />
          <p v-else class="muted">今日暂无电影发行记录。</p>
        </section>
        <section v-show="page === 'film-calendar'" class="calendar-section" id="calendar-section">
          <div class="section-head"><h2>{{ !customStart && weekOffset === 0 ? '未来 7 天' : '七日排期' }} <span>{{ calendar[0]?.date }} — {{ calendar[6]?.date }}</span></h2><div class="week-nav"><label>选择起始日期 <input type="date" :value="calendar[0]?.date" max="9999-12-25" @change="$event.target.value && changeWeek(0, $event.target.value)"></label><button @click="changeWeek(-1)">上一周</button><button @click="changeWeek(0)">返回今天</button><button @click="changeWeek(1)">下一周</button></div></div>
          <div class="week"><button v-for="day in calendar" :key="day.date" :class="{ selected: activeDate === day.date }" :aria-pressed="activeDate === day.date" @click="activeDate = day.date"><span>{{ day.date === today.today ? '今天' : dayLabel(day.date) }}</span><strong>{{ day.date.slice(5).replace('-', '/') }}</strong><small v-if="category !== 'movie'">{{ countWorks(filter(day.items)) }} 部作品</small><small v-if="category !== 'movie'">{{ countText(filter(day.items)) }}</small><small v-if="releasesOn(day.releases).length">{{ releasesOn(day.releases).length }} 条电影发行</small></button></div>
          <div v-if="category !== 'movie'" class="table-wrap"><table><thead><tr><th>作品 / 平台</th><th>类型</th><th>更新内容 / 状态</th><th>数量 / 来源</th><th>评分 / 来源</th></tr></thead><tbody><tr v-for="item in filteredSelected" :key="item.id"><td><a class="source-link" :href="`#/media/${item.show_id}`">{{ item.title }}</a><small>{{ item.platform }}</small></td><td>{{ labels[item.category] }}</td><td>{{ episodeText(item) }}<small>{{ scheduleLabels[item.schedule_status] }}</small></td><td>{{ value(item.planned_count) }}{{ item.category === "variety" ? "期内容" : "集" }}<small>{{ item.source_note || item.source }} · {{ item.captured_at }}</small></td><td class="score">{{ value(item.score) }}<small>{{ value(item.rating_source) }}</small></td></tr></tbody></table></div>
          <p v-if="category !== 'movie' && !filteredSelected.length" class="state">该日期暂无分集排期。</p>
          <section v-if="selectedReleases.length">
            <h2>电影发行</h2>
            <ReleaseList :rows="selectedReleases" show-titles />
          </section>
          <p v-else-if="category === 'movie'" class="state">该日期暂无电影发行记录。</p>
        </section>
        <section v-show="page === 'media' || page === 'watchlist'">
          <div class="section-head"><h2>{{ page === 'watchlist' || favoritesOnly ? '我的追更' : '作品库' }} <span>{{ visibleShows.length }} 部</span></h2><span class="muted">未看集数 = 当前身份最近有效集数 − 已看集数</span></div>
          <a class="tracker-button secondary" href="#local-editor">编辑作品、排期和评分</a>
          <div class="library"><article v-for="show in visibleShows" :key="show.id" :id="`show-${show.id}`">
            <img v-if="show.poster_url && !brokenPosters[show.id]" class="library-poster" :src="show.poster_url" :alt="`${show.title}海报`" @error="brokenPosters[show.id] = true">
            <div v-else class="poster-placeholder">海报<br>暂无数据</div>
            <div class="library-info"><h3>{{ show.title }}</h3><p class="source-badge">{{ show.is_mock ? "模拟数据" : [...new Set(show.platforms.map(p => sourceLabel(p.source_kind)))].join(" / ") }}</p><p>{{ value(labels[show.category]) }} · {{ show.platforms.map(p => p.platform==='芒果TV'?'芒果TV（停用平台）':p.platform).join(' / ') || '暂无数据' }}</p><p>{{ show.category === 'movie' ? '首映' : '开播' }} {{ value(show.premiere_date) }}</p>
              <template v-if="show.category !== 'movie'"><p>{{ "最新有效快照" }} {{ latest(show).latest_period ? `${latest(show).latest_period}期` : value(latest(show).latest_episode) }} / 总 {{ value(show.total_episodes) }} {{ show.category === "variety" ? "期" : "集" }}</p><p>有效快照 {{ value(latest(show).latest_as_of) }}</p><div v-if="!show.is_mock" class="platform-details"><details v-for="p in show.platforms" :key="p.id"><summary>{{ p.platform }}{{ p.platform==='芒果TV'?'（停用平台）':'' }} · {{ sourceLabel(p.source_kind) }}</summary><p>{{ p.title }} · 开播 {{ value(p.premiere_date) }} · 总 {{ value(p.total_episodes) }} 集/期</p><p>会员 {{ value(p.observations.vip.latest_episode) }} · 免费 {{ value(p.observations.free.latest_episode) }} · SVIP {{ value(p.observations.svip?.latest_episode) }} · 身份未知 {{ value(p.public_observation?.latest_episode ?? p.public_observation?.latest_period) }}</p><p>信息时间 {{ value(p.data_captured_at ?? p.public_observation?.latest_as_of) }} · {{ p.source_note }}</p><a v-if="p.source_url" :href="p.source_url" target="_blank" rel="noopener noreferrer">查看作品出处</a></details></div><p>已看 {{ show.watched_episodes }} 集 · 剩余未看 {{ value(remaining(show)) }} 集</p>
              </template>
              <a :href="`#/media/${show.id}`" class="source-link work-detail-link">查看作品详情</a>
              <p v-if="!show.is_mock && show.category !== 'movie'" class="muted">{{ show.has_schedule ? "有明确日期的导入/手动排期，见日历" : "暂无可靠排期" }}</p>
              <button class="favorite" :disabled="saving[show.id]" :aria-pressed="!!show.is_favorite" @click="updateShow(show, 'favorite')">{{ show.is_favorite ? '取消收藏' : '收藏追更' }}</button>
              <form v-if="show.category !== 'movie'" class="progress-form" @submit.prevent="updateShow(show, 'progress')"><label>已看至 <input :value="drafts[show.id] ?? show.watched_episodes" @input="editProgress(show, $event.target.value)" type="number" min="0" :max="show.total_episodes ?? undefined" step="1" :aria-label="`${show.title}已看集数`"> 集</label><button :disabled="saving[show.id] || progressConflicts[show.id]" type="submit">保存</button></form>
              <p v-if="saveErrors[show.id]" class="error" role="alert">{{ saveErrors[show.id] }}</p>
              <div v-if="progressConflicts[show.id]" class="progress-form">
                <button type="button" @click="discardProgress(show)">使用本机已保存进度（{{ show.watched_episodes }} 集）</button>
                <button type="button" @click="refreshProgressVersion(show)">已核对，保存我的进度</button>
              </div>
            </div><div><b v-for="rating in show.ratings" :key="rating.id" class="score">{{ value(rating.score) }}<small>{{ rating.source }}</small><small>{{ sourceLabel(rating.source_kind) }}</small><small>{{ rating.captured_at }} · {{rating.confirmed?'已确认':'待核对'}}</small><small>评分人数 {{ value(rating.rating_count) }}</small></b><span v-if="!show.ratings.length">暂无评分</span></div>
          </article></div>
          <p v-if="!visibleShows.length" class="state">{{ shows.length ? '没有匹配的作品。' : '作品库为空，可以添加第一部作品。' }}</p>
        </section>
      </template>
    </div>
  </div>
</template>
