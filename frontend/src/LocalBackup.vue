<script setup>
import { ref } from 'vue'
import { BACKUP_SIZE, exportLibrary, importLibrary, readBackup } from './localStore'
import { beijingDate } from './calendar'
import { clearLocalDrafts } from './offline'

const emit = defineEmits(['restored'])

const pending = ref(null), busy = ref(false), error = ref(''), notice = ref('')

async function download() {
  busy.value = true
  error.value = ''
  try {
    const file = new Blob([await exportLibrary()], { type: 'application/json' })
    const address = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = address
    link.download = `show-tracker-${beijingDate()}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(address), 30000)
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}

async function select(event) {
  const file = event.target.files[0]
  event.target.value = ''
  pending.value = null
  error.value = notice.value = ''
  if (!file) return
  busy.value = true
  try {
    if (file.size > BACKUP_SIZE || !file.name.toLowerCase().endsWith('.json')) throw new Error('请选择 12 MiB 以内的 JSON 文件')
    const text = await file.text()
    const data = readBackup(text)
    pending.value = { text, shows: data.shows.length, schedules: data.schedules.length, ratings: data.ratings.length }
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}

async function restore() {
  if (!pending.value) return
  busy.value = true
  error.value = ''
  try {
    const count = await importLibrary(pending.value.text)
    window.dispatchEvent(new Event('tracker-library-replaced'))
    clearLocalDrafts()
    pending.value = null
    notice.value = `导入成功，本机作品库有 ${count} 部作品。`
    emit('restored')
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}
</script>

<template>
  <section class="tracker-account">
    <h2>本地数据导入与导出</h2>
    <p>数据保存在当前浏览器。换设备或清理浏览器数据前，请导出 JSON。</p>
    <button class="tracker-button secondary" type="button" :disabled="busy" @click="download">导出 JSON</button>
    <label>选择本地版 JSON <input type="file" accept=".json,application/json" :disabled="busy" @change="select"></label>
    <template v-if="pending">
      <p>文件包含 {{ pending.shows }} 部作品、{{ pending.schedules }} 条排期、{{ pending.ratings }} 条评分。导入将替换当前浏览器的数据。</p>
      <button class="tracker-button" type="button" :disabled="busy" @click="restore">确认替换本地数据</button>
      <button class="tracker-button secondary" type="button" :disabled="busy" @click="pending = null">取消</button>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
