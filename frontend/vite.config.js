import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

function trackerWorker() {
  const published = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
  return {
    name: 'tracker-service-worker',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const worker = readFileSync(new URL('./sw.js', import.meta.url), 'utf8')
        const names = [...new Set(['index.html', ...published, ...Object.keys(bundle).filter(name => /\.(?:js|css)$/.test(name))])].sort()
        const hash = createHash('sha256').update(worker)
        for (const name of names) {
          const entry = bundle[name]
          hash.update(name)
          if (entry) hash.update(entry.type === 'asset' ? entry.source : entry.code)
          else if (published.includes(name)) hash.update(readFileSync(new URL(`./public/${name}`, import.meta.url)))
          else hash.update(readFileSync(new URL('./index.html', import.meta.url)))
        }
        const source = worker.replace('__TRACKER_REVISION__', JSON.stringify(hash.digest('hex').slice(0, 16)))
          .replace('__TRACKER_ASSETS__', JSON.stringify(names))
        this.emitFile({ type: 'asset', fileName: 'sw.js', source })
      },
    },
  }
}

export default defineConfig({
  base: '/show-tracker/',
  plugins: [vue(), trackerWorker()],
  server: { port: 5173, strictPort: true },
})
