<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { resolveRoute } from './navigation'
import MediaWorkspace from './MediaWorkspace.vue'
import MediaDetail from './MediaDetail.vue'
import CompetitionWorkspace from './CompetitionWorkspace.vue'
import EventWorkspace from './EventWorkspace.vue'
import TrackerHub from './TrackerHub.vue'
import PwaPanel from './PwaPanel.vue'
import { applyAppUpdate, pwa } from './pwa'
import LocalBackup from './LocalBackup.vue'

const mobile = [
  { id: 'home', label: '首页', icon: '⌂' },
  { id: 'discover', label: '发现', icon: '◇' },
  { id: 'calendar', label: '日历', icon: '▦' },
  { id: 'follows', label: '关注', icon: '☆' },
  { id: 'account', label: '我的', icon: '○' },
]
const desktop = [
  mobile[0], { id: 'media', label: '影视', icon: '▤' },
  { id: 'competitions', href: '#/competitions/esports', label: '赛事', icon: '⚑' },
  { id: 'events', href: '#/events/performance', label: '演出', icon: '♪' },
  { id: 'activities', href: '#/events/activity', label: '活动', icon: '◇' }, mobile[2],
  { ...mobile[3], label: '我的关注' },
]
const titles = {
  home: '首页', discover: '发现', media: '影视', calendar: '日历',
  follows: '我的关注', account: '我的本地数据', detail: '作品详情', competitions: '赛事', events: '现场与活动',
  'film-calendar': '影视七日日历', watchlist: '影视观看进度', messages: '消息中心', settings: '首页设置',
}
const hubViews = { home: 'home', follows: 'follows', calendar: 'calendar', messages: 'messages', settings: 'display' }
const route = ref(resolveRoute(window.location.hash))
const trackerAvailable = ref(false)
const edited = ref(false)
const libraryVersion = ref(0)

function readRoute() {
  route.value = resolveRoute(window.location.hash)
  if (!route.value.anchor) window.scrollTo(0, 0)
}

function desktopActive(id) {
  if (route.value.page === 'events') {
    return id === (route.value.kind === 'activity' ? 'activities' : 'events')
  }
  if (route.value.page === 'film-calendar') return id === 'calendar'
  if (route.value.page === 'watchlist') return id === 'follows'
  return route.value.page === id || (id === 'media' && route.value.page === 'detail')
}

function markEdited() { edited.value = true }
function requestUpdate() {
  if (edited.value && !window.confirm('页面上可能有未保存的编辑。请先保存草稿，是否现在更新？')) return
  applyAppUpdate()
}

onMounted(() => {
  window.addEventListener('hashchange', readRoute)
  document.addEventListener('input', markEdited)
})
onUnmounted(() => {
  window.removeEventListener('hashchange', readRoute)
  document.removeEventListener('input', markEdited)
})
</script>

<template>
  <div class="tracker-layout">
    <aside class="tracker-sidebar">
      <a href="#/home" class="tracker-brand"><span aria-hidden="true">S</span> Show Tracker</a>
      <nav aria-label="主导航">
        <a v-for="item in desktop" :key="item.id" :href="item.href || `#/${item.id}`"
          :aria-current="desktopActive(item.id) ? 'page' : undefined">
          <i aria-hidden="true">{{ item.icon }}</i>{{ item.label }}
        </a>
      </nav>
    </aside>
    <div class="tracker-content">
      <header class="tracker-top">
        <a href="#/home" class="tracker-brand mobile-brand"><span aria-hidden="true">S</span> Show Tracker</a>
        <span class="tracker-timezone">北京时间</span>
        <a href="#/messages" class="tracker-account-link">消息</a>
        <a href="#/settings" class="tracker-account-link">设置</a>
        <a href="#/account" class="tracker-account-link">本地数据</a>
      </header>
      <main class="tracker-main">
        <div v-if="pwa.update" class="tracker-offline" role="status">发现新版本。保存编辑后可手动更新。
          <button class="tracker-button secondary" type="button" @click="requestUpdate">更新应用</button>
        </div>
        <h1>{{ titles[route.page] }}</h1>
        <div v-if="route.page === 'discover'" class="tracker-discover">
          <a href="#/media"><strong>影视</strong><span>作品库与观看进度</span></a>
          <a href="#/competitions/esports"><strong>电竞</strong><span>比赛、战队与选手</span></a>
          <a href="#/competitions/sports"><strong>体育</strong><span>联赛、杯赛与排名</span></a>
          <a href="#/events/performance"><strong>演出</strong><span>演唱会、巡演与 Livehouse</span></a>
          <a href="#/events/festival"><strong>音乐节</strong><span>多日阵容、舞台与票务</span></a>
          <a href="#/events/activity"><strong>其他活动</strong><span>展览、发布会与自定义分类</span></a>
        </div>
        <LocalBackup v-if="route.page === 'account'" @restored="libraryVersion++" />
        <PwaPanel v-if="route.page === 'account'" />
        <TrackerHub v-if="hubViews[route.page]" :key="route.page" :view="hubViews[route.page]" @availability="trackerAvailable = $event" />
        <MediaWorkspace v-show="route.page !== 'home' || !trackerAvailable" :key="libraryVersion" :route="route" />
        <MediaDetail v-if="route.page === 'detail'" :key="route.showId" :show-id="route.showId" />
        <CompetitionWorkspace v-if="route.page === 'competitions'" :key="`${route.kind}/${route.eventId || ''}`"
          :kind="route.kind" :event-id="route.eventId" />
        <EventWorkspace v-if="route.page === 'events'" :key="`${route.kind}/${route.eventId || ''}`"
          :kind="route.kind" :event-id="route.eventId" />
      </main>
    </div>
    <nav class="tracker-bottom" aria-label="手机导航">
      <a v-for="item in mobile" :key="item.id" :href="`#/${item.id}`"
        :aria-current="route.page === item.id
          || (item.id === 'calendar' && route.page === 'film-calendar')
          || (item.id === 'follows' && route.page === 'watchlist')
          || (item.id === 'account' && ['settings','messages'].includes(route.page))
          || (item.id === 'discover' && ['media', 'detail', 'competitions', 'events'].includes(route.page)) ? 'page' : undefined">
        <i aria-hidden="true">{{ item.icon }}</i>{{ item.label }}
      </a>
    </nav>
  </div>
</template>
