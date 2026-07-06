import { Schema } from "effect"
import { m } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import { Url } from "foldkit/url"

import * as Command from "@/components/ui/command"
import * as Dialog from "@/components/ui/dialog"

export const ClickedLink = m("ClickedLink", { request: UrlRequest })
export const ChangedUrl = m("ChangedUrl", { url: Url })
export const CompletedNavigateInternal = m("CompletedNavigateInternal")
export const CompletedLoadExternal = m("CompletedLoadExternal")
export const PressedSearchShortcut = m("PressedSearchShortcut")
export const GotSearchDialogMessage = m("GotSearchDialogMessage", { message: Dialog.Message })
export const GotSearchCommandMessage = m("GotSearchCommandMessage", { message: Command.Message })

export const Message = Schema.Union([
  ClickedLink,
  ChangedUrl,
  CompletedNavigateInternal,
  CompletedLoadExternal,
  PressedSearchShortcut,
  GotSearchDialogMessage,
  GotSearchCommandMessage,
])
export type Message = typeof Message.Type
