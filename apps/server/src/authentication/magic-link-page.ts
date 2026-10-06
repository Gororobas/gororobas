// @todo remove once we can serve this page from the front-end

import { EmailDelivery } from "@yielded/auth"
import { Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Sign in · Gororobas</title>
<h1>Sign in to Gororobas</h1>
<form id="request"><label>Name <input name="name" required maxlength="128" autocomplete="name"></label>
<label>Email <input name="email" type="email" required maxlength="320" autocomplete="email"></label>
<button>Send magic link</button></form>
<p id="oauth"><button data-provider="apple">Continue with Apple</button> <button data-provider="google">Continue with Google</button> <button data-provider="microsoft">Continue with Microsoft</button></p>
<button id="confirm" hidden>Confirm sign-in</button>
<button id="sign-out" hidden>Sign out</button>
<p id="status" role="status" aria-live="polite"></p>
<script src="/api/auth/login.js" defer></script></html>`

const javascript = `
const form = document.getElementById('request');
const confirm = document.getElementById('confirm');
const signOut = document.getElementById('sign-out');
const status = document.getElementById('status');
const fragment = location.hash;
history.replaceState(null, '', location.pathname);
const storageKey = 'gororobas.magic-link';
const report = message => { status.textContent = message; };
const call = async (name, payload) => {
  const response = await fetch('/api/auth/' + name, {
    method: name === 'getSession' ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-effect-auth-csrf': '1' },
    ...(name === 'getSession' ? {} : { body: JSON.stringify(payload === undefined ? {} : { payload }) })
  });
  const result = await response.json();
  if (!response.ok || result._tag !== 'Success') {
    const reason = result.error?.reason;
    if (reason === 'email-verification-required' || reason === 'account-conflict') throw new Error('Sign in with a magic link first, then connect this provider from the same page.');
    if (reason === 'provider-disabled') throw new Error('This provider is not configured.');
    throw new Error('This request could not be completed. Start a fresh sign-in.');
  }
  return result.value;
};
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const identity = { flowId: crypto.randomUUID(), name: form.elements.name.value.trim(), email: form.elements.email.value.trim().toLowerCase() };
    await call('beginMagicLink', { flowId: identity.flowId });
    const receipt = await call('requestMagicLink', { ...identity, requestId: crypto.randomUUID(), locale: navigator.language || 'en' });
    localStorage.setItem(storageKey, JSON.stringify({ identity, reference: receipt.reference, expiresAt: Date.now() + 300000 }));
    report('Check your email and open the link in this browser. Your account is created after confirmation.');
  } catch (error) { report(error.message); }
  finally { button.disabled = false; }
});
document.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const input = { provider: button.dataset.provider, flowId: crypto.randomUUID() };
    const result = await call('beginOAuth', input);
    localStorage.setItem('gororobas.oauth', JSON.stringify({ ...input, expiresAt: Date.now() + 600000 }));
    location.assign(result.authorizationUrl);
  } catch (error) { report(error.message); button.disabled = false; }
}));
if (fragment.startsWith('#oauth=')) {
  form.hidden = true;
  let response;
  let saved;
  try {
    response = JSON.parse(decodeURIComponent(fragment.slice(7)));
    saved = JSON.parse(localStorage.getItem('gororobas.oauth'));
    if (!saved || saved.provider !== response.provider || saved.expiresAt <= Date.now()) throw new Error();
    confirm.hidden = false;
    report('Confirm to finish signing in with your provider.');
  } catch { form.hidden = false; report('Start a fresh provider sign-in in this browser.'); }
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    try {
      const completed = await call('completeOAuth', { ...response, flowId: saved.flowId });
      if (completed._tag !== 'Authenticated') throw new Error('Start a fresh sign-in.');
      localStorage.removeItem('gororobas.oauth');
      response = undefined;
      confirm.hidden = true;
      signOut.hidden = false;
      report('You are signed in.');
    } catch (error) { response = undefined; confirm.hidden = true; form.hidden = false; report(error.message); }
  });
} else if (fragment === '#oauth-error') {
  report('Provider sign-in was cancelled or failed. Start a fresh sign-in.');
} else if (fragment) {
  form.hidden = true;
  let link;
  let saved;
  try {
    if (!/^#eal1\\.[A-Za-z0-9_-]{1,4096}$/.test(fragment)) throw new Error();
    const bytes = Uint8Array.from(atob(fragment.slice(6).replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    link = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || saved.expiresAt <= Date.now() || saved.reference.proofId !== link.reference.proofId || saved.reference.purpose !== link.reference.purpose) throw new Error();
    confirm.hidden = false;
    report('Confirm to finish signing in.');
  } catch { report('Open this link in the browser where you requested it, or request a fresh link.'); form.hidden = false; }
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    try {
      const verified = await call('verifyMagicLink', { ...saved.identity, reference: link.reference, secret: link.token });
      const completed = await call('completeMagicLink', { ...saved.identity, continuationId: verified.continuation.continuationId });
      if (completed._tag !== 'Authenticated') throw new Error('Authentication could not be completed. Request a fresh link.');
      localStorage.removeItem(storageKey);
      link = undefined;
      confirm.hidden = true;
      signOut.hidden = false;
      report('You are signed in.');
    } catch (error) { link = undefined; confirm.hidden = true; form.hidden = false; report(error.message); }
  });
} else {
  call('getSession').then(session => {
    if (session) { form.hidden = true; signOut.hidden = false; report('You are signed in. Use the provider buttons to connect an account within five minutes of sign-in.'); }
  }).catch(() => report('Could not check your session.'));
}
signOut.addEventListener('click', async () => {
  signOut.disabled = true;
  try { await call('signOut'); signOut.hidden = true; form.hidden = false; report('You are signed out.'); }
  catch (error) { report(error.message); }
  finally { signOut.disabled = false; }
});
`

const headers = {
  ...EmailDelivery.linkLandingHeaders,
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
}

export const magicLinkPageRoutes = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/api/auth/login",
    HttpServerResponse.text(html, { headers, contentType: "text/html; charset=utf-8" }),
  ),
  HttpRouter.add(
    "GET",
    "/api/auth/login.js",
    HttpServerResponse.text(javascript, { headers, contentType: "text/javascript; charset=utf-8" }),
  ),
)
