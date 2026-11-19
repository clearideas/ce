import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import BaseActions from '../../src-web/src/components/base/BaseActions.vue'
import BaseTabs from '../../src-web/src/components/base/BaseTabs.vue'
import CompactInlineSelector from '../../src-web/src/components/base/CompactInlineSelector.vue'
import RefreshBase from '../../src-web/src/components/base/RefreshBase.vue'
import SettingsCard from '../../src-web/src/components/base/SettingsCard.vue'
import TableFooter from '../../src-web/src/components/base/TableFooter.vue'
import Tag from '../../src-web/src/components/base/Tag.vue'
import TagOverflowRow from '../../src-web/src/components/base/TagOverflowRow.vue'
import Avatar from '../../src-web/src/components/base/Avatar.vue'
import ItemLink from '../../src-web/src/components/base/ItemLink.vue'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

/**
 * Plan item 4.1 — primitive suite. One `describe` per primitive: default render, interaction
 * (keyboard included where the primitive is interactive) and axe. Structural assertions are used
 * instead of full-markup snapshots, which would churn on every Vuetify release.
 * (BaseButton, BaseDialog, EmptyState, IconCheckbox, PageHeader, Breadcrumbs and StatusIcon have
 * their own spec files.)
 */

const stub = { template: '<div />' }

describe('BaseTabs', () => {
  const tabs = [
    { key: 'content', title: 'Content', to: '/site/s1/content' },
    { key: 'users', title: 'Users', to: '/site/s1/users', hasIndicator: true },
    { key: 'settings', title: 'Settings', to: '/site/s1/settings' },
  ]

  async function mountTabs(initial = 'content') {
    const model = ref(initial)
    const Host = defineComponent({
      render: () =>
        h(BaseTabs, {
          tabs,
          modelValue: model.value,
          'onUpdate:modelValue': (v: string) => (model.value = v),
        }),
    })
    const wrapper = await mountWithVuetify(Host, {
      routes: tabs.map(tab => ({ path: tab.to, component: stub })),
    })
    return { wrapper, model }
  }

  it('renders one tab per item and marks the v-model tab selected', async () => {
    const { wrapper } = await mountTabs('users')
    const rendered = wrapper.findAll('[role="tab"]')
    expect(rendered.map(tab => tab.text())).toEqual(['Content', 'Users', 'Settings'])
    expect(rendered.map(tab => tab.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
    // The "has something new" dot is decorative.
    expect(rendered[1].find('.base-tabs__indicator').attributes('aria-hidden')).toBe('true')
    await expectNoA11yViolations(wrapper)
  })

  it('clicking a tab selects it and navigates to its route', async () => {
    const { wrapper, model } = await mountTabs()
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    await settle()
    expect(model.value).toBe('settings')
    expect(wrapper.router.currentRoute.value.path).toBe('/site/s1/settings')
  })

  it('arrow keys move focus between tabs (roving focus from VTabs)', async () => {
    const { wrapper } = await mountTabs()
    const [first, second] = wrapper.findAll('[role="tab"]')
    ;(first.element as HTMLElement).focus()
    await first.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement).toBe(second.element)
  })
})

describe('BaseActions', () => {
  const slots = {
    primary:
      '<template #primary="{ isNarrow }"><span class="primary-slot">{{ isNarrow ? "narrow" : "wide" }}</span></template>',
    default: '<span class="wide-slot">wide actions</span>',
    narrow: '<span class="narrow-slot">narrow menu</span>',
    persistent: '<span class="persistent-slot">always</span>',
  }

  it('renders the wide actions when the container is wider than the breakpoint', async () => {
    const wrapper = await mountWithVuetify(BaseActions, {
      props: { containerWidth: 900, narrowBreakpoint: 600 },
      slots,
    })
    expect(wrapper.find('.wide-slot').exists()).toBe(true)
    expect(wrapper.find('.narrow-slot').exists()).toBe(false)
    expect(wrapper.find('.primary-slot').text()).toBe('wide')
    expect(wrapper.find('.persistent-slot').exists()).toBe(true)
  })

  it('switches to the narrow slot below the breakpoint, or when forced', async () => {
    const wrapper = await mountWithVuetify(BaseActions, {
      props: { containerWidth: 400, narrowBreakpoint: 600 },
      slots,
    })
    expect(wrapper.find('.wide-slot').exists()).toBe(false)
    expect(wrapper.find('.narrow-slot').exists()).toBe(true)
    expect(wrapper.find('.primary-slot').text()).toBe('narrow')

    await wrapper.setProps({ containerWidth: 900, forceNarrow: true })
    expect(wrapper.find('.narrow-slot').exists()).toBe(true)
  })

  it('falls back to the display breakpoint when the container has not been measured', async () => {
    const wrapper = await mountWithVuetify(BaseActions, {
      props: { containerWidth: 0, narrowBreakpoint: 600 },
      slots,
    })
    // jsdom window is 1280 px wide → not mobile.
    expect(wrapper.find('.wide-slot').exists()).toBe(true)
  })
})

describe('SettingsCard', () => {
  it('renders title, subtitle, body and an inline footer', async () => {
    const wrapper = await mountWithVuetify(SettingsCard, {
      props: { title: 'Profile', subtitle: 'Manage your name.' },
      slots: { default: '<p class="body">Body</p>', footer: '<button type="button">Save</button>' },
    })
    expect(wrapper.find('.settings-card-title').text()).toBe('Profile')
    expect(wrapper.find('.settings-card-subtitle').text()).toBe('Manage your name.')
    expect(wrapper.find('.body').exists()).toBe(true)
    expect(wrapper.find('.settings-card-footer button').text()).toBe('Save')
    expect(wrapper.text()).not.toContain('Unsaved changes')
    await expectNoA11yViolations(wrapper)
  })

  it('shows the unsaved-changes marker when dirty and announces errors', async () => {
    const wrapper = await mountWithVuetify(SettingsCard, {
      props: { title: 'Profile', dirty: true, errorMessage: 'Could not save.' },
    })
    expect(wrapper.find('.settings-card__dirty').text()).toBe('Unsaved changes')
    expect(wrapper.find('[role="alert"]').text()).toBe('Could not save.')
  })

  it('hides the body until initialised', async () => {
    const wrapper = await mountWithVuetify(SettingsCard, {
      props: { title: 'Profile', isInitialized: false },
      slots: { default: '<p class="body">Body</p>' },
    })
    expect(wrapper.find('.body').exists()).toBe(false)
    expect(wrapper.find('.settings-card-title').text()).toBe('Profile')
  })
})

describe('TableFooter', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i }))

  async function mountFooter(props: Record<string, unknown> = {}) {
    const page = ref(1)
    const itemsPerPage = ref(10)
    const updatePage = vi.fn()
    const Host = defineComponent({
      render: () =>
        h(TableFooter, {
          items,
          itemLabel: 'Sites',
          page: page.value,
          'onUpdate:page': (v: number) => {
            page.value = v
            updatePage(v)
          },
          itemsPerPage: itemsPerPage.value,
          'onUpdate:itemsPerPage': (v: number) => (itemsPerPage.value = v),
          ...props,
        }),
    })
    const wrapper = await mountWithVuetify(Host)
    return { wrapper, page, itemsPerPage, updatePage }
  }

  const button = (wrapper: Awaited<ReturnType<typeof mountFooter>>['wrapper'], label: string) =>
    wrapper.get(`button[aria-label="${label}"]`)

  it('summarises the range and pages forwards and backwards (client mode)', async () => {
    const { wrapper, page } = await mountFooter()
    expect(wrapper.text()).toContain('Sites 1 to 10 of 25')
    expect(wrapper.text()).toContain('Page 1 of 3')
    expect(button(wrapper, 'First page').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Previous page').attributes('disabled')).toBeDefined()

    await button(wrapper, 'Next page').trigger('click')
    expect(page.value).toBe(2)
    expect(wrapper.text()).toContain('Sites 11 to 20 of 25')

    await button(wrapper, 'Last page').trigger('click')
    expect(page.value).toBe(3)
    expect(wrapper.text()).toContain('Sites 21 to 25 of 25')
    expect(button(wrapper, 'Next page').attributes('disabled')).toBeDefined()

    await button(wrapper, 'Previous page').trigger('click')
    expect(page.value).toBe(2)
    await button(wrapper, 'First page').trigger('click')
    expect(page.value).toBe(1)
  })

  it('hides page navigation when everything fits on one page', async () => {
    const { wrapper } = await mountFooter({ items: items.slice(0, 5) })
    expect(wrapper.find('button[aria-label="Next page"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sites 1 to 5 of 5')
  })

  it('has a labelled page-size control and labelled pagination buttons (axe)', async () => {
    const { wrapper } = await mountFooter()
    expect(wrapper.find('[aria-label="Page size"]').exists()).toBe(true)
    await expectNoA11yViolations(wrapper)
  })

  it('emits update:page in server mode instead of paging locally', async () => {
    const { wrapper, updatePage } = await mountFooter({
      mode: 'server',
      pagination: { total: 45, page: 2, limit: 10, totalPages: 5, hasMore: true },
    })
    expect(wrapper.text()).toContain('Sites 11 to 20 of 45')
    await button(wrapper, 'Next page').trigger('click')
    expect(updatePage).toHaveBeenCalledWith(3)
  })
})

describe('Tag', () => {
  it('renders a tonal chip with its text and optional file icon', async () => {
    const wrapper = await mountWithVuetify(Tag, { props: { text: 'Owned', fileIcon: 'fas fa-file' } })
    const chip = wrapper.get('.v-chip')
    expect(chip.text()).toBe('Owned')
    expect(chip.classes()).toContain('v-chip--variant-tonal')
    expect(chip.find('.v-chip__prepend').exists()).toBe(true)
    await expectNoA11yViolations(wrapper)
  })
})

describe('TagOverflowRow', () => {
  const items = [{ text: 'contracts' }, { text: 'legal' }, { text: 'due-diligence' }, { text: 'q3' }]

  it('renders every tag when no character budget is set (list rows)', async () => {
    const wrapper = await mountWithVuetify(TagOverflowRow, { props: { items } })
    expect(wrapper.findAll('.v-chip').map(chip => chip.text())).toEqual([
      'contracts',
      'legal',
      'due-diligence',
      'q3',
    ])
  })

  it('collapses tags beyond maxVisibleChars into a "+N" chip that names them for screen readers', async () => {
    const wrapper = await mountWithVuetify(TagOverflowRow, { props: { items, maxVisibleChars: 18 } })
    const chips = wrapper.findAll('.v-chip')
    // contracts (9) + legal (5) = 14 ≤ 18; + due-diligence would exceed it.
    expect(chips.slice(0, 2).map(chip => chip.text())).toEqual(['contracts', 'legal'])
    const more = wrapper.get('.tag-overflow-row__more')
    expect(more.text()).toBe('+2 more: due-diligence, q3')
    expect(more.get('.d-sr-only').text()).toBe('more: due-diligence, q3')
    await expectNoA11yViolations(wrapper)
  })

  it('always shows at least one tag, even if it alone exceeds the budget', async () => {
    const wrapper = await mountWithVuetify(TagOverflowRow, {
      props: { items: [{ text: 'a-very-long-tag-name-indeed' }, { text: 'x' }], maxVisibleChars: 10 },
    })
    expect(wrapper.findAll('.v-chip')[0].text()).toBe('a-very-long-tag-name-indeed')
    expect(wrapper.get('.tag-overflow-row__more').text()).toContain('+1')
  })
})

describe('CompactInlineSelector', () => {
  it('renders icon, label and chevron, with the control slot layered over them', async () => {
    const wrapper = await mountWithVuetify(CompactInlineSelector, {
      props: { icon: 'fas fa-eye', label: 'Viewer', size: 'small' },
      slots: { default: '<select aria-label="Role"><option>Viewer</option></select>' },
    })
    expect(wrapper.find('.compact-inline-selector__label').text()).toBe('Viewer')
    expect(wrapper.find('.compact-inline-selector__chevron').exists()).toBe(true)
    expect(wrapper.find('.compact-inline-selector__control select').exists()).toBe(true)
    // The visual layer is decorative: pointer events go to the control on top.
    expect(wrapper.find('.compact-inline-selector__visual').exists()).toBe(true)
    await expectNoA11yViolations(wrapper)
  })

  it('omits the chevron and label when asked', async () => {
    const wrapper = await mountWithVuetify(CompactInlineSelector, {
      props: { icon: 'fas fa-eye', showChevron: false },
    })
    expect(wrapper.find('.compact-inline-selector__chevron').exists()).toBe(false)
    expect(wrapper.find('.compact-inline-selector__label').exists()).toBe(false)
    expect(wrapper.find('.compact-inline-selector__control').exists()).toBe(false)
  })
})

describe('Avatar', () => {
  it('uses up to two initials from the name, else the first letter of the email', async () => {
    const full = await mountWithVuetify(Avatar, { props: { name: 'ada  king lovelace', email: 'a@x.test' } })
    expect(full.text()).toBe('AK')
    const emailOnly = await mountWithVuetify(Avatar, { props: { email: 'zoe@example.test' } })
    expect(emailOnly.text()).toBe('Z')
    const nothing = await mountWithVuetify(Avatar, { props: {} })
    expect(nothing.text()).toBe('?')
  })

  it('picks a deterministic colour from the identity', async () => {
    const colourOf = async (name: string, email: string) => {
      const wrapper = await mountWithVuetify(Avatar, { props: { name, email } })
      return wrapper
        .get('.v-avatar')
        .classes()
        .find(c => c.startsWith('bg-'))
    }
    const first = await colourOf('Ada Lovelace', 'ada@example.test')
    expect(first).toBeDefined()
    expect(await colourOf('Ada Lovelace', 'ada@example.test')).toBe(first)
  })

  it('is decorative by default and an image with a name when labelled', async () => {
    const decorative = await mountWithVuetify(Avatar, { props: { name: 'Ada Lovelace' } })
    expect(decorative.get('.v-avatar').attributes('aria-hidden')).toBe('true')
    const labelled = await mountWithVuetify(Avatar, {
      props: { name: 'Ada Lovelace', label: 'Ada Lovelace' },
    })
    expect(labelled.get('.v-avatar').attributes('role')).toBe('img')
    expect(labelled.get('.v-avatar').attributes('aria-label')).toBe('Ada Lovelace')
    await expectNoA11yViolations(labelled)
  })

  it('scales the initials with the avatar size', async () => {
    const wrapper = await mountWithVuetify(Avatar, { props: { name: 'Ada', size: 40 } })
    expect(wrapper.get('.ci-avatar__initials').attributes('style')).toContain('font-size: 16px')
  })
})

describe('RefreshBase', () => {
  it('is a named icon button that calls onRefresh and swallows its failure', async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error('offline'))
    const wrapper = await mountWithVuetify(RefreshBase, { props: { onRefresh } })
    const button = wrapper.get('button[aria-label="Refresh"]')
    await button.trigger('click')
    await settle()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await expectNoA11yViolations(wrapper)
  })

  it('renders as a menu item when showAsMenu is set', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const wrapper = await mountWithVuetify(RefreshBase, { props: { onRefresh, showAsMenu: true } })
    expect(wrapper.find('button[aria-label="Refresh"]').exists()).toBe(false)
    await wrapper.get('.v-list-item').trigger('click')
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('ItemLink', () => {
  const routes = [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/site/:siteId', name: 'site', component: { template: '<div />' } },
  ]

  it('is a real, non-draggable link to the item whose clicks do not reach the row', async () => {
    const rowClick = vi.fn()
    const Host = defineComponent({
      render: () =>
        h('div', { class: 'row', onClick: rowClick }, [
          h(ItemLink, { to: { name: 'site', params: { siteId: 's1' } } }, () => 'Handbook'),
        ]),
    })
    const wrapper = await mountWithVuetify(Host, { routes })
    const link = wrapper.get('a.item-link')
    expect(link.attributes('href')).toBe('/site/s1')
    expect(link.attributes('draggable')).toBe('false')
    expect(link.text()).toBe('Handbook')
    await link.trigger('click')
    await settle()
    expect(rowClick).not.toHaveBeenCalled()
    expect(wrapper.router.currentRoute.value.path).toBe('/site/s1')
    await expectNoA11yViolations(wrapper)
  })

  it('stretched: marks the link to cover its tile', async () => {
    const wrapper = await mountWithVuetify(ItemLink, {
      props: { to: { name: 'site', params: { siteId: 's1' } }, stretched: true },
      slots: { default: () => 'Handbook' },
      routes,
    })
    expect(wrapper.get('a').classes()).toContain('item-link--stretched')
  })
})
