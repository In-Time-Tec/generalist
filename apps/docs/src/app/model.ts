import { Schema } from "effect"
import { Url } from "foldkit/url"

import * as Command from "@/components/ui/command"
import * as Dialog from "@/components/ui/dialog"

import { SidebarGroups } from "../layout/sidebarStorage"
import { Route } from "../route/route"

export const ThemePreference = Schema.Literals(["Light", "System", "Dark"])
export type ThemePreference = typeof ThemePreference.Type

export const Model = Schema.Struct({
  route: Route,
  url: Url,
  searchDialog: Dialog.Model,
  searchCommand: Command.Model,
  copiedCode: Schema.Option(Schema.String),
  themePreference: ThemePreference,
  maybeActiveSectionId: Schema.Option(Schema.String),
  openSidebarGroups: SidebarGroups,
  isMobileTocOpen: Schema.Boolean,
  isMobileNavOpen: Schema.Boolean,
})
export type Model = typeof Model.Type
