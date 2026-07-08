import { llmsFull, llmsIndex } from "../src/content/registry"

await Bun.write(new URL("../public/llms.txt", import.meta.url), `${llmsIndex()}\n`)
await Bun.write(new URL("../public/llms-full.txt", import.meta.url), `${llmsFull()}\n`)
