import { describe, expect, it } from "@effect/vitest"
import { OpenApi } from "effect/unstable/httpapi"
import { Server } from "generalist/server"
import { acceptAdditionalRequestProperties } from "../../src/server/api.js"

const requestMethods = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const
const strictClaim = '"additionalProperties":false'

const referenceNames = (json: string): ReadonlyArray<string> =>
  Array.from(json.matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g), (match) => match[1] ?? "")

const requestBodyJson = (document: OpenApi.OpenAPISpec): ReadonlyArray<string> =>
  Object.values(document.paths).flatMap((pathItem) =>
    requestMethods.flatMap((method) => {
      const requestBody = pathItem[method]?.requestBody
      return requestBody === undefined ? [] : [JSON.stringify(requestBody)]
    }),
  )

const referencedComponents = (document: OpenApi.OpenAPISpec): ReadonlySet<string> => {
  const visited = new Set<string>()
  const pending = requestBodyJson(document).flatMap(referenceNames)
  while (pending.length > 0) {
    const name = pending.pop()
    if (name === undefined || visited.has(name)) continue
    visited.add(name)
    const schema = document.components.schemas[name]
    if (schema !== undefined) pending.push(...referenceNames(JSON.stringify(schema)))
  }
  return visited
}

describe("acceptAdditionalRequestProperties", () => {
  it("drops the strict annotation from request bodies and the components they reference", () => {
    const document = acceptAdditionalRequestProperties({
      paths: {
        "/sessions": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { type: "object", additionalProperties: false } } },
            },
          },
        },
        "/runs/{id}/messages": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { anyOf: [{ type: "string" }, { $ref: "#/components/schemas/PromptEncoded" }] },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          PromptEncoded: { type: "object", properties: { input: { additionalProperties: false } } },
          StrictResponse: { additionalProperties: false },
        },
      },
    })
    expect(document.paths["/sessions"].post.requestBody.content["application/json"].schema).not.toHaveProperty(
      "additionalProperties",
    )
    expect(document.components.schemas.PromptEncoded.properties.input).not.toHaveProperty("additionalProperties")
    expect(document.components.schemas.StrictResponse).toEqual({ additionalProperties: false })
  })

  it("preserves explicit additionalProperties schemas", () => {
    const schema = { type: "object", additionalProperties: { type: "string" } }
    acceptAdditionalRequestProperties({
      paths: { "/sessions": { post: { requestBody: { content: { "application/json": { schema } } } } } },
    })
    expect(schema.additionalProperties).toEqual({ type: "string" })
  })
})

describe("Server OpenAPI property policy", () => {
  const document = OpenApi.fromApi(Server.api)

  it("accepts additional properties in every request body schema", () => {
    const bodies = requestBodyJson(document)
    const referenced = referencedComponents(document)
    expect(bodies.length).toBeGreaterThan(0)
    expect(referenced.size).toBeGreaterThan(0)
    for (const body of bodies) expect(body).not.toContain(strictClaim)
    for (const name of referenced) {
      const schema = document.components.schemas[name]
      expect(schema).toBeDefined()
      expect(JSON.stringify(schema)).not.toContain(strictClaim)
    }
  })

  it("keeps the strict annotation on response-only component schemas", () => {
    const referenced = referencedComponents(document)
    const responseOnly = Object.entries(document.components.schemas).filter(
      ([name, schema]) => !referenced.has(name) && JSON.stringify(schema).includes(strictClaim),
    )
    expect(responseOnly.length).toBeGreaterThan(0)
  })
})
