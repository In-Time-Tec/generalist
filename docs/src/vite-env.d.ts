/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FOLDKIT_BUILD_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.server.js" {
  export const renderPage: (request: Request) => Promise<import("foldkit/experimental/server").EntryResult>
}
declare module "@stylexjs/unplugin/vite" {
  import type { UserOptions } from "@stylexjs/unplugin"
  import type { PluginOption } from "vite"
  const plugin: (options?: Partial<UserOptions>) => PluginOption
  export default plugin
}
