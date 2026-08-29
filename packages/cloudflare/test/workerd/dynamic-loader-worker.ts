/* oxlint-disable effecttsgo/async-function */
interface WorkerLoader {
  readonly load: (code: {
    readonly compatibilityDate: string
    readonly mainModule: string
    readonly modules: Readonly<Record<string, string>>
    readonly globalOutbound: null
    readonly env: Readonly<Record<string, never>>
    readonly limits: { readonly cpuMs: number; readonly subRequests: number }
  }) => {
    readonly getEntrypoint: () => { readonly fetch: (request: Request) => Promise<Response> }
  }
}

interface Environment {
  readonly LOADER: WorkerLoader
}

const source = `
let calls = 0;
export default {
  async fetch() {
    let networkDenied = false;
    try { await fetch("https://example.com/"); } catch { networkDenied = true; }
    return Response.json({
      calls: ++calls,
      processEnvironment: typeof globalThis.process === "object" ? Object.keys(globalThis.process.env ?? {}) : [],
      processSpawn: typeof globalThis.process?.spawn,
      bun: typeof globalThis.Bun,
      ambientSecret: typeof globalThis.TENETKIT_CONFORMANCE_SECRET,
      networkDenied
    });
  }
};`

const code = (moduleSource: string) => ({
  compatibilityDate: "2026-08-19",
  mainModule: "program.js",
  modules: { "program.js": moduleSource },
  globalOutbound: null,
  env: {},
  limits: { cpuMs: 50, subRequests: 2 },
})

export default {
  async fetch(_request: Request, environment: Environment): Promise<Response> {
    const run = async () =>
      environment.LOADER.load(code(source)).getEntrypoint().fetch(new Request("https://guest.invalid/"))
    const first: unknown = await (await run()).json()
    const second: unknown = await (await run()).json()
    return Response.json({ first, second })
  },
}
