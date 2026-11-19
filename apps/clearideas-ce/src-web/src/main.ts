// Self-hosted Inter (variable, OFL) — the brand typeface. Must precede the Vuetify/app styles that reference it.
import '@fontsource-variable/inter'
import 'vuetify/styles'
import './styles/main.scss'
import './plugins/fontawesome'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { installTippy } from './plugins/tippy'
import { vuetify } from './plugins/vuetify'
import { router } from './router'

const app = createApp(App).use(createPinia()).use(router).use(vuetify)
installTippy(app)
app.mount('#app')
