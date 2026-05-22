import { createLogEmailProvider, createTemplateEmailProvider, type EmailTemplate, type EmailTemplateLoader } from '@clearideas/core/services/email'
import type { EmailProvider, EmailSendInput } from '@clearideas/core/providers'
import fs from 'fs/promises'
import nodemailer from 'nodemailer'
import path from 'path'

export interface CeEmailProviderOptions {
  templateRoot: string
}

export async function createCeEmailProvider(options: CeEmailProviderOptions): Promise<EmailProvider> {
  const provider = (process.env.EMAIL_PROVIDER ?? 'log').trim().toLowerCase()
  const templateLoader = createFileTemplateLoader(options.templateRoot)

  if (provider === 'smtp') {
    return createTemplateEmailProvider({
      templateLoader,
      transport: createSmtpEmailTransport(),
    })
  }

  if (provider === 'log') {
    return createTemplateEmailProvider({
      templateLoader,
      transport: createLogEmailProvider(),
    })
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}". Use "log" or "smtp".`)
}

function createSmtpEmailTransport(): Pick<EmailProvider, 'send'> {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const secure = String(process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.EMAIL_FROM
  const replyTo = process.env.EMAIL_REPLY_TO

  if (!host) throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp')
  if (!from) throw new Error('EMAIL_FROM is required when EMAIL_PROVIDER=smtp')

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  })

  return {
    async send(input: EmailSendInput) {
      await transporter.sendMail({
        from: input.from ?? from,
        to: input.to,
        replyTo: input.replyTo ?? replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })
    },
  }
}

function createFileTemplateLoader(templateRoot: string): EmailTemplateLoader {
  return {
    async load(templateAlias: string): Promise<EmailTemplate> {
      const safeAlias = templateAlias.replace(/[^a-zA-Z0-9._-]/g, '')
      if (!safeAlias) throw new Error('Email template alias is required')
      const basePath = path.join(templateRoot, safeAlias)
      const [subject, html, text] = await Promise.all([
        readRequired(`${basePath}.subject.hbs`),
        readOptional(`${basePath}.html.hbs`),
        readOptional(`${basePath}.text.hbs`),
      ])
      return { subject: subject.trim(), html, text }
    },
  }
}

async function readRequired(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}
