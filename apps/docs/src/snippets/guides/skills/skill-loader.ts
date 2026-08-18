import { FileSystem, Layer, Path } from "effect"
import { SkillSource } from "tenetkit"
import { SkillLoader } from "tenetkit/skills"

export const filesystemSkills: Layer.Layer<
  SkillSource.SkillSource,
  SkillSource.SkillSourceError,
  FileSystem.FileSystem | Path.Path
> = SkillLoader.layer({
  cwd: ".",
  roots: [".agents/skills", ".claude/skills"],
})
