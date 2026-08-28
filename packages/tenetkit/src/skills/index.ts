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
import { loadInstructionFiles as InstructionFiles_loadInstructionFiles } from "./instructions-files.js"
export const InstructionFiles = {
  loadInstructionFiles: InstructionFiles_loadInstructionFiles,
}
export namespace InstructionFiles {
  export type loadInstructionFiles = typeof import("./instructions-files.js").loadInstructionFiles
  export type InstructionFile = import("./instructions-files.js").InstructionFile
  export type LoadInstructionFilesOptions = import("./instructions-files.js").LoadInstructionFilesOptions
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
import { make as SkillLoader_make, layer as SkillLoader_layer } from "./loader.js"
export const SkillLoader = {
  make: SkillLoader_make,
  layer: SkillLoader_layer,
}
export namespace SkillLoader {
  export type make = typeof import("./loader.js").make
  export type layer = typeof import("./loader.js").layer
  export type LoadOptions = import("./loader.js").LoadOptions
}
