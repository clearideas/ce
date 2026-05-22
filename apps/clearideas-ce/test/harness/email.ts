import type { EmailProvider, EmailSendInput, EmailTemplateSendInput } from '@clearideas/core/providers'

export interface CapturedEmailProvider extends EmailProvider {
  messages: EmailSendInput[]
  templates: EmailTemplateSendInput[]
  lastTemplate(alias?: string): EmailTemplateSendInput | undefined
  lastCode(email?: string): string | undefined
  clear(): void
}

export function createCapturedEmailProvider(): CapturedEmailProvider {
  const provider: CapturedEmailProvider = {
    messages: [],
    templates: [],
    async send(input) {
      provider.messages.push(input)
    },
    async sendTemplate(input) {
      provider.templates.push(input)
    },
    lastTemplate(alias) {
      return [...provider.templates].reverse().find(item => !alias || item.templateAlias === alias)
    },
    lastCode(email) {
      const normalized = email?.toLowerCase()
      const template = [...provider.templates].reverse().find(item => {
        if (item.templateAlias !== 'sign-in-code' && item.templateAlias !== 'site-invitation' && item.templateAlias !== 'user-invitation') return false
        if (!normalized) return true
        return String(item.to).toLowerCase() === normalized
      })
      return template?.templateModel?.code == null ? undefined : String(template.templateModel.code)
    },
    clear() {
      provider.messages.splice(0)
      provider.templates.splice(0)
    },
  }
  return provider
}
