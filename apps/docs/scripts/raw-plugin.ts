import { plugin } from "bun"
import { dirname, resolve } from "node:path"

plugin({
  name: "raw-imports",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(dirname(args.importer), args.path.slice(0, -"?raw".length)),
      namespace: "raw",
    }))
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
      contents: `export default ${JSON.stringify(await Bun.file(args.path).text())}`,
      loader: "js",
    }))
  },
})
