import { FileSystem, Layer, Path } from "effect"
import { SkillCatalog } from "tenetkit"
import { FileSystemCatalog } from "tenetkit/skills"

export const fileSystemSkills: Layer.Layer<
  SkillCatalog.SkillCatalog,
  SkillCatalog.SkillCatalogError,
  FileSystem.FileSystem | Path.Path
> = FileSystemCatalog.layer({
  cwd: ".",
  roots: [".agents/skills", ".claude/skills"],
})
