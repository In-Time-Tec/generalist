import { FileSystem, Layer, Path } from "effect"
import { SkillCatalog } from "generalist"
import { FileSystemCatalog } from "generalist/instructions/skills"

export const fileSystemSkills: Layer.Layer<
  SkillCatalog.SkillCatalog,
  SkillCatalog.SkillCatalogError,
  FileSystem.FileSystem | Path.Path
> = FileSystemCatalog.layer({
  cwd: ".",
  roots: [".agents/skills", ".claude/skills"],
})
