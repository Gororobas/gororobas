import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import worker from '../dist/server/fetch.js'

const requestPage = (path, method = 'GET') =>
  worker.fetch(
    new Request(`https://pleat.example${path}`, {
      method,
      headers: { accept: 'text/html' },
    }),
  )

for (const path of ['/', '/guide/', '/reference?section=style', '/404']) {
  test(`${path} renders a document that can be prerendered`, async () => {
    const response = await requestPage(path)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /data-pleat/)
  })
}

test('unknown pages return the styled not-found document with HTTP 404', async () => {
  const response = await requestPage('/missing/nested-page')
  assert.equal(response.status, 404)
  assert.match(await response.text(), /There is no page at this address\./)
})

test('HEAD preserves the missing-page status without a body', async () => {
  const response = await requestPage('/missing', 'HEAD')
  assert.equal(response.status, 404)
  assert.equal(await response.text(), '')
})

test('a missing asset receives HTTP 404 without the app document', async () => {
  const response = await requestPage('/assets/missing.js')
  assert.equal(response.status, 404)
  assert.equal(await response.text(), '')
})

test('Cloudflare receives the prerendered not-found page as 404.html', async () => {
  assert.equal(
    await readFile(new URL('../dist/client/404.html', import.meta.url), 'utf8'),
    await readFile(new URL('../dist/client/404/index.html', import.meta.url), 'utf8'),
  )
})
