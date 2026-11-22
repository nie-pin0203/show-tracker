const progressKey = 'show-tracker:local-v1:progress-draft'
const formKey = name => 'show-tracker:local-v1:form:' + name

export function progressDraft() {
  try { return JSON.parse(globalThis.localStorage?.getItem(progressKey) || '{}') }
  catch { return {} }
}

export function saveProgressDraft(drafts, versions) {
  const data = Object.fromEntries(Object.entries(drafts).filter(([id]) => Number.isSafeInteger(versions[id]))
    .slice(-100).map(([id, value]) => [id, { value: String(value).slice(0, 12), version: versions[id] }]))
  try { globalThis.localStorage?.setItem(progressKey, JSON.stringify(data)) } catch { /* Optional draft. */ }
}

export function readFormDraft(name) {
  try { return JSON.parse(globalThis.localStorage?.getItem(formKey(name)) || 'null') }
  catch { return null }
}

export function writeFormDraft(name, value) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(formKey(name))
    else {
      const encoded = JSON.stringify(value)
      if (encoded.length <= 1000000) globalThis.localStorage?.setItem(formKey(name), encoded)
    }
  } catch { /* Optional draft. */ }
}

export function clearLocalDrafts() {
  try {
    for (const key of Object.keys(globalThis.localStorage)) {
      if (key.startsWith('show-tracker:local-v1:') || key === 'show-tracker:paste-draft:v1:local-library-v1') {
        globalThis.localStorage.removeItem(key)
      }
    }
  } catch { /* Draft storage is optional. */ }
}
