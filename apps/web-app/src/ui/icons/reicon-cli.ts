#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, FileSystem, Path, Schema } from "effect"
import * as Command from "effect/cli/Command"
import * as P from "effect/Predicate"
import * as Record from "effect/Record"

import { ICONS_OF_INTEREST, type IconOfInterest } from "./icons-of-interest.ts"

const ReiconDuotone = Schema.Struct({
  icons: Schema.Record(Schema.String, Schema.Struct({ code: Schema.String })),
})

const ReiconRegular = Schema.Struct({
  categories: Schema.Record(
    Schema.String,
    Schema.Struct({
      icons: Schema.Record(
        Schema.String,
        Schema.Struct({
          weights: Schema.Record(Schema.String, Schema.Struct({ code: Schema.String })),
        }),
      ),
    }),
  ),
})

class MissingReicons extends Schema.TaggedError<MissingReicons>()("MissingReicons", {
  iconNames: Schema.Array(Schema.String),
}) {}

const toExportName = (iconName: string): string =>
  iconName.replace(/-([a-z])/g, (_, character: string) => character.toUpperCase())

const iconName = (icon: IconOfInterest): string => (P.isString(icon) ? icon : icon.name)

const escapeString = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")

const iconSource = (
  iconName: string,
  paths: { readonly duotone: string; readonly filled: string; readonly outline: string },
): string =>
  `import { type Html } from "foldkit/html"\nimport { reiconGenerator, type IconConfig } from "../reicon-generator.js"\n\nexport const ${toExportName(iconName)} = (config: IconConfig = {}): Html =>\n  reiconGenerator(\n    {\n      duotone: "${escapeString(paths.duotone)}",\n      filled: "${escapeString(paths.filled)}",\n      outline: "${escapeString(paths.outline)}",\n    },\n    config,\n  )\n`

const barrelSource = (): string =>
  ICONS_OF_INTEREST.reduce<ReadonlyArray<string>>((exports, icon) => {
    const name = iconName(icon)
    const exportName = toExportName(name)
    const exportStatement = `export { ${exportName}${P.isString(icon) ? "" : `, ${exportName} as ${icon.alias}`} } from "./${name}.js"`
    return exports.some((entry) => entry.includes(` from "./${name}.js"`))
      ? [...exports, exportStatement.replace(`${exportName}, `, "")]
      : [...exports, exportStatement]
  }, []).join("\n") + "\n"

const generateReicons = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const projectRoot = path.resolve(".")
  const duotoneSourcePath = path.join(projectRoot, "src/ui/icons/reicon-duotone.json")
  const regularSourcePath = path.join(projectRoot, "src/ui/icons/reicon-regular.json")
  const outputDirectory = path.join(projectRoot, "src/ui/icons/reicon")
  const [duotoneSource, regularSource] = yield* Effect.all(
    [fileSystem.readFileString(duotoneSourcePath), fileSystem.readFileString(regularSourcePath)],
    { concurrency: 1 },
  )
  const reiconDuotone = yield* Schema.decodeEffect(Schema.fromJsonString(ReiconDuotone))(
    duotoneSource,
  )
  const reiconRegular = yield* Schema.decodeEffect(Schema.fromJsonString(ReiconRegular))(
    regularSource,
  )

  const missingIcons = ICONS_OF_INTEREST.flatMap((icon) => {
    const name = iconName(icon)
    const regularIcon = Record.values(reiconRegular.categories)
      .map(({ icons }) => icons[name])
      .find((icon) => icon !== undefined)

    return [
      ...(regularIcon?.weights.Filled === undefined ? [`${name} (filled)`] : []),
      ...(regularIcon?.weights.Outline === undefined ? [`${name} (outline)`] : []),
    ]
  })

  if (missingIcons[0] !== undefined) {
    return yield* new MissingReicons({ iconNames: missingIcons })
  }

  yield* fileSystem.makeDirectory(outputDirectory, { recursive: true })

  yield* Effect.forEach(
    ICONS_OF_INTEREST,
    (icon) => {
      const name = iconName(icon)

      return fileSystem.writeFileString(
        path.join(outputDirectory, `${name}.ts`),
        iconSource(name, {
          duotone:
            reiconDuotone.icons[name]?.code ??
            Record.values(reiconRegular.categories)
              .map(({ icons }) => icons[name])
              .find((icon) => icon !== undefined)?.weights.Filled?.code ??
            "",
          filled:
            Record.values(reiconRegular.categories)
              .map(({ icons }) => icons[name])
              .find((icon) => icon !== undefined)?.weights.Filled?.code ?? "",
          outline:
            Record.values(reiconRegular.categories)
              .map(({ icons }) => icons[name])
              .find((icon) => icon !== undefined)?.weights.Outline?.code ?? "",
        }),
      )
    },
    { concurrency: 1 },
  )

  yield* fileSystem.writeFileString(path.join(outputDirectory, "index.ts"), barrelSource())
})

const command = Command.make("generate-reicon", {}, () => generateReicons).pipe(
  Command.withDescription("Generate the icons listed in ICONS_OF_INTEREST from ReIcon Duotone"),
)

Command.run(command, { version: "0.1.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
