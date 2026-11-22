import { reactive } from 'vue'

export const pwa = reactive({ canInstall: false, installed: false, ready: false, update: false, error: '' })
let installEvent, registration, updating = false

export function startPwa() {
  const standalone = window.matchMedia('(display-mode: standalone)')
  const installed = () => { pwa.installed = standalone.matches || navigator.standalone === true }
  installed()
  standalone.addEventListener?.('change', installed)
  window.addEventListener('appinstalled', () => {
    pwa.installed = true
    pwa.canInstall = false
    installEvent = null
  })
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    installEvent = event
    pwa.canInstall = true
  })
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pwa.ready = !!navigator.serviceWorker.controller
    if (updating) window.location.reload()
  })
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then(result => {
    registration = result
    pwa.ready = !!navigator.serviceWorker.controller
    pwa.update = !!result.waiting
    result.addEventListener('updatefound', () => {
      result.installing?.addEventListener('statechange', () => {
        if (result.waiting && navigator.serviceWorker.controller) pwa.update = true
      })
    })
  }).catch(() => { pwa.error = '应用缓存初始化失败，请联网刷新后重试。' })
}

export async function installApp() {
  if (!installEvent) return
  const event = installEvent
  installEvent = null
  pwa.canInstall = false
  await event.prompt()
}

export function applyAppUpdate() {
  if (!registration?.waiting) {
    pwa.update = false
    return
  }
  updating = true
  registration.waiting.postMessage('tracker-update')
}

