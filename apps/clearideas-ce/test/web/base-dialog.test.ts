import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import BaseDialog from '../../src-web/src/components/base/BaseDialog.vue'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

/** VDialog teleports its content to document.body; query there. */
function dialogEl() {
  return document.body.querySelector('[role="dialog"]') as HTMLElement | null
}
function buttonNamed(name: string) {
  return [...document.body.querySelectorAll('button')].find(
    b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
  )
}

async function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  const open = ref(true)
  const Host = defineComponent({
    setup() {
      return () =>
        h(
          BaseDialog,
          {
            modelValue: open.value,
            'onUpdate:modelValue': (v: boolean) => (open.value = v),
            title: 'Delete site',
            ...props,
          },
          { default: () => h('p', 'Body text'), ...slots },
        )
    },
  })
  const wrapper = await mountWithVuetify(Host)
  await settle()
  return { wrapper, open }
}

describe('BaseDialog', () => {
  it('renders a labelled modal dialog with a named close button and closes via it', async () => {
    const { wrapper, open } = await mountDialog()
    const dialog = dialogEl()
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dialog?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toContain('Delete site')
    expect(document.body.textContent).toContain('Body text')
    await expectNoA11yViolations(dialog!)

    buttonNamed('Close')!.click()
    await settle()
    expect(open.value).toBe(false)
    expect(wrapper.emitted('close') ?? []).toBeDefined()
  })

  it('renders Cancel → Confirm from confirmText and emits confirm / cancel', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { open } = await mountDialog({
      confirmText: 'Delete',
      confirmIntent: 'danger',
      onConfirm,
      onCancel,
    })
    const confirm = buttonNamed('Delete')!
    const cancel = buttonNamed('Cancel')!
    expect(confirm.className).toContain('bg-error')
    expect(cancel.className).toContain('v-btn--variant-text')
    // Order: Cancel before Confirm.
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    confirm.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(open.value).toBe(true) // confirm does not close by itself; the caller decides when work is done

    cancel.click()
    await settle()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(open.value).toBe(false)
  })

  it('binds Confirm to a form in the body when `form` is given', async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    await mountDialog(
      { confirmText: 'Save', form: 'my-form' },
      { default: () => h('form', { id: 'my-form', onSubmit }, [h('input', { name: 'a' })]) },
    )
    const confirm = buttonNamed('Save')!
    expect(confirm.getAttribute('type')).toBe('submit')
    expect(confirm.getAttribute('form')).toBe('my-form')
  })

  it('locks the dialog while loading: Cancel and Close disabled, Confirm spinning', async () => {
    await mountDialog({ confirmText: 'Create', loading: true })
    expect(buttonNamed('Cancel')!.hasAttribute('disabled')).toBe(true)
    expect(buttonNamed('Close')!.hasAttribute('disabled')).toBe(true)
    expect(buttonNamed('Create')!.querySelector('.v-btn__loader')).not.toBeNull()
  })

  it('renders a custom actions slot inside the footer chrome', async () => {
    await mountDialog({}, { actions: () => h('button', { type: 'button' }, 'Custom') })
    expect(buttonNamed('Custom')).toBeDefined()
    expect(document.body.querySelector('.base-dialog__actions')).not.toBeNull()
  })

  it('returns focus to the element that opened it when it closes', async () => {
    const open = ref(false)
    const afterLeave = vi.fn()
    const Host = defineComponent({
      setup() {
        return () => [
          h('button', { class: 'opener', onClick: () => (open.value = true) }, 'Open'),
          h(
            BaseDialog,
            {
              modelValue: open.value,
              'onUpdate:modelValue': (v: boolean) => (open.value = v),
              title: 'Rename',
              onAfterLeave: afterLeave,
            },
            { default: () => h('input', { 'aria-label': 'Name', autofocus: true }) },
          ),
        ]
      },
    })
    // Real transitions, so VDialog's after-leave fires (Test Utils stubs <transition> by default).
    const wrapper = await mountWithVuetify(Host, { global: { stubs: { transition: false } } })
    const opener = wrapper.get('button.opener').element as HTMLButtonElement
    opener.focus()
    opener.click()
    await settle()
    document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!.focus()
    buttonNamed('Close')!.click()
    await vi.waitFor(() => expect(afterLeave).toHaveBeenCalled(), { timeout: 3000 })
    expect(document.activeElement).toBe(opener)
  })
})
