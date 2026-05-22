import Handlebars from 'handlebars'
import type { EmailProvider, EmailSendInput, EmailTemplateSendInput } from '../providers/index.js'

export interface EmailTemplate {
  subject: string
  html?: string
  text?: string
}

export interface EmailTemplateLoader {
  load(templateAlias: string): Promise<EmailTemplate>
}

export interface LogEmailProviderOptions {
  logger?: Pick<Console, 'info'>
}

export function renderEmailTemplate(
  template: EmailTemplate,
  templateModel: Record<string, unknown>,
): Required<Pick<EmailSendInput, 'subject'>> & Pick<EmailSendInput, 'html' | 'text'> {
  return {
    subject: renderTemplateString(template.subject, templateModel),
    html: template.html ? renderTemplateString(template.html, templateModel) : undefined,
    text: template.text ? renderTemplateString(template.text, templateModel) : undefined,
  }
}

export function createTemplateEmailProvider(input: {
  transport: Pick<EmailProvider, 'send'>
  templateLoader: EmailTemplateLoader
}): EmailProvider {
  return {
    send: input.transport.send,
    async sendTemplate(message: EmailTemplateSendInput) {
      const template = await input.templateLoader.load(message.templateAlias)
      const rendered = renderEmailTemplate(template, message.templateModel)
      await input.transport.send({
        to: message.to,
        from: message.from,
        replyTo: message.replyTo,
        subject: message.subject ?? rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })
    },
  }
}

export function createLogEmailProvider(options: LogEmailProviderOptions = {}): EmailProvider {
  const logger = options.logger ?? console
  return {
    async send(input: EmailSendInput) {
      logger.info(formatLogEmail('email', input))
    },
    async sendTemplate(input: EmailTemplateSendInput) {
      logger.info(formatLogEmail('email-template', input))
    },
  }
}

function renderTemplateString(template: string, model: Record<string, unknown>): string {
  return Handlebars.compile(template, { noEscape: true })(model)
}

function formatLogEmail(kind: string, input: EmailSendInput | EmailTemplateSendInput): string {
  return `[clearideas-email] ${JSON.stringify({
    provider: 'log',
    kind,
    timestamp: new Date().toISOString(),
    ...input,
  })}`
}
