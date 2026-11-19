import VueTippy from 'vue-tippy'
import type { App } from 'vue'

/**
 * vue-tippy is the app's single tooltip system (`v-tippy` directive for strings, `<Tippy>` for rich
 * content). These defaults apply everywhere; per-usage options still override them.
 *
 * Tooltips are supplementary — every control must have an accessible name of its own.
 */
export const TIPPY_DEFAULTS = {
  placement: 'top' as const,
  theme: 'ci',
  arrow: true,
  delay: [300, 0] as [number, number],
  duration: [120, 80] as [number, number],
  offset: [0, 6] as [number, number],
  // Long-press on touch devices; never block taps.
  touch: ['hold', 500] as ['hold', number],
  // Keyboard users get the tooltip on focus as well as hover.
  trigger: 'mouseenter focus',
  appendTo: () => document.body,
}

export function installTippy(app: App) {
  app.use(VueTippy, {
    directive: 'tippy',
    component: 'Tippy',
    defaultProps: TIPPY_DEFAULTS,
  })
}
