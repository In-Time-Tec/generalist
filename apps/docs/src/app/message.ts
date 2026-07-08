import { Schema } from "effect"
import { m } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

import * as Command from "@/components/ui/command"
import * as Dialog from "@/components/ui/dialog"

import { SidebarGroups } from "../layout/sidebarStorage"
import { ThemePreference } from "./model"

export const ClickedLink = m("ClickedLink", { request: UrlRequest })
export const ChangedUrl = m("ChangedUrl", { url: Url })
export const CompletedNavigateInternal = m("CompletedNavigateInternal")
export const CompletedLoadExternal = m("CompletedLoadExternal")
export const PressedSearchShortcut = m("PressedSearchShortcut")
export const GotSearchDialogMessage = m("GotSearchDialogMessage", { message: Dialog.Message })
export const GotSearchCommandMessage = m("GotSearchCommandMessage", { message: Command.Message })
export const ClickedCopyCode = m("ClickedCopyCode", { source: Schema.String })
export const CompletedCopyCode = m("CompletedCopyCode", { source: Schema.String })
export const ClearedCopiedCode = m("ClearedCopiedCode", { source: Schema.String })
export const SelectedThemePreference = m("SelectedThemePreference", { preference: ThemePreference })
export const GotThemePreference = m("GotThemePreference", { preference: ThemePreference })
export const CompletedApplyTheme = m("CompletedApplyTheme")
export const CompletedSaveThemePreference = m("CompletedSaveThemePreference")
export const ChangedSystemTheme = m("ChangedSystemTheme", { theme: Schema.Literals(["Light", "Dark"]) })
export const ToggledSidebarGroup = m("ToggledSidebarGroup", { group: Schema.String })
export const GotSidebarGroups = m("GotSidebarGroups", { open: SidebarGroups })
export const CompletedSaveSidebarGroups = m("CompletedSaveSidebarGroups")
export const ChangedActiveSection = m("ChangedActiveSection", { sectionId: Schema.String })
export const ToggledMobileTableOfContents = m("ToggledMobileTableOfContents", { isOpen: Schema.Boolean })
export const ClickedMobileTableOfContentsLink = m("ClickedMobileTableOfContentsLink", { sectionId: Schema.String })
export const ToggledMobileNav = m("ToggledMobileNav", { isOpen: Schema.Boolean })

export const Message = Schema.Union([
  ClickedLink,
  ChangedUrl,
  CompletedNavigateInternal,
  CompletedLoadExternal,
  PressedSearchShortcut,
  GotSearchDialogMessage,
  GotSearchCommandMessage,
  ClickedCopyCode,
  CompletedCopyCode,
  ClearedCopiedCode,
  SelectedThemePreference,
  GotThemePreference,
  CompletedApplyTheme,
  CompletedSaveThemePreference,
  ChangedSystemTheme,
  ToggledSidebarGroup,
  GotSidebarGroups,
  CompletedSaveSidebarGroups,
  ChangedActiveSection,
  ToggledMobileTableOfContents,
  ClickedMobileTableOfContentsLink,
  ToggledMobileNav,
])
export type Message = typeof Message.Type
