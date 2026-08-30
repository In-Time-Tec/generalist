import { make as GitHubCatalog_make, layer as GitHubCatalog_layer } from "./github-catalog.js"
export const GitHubCatalog = {
  make: GitHubCatalog_make,
  layer: GitHubCatalog_layer,
}
export namespace GitHubCatalog {
  export type make = typeof import("./github-catalog.js").make
  export type layer = typeof import("./github-catalog.js").layer
  export type Options = import("./github-catalog.js").Options
}
import { make as HttpCatalog_make, layer as HttpCatalog_layer } from "./http-catalog.js"
export const HttpCatalog = {
  make: HttpCatalog_make,
  layer: HttpCatalog_layer,
}
export namespace HttpCatalog {
  export type make = typeof import("./http-catalog.js").make
  export type layer = typeof import("./http-catalog.js").layer
  export type Options = import("./http-catalog.js").Options
}
import { load as InstructionFiles_load } from "./instructions-files.js"
export const InstructionFiles = {
  load: InstructionFiles_load,
}
export namespace InstructionFiles {
  export type load = typeof import("./instructions-files.js").load
  export type File = import("./instructions-files.js").File
  export type Options = import("./instructions-files.js").Options
}
import { make as S3Catalog_make, layer as S3Catalog_layer } from "./s3-catalog.js"
export const S3Catalog = {
  make: S3Catalog_make,
  layer: S3Catalog_layer,
}
export namespace S3Catalog {
  export type make = typeof import("./s3-catalog.js").make
  export type layer = typeof import("./s3-catalog.js").layer
  export type Options = import("./s3-catalog.js").Options
}
import { make as FileSystemCatalog_make, layer as FileSystemCatalog_layer } from "./file-system-catalog.js"
export const FileSystemCatalog = {
  make: FileSystemCatalog_make,
  layer: FileSystemCatalog_layer,
}
export namespace FileSystemCatalog {
  export type make = typeof import("./file-system-catalog.js").make
  export type layer = typeof import("./file-system-catalog.js").layer
  export type Options = import("./file-system-catalog.js").Options
}
