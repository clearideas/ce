import { describe, expect, it, vi } from 'vitest'
import StatusIcon from '../../src-web/src/components/base/StatusIcon.vue'
import SettingsCard from '../../src-web/src/components/base/SettingsCard.vue'
import type { ActionStore } from '../../src-web/src/types/ui'
import { mountWithVuetify } from './harness'

function fakeStore() {
  const unsubscribe = vi.fn()
  const onAction = vi.fn<ActionStore['$onAction']>(() => unsubscribe)
  return { store: { $onAction: onAction } satisfies ActionStore, onAction, unsubscribe }
}

describe('StatusIcon', () => {
  it('subscribes to the store action once and unsubscribes on unmount (review finding C6)', async () => {
    const { store, onAction, unsubscribe } = fakeStore()
    const wrapper = await mountWithVuetify(StatusIcon, { props: { store: () => store, action: 'save' } })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('reflects loading → success through the action hooks', async () => {
    vi.useFakeTimers()
    const { store, onAction } = fakeStore()
    const wrapper = await mountWithVuetify(StatusIcon, {
      props: { store: () => store, action: 'save', icon: 'fas fa-gear', success: 'fas fa-check' },
    })
    const listener = onAction.mock.calls[0][0]
    let afterCb: (() => void) | undefined
    listener({ name: 'save', after: cb => (afterCb = cb), onError: () => {} })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.status-icon').classes()).toContain('text-primary')

    afterCb?.()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.status-icon').classes()).toContain('text-success')

    vi.runAllTimers()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.status-icon').classes()).toContain('text-secondary')
    vi.useRealTimers()
  })
})

describe('SettingsCard', () => {
  it('does not leak card props onto the status icon element', async () => {
    const wrapper = await mountWithVuetify(SettingsCard, {
      props: { title: 'Profile', subtitle: 'Manage your name', icon: 'fas fa-id-card', errorMessage: '' },
    })
    const icon = wrapper.find('.status-icon')
    expect(icon.exists()).toBe(true)
    for (const attr of [
      'title',
      'subtitle',
      'variant',
      'isinitialized',
      'is-initialized',
      'errormessage',
      'error-message',
    ]) {
      expect(icon.attributes(attr), attr).toBeUndefined()
    }
    expect(wrapper.text()).toContain('Profile')
  })
})
