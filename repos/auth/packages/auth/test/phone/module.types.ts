import { Auth, Sessions } from "@yielded/auth";
import type { ProofKeys } from "@yielded/auth/Proofs";
import type { SmsDelivery } from "@yielded/auth/SmsDelivery";
import { Email, OAuth, Passkey, Password, PhoneOtp, Totp } from "@yielded/auth/strategies";
import type { Layer } from "effect";
import { Schema } from "effect";
import { expectTypeOf } from "vite-plus/test";

// Compile-only proof of requirements inferred through Auth.make and its strategies.
export const strategyRequirements = () => {
  const app = Auth.make("test/default-strategies", {
    claims: Schema.Struct({}),
    sessions: Sessions.stateful(),
    strategies: {
      phone: PhoneOtp.make(),
      email: Email.makeCode(),
      link: Email.makeLink({ url: "https://example.invalid/sign-in" }),
      password: Password.make(),
      passkey: Passkey.make(),
      oauth: OAuth.make(),
      totp: Totp.make(),
    },
  });

  type Dependencies = Layer.Services<typeof app.layer>;
  expectTypeOf<Extract<Dependencies, SmsDelivery>>().toEqualTypeOf<SmsDelivery>();
  expectTypeOf<Extract<Dependencies, ProofKeys>>().toEqualTypeOf<ProofKeys>();
  expectTypeOf<
    Extract<Dependencies, Passkey.PasskeyConfig>
  >().toEqualTypeOf<Passkey.PasskeyConfig>();
  expectTypeOf<
    Extract<Layer.Services<typeof app.strategies.link.layer>, ProofKeys>
  >().toEqualTypeOf<never>();

  const managedPassword = Auth.make("test/password-defaults", {
    claims: Schema.Struct({}),
    sessions: Sessions.stateful(),
    strategies: {
      password: Password.make({
        registration: Schema.Struct({}),
        reset: Password.resetLink({ url: "https://example.invalid/reset" }),
      }),
    },
  });

  expectTypeOf<
    Extract<Layer.Services<typeof managedPassword.layer>, ProofKeys>
  >().toEqualTypeOf<never>();
};
