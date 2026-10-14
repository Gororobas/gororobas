import { SupportedLanguage } from "@gororobas/domain"
import { EmailDelivery } from "@yielded/auth"
import { Clock, Effect, Layer, Match, Option, Redacted, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/**
 * Yielded renders proof emails without knowing their recipient, while delivery knows the recipient
 * but only sees finished content. New accounts get different wording, so the renderer serializes
 * the template and the delivery below — which can look the recipient up — writes the actual copy.
 * Both must be installed together; `AuthenticationEmailsLive` does that.
 */
const PendingEmail = Schema.Struct({
  code: Schema.String,
  minutes: Schema.Int,
  language: SupportedLanguage,
})

const PendingEmailJson = Schema.fromJsonString(PendingEmail)

export const languageFromLocale = (locale: string): SupportedLanguage => {
  const language = locale.toLowerCase().split(/[-_]/, 1)[0]
  return language === "pt" || language === "es" ? language : "en"
}

const AuthenticationEmailRenderer = Layer.succeed(EmailDelivery.EmailRenderer, {
  render: Effect.fnUntraced(function* ({ content, expiresAtMillis, locale }) {
    const now = yield* Clock.currentTimeMillis

    const pending = yield* Schema.encodeEffect(PendingEmailJson)({
      code: Redacted.value(
        Match.valueTags(content, { Code: ({ code }) => code, Link: ({ url }) => url }),
      ),
      minutes: Math.max(1, Math.ceil((expiresAtMillis - now) / 60_000)),
      language: languageFromLocale(locale),
    }).pipe(Effect.orDie)

    return { subject: "Gororobas", text: Redacted.make(pending) }
  }),
})

const EMAIL_COPY = {
  en: {
    signIn: {
      subject: (code: string) => `${code} is your Gororobas sign-in code`,
      intro: "Use this code to sign in to Gororobas:",
    },
    signUp: {
      subject: (code: string) => `${code} is your code to join Gororobas`,
      intro: "Welcome to Gororobas! Use this code to confirm your email and create your account:",
    },
    link: "Or open this link in the same browser where you requested it:",
    expiry: (minutes: number) =>
      `The code expires in ${minutes} minute${minutes === 1 ? "" : "s"}. If you didn't request it, you can ignore this email.`,
  },
  pt: {
    signIn: {
      subject: (code: string) => `${code} é seu código para entrar no Gororobas`,
      intro: "Use este código para entrar no Gororobas:",
    },
    signUp: {
      subject: (code: string) => `${code} é seu código para criar sua conta no Gororobas`,
      intro:
        "Boas-vindas ao Gororobas! Use este código para confirmar seu email e criar sua conta:",
    },
    link: "Ou abra este link no mesmo navegador em que você pediu o código:",
    expiry: (minutes: number) =>
      `O código expira em ${minutes} minuto${minutes === 1 ? "" : "s"}. Se você não pediu este código, pode ignorar este email.`,
  },
  es: {
    signIn: {
      subject: (code: string) => `${code} es tu código para iniciar sesión en Gororobas`,
      intro: "Usa este código para iniciar sesión en Gororobas:",
    },
    signUp: {
      subject: (code: string) => `${code} es tu código para crear tu cuenta en Gororobas`,
      intro:
        "¡Te damos la bienvenida a Gororobas! Usa este código para confirmar tu correo electrónico y crear tu cuenta:",
    },
    link: "O abre este enlace en el mismo navegador en el que solicitaste el código:",
    expiry: (minutes: number) =>
      `El código vence en ${minutes} minuto${minutes === 1 ? "" : "s"}. Si no solicitaste este código, puedes ignorar este correo electrónico.`,
  },
} as const

export const renderAuthenticationEmail = (input: {
  readonly origin: string
  readonly code: string
  readonly minutes: number
  readonly language: SupportedLanguage
  readonly isNewAccount: boolean
}) => {
  const copy = EMAIL_COPY[input.language]
  const variant = input.isNewAccount ? copy.signUp : copy.signIn

  return {
    subject: variant.subject(input.code),
    text: [
      variant.intro,
      input.code,
      `${copy.link}\n${input.origin}/login#code=${input.code}`,
      copy.expiry(input.minutes),
    ].join("\n\n"),
  }
}

const isUnclaimedEmail = SqlSchema.findOneOption({
  Request: Schema.String,
  Result: Schema.Struct({ isUnclaimed: Schema.BooleanFromBit }),
  execute: (email) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT claimed_at IS NULL AS is_unclaimed FROM auth_subjects WHERE email = ${email}`,
    ),
})

const RecipientAwareDelivery = (origin: string) =>
  Layer.effect(
    EmailDelivery.EmailDelivery,
    Effect.gen(function* () {
      const transport = yield* EmailDelivery.EmailDelivery
      const sql = yield* SqlClient.SqlClient

      return EmailDelivery.EmailDelivery.of({
        send: Effect.fn("AuthenticationEmails.send")(function* (message) {
          const pending = yield* Schema.decodeEffect(PendingEmailJson)(
            Redacted.value(message.text),
          ).pipe(Effect.mapError(() => EmailDelivery.EmailNotAccepted.make({})))

          const recipient = yield* isUnclaimedEmail(message.to).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.mapError(() => EmailDelivery.EmailNotAccepted.make({})),
          )

          const rendered = renderAuthenticationEmail({
            code: pending.code,
            minutes: pending.minutes,
            language: pending.language,
            origin,
            isNewAccount: Option.match(recipient, {
              onNone: () => false,
              onSome: ({ isUnclaimed }) => isUnclaimed,
            }),
          })

          return yield* transport.send({
            to: message.to,
            subject: rendered.subject,
            text: Redacted.make(rendered.text),
          })
        }),
      })
    }),
  )

export const AuthenticationEmailsLive = (origin: string) =>
  Layer.merge(AuthenticationEmailRenderer, RecipientAwareDelivery(origin))
