import { Schema } from "effect"
import { inertHtml, type HtmlBuilder } from "foldkit/html"

const HtmlBuilderSchema = <Message>() =>
  Schema.declare((input): input is HtmlBuilder<Message> => Object.is(input, inertHtml))

export const html = <Message>(): HtmlBuilder<Message> =>
  Schema.decodeUnknownSync(HtmlBuilderSchema<Message>())(inertHtml)
