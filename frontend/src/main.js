import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './layout.css'
import { startPwa } from './pwa'

startPwa()
createApp(App).mount('#app')
