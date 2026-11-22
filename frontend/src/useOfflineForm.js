import { ref, watch } from 'vue'
import { readFormDraft, writeFormDraft } from './offline'

export function useOfflineForm(model, key, version, valid) {
  const saved = readFormDraft(key)
  const previous = ref(saved && valid(saved.data) ? saved : null)
  const restored = ref(false)
  function restore() {
    if (!previous.value) return
    model.value = previous.value.data
    previous.value = null
    restored.value = true
  }
  if (previous.value?.version === version) restore()
  watch(model, data => writeFormDraft(key, { data, version }), { deep: true })
  return {
    previous, restored, restore,
    clear: () => writeFormDraft(key, null),
  }
}
