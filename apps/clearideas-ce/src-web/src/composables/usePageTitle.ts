import { toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

export const APP_TITLE = 'Clear Ideas CE'

/**
 * Keep `document.title` in sync with the current page: `"<page> · Clear Ideas CE"`, or just the app
 * name while the page title is empty (e.g. still loading).
 */
export function usePageTitle(title: MaybeRefOrGetter<string | undefined | null>) {
  watchEffect(() => {
    const value = String(toValue(title) ?? '').trim()
    if (typeof document === 'undefined') return
    document.title = value ? `${value} · ${APP_TITLE}` : APP_TITLE
  })
}
