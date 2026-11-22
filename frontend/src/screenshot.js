export const IMAGE_LIMIT = 8 * 1024 * 1024
const types = ['image/png', 'image/jpeg', 'image/webp']

export function pastedFiles(data) {
  if (!data) return []
  const files = Array.from(data.files ?? [])
  if (files.length) return files
  return Array.from(data.items ?? []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
}

export function handleImagePaste(event, accept) {
  const files = pastedFiles(event.clipboardData)
  if (!files.length) return false
  event.preventDefault()
  accept(files)
  return true
}

export async function validateImage(file) {
  if (!file || !types.includes(file.type)) throw new Error('仅支持PNG、JPG、WebP图片')
  if (!file.size || file.size > IMAGE_LIMIT) throw new Error('截图不能为空，且不得超过8MiB')
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = (start, end) => String.fromCharCode(...b.slice(start, end))
  const png = [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255
  const webp = text(0,4) === 'RIFF' && text(8,12) === 'WEBP'
  if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw new Error('图片内容与格式不符，请重新截图')
}

export function decodePreview(url) {
  return new Promise((resolve,reject) => {
    const img = new Image()
    img.onload = () => img.naturalWidth * img.naturalHeight > 16000000 || Math.max(img.naturalWidth,img.naturalHeight) > 8192
      ? reject(new Error('图片过大，请裁剪至1600万像素以内，单边不超过8192像素')) : resolve()
    img.onerror = () => reject(new Error('图片无法解码，请重新截图或选择有效图片'))
    img.src = url
  })
}

// The caller supplies rendering and URL primitives so input races and cleanup can be tested without a browser.
export function imageSelection({create = URL.createObjectURL, revoke = URL.revokeObjectURL, decode = decodePreview} = {}) {
  let revision = 0, current = null
  return {
    get current() {return current},
    async select(files) {
      const version = ++revision
      if (files.length !== 1) throw new Error('一次仅支持一张截图，请逐张核对')
      const file = files[0]
      await validateImage(file)
      const url = create(file)
      try {
        await decode(url)
        if (version !== revision) {revoke(url);return null}
        if (current) revoke(current.url)
        current = {file,url}
        return current
      } catch(e) {revoke(url);throw e}
    },
    clear() {revision++;if(current) revoke(current.url);current=null}
  }
}

export function reviewedText(existing, candidate, confirmed) {
  if (!confirmed || !candidate.trim()) throw new Error('请先核对截图文字并确认')
  const joined = [existing.trim(),candidate.trim()].filter(Boolean).join('\n\n')
  if (joined.length > 30000) throw new Error('合并文字超过30000字，请分批处理')
  return joined
}
