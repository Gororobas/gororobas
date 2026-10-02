/* oxlint-disable custom-lint-rules/no-direct-fetch -- This standalone preview deliberately tests without Effect. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import { test } from "node:test"

void test("preview serves local exports unchanged and does not expose other files or writes", async () => {
  const child = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  })
  try {
    const url = await new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error(`Preview exited with ${code}`)))
      child.stdout.once("data", (data) =>
        resolve(String(data).trim().replace("Migration preview: ", "")),
      )
    })
    const response = await fetch(`${url}/exports.json`)
    assert.equal(response.status, 200)
    const dataset = await response.json()
    assert.equal(dataset.rejected.length, 0)
    for (const [category, folder] of Object.entries({
      plants: "vegetables",
      resources: "resources",
      notes: "notes",
    })) {
      const directory = new URL(`../debug/${folder}/`, import.meta.url)
      let files
      try {
        files = (await readdir(directory)).filter((file) => file.endsWith(".json"))
      } catch (error) {
        if (error.code !== "ENOENT") throw error
        assert.ok(dataset.missing.includes(folder))
        assert.deepEqual(dataset[category], [])
        continue
      }
      assert.equal(dataset[category].length, files.length)
      for (const { file, ...data } of dataset[category]) {
        const original = JSON.parse(await readFile(new URL(file, directory), "utf8"))
        assert.deepEqual(data, original.latest_source ? original : { latest_source: original })
      }
    }
    assert.match(await (await fetch(url)).text(), /Preview da migração/)
    assert.equal((await fetch(`${url}/../package.json`)).status, 404)
    assert.equal((await fetch(`${url}/exports.json`, { method: "POST" })).status, 405)
  } finally {
    child.kill()
  }
})
