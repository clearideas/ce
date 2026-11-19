import { createTestingPinia } from '@pinia/testing'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import NotificationSettings from '../../src-web/src/components/settings/NotificationSettings.vue'
import ProfileSettings from '../../src-web/src/components/settings/ProfileSettings.vue'
import { useDirtyForm } from '../../src-web/src/composables/useDirtyForm'
import { useProfileStore } from '../../src-web/src/stores/profile.store'
import { useSiteStore } from '../../src-web/src/stores/site.store'
import { useUnsavedChangesStore } from '../../src-web/src/stores/unsavedChanges.store'
import { mountWithVuetify, settle } from './harness'

vi.mock('../../src-web/src/api/client', () => ({ ceApi: {}, api: {} }))
vi.mock('../../src-web/src/composables/useAlert', () => ({
  useAlert: () => ({ add: vi.fn() }),
  updateAlertTheme: vi.fn(),
}))

describe('useDirtyForm (plan item 3.7)', () => {
  it('is clean after load, dirty after a change, clean again after markClean', () => {
    const form = reactive({ name: 'A', tags: ['x'] })
    const { dirty, markClean } = useDirtyForm(() => ({ ...form, tags: [...form.tags] }))
    expect(dirty.value).toBe(false)
    form.tags.push('y')
    expect(dirty.value).toBe(true)
    markClean()
    expect(dirty.value).toBe(false)
    form.name = 'B'
    expect(dirty.value).toBe(true)
    form.name = 'A'
    expect(dirty.value).toBe(false) // reverting a change is not dirty
  })
})

function seededPinia() {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
  const profileStore = useProfileStore(pinia)
  profileStore.user = {
    id: 'u1',
    email: 'u@example.test',
    displayName: 'Ursula',
    attributes: {
      sites: { favourites: ['site-1'], autoAcceptInvites: true, suppressNotifications: [] },
      notifications: { frequency: 'daily', hours: ['09:00', '17:00'], days: [] },
    },
  } as never
  profileStore.account = { id: 'a1', name: 'Acme' } as never
  const siteStore = useSiteStore(pinia)
  siteStore.sites = [
    { id: 'site-1', name: 'Client Documents', folders: [] },
    { id: 'site-2', name: 'Archive', folders: [] },
  ]
  return { pinia, profileStore, siteStore }
}

describe('ProfileSettings', () => {
  it('enables Save only when the form is dirty and saves the trimmed values', async () => {
    const { pinia, profileStore } = seededPinia()
    vi.mocked(profileStore.updateProfile).mockResolvedValue({} as never)
    vi.mocked(profileStore.updateAccount).mockResolvedValue({} as never)
    const wrapper = await mountWithVuetify(ProfileSettings, { global: { plugins: [pinia] } })
    const save = () => wrapper.findAll('button').find(b => b.text() === 'Save profile')!
    expect(save().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Unsaved changes')

    await wrapper.find('input[aria-label="Display name"]').setValue('  Ursula K.  ')
    expect(save().attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('Unsaved changes')

    await save().trigger('click')
    await settle()
    expect(profileStore.updateProfile).toHaveBeenCalledWith({ displayName: 'Ursula K.' }, { silent: true })
    expect(profileStore.updateAccount).toHaveBeenCalledWith({ name: 'Acme' }, { silent: true })
    expect(save().attributes('disabled')).toBeDefined() // clean again
  })
})

describe('NotificationSettings', () => {
  it('preserves the other `sites` attributes when saving (no favourites/blocked-sites loss)', async () => {
    const { pinia, profileStore } = seededPinia()
    vi.mocked(profileStore.updateProfile).mockResolvedValue({} as never)
    const wrapper = await mountWithVuetify(NotificationSettings, { global: { plugins: [pinia] } })
    await settle()

    // Unsubscribe from one site.
    const archive = wrapper
      .findAll('input[type="checkbox"]')
      .find(
        i => i.attributes('id') && wrapper.find(`label[for="${i.attributes('id')}"]`).text() === 'Archive',
      )!
    await archive.setValue(false)
    const save = wrapper.findAll('button').find(b => b.text() === 'Save notification settings')!
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    await settle()

    const payload = vi.mocked(profileStore.updateProfile).mock.calls[0][0]
    expect(payload.attributes?.sites).toEqual({
      favourites: ['site-1'],
      autoAcceptInvites: true,
      suppressNotifications: ['site-2'],
    })
  })
})

describe('unsaved-changes dialog store', () => {
  it('resolves the pending navigation with the user’s decision', async () => {
    const pinia = createPinia() // real actions, not the testing stubs
    setActivePinia(pinia)
    const store = useUnsavedChangesStore(pinia)
    const decision = store.confirmLeave()
    expect(store.open).toBe(true)
    store.resolve(true)
    await expect(decision).resolves.toBe(true)
    expect(store.open).toBe(false)

    const second = store.confirmLeave()
    store.resolve(false)
    await expect(second).resolves.toBe(false)
    await nextTick()
  })
})
