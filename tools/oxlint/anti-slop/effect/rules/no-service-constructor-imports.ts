import { defineRule } from "@oxlint/plugins"

import type { ESTree } from "@oxlint/plugins"

const SERVICE_CONSTRUCTOR_NAME = /^make[A-Z]/u
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u
const PURE_DOMAIN_CONSTRUCTORS = new Map([
  ["/pin.js", new Set(["makeCapability", "makeModel", "makeProgram"])],
  ["/pin-internal.js", new Set(["makeAgent", "makeExecutable"])],
  ["/manifest/executable-manifest.js", new Set(["makeTest"])],
  ["/code-executor.js", new Set(["makeRequest"])],
])

function isProjectLocalImport(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../")
}

function getImportedName(specifier: ESTree.ImportSpecifier): string {
  if (specifier.imported.type === "Identifier") return specifier.imported.name
  return specifier.imported.value
}

function isPureDomainConstructor(source: string, importedName: string): boolean {
  for (const [suffix, names] of PURE_DOMAIN_CONSTRUCTORS) {
    if (source.endsWith(suffix) && names.has(importedName)) return true
  }
  return false
}

/** Keep dependency-bearing Effect service constructors local to their owning capability modules. */
export const noServiceConstructorImportsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow project-local make<CapabilityName> imports outside test and spec files.",
    },
    messages: {
      serviceConstructorImport:
        'Do not import Effect service constructor "{{name}}" into runtime code. Import the owning Layer, yield the contextual service, and allow its requirements to propagate to the composition root.',
    },
  },
  create(context) {
    const isTestFile = TEST_FILE.test(context.filename.replaceAll("\\", "/"))

    return {
      ImportDeclaration(node) {
        if (isTestFile || !isProjectLocalImport(node.source.value)) return

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue

          const importedName = getImportedName(specifier)
          if (!SERVICE_CONSTRUCTOR_NAME.test(importedName)) continue
          if (isPureDomainConstructor(node.source.value, importedName)) continue

          context.report({
            node: specifier,
            messageId: "serviceConstructorImport",
            data: { name: importedName },
          })
        }
      },
    }
  },
})
