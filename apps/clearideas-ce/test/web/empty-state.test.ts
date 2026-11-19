import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import EmptyState from '../../src-web/src/components/base/EmptyState.vue'
import SiteEmptyState from '../../src-web/src/components/sites/SiteEmptyState.vue'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

describe('EmptyState', () => {
  it('renders icon, title, text and an actions slot', async () => {
    const wrapper = await mountWithVuetify(EmptyState, {
      props: { title: 'No users', text: 'Add users to collaborate.', icon: 'fas fa-users' },
      slots: { actions: () => h('button', { type: 'button' }, 'Add user') },
    })
    expect(wrapper.find('.v-empty-state__title').text()).toBe('No users')
    expect(wrapper.find('.v-empty-state__text').text()).toBe('Add users to collaborate.')
    expect(wrapper.find('svg.fa-users').exists()).toBe(true)
    expect(wrapper.find('.v-empty-state__actions button').text()).toBe('Add user')
    await expectNoA11yViolations(wrapper)
  })

  it('has a compact variant for use inside cards', async () => {
    const wrapper = await mountWithVuetify(EmptyState, { props: { title: 'Nothing yet', compact: true } })
    expect(wrapper.classes()).toContain('empty-state--compact')
  })
})

describe('SiteEmptyState', () => {
  it('offers the New site action (review finding U5)', async () => {
    const wrapper = await mountWithVuetify(SiteEmptyState)
    const cta = wrapper.find('.v-empty-state__actions button')
    expect(cta.text()).toContain('New site')
    expect(cta.classes()).toContain('bg-primary')
  })

  it('adapts the copy for the Owned tab', async () => {
    const wrapper = await mountWithVuetify(SiteEmptyState, { props: { owned: true } })
    expect(wrapper.text()).toContain('You do not own any sites yet')
  })
})
