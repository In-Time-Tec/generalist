import { Crypto, FileSystem, Layer, Path } from "effect"
import { HttpClient } from "effect/unstable/http"
import { SkillCatalog } from "tenetkit"
import { GitHubCatalog, HttpCatalog, S3Catalog, FileSystemCatalog } from "tenetkit/skills"

export const skills: Layer.Layer<
  SkillCatalog.SkillCatalog,
  SkillCatalog.SkillCatalogError,
  Crypto.Crypto | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> = SkillCatalog.layer<Crypto.Crypto | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>([
  FileSystemCatalog.make({ cwd: ".", roots: [".agents/skills"] }),
  HttpCatalog.make({ manifestUrl: "https://skills.example.com/skills.json" }),
  S3Catalog.make({ bucket: "company-skills", region: "us-west-2", prefix: "support" }),
  GitHubCatalog.make({
    owner: "company",
    repo: "agent-skills",
    ref: "0123456789abcdef0123456789abcdef01234567",
    root: "skills",
  }),
])
