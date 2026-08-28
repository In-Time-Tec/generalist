import { layerSqlite } from "./sql/layer.js"
import { layerSqliteStore } from "./sql/store.js"

export const Runtime = {
  layerSqlite,
} as const

export namespace Runtime {
  export type Options = import("./sql/layer.js").BunSqliteStoreOptions
}

export const RunStore = {
  layerSqlite: layerSqliteStore,
} as const

export namespace RunStore {
  export type Options = import("./sql/store.js").SqliteStoreOptions
  export type Error = import("./sql/store.js").SqliteStoreError
}
