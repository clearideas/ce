import { describe, expect, it } from 'vitest'
import { VBtn } from 'vuetify/components/VBtn'
import BaseButton from '../../src-web/src/components/base/BaseButton.vue'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

/**
 * Smoke test for the Vuetify-mounted harness. It proves that real Vuetify (theme, defaults,
 * FontAwesome icon set), the memory router, testing Pinia and vue-tippy are all wired, which
 * is the precondition for every primitive/feature test written in Phases 1-4.
 */
describe('mountWithVuetify harness', () => {
  it('applies the app-level Vuetify defaults (plugins/vuetify/defaults.ts) to a raw VBtn', async () => {
    const wrapper = await mountWithVuetify(VBtn, { props: { text: 'Raw' } })
    const button = wrapper.find('button')
    expect(button.classes()).toContain('v-btn')
    // defaults.ts: VBtn { rounded: 'pill', density: 'default', elevation: 0 }
    expect(button.classes()).toContain('rounded-pill')
    expect(button.classes()).toContain('v-btn--density-default')
    expect(button.classes()).toContain('elevation-0')
    expect(button.classes()).toContain('v-theme--light')
  })

  it('mounts BaseButton with the same defaults, a resolved FontAwesome icon, and no a11y violations', async () => {
    const wrapper = await mountWithVuetify(BaseButton, {
      props: { text: 'Save changes', prependIcon: 'fas fa-check' },
    })

    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('Save changes')
    // Default intent is `primary` → color primary / variant flat; shape and density come from defaults.ts.
    expect(button.classes()).toContain('bg-primary')
    expect(button.classes()).toContain('v-btn--variant-flat')
    expect(button.classes()).toContain('rounded-pill')
    expect(button.classes()).toContain('v-btn--density-default')
    // FontAwesome SVG icon resolved through the `fa` icon set.
    expect(wrapper.find('svg.svg-inline--fa').exists()).toBe(true)

    await expectNoA11yViolations(wrapper)
  })

  it('starts in the requested theme', async () => {
    const wrapper = await mountWithVuetify(BaseButton, { props: { text: 'Dark' }, themeName: 'dark' })
    expect(wrapper.find('button').classes()).toContain('v-theme--dark')
  })

  it('attaches a tippy tooltip to the button itself when a tooltip is provided', async () => {
    const wrapper = await mountWithVuetify(BaseButton, { props: { text: 'Refresh', tooltip: 'Reload data' } })
    const button = wrapper.find('button').element as HTMLElement & { _tippy?: { props: { content: string } } }
    // The `v-tippy` directive stores its instance on the element.
    expect(button._tippy?.props.content).toBe('Reload data')
  })
})
