import { Runtime } from "foldkit"
import { props } from "@stylexjs/stylex"
import { Effect, Layer, Option } from "effect"
import { application } from "./main"
import { styles } from "./styles"

document.documentElement.className = props(styles.document).className ?? ""
document.body.className = props(styles.body).className ?? ""

const fonts = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.tryPromise(() =>
      new FontFace("Inter", 'url("/fonts/InterVariable.woff2")', { weight: "100 900", display: "swap" }).load(),
    ).pipe(
      Effect.tap((font) =>
        Effect.sync(() => {
          document.fonts.add(font)
        }),
      ),
      Effect.map(Option.some),
      Effect.orElseSucceed(Option.none),
    ),
    (font) =>
      Effect.sync(() => {
        if (Option.isSome(font)) document.fonts.delete(font.value)
      }),
  ),
)

const runtime = Runtime.makeApplication({
  ...application,
  resources: fonts,
  container: document.getElementById("root"),
  devTools: false,
})

Runtime.hydrate(runtime, { buildId: import.meta.env.FOLDKIT_BUILD_ID })
