/// <reference types="vite/client" />

import { RegistryProvider, useAtom, useAtomValue } from "@effect/atom-react";
import { Email, Passkey, Password } from "@yielded/auth";
import {
  PasskeyBrowserNotCompleted,
  PasskeyBrowserUnsupported,
  PasskeyBrowserBusy,
} from "@yielded/auth-simplewebauthn/Browser";
import { Cause, Schema } from "effect";
import type { AsyncResult } from "effect/reactivity";
import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { FlowExpired, type AccountClient } from "./client";

import "./style.css";

interface AccountAppOptions {
  readonly number: string;
  readonly description: string;
  readonly minimumPasswordLength: number;
  readonly username?: boolean;
  readonly emailDeliveryHint?: string;
  readonly banner?: ReactNode;
  readonly returnToApp?: boolean;
}

export const mountAccountApp = (client: AccountClient, options: AccountAppOptions) => {
  const minimumPasswordLength = options.minimumPasswordLength;
  const emailDeliveryHint = options.emailDeliveryHint ?? "Check your inbox and spam folder.";

  const {
    auth,
    addPasskey,
    createAccount,
    notice,
    page,
    passkeys,
    recovery,
    recoveryWindow,
    requestReset,
    resetPassword,
    sendVerification,
    signIn,
    signInWithPasskey,
    signOut,
    verification,
    verificationWindow,
    verifyEmail,
  } = client;

  function Failure({
    result,
    fallback,
  }: {
    readonly result: AsyncResult.AsyncResult<unknown, unknown>;
    readonly fallback: string;
  }) {
    if (result._tag !== "Failure") return null;
    let message = fallback;

    for (const reason of result.cause.reasons) {
      if (!Cause.isFailReason(reason)) continue;
      const error = reason.error;

      if (Schema.is(Password.NewPasswordRejected)(error)) {
        message =
          error.reason === "too-short"
            ? `Use at least ${minimumPasswordLength} characters for your password.`
            : error.reason === "compromised" || error.reason === "common"
              ? "This password is known to attackers. Choose a different passphrase."
              : error.reason === "contextual"
                ? "Choose a password that does not contain your account name."
                : "Choose a different password.";
      } else if (Schema.is(Password.PasswordCheckUnavailable)(error))
        message = "Password screening is unavailable. Please try again shortly.";
      else if (
        Schema.is(Password.PasswordActionRequired)(error) ||
        Schema.is(Email.EmailActionRequired)(error)
      )
        message = "Please sign in again before continuing.";
      else if (Schema.is(Email.EmailRejected)(error))
        message = "That code is incorrect or expired. Try again, or request a new code.";
      else if (Schema.is(FlowExpired)(error))
        message = "This code has expired. Request a new code.";
      else if (Schema.is(Password.PasswordRejected)(error)) message = fallback;
      else if (Schema.is(PasskeyBrowserNotCompleted)(error))
        message = "The passkey prompt was closed or timed out. You can try again.";
      else if (Schema.is(PasskeyBrowserUnsupported)(error))
        message =
          "Passkeys aren’t available in this browser. Try a browser or device that supports them.";
      else if (Schema.is(PasskeyBrowserBusy)(error))
        message = "Finish the open passkey prompt first.";
      else if (Schema.is(Passkey.PasskeyActionRequired)(error))
        message = "Your session could not authorize this request. Sign in again to continue.";
      else if (Schema.is(Passkey.PasskeyRejected)(error))
        message = "That passkey request could not be completed. Please try again.";
    }

    return (
      <p className="notice error" role="alert">
        {message}
      </p>
    );
  }

  function PasswordInput({
    value,
    onChange,
    fresh = false,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly fresh?: boolean;
  }) {
    const [visible, setVisible] = useState(false);

    return (
      <>
        <div className="label-row field-label">
          <label htmlFor="password">{fresh ? "New password" : "Password"}</label>
          <button className="text-button" type="button" onClick={() => setVisible(!visible)}>
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="password"
          type={visible ? "text" : "password"}
          autoComplete={fresh ? "new-password" : "current-password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={fresh ? minimumPasswordLength : undefined}
          maxLength={1024}
        />
      </>
    );
  }

  function AccountForm({ register }: { readonly register: boolean }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [username, setUsername] = useState("");
    const [created, create] = useAtom(createAccount);
    const [signedIn, login] = useAtom(signIn);
    const [passkeyResult, passkeyLogin] = useAtom(signInWithPasskey);
    const [, navigate] = useAtom(page);
    const result = register ? created : signedIn;

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (register) create({ email, password, displayName, username });
          else login({ login: email, password });
        }}
      >
        {register && (
          <>
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              required
            />
            {options.username && (
              <>
                <label className="field-label" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                  maxLength={24}
                  minLength={3}
                  placeholder="your_name"
                  required
                />
              </>
            )}
          </>
        )}
        <label className={register ? "field-label" : undefined} htmlFor="email">
          {register || !options.username ? "Email address" : "Email or username"}
        </label>
        <input
          id="email"
          type={register || !options.username ? "email" : "text"}
          autoComplete={register && options.username ? "email" : "username"}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={320}
          placeholder={
            register || !options.username ? "you@example.com" : "you@example.com or your_name"
          }
        />
        <PasswordInput value={password} onChange={setPassword} fresh={register} />
        {!register && (
          <div className="forgot">
            <button className="text-button" type="button" onClick={() => navigate("reset")}>
              Forgot password?
            </button>
          </div>
        )}
        <button className="primary submit" disabled={result.waiting || passkeyResult.waiting}>
          {result.waiting
            ? "Please wait…"
            : register
              ? options.returnToApp
                ? "Create account and return to app"
                : "Create account"
              : options.returnToApp
                ? "Sign in and return to app"
                : "Sign in"}
          <span aria-hidden="true">↗</span>
        </button>
        <Failure
          result={result}
          fallback={
            register
              ? "We could not finish signing you up. If you already have an account, sign in or reset your password."
              : options.username
                ? "The email, username or password is incorrect. Please try again."
                : "The email or password is incorrect. Please try again."
          }
        />
        {!register && (
          <>
            <div className="divider" aria-hidden="true">
              or
            </div>
            <button
              className="secondary passkey-button"
              type="button"
              disabled={result.waiting || passkeyResult.waiting}
              onClick={() => passkeyLogin()}
            >
              {passkeyResult.waiting
                ? "Follow your browser’s prompt…"
                : options.returnToApp
                  ? "Use a passkey and return to app"
                  : "Sign in with a passkey"}
            </button>
            <Failure
              result={passkeyResult}
              fallback="We couldn’t sign you in with that passkey. Please try again."
            />
          </>
        )}
      </form>
    );
  }

  function ResetForm() {
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const saved = useAtomValue(recovery);
    const challenge = saved._tag === "Success" ? saved.value : null;
    const { loading, expired, resendInSeconds } = useAtomValue(recoveryWindow);
    const [requested, send] = useAtom(requestReset);
    const [result, reset] = useAtom(resetPassword);
    const [, navigate] = useAtom(page);

    return (
      <>
        <Failure
          result={saved}
          fallback="We could not restore your reset request. Refresh to try again."
        />
        {challenge === null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(email);
            }}
          >
            <label htmlFor="reset-email">Email address</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <p className="hint">
              If your account has a verified email address, we’ll send a reset code.{" "}
              {emailDeliveryHint}
            </p>
            <button className="primary" disabled={loading || requested.waiting}>
              {requested.waiting ? "Sending…" : "Send reset code"}
              <span aria-hidden="true">↗</span>
            </button>
            <Failure
              result={requested}
              fallback="We could not request a reset code. Please try again shortly."
            />
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              reset({ code, password });
            }}
          >
            <p className="hint">
              {expired
                ? "This code has expired. Request a new code."
                : `Enter the code sent to ${challenge.email}, then choose a new password.`}{" "}
              {emailDeliveryHint}
            </p>
            <label htmlFor="reset-code">Email code</label>
            <input
              id="reset-code"
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={expired}
              required
            />
            <PasswordInput value={password} onChange={setPassword} fresh />
            <button className="primary" disabled={expired || requested.waiting || result.waiting}>
              {result.waiting ? "Updating…" : "Update password"}
              <span aria-hidden="true">↗</span>
            </button>
            <Failure
              result={result}
              fallback="The code is incorrect or expired. Request a new code and try again."
            />
            <button
              className="text-button restart"
              type="button"
              onClick={() => send(challenge.email)}
              disabled={loading || requested.waiting || result.waiting || resendInSeconds > 0}
            >
              {requested.waiting
                ? "Sending…"
                : resendInSeconds > 0
                  ? `Resend in ${resendInSeconds}s`
                  : "Send a new code"}
            </button>
            <Failure
              result={requested}
              fallback="We could not request a reset code. Please try again shortly."
            />
          </form>
        )}
        <button className="text-button restart" type="button" onClick={() => navigate("sign-in")}>
          Back to sign in
        </button>
      </>
    );
  }

  function VerifyForm({ email }: { readonly email: string }) {
    const [code, setCode] = useState("");
    const saved = useAtomValue(verification);
    const challenge = saved._tag === "Success" ? saved.value : null;
    const { loading, expired, resendInSeconds } = useAtomValue(verificationWindow);
    const [sent, send] = useAtom(sendVerification);
    const [result, verify] = useAtom(verifyEmail);

    return (
      <div className="verification">
        <h2>Verify your email</h2>
        <p className="description">Confirm {email} to enable password recovery.</p>
        {saved._tag === "Initial" && <p role="status">Loading your verification…</p>}
        <Failure
          result={saved}
          fallback="We could not restore your verification. Refresh to try again."
        />
        {expired && <p className="notice">This code has expired. Request a new code.</p>}
        {challenge !== null && !expired && (
          <form
            className="code-form"
            onSubmit={(event) => {
              event.preventDefault();
              verify(code);
            }}
          >
            <label htmlFor="verify-code">Six-digit email code</label>
            <input
              id="verify-code"
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <button className="primary" disabled={sent.waiting || result.waiting}>
              {result.waiting ? "Verifying…" : "Verify email"}
              <span aria-hidden="true">↗</span>
            </button>
            <Failure result={result} fallback="Verification could not finish. Please try again." />
          </form>
        )}
        <button
          className={challenge === null ? "primary submit" : "text-button restart"}
          type="button"
          disabled={loading || sent.waiting || result.waiting || resendInSeconds > 0}
          onClick={() => send(email)}
        >
          {sent.waiting
            ? "Sending…"
            : resendInSeconds > 0
              ? `Resend in ${resendInSeconds}s`
              : challenge === null
                ? "Send verification code"
                : "Send a new code"}
        </button>
        {challenge !== null && (
          <p className="hint">
            {emailDeliveryHint} You can refresh this page and still enter your code.
          </p>
        )}
        <Failure
          result={sent}
          fallback="We could not request an email. Please try again shortly."
        />
      </div>
    );
  }

  function PasskeyPanel() {
    const saved = useAtomValue(passkeys);
    const [result, add] = useAtom(addPasskey);
    const [name, setName] = useState("My passkey");
    const keys = saved._tag === "Success" ? saved.value.credentials : [];

    return (
      <section className="panel session-panel">
        <h2>Passkeys</h2>
        <p className="description">Sign in with your fingerprint, face, or device PIN.</p>
        {saved._tag === "Initial" && (
          <p className="hint" role="status">
            Loading passkeys…
          </p>
        )}
        <Failure result={saved} fallback="We couldn’t load your passkeys. Refresh to try again." />
        {keys.length > 0 && (
          <ul className="passkey-list">
            {keys.map((key) => (
              <li key={key.credentialId}>
                <strong>{key.name}</strong>
                <span>Added {new Date(key.createdAtMillis).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
        {keys.length >= 5 ? (
          <p className="hint">You have five passkeys saved.</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add({ name });
            }}
          >
            <label className="field-label" htmlFor="passkey-name">
              Passkey name
            </label>
            <input
              id="passkey-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={128}
              placeholder="My laptop"
              required
              disabled={result.waiting}
            />
            <button
              className="primary submit"
              disabled={result.waiting || saved._tag !== "Success"}
            >
              {result.waiting ? "Follow your browser’s prompt…" : "Add passkey"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
        )}
        <Failure result={result} fallback="We couldn’t add the passkey. Please try again." />
      </section>
    );
  }

  function App() {
    const session = useAtomValue(auth.session);
    const registration = useAtomValue(createAccount);
    const [currentPage, navigate] = useAtom(page);
    const message = useAtomValue(notice);
    const [signOutResult, logout] = useAtom(signOut);
    const addingPasskey = useAtomValue(addPasskey);
    const signedIn = session._tag === "Success" ? session.value : null;

    return (
      <main>
        <header>
          <a className="wordmark" href="/">
            <span aria-hidden="true">y</span>yielded<span className="wordmark-divider">/</span>
            account
          </a>
          <span className="local-indicator">
            <span />
            EXAMPLE {options.number}
          </span>
        </header>
        {options.banner}
        <section className="intro">
          <p className="eyebrow">YOUR SPACE</p>
          <h1>
            {signedIn ? `Welcome, ${signedIn.claims.displayName}.` : "Make yourself at home."}
          </h1>
          <p>
            {signedIn
              ? "Your account is ready whenever you need it."
              : "Create an account, verify your email, and come back any time."}
          </p>
        </section>
        {message !== null && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        {session._tag === "Initial" ? (
          <p role="status">Loading your account…</p>
        ) : (
          <div className="workspace">
            {signedIn ? (
              <section className="panel sign-in">
                <div className="section-heading">
                  <h2>Your account</h2>
                  <span className="badge active">SIGNED IN</span>
                </div>
                <div className="identity">
                  <span className="avatar" aria-hidden="true">
                    {signedIn.claims.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{signedIn.claims.displayName}</strong>
                    <p>
                      {signedIn.claims.username !== undefined && (
                        <>@{signedIn.claims.username} · </>
                      )}
                      {signedIn.claims.email}
                    </p>
                  </div>
                </div>
                <p className="description">
                  {signedIn.claims.emailVerified
                    ? "Your email is verified. You can recover this account if you forget your password."
                    : "Your account is ready. Verify your email to finish setting it up."}
                </p>
                <button
                  className="secondary submit"
                  disabled={signOutResult.waiting || addingPasskey.waiting}
                  onClick={() => logout()}
                >
                  {signOutResult.waiting ? "Signing out…" : "Sign out"}
                </button>
                <Failure result={signOutResult} fallback="Sign-out failed. Please try again." />
              </section>
            ) : (
              <section className="panel sign-in">
                <h2>
                  {currentPage === "reset"
                    ? "Reset your password"
                    : currentPage === "register"
                      ? "Create your account"
                      : "Good to see you again"}
                </h2>
                <p className="description">
                  {currentPage === "reset"
                    ? "Get a code at your verified email address."
                    : currentPage === "register"
                      ? options.username
                        ? "A name, a username, an email, and a password."
                        : "A name, an email, and a password. That’s all."
                      : "Use your password or a saved passkey."}
                </p>
                {currentPage !== "reset" && (
                  <div className="tabs">
                    <button
                      aria-pressed={currentPage === "register"}
                      onClick={() => navigate("register")}
                    >
                      Create account
                    </button>
                    <button
                      aria-pressed={currentPage === "sign-in"}
                      onClick={() => navigate("sign-in")}
                    >
                      Sign in
                    </button>
                  </div>
                )}
                {currentPage === "reset" ? (
                  <div className="reset-form">
                    <ResetForm />
                  </div>
                ) : (
                  <AccountForm key={currentPage} register={currentPage === "register"} />
                )}
              </section>
            )}
            <aside className="side">
              {signedIn && <PasskeyPanel />}
              {signedIn && !signedIn.claims.emailVerified ? (
                <section className="panel session-panel">
                  <Failure
                    result={registration}
                    fallback="Your account was created, but verification could not start. Request a code below."
                  />
                  <VerifyForm email={signedIn.claims.email} />
                </section>
              ) : !signedIn ? (
                <section className="panel welcome">
                  <p className="eyebrow">{signedIn ? "ALL SET" : "A PLACE TO RETURN TO"}</p>
                  <div className="success-mark" aria-hidden="true">
                    {signedIn ? "✓" : "↗"}
                  </div>
                  <h2>{signedIn ? "You’re in." : "Start here. Stay a while."}</h2>
                  <p>
                    {signedIn
                      ? "Your email is verified and your account is ready."
                      : "Your account stays with you. Close the tab, come back later, and pick up where you left off."}
                  </p>
                </section>
              ) : null}
            </aside>
          </div>
        )}
        <footer>
          <p>Yielded Auth · {options.description}</p>
          <p>Email verification · Password recovery</p>
        </footer>
      </main>
    );
  }

  const root = document.getElementById("root");

  if (root !== null)
    createRoot(root).render(
      <RegistryProvider>
        <App />
      </RegistryProvider>,
    );
};
