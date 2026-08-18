import { make as GitHubCatalog_make, layer as GitHubCatalog_layer } from "./skill/github-catalog.js"
export const GitHubCatalog = {
  make: GitHubCatalog_make,
  layer: GitHubCatalog_layer,
} as typeof import("./skill/github-catalog.js")
export namespace GitHubCatalog {
  export type make = typeof import("./skill/github-catalog.js").make
  export type layer = typeof import("./skill/github-catalog.js").layer
  export type Options = import("./skill/github-catalog.js").Options
}
import { make as HttpCatalog_make, layer as HttpCatalog_layer } from "./skill/http-catalog.js"
export const HttpCatalog = {
  make: HttpCatalog_make,
  layer: HttpCatalog_layer,
} as typeof import("./skill/http-catalog.js")
export namespace HttpCatalog {
  export type make = typeof import("./skill/http-catalog.js").make
  export type layer = typeof import("./skill/http-catalog.js").layer
  export type Options = import("./skill/http-catalog.js").Options
}
import { loadInstructionFiles as InstructionFiles_loadInstructionFiles } from "./skill/instructions-files.js"
export const InstructionFiles = {
  loadInstructionFiles: InstructionFiles_loadInstructionFiles,
} as typeof import("./skill/instructions-files.js")
export namespace InstructionFiles {
  export type loadInstructionFiles = typeof import("./skill/instructions-files.js").loadInstructionFiles
  export type InstructionFile = import("./skill/instructions-files.js").InstructionFile
  export type LoadInstructionFilesOptions = import("./skill/instructions-files.js").LoadInstructionFilesOptions
}
import { make as S3Catalog_make, layer as S3Catalog_layer } from "./skill/s3-catalog.js"
export const S3Catalog = {
  make: S3Catalog_make,
  layer: S3Catalog_layer,
} as typeof import("./skill/s3-catalog.js")
export namespace S3Catalog {
  export type make = typeof import("./skill/s3-catalog.js").make
  export type layer = typeof import("./skill/s3-catalog.js").layer
  export type Options = import("./skill/s3-catalog.js").Options
}
import { make as SkillLoader_make, layer as SkillLoader_layer } from "./skill/skill-loader.js"
export const SkillLoader = {
  make: SkillLoader_make,
  layer: SkillLoader_layer,
} as typeof import("./skill/skill-loader.js")
export namespace SkillLoader {
  export type make = typeof import("./skill/skill-loader.js").make
  export type layer = typeof import("./skill/skill-loader.js").layer
  export type LoadOptions = import("./skill/skill-loader.js").LoadOptions
}
