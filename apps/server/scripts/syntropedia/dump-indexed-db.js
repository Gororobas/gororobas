/**
 * Dumps Syntropedia's offline plant catalogue from the browser's IndexedDB as JSON.
 *
 * Paste into the devtools console on https://syntropedia.forests4farming.org once signed in and
 * the catalogue has synced. It downloads `syntropedia-indexed-db.json`, which `normalize.ts`
 * turns into our schema. See README.md in this folder for the whole procedure.
 *
 * The app is Flutter, and keeps everything in one Hive box: the "syntropedia" database's "box"
 * store. Hive's web backend writes each value as a binary frame, decoded here.
 */
void (async () => {
  /** Hive's built-in type IDs: `FrameValueType` in hive/lib/src/binary/frame.dart. */
  const decodeHiveFrame = (buffer) => {
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)
    const utf8 = new TextDecoder()
    // Every frame starts with these two bytes.
    if (bytes[0] !== 0x90 || bytes[1] !== 0xa9) throw new Error("Not a Hive frame")
    let offset = 2

    const uint8 = () => bytes[offset++]

    const uint32 = () => {
      const value = view.getUint32(offset, true)
      offset += 4
      return value
    }

    const float64 = () => {
      const value = view.getFloat64(offset, true)
      offset += 8
      return value
    }

    const string = () => {
      const length = uint32()
      const value = utf8.decode(bytes.subarray(offset, offset + length))
      offset += length
      return value
    }

    const repeat = (read) => Array.from({ length: uint32() }, read)

    const value = () => {
      const type = uint8()

      switch (type) {
        case 0:
          return null
        // Hive's web backend writes ints as doubles.
        case 1:
        case 2:
          return float64()
        case 3:
          return uint8() !== 0
        case 4:
          return string()
        case 5:
          return repeat(uint8)
        case 6:
        case 7:
          return repeat(float64)
        case 8:
          return repeat(() => uint8() !== 0)
        case 9:
          return repeat(string)
        case 10:
          return repeat(value)
        case 11:
          return Object.fromEntries(repeat(() => [value(), value()]))
        default:
          throw new Error(`Unsupported Hive type ${type} at byte ${offset - 1}`)
      }
    }

    return value()
  }

  const request = (operation) =>
    new Promise((resolve, reject) => {
      operation.onsuccess = () => resolve(operation.result)
      operation.onerror = () => reject(operation.error)
    })

  const database = await request(indexedDB.open("syntropedia"))
  const store = database.transaction("box").objectStore("box")
  const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
  database.close()

  const box = new Map(
    keys.map((key, index) => [
      key,
      values[index] instanceof ArrayBuffer ? decodeHiveFrame(values[index]) : values[index],
    ]),
  )

  const entriesStartingWith = (prefix) =>
    [...box.entries()].filter(([key]) => String(key).startsWith(prefix))

  // Keyed by user and tier ("catalog_assets:<userId>:premium"), but not by language: names are
  // in every language already, and the app writes the same catalogue whatever its language.
  const [[, assets] = []] = entriesStartingWith("catalog_assets:")
  if (!Array.isArray(assets)) throw new Error("No catalogue in IndexedDB: wait for it to sync")

  // Thumbnails are inlined as base64 data URLs: most of the box's size, and served by URL anyway.
  const withoutInlinedImages = ({
    thumbnail_gallery: _thumbnails,
    image_gallery: _images,
    ...asset
  }) => ({
    ...asset,
    tested_location_profiles: (asset.tested_location_profiles ?? []).map(withoutInlinedImages),
  })

  const dump = {
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    // "catalog_manifest:catalog:<userId>:<language>:premium": revision and asset counts.
    manifests: Object.fromEntries(
      entriesStartingWith("catalog_manifest:").map(
        ([key, { image_manifest: _images, ...manifest }]) => [key.split(":").at(-2), manifest],
      ),
    ),
    filterOptions: box.get("filter_options") ?? null,
    assets: assets.map(withoutInlinedImages),
  }

  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: "application/json" }))
  link.download = "syntropedia-indexed-db.json"
  link.click()

  return { assets: dump.assets.length, manifests: dump.manifests }
})()
