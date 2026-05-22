import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NavUserProfileMenu from '../../src-web/src/layouts/components/NavUserProfileMenu.vue'

const { push, getAppConfig } = vi.hoisted(() => ({
  push: vi.fn(),
  getAppConfig: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('../../src-web/src/api/client', () => ({
  appConfigApi: { get: getAppConfig },
}))

describe('NavUserProfileMenu', () => {
  beforeEach(() => {
    push.mockReset()
    getAppConfig.mockReset()
  })

  it('routes documentation to the bundled CE docs and emits logout', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: true })
    const wrapper = mount(NavUserProfileMenu, {
      props: {
        session: {
          user: { id: 'user-1', name: 'CE User', email: 'ce@example.test' },
        } as any,
      },
      global: {
        stubs: {
          VMenu: { template: '<div><slot name="activator" :props="{}" /><slot /></div>' },
          VList: { template: '<div><slot /></div>' },
          VListItem: { template: `<button @click="$emit('click')"><slot name="prepend" /><slot /></button>` },
          VListItemTitle: { template: '<span><slot /></span>' },
          VListItemSubtitle: { template: '<span><slot /></span>' },
          VDivider: true,
          VIcon: true,
          VChip: { template: '<span><slot /></span>' },
          Avatar: { template: '<span />' },
        },
      },
    })
    await flushPromises()

    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text().includes('Documentation'))!.trigger('click')
    await buttons.find(button => button.text().includes('Log out'))!.trigger('click')

    expect(push).toHaveBeenCalledWith('/docs')
    expect(wrapper.emitted('logout')?.length).toBeGreaterThanOrEqual(1)
  })

  it('hides documentation when docs are disabled', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: false })
    const wrapper = mount(NavUserProfileMenu, {
      props: {
        session: {
          user: { id: 'user-1', name: 'CE User', email: 'ce@example.test' },
        } as any,
      },
      global: {
        stubs: {
          VMenu: { template: '<div><slot name="activator" :props="{}" /><slot /></div>' },
          VList: { template: '<div><slot /></div>' },
          VListItem: { template: `<button @click="$emit('click')"><slot name="prepend" /><slot /></button>` },
          VListItemTitle: { template: '<span><slot /></span>' },
          VListItemSubtitle: { template: '<span><slot /></span>' },
          VDivider: true,
          VIcon: true,
          VChip: { template: '<span><slot /></span>' },
          Avatar: { template: '<span />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Documentation')
  })

  it('uses readable contrast for the profile email subtitle', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: false })
    const wrapper = mount(NavUserProfileMenu, {
      props: {
        session: {
          user: { id: 'user-1', name: 'CE User', email: 'ce@example.test' },
        } as any,
      },
      global: {
        stubs: {
          VMenu: { template: '<div><slot name="activator" :props="{}" /><slot /></div>' },
          VList: { template: '<div><slot /></div>' },
          VListItem: { template: `<button @click="$emit('click')"><slot name="prepend" /><slot /></button>` },
          VListItemTitle: { template: '<span><slot /></span>' },
          VListItemSubtitle: { template: '<span :class="$attrs.class"><slot /></span>' },
          VDivider: true,
          VIcon: true,
          VChip: { template: '<span><slot /></span>' },
          Avatar: { template: '<span />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.nav-profile-menu__subtitle').exists()).toBe(true)
    expect(wrapper.find('.nav-profile-menu__subtitle').classes()).not.toContain('font-weight-light')
  })
})
