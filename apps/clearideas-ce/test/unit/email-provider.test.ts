import { afterEach, describe, expect, it, vi } from 'vitest'

const { createTransport, sendMail } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: { createTransport },
}))

import { createCeEmailProvider } from '../../src/providers/email.js'

const originalEnvironment = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnvironment }
  createTransport.mockReset()
  sendMail.mockReset()
})

describe('CE SMTP email provider', () => {
  it('sends ordinary SMTP messages with the supported Nodemailer runtime', async () => {
    createTransport.mockReturnValue({ sendMail })
    process.env.EMAIL_PROVIDER = 'smtp'
    process.env.SMTP_HOST = 'smtp.example.test'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_SECURE = 'true'
    process.env.SMTP_USER = 'mailer'
    process.env.SMTP_PASS = 'secret'
    process.env.EMAIL_FROM = 'Clear Ideas <noreply@example.test>'
    process.env.EMAIL_REPLY_TO = 'support@example.test'

    const provider = await createCeEmailProvider({ templateRoot: '/unused' })
    await provider.send({
      to: 'recipient@example.test',
      subject: 'Account update',
      text: 'Your account was updated.',
      html: '<p>Your account was updated.</p>',
    })

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      auth: { user: 'mailer', pass: 'secret' },
    })
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Clear Ideas <noreply@example.test>',
      to: 'recipient@example.test',
      replyTo: 'support@example.test',
      subject: 'Account update',
      text: 'Your account was updated.',
      html: '<p>Your account was updated.</p>',
    })
  })
})
