import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import defaults from './defaults'
import { aliases, fa } from './icons'
import theme from './theme'

export const vuetify = createVuetify({
  components,
  directives,
  theme,
  defaults,
  icons: {
    defaultSet: 'fa',
    aliases,
    sets: { fa },
  },
})
