<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listFollows, readCalendar, readDisplay, saveDisplayOptions, saveFollow } from './library'
import { addDays, beijingDate } from './calendar'
import { displayMoment, statuses } from './competitions'
import { calendarRange, daysIn, moveDate, recordsOn } from './trackerCalendar'

const props = defineProps({ view: String })
const emit = defineEmits(['availability'])
const categories = { media: '影视', esports: '电竞', sports: '体育', performance: '演出', festival: '音乐节', activity: '其他活动' }
const stateLabels = { ...statuses, actual: '实际更新', paused: '已暂停', active: '关注中' }
const today = beijingDate()
const date = ref(today), calendarView = ref('month'), filters = ref({ category: '', city: '', followed: false, target: '', include_mock: false })
const range = computed(() => calendarRange(calendarView.value, date.value))
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const days = computed(() => daysIn(range.value))
const firstColumn = computed(() => (new Date(`${range.value.start}T00:00:00Z`).getUTCDay() + 6) % 7 + 1)
const data = ref(null), followData = ref(null), display = ref(null), error = ref(''), notice = ref(''), busy = ref(false)
const q = ref(''), homeFollowed = ref(true)
const entries = computed(() => data.value?.items || [])
const homeGroups = computed(() => (display.value?.categories || Object.keys(categories))
  .filter(key => !display.value?.hidden.includes(key))
  .map(key => ({ key, entries: entries.value.filter(row => row.category === key &&
    !['cancelled', 'postponed'].includes(row.status)).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 4) }))
  .filter(group => group.entries.length))
const visibleDays = computed(() => calendarView.value === 'week' ? days.value : [date.value])
let sequence = 0, refreshTimer

async function load() {
  const request = ++sequence
  error.value = ''
  try {
    let result
    if (props.view === 'calendar') {
      const [calendar, follows] = await Promise.all([
        readCalendar({ ...range.value, ...filters.value }), listFollows(),
      ])
      result = calendar
      if (sequence === request) followData.value = follows
    } else if (props.view === 'home') {
      const current = beijingDate()
      const [calendar, preferences] = await Promise.all([
        readCalendar({ start: current, end: addDays(current, 6), followed: homeFollowed.value }),
        readDisplay(),
      ])
      result = calendar
      if (sequence === request) display.value = preferences
    } else if (props.view === 'display') {
      display.value = await readDisplay()
      result = await listFollows()
    } else if (props.view === 'follows') {
      result = await listFollows({ q: q.value.trim() })
    } else {
      result = { enabled: true }
    }
    if (sequence === request) {
      data.value = result
      emit('availability', result.enabled)
    }
  } catch (e) { if (sequence === request) error.value = e.message }
}

function go(direction) { selectDate(moveDate(calendarView.value, date.value, direction)) }
function selectDate(value) {
  if (!value || value < '1900-01-01' || value > '9998-12-31') return
  date.value = value
  load()
}
async function action(saveChanges, message) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveChanges()
    await load()
    notice.value = message
    return true
  } catch (e) { error.value = e.message; return false }
  finally { busy.value = false }
}
function updateFollow(row, state) {
  action(() => saveFollow({ target: row.target, state, version: row.version || 0 }), '关注已更新')
}
function moveCategory(index, offset) {
  const list = display.value.categories
  const [category] = list.splice(index, 1)
  list.splice(index + offset, 0, category)
}
function refresh() {
  if (!busy.value && document.visibilityState !== 'hidden' && props.view !== 'display') load()
}
onMounted(() => {
  load()
  refreshTimer = setInterval(refresh, 30000)
  window.addEventListener('tracker-library-changed', refresh)
})
onUnmounted(() => {
  sequence++
  clearInterval(refreshTimer)
  window.removeEventListener('tracker-library-changed', refresh)
})
</script>

<template>
  <div class="tracker-hub">
    <p v-if="error" class="error" role="alert">{{ error }} <button type="button" @click="load">重读</button></p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="!data && !error && view !== 'home'" role="status">正在读取…</p>
    <a v-if="view === 'calendar'" class="tracker-button secondary" href="#/film-calendar">影视七日日历</a>
    <a v-if="view === 'follows'" class="tracker-button secondary" href="#/watchlist">影视观看进度</a>
    <template v-if="data?.enabled">
      <template v-if="view === 'home'">
        <div class="hub-head"><h2>未来七天</h2><a class="tracker-button secondary" href="#/settings">调整首页</a></div>
        <label class="hub-check"><input v-model="homeFollowed" type="checkbox" @change="load">只看关注</label>
        <p v-if="!homeGroups.length" class="state">这七天暂无符合筛选的日程。</p>
        <a v-if="!homeGroups.length" href="#local-editor" class="tracker-button secondary">添加作品</a>
        <section v-for="group in homeGroups" :key="group.key" class="hub-panel">
          <h2>{{ categories[group.key] }}</h2>
          <ul class="hub-list"><li v-for="row in group.entries" :key="row.key">
            <a :href="`#${row.route}`">{{ row.title }}</a>
            <p>{{ displayMoment(row.starts_at) }} · {{ stateLabels[row.status] }} · {{ row.text }}</p>
          </li></ul>
        </section>
      </template>
      <template v-if="view === 'calendar'">
        <div class="hub-controls">
          <label>视图<select v-model="calendarView" @change="load"><option value="month">月视图</option><option value="week">周视图</option><option value="day">日视图</option></select></label>
          <button type="button" @click="go(-1)">上一段</button>
          <label>日期<input :value="date" type="date" min="1900-01-01" max="9998-12-31" @change="selectDate($event.target.value)"></label>
          <button type="button" @click="go(1)">下一段</button>
          <button type="button" @click="selectDate(beijingDate())">今天</button>
        </div>
        <form class="hub-controls" @submit.prevent="load">
          <label>类别<select v-model="filters.category"><option value="">全部</option><option v-for="(label, key) in categories" :key="key" :value="key">{{ label }}</option></select></label>
          <label>城市<input v-model="filters.city" maxlength="100"></label>
          <label>关注对象<select v-model="filters.target"><option value="">全部</option><option v-for="row in followData?.items || []" :key="row.target" :value="row.target">{{ row.title }}</option></select></label>
          <label class="hub-check"><input v-model="filters.followed" type="checkbox">仅有效关注</label>
          <label class="hub-check"><input v-model="filters.include_mock" type="checkbox">含模拟影视</label>
          <button type="submit">筛选</button>
        </form>
        <div v-if="calendarView === 'month'" class="hub-month">
          <span v-for="day in weekdays" :key="day">周{{ day }}</span>
          <button v-for="(day, i) in days" :key="day" type="button" :style="i === 0 ? { gridColumnStart: firstColumn } : {}"
            :aria-pressed="day === date" @click="date = day">
            <strong>{{ day.slice(8) }}</strong><small>{{ recordsOn(entries, day).length }} 项</small>
          </button>
        </div>
        <section v-for="day in visibleDays" :key="day" class="hub-panel">
          <h2>{{ day }}</h2>
          <ul v-if="recordsOn(entries, day).length" class="hub-list"><li v-for="row in recordsOn(entries, day)" :key="row.key">
            <a :href="`#${row.route}`">{{ row.title }}</a>
            <p>{{ categories[row.category] }} · {{ row.mock ? '模拟数据 · ' : '' }}{{ stateLabels[row.status] }} · {{ displayMoment(row.starts_at) }}</p>
            <p>{{ row.text }}{{ row.city ? ` · ${row.city}` : '' }}</p>
            <a v-if="row.source_url.startsWith('https://')" :href="row.source_url" target="_blank" rel="noopener noreferrer" class="source-link">查看来源</a>
          </li></ul>
          <p v-else class="muted">暂无日程。</p>
        </section>
      </template>
      <template v-if="view === 'follows'">
        <form class="hub-controls" @submit.prevent="load">
          <label>搜索作品、赛事、战队、艺人或场馆<input v-model="q" maxlength="100" type="search"></label><button type="submit">搜索</button>
        </form>
        <ul v-if="data.candidates.length" class="hub-list hub-panel"><li v-for="row in data.candidates" :key="row.target">
          <a :href="`#${row.route}`">{{ row.title }}</a> · {{ categories[row.kind] }}{{ row.mock ? ' · 模拟数据' : '' }}
          <button type="button" :disabled="busy" @click="updateFollow(row, 'active')">关注</button>
        </li></ul>
        <p v-if="!data.items.length" class="state">还没有关注对象。</p>
        <article v-for="row in data.items" :key="row.target" class="hub-panel">
          <h2><a :href="`#${row.route}`">{{ row.title }}</a></h2>
          <p>{{ categories[row.kind] }} · {{ stateLabels[row.state] }}{{ row.mock ? ' · 模拟数据' : '' }}</p>
          <div class="hub-controls">
            <button type="button" :disabled="busy" @click="updateFollow(row, row.state === 'active' ? 'paused' : 'active')">{{ row.state === 'active' ? '暂停' : '恢复' }}</button>
            <button type="button" :disabled="busy" @click="updateFollow(row, 'cancelled')">取消关注</button>
          </div>
        </article>
      </template>
      <p v-if="view === 'messages'" class="state">本地日程和更新可在「日历」与「我的关注」查看。</p>
      <template v-if="view === 'display' && display">
        <h2>首页分类</h2>
        <div v-for="(key, index) in display.categories" :key="key" class="hub-controls hub-panel">
          <label class="hub-check"><input v-model="display.hidden" :value="key" type="checkbox">隐藏{{ categories[key] }}</label>
          <button type="button" :disabled="index === 0" @click="moveCategory(index, -1)">上移</button>
          <button type="button" :disabled="index === display.categories.length - 1" @click="moveCategory(index, 1)">下移</button>
        </div>
        <button type="button" class="tracker-button" :disabled="busy" @click="action(() => saveDisplayOptions(display), '首页设置已保存')">保存首页设置</button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tracker-hub { display: grid; gap: 12px; }
.tracker-hub > .tracker-button { justify-self: start; }
.hub-head, .hub-controls { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
.hub-head { justify-content: space-between; align-items: center; }
.hub-controls label { display: grid; gap: 3px; font-size: 14px; }
.hub-controls input:not([type=checkbox]), .hub-controls select { min-height: 44px; max-width: 100%; padding: 6px; border: 1px solid #cdd9db; border-radius: 7px; }
.hub-check { display: flex !important; align-items: center; gap: 6px; min-height: 36px; }
.tracker-hub button:not(.tracker-button) { padding: 6px 12px; border-radius: 7px; background: #e3f2ed; color: #075a4e; }
.hub-panel { background: white; padding: 14px; border: 1px solid #e3e8ea; border-radius: 10px; overflow-wrap: anywhere; }
.hub-list { list-style: none; margin: 0; padding: 0; }
.hub-list li { margin-top: 9px; padding: 7px 0; border-top: 1px solid #e3e8ea; }
.hub-list a, .hub-panel h2 a { text-decoration: underline; color: #075a4e; }
.hub-panel .source-link { margin-right: 12px; }
.hub-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; text-align: center; }
.hub-month button { display: grid; place-items: center; padding: 2px !important; }
.hub-month button[aria-pressed=true] { background: #12695d; color: white; }
.hub-month small { font-size: 10px; }
</style>
