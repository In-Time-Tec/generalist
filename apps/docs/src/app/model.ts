import { Schema } from "effect"
import { Url } from "foldkit/url"

import * as Command from "@/components/ui/command"
import * as Dialog from "@/components/ui/dialog"

import { Route } from "../route/route"

export const Model = Schema.Struct({
  route: Route,
  url: Url,
  searchDialog: Dialog.Model,
  searchCommand: Command.Model,
})
export type Model = typeof Model.Type
