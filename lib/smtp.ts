import nodemailer from 'nodemailer'

export async function sendMagicLinkEmail(email: string, magicLink: string) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || 'noreply@yourdomain.com'

  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS or SMTP_PASSWORD are required')
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  await transport.sendMail({
    from,
    to: email,
    subject: 'Your CareThread magic link',
    text: [
      'Use this secure magic link to sign in to CareThread:',
      '',
      magicLink,
      '',
      'This link expires in 15 minutes and can be used once.',
    ].join('\n'),
  })
}
