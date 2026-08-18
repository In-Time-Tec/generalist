import { Crypto, FileSystem, Layer, Path } from "effect"
import { HttpClient } from "effect/unstable/http"
import { SkillSource } from "tenetkit"
import { GitHubCatalog, HttpCatalog, S3Catalog, SkillLoader } from "tenetkit/skills"

export const skills: Layer.Layer<
  SkillSource.SkillSource,
  SkillSource.SkillSourceError,
  Crypto.Crypto | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> = SkillSource.layer<Crypto.Crypto | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>([
  SkillLoader.make({ cwd: ".", roots: [".agents/skills"] }),
  HttpCatalog.make({ manifestUrl: "https://skills.example.com/skills.json" }),
  S3Catalog.make({ bucket: "company-skills", region: "us-west-2", prefix: "support" }),
  GitHubCatalog.make({
    owner: "company",
    repo: "agent-skills",
    ref: "0123456789abcdef0123456789abcdef01234567",
    root: "skills",
  }),
])
