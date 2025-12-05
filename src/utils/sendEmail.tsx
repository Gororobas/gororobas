import { render } from '@react-email/components'
import { Config, Effect } from 'effect'
import type { CreateEmailOptions } from 'resend'
import { m } from '@/paraglide/messages'
import * as Mailpit from '../services/mailpit'
import * as Resend from '../services/resend'

export const sendEmail = (
  payload: Omit<CreateEmailOptions, 'from'>,
) =>
  Effect.gen(function* () {
    const fromName = m.frail_weary_slug_flop()
    const fromEmail = m.gororobas_email()

    const nodeEnv = yield* Config.string('NODE_ENV')
    const isDev = nodeEnv === 'development'

    if (isDev) {
      const mailpit = yield* Mailpit.Mailpit
      const html = yield* Effect.tryPromise({
        // biome-ignore lint: We do indeed need this fragment
        try: () => render(<>{payload.react}</>),
        catch: () =>
          new Mailpit.MailpitError({
            message: 'Failed to render React Email',
          }),
      })
      const result = yield* mailpit.use((client) =>
        client.sendMessage({
          From: { Email: fromEmail, Name: fromName },
          To: [payload.to].flat().map((email) => ({ Email: email })),
          HTML: html,
          Bcc: payload.bcc ? [payload.bcc].flat() : [],
          Cc: payload.cc
            ? [payload.cc].flat().map((email) => ({ Email: email }))
            : [],
          Attachments: payload.attachments
            ? [payload.attachments].flat().map((attachment) => ({
                Content: attachment.content?.toString('base64') ?? '',
                ContentType: attachment.contentType ?? '',
                Filename: attachment.filename || '',
              }))
            : [],
          Subject: payload.subject || '',
        }),
      )
      return { id: result.ID }
    }

    const resend = yield* Resend.Resend
    const result = yield* resend.use((client) =>
      client.emails.send({
        ...payload,
        from: `${fromName} <${fromEmail}>`,
      } as  CreateEmailOptions),
    )
    if (!result.data?.id) {
      return yield* Effect.fail(
        new Resend.ResendError({
          message: 'Failed to send email',
        }),
      )
    }
    return {
      id: result.data.id,
    }
  })
