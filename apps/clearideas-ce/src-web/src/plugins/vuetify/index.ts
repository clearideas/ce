import { createVuetify } from 'vuetify'
import defaults from './defaults'
import { aliases, fa } from './icons'
import theme from './theme'

// Components and directives are NOT registered globally: `vite-plugin-vuetify` (`autoImport: true`
// in vite.config.ts) injects the ones each SFC uses, so only those are bundled. Registering
// `vuetify/components` here would pull the whole library into the entry chunk.
// Tests use `createTestVuetify()` in test/web/harness, which does register everything.
export const vuetify = createVuetify({
  theme,
  defaults,
  icons: {
    defaultSet: 'fa',
    aliases,
    sets: { fa },
  },
})
