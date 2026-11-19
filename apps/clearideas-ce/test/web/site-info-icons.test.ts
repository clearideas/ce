import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it, vi } from 'vitest'
import SiteInfoIcons from '../../src-web/src/components/sites/SiteInfoIcons.vue'
import TableFooter from '../../src-web/src/components/base/TableFooter.vue'
import { useProfileStore } from '../../src-web/src/stores/profile.store'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

const site = {
  id: 'site-1',
  name: 'Client Documents',
  owned: true,
  currentUserRole: 'owner',
  visibility: 'private',
  folders: [],
}

describe('SiteInfoIcons (review finding A2)', () => {
  it('renders real, named buttons for favourite / visibility / users and the row menu', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
    const profileStore = useProfileStore(pinia)
    profileStore.user = {
      id: 'u1',
      email: 'u@example.test',
      attributes: { sites: { favourites: [] } },
    } as never

    const wrapper = await mountWithVuetify(SiteInfoIcons, {
      props: { item: site },
      global: { plugins: [pinia] },
    })
    const names = wrapper.findAll('button').map(b => b.attributes('aria-label'))
    expect(names).toEqual(
      expect.arrayContaining([
        'Add Client Documents to favourites',
        'Private site: open settings for Client Documents',
        'Users of Client Documents',
      ]),
    )
    const favourite = wrapper.find('button[aria-pressed]')
    expect(favourite.attributes('aria-pressed')).toBe('false')
    await favourite.trigger('click')
    expect(profileStore.toggleFavourites).toHaveBeenCalledWith('site-1')
    await expectNoA11yViolations(wrapper)
  })

  it('reports a favourited site through aria-pressed', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
    const profileStore = useProfileStore(pinia)
    profileStore.user = {
      id: 'u1',
      email: 'u@example.test',
      attributes: { sites: { favourites: ['site-1'] } },
    } as never
    const wrapper = await mountWithVuetify(SiteInfoIcons, {
      props: { item: site },
      global: { plugins: [pinia] },
    })
    expect(wrapper.find('button[aria-pressed]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('button[aria-pressed]').attributes('aria-label')).toContain('Remove')
  })
})

describe('TableFooter (review finding A4)', () => {
  it('names the pagination controls and page-size select', async () => {
    const wrapper = await mountWithVuetify(TableFooter, {
      props: {
        page: 1,
        itemsPerPage: 10,
        items: Array.from({ length: 25 }, (_, i) => ({ id: i })),
        itemLabel: 'Sites',
      },
    })
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      expect(wrapper.find(`button[aria-label="${name}"]`).exists(), name).toBe(true)
    }
    expect(wrapper.find('[aria-label="Page size"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sites 1 to 10 of 25')
    await wrapper.find('button[aria-label="Next page"]').trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2])
  })
})
