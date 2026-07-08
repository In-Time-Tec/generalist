import { Glob } from "bun"
import { dirname, join, relative } from "node:path"

const snippetsRoot = join(import.meta.dir, "..", "src", "snippets")
const glob = new Glob("**/*.expected.txt")

const failures: Array<string> = []
let checked = 0

for await (const expectedPath of glob.scan({ cwd: snippetsRoot, absolute: true })) {
  const snippetPath = expectedPath.replace(/\.expected\.txt$/, ".ts")
  const label = relative(snippetsRoot, snippetPath)
  const snippetExists = await Bun.file(snippetPath).exists()
  if (!snippetExists) {
    failures.push(`${label}: expected-output file has no sibling snippet`)
    continue
  }
  const expected = (await Bun.file(expectedPath).text()).trimEnd()
  const run = Bun.spawnSync(["bun", snippetPath], { cwd: dirname(snippetPath), stdout: "pipe", stderr: "pipe" })
  const stdout = run.stdout.toString().trimEnd()
  checked += 1
  if (run.exitCode !== 0) {
    failures.push(`${label}: exited ${run.exitCode}\n${run.stderr.toString().trimEnd()}`)
    continue
  }
  if (stdout !== expected) {
    failures.push(`${label}: stdout drifted\n--- expected\n${expected}\n--- actual\n${stdout}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"))
  process.exit(1)
}

console.log(`check-snippets: ${checked} runnable snippets verified`)
