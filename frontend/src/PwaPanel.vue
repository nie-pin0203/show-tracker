<script setup>
import { ref } from 'vue'
import { installApp, pwa } from './pwa'

const error = ref('')
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
async function install() {
  try { await installApp() }
  catch { error.value = '无法唤起安装，请使用浏览器菜单。' }
}
</script>

<template>
  <section class="pwa-panel">
    <h2>安装与离线</h2>
    <p v-if="pwa.installed">正在以独立应用打开。</p>
    <button v-else-if="pwa.canInstall" class="tracker-button" type="button" @click="install">安装 Show Tracker</button>
    <p v-else-if="ios">在 Safari 中打开本站，使用「分享 → 添加到主屏幕」。</p>
    <p v-else>在浏览器菜单选择「安装应用」或「添加到主屏幕」。</p>
    <p class="muted">{{ pwa.ready ? '应用资源已缓存。' : pwa.error || '请通过 HTTPS 打开生产版本以完成缓存。' }}</p>
</section>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
</template>

<style scoped>
.pwa-panel { max-width: 580px; background: #fff; border: 1px solid #e3e8ea; border-radius: 12px; padding: 16px; margin-top: 12px; }
.pwa-panel p, .pwa-panel button { margin-top: 8px; }
</style>
