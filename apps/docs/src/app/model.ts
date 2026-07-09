import { Schema } from "effect"
import { Url } from "foldkit/url"

import { CommandModel } from "@/components/ui/command"
import { DialogModel } from "@/components/ui/dialog"

import { SidebarGroups } from "../layout/sidebarStorage"
import { Route } from "../route/route"

export const ThemePreference = Schema.Literals(["Light", "System", "Dark"])
export type ThemePreference = typeof ThemePreference.Type

export const Model = Schema.Struct({
  route: Route,
  url: Url,
  searchDialog: DialogModel,
  searchCommand: CommandModel,
  copiedCode: Schema.Option(Schema.String),
  themePreference: ThemePreference,
  maybeActiveSectionId: Schema.Option(Schema.String),
  openSidebarGroups: SidebarGroups,
  isMobileTocOpen: Schema.Boolean,
  isMobileNavOpen: Schema.Boolean,
})
export type Model = typeof Model.Type
