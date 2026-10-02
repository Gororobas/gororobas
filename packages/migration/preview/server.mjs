import { readFile, readdir } from "node:fs/promises"
import { createServer } from "node:http"

const directories = {
  plants: "vegetables",
  resources: "resources",
  notes: "notes",
  cultivars: "cultivars",
  tags: "tags",
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store")
  if (request.method !== "GET") {
    response.writeHead(405).end("Read-only preview")
    return
  }
  try {
    if (request.url === "/exports.json") {
      const exports = { plants: [], resources: [], notes: [], cultivars: [], tags: [] }
      const rejected = []
      const missing = []
      for (const [category, folder] of Object.entries(directories)) {
        const directory = new URL(`../debug/${folder}/`, import.meta.url)
        let files
        try {
          files = (await readdir(directory)).filter((file) => file.endsWith(".json"))
        } catch (error) {
          if (error.code !== "ENOENT") throw error
          missing.push(folder)
          continue
        }
        for (const file of files) {
          try {
            const data = JSON.parse(await readFile(new URL(file, directory), "utf8"))
            const source = data.latest_source ?? data
            if (!source.handle || !source.id)
              throw new Error("Expected source.handle and source.id")
            exports[category].push({
              file,
              ...(data.latest_source ? data : { latest_source: data }),
            })
          } catch (error) {
            rejected.push({ file: `${folder}/${file}`, error: error.message })
          }
        }
      }
      response.setHeader("Content-Type", "application/json; charset=utf-8")
      let references = []
      try {
        references = JSON.parse(
          await readFile(new URL("../debug/references/index.json", import.meta.url), "utf8"),
        )
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
      try {
        for (const file of (await readdir(new URL("../debug/references/", import.meta.url))).filter(
          (file) => file.endsWith(".json") && file !== "index.json",
        ))
          references.push(
            JSON.parse(
              await readFile(new URL(`../debug/references/${file}`, import.meta.url), "utf8"),
            ),
          )
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
      response.end(JSON.stringify({ ...exports, references, rejected, missing }))
    } else if (request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8")
      response.end(await readFile(new URL("./index.html", import.meta.url)))
    } else {
      response.writeHead(404).end("Not found")
    }
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
    response.end(`Cannot load local exports: ${error.message}`)
  }
})

server.listen(Number(process.env.PORT ?? 5173), "127.0.0.1", () => {
  console.log(`Migration preview: http://127.0.0.1:${server.address().port}`)
})
