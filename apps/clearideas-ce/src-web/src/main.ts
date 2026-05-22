import 'vuetify/styles'
import './styles/main.scss'
import './plugins/fontawesome'
import VueTippy from 'vue-tippy'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import { router } from './router'

createApp(App).use(createPinia()).use(router).use(vuetify).use(VueTippy, { directive: 'tippy', component: 'Tippy' }).mount('#app')
