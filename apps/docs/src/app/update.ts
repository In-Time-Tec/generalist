import { Effect, Match, Option, Schema } from "effect"
import { Command } from "foldkit"
import { load, pushUrl, replaceUrl } from "foldkit/navigation"
import { evo } from "foldkit/struct"
import * as Url from "foldkit/url"

import * as Dialog from "@/components/ui/dialog"

import { legacyRedirects } from "../content/registry"
import { isSidebarGroupOpen, readSidebarGroups, writeSidebarGroups, SidebarGroups } from "../layout/sidebarStorage"
import { toPath, urlToRoute } from "../route/route"
import {
  ClearedCopiedCode,
  CompletedApplyTheme,
  CompletedCopyCode,
  CompletedLoadExternal,
  CompletedNavigateInternal,
  CompletedSaveSidebarGroups,
  CompletedSaveThemePreference,
  GotSearchCommandMessage,
  GotSearchDialogMessage,
  GotSidebarGroups,
  GotThemePreference,
  type Message,
} from "./message"
import { ThemePreference, type Model } from "./model"
import { SearchCommand, initialSearchCommand, itemToPath } from "./searchPalette"

type Update = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const update = (model: Model, message: Message): Update =>
  Match.value(message).pipe(
    Match.withReturnType<Update>(),
    Match.tagsExhaustive({
      ClickedLink: ({ request }) =>
        Match.value(request).pipe(
          Match.withReturnType<Update>(),
          Match.tagsExhaustive({
            Internal: ({ url }) => [model, [NavigateInternal({ url: Url.toString(url) })]],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),
      ChangedUrl: ({ url }) => {
        const route = urlToRoute(url)
        const redirectTarget = legacyRedirects.get(toPath(route))
        if (redirectTarget !== undefined) {
          return [model, [RedirectLegacy({ url: redirectTarget })]]
        }
        return [
          evo(model, {
            route: () => route,
            url: () => url,
            isMobileNavOpen: () => false,
            isMobileTocOpen: () => false,
            maybeActiveSectionId: () => Option.none(),
          }),
          [],
        ]
      },
      PressedSearchShortcut: () => {
        if (model.searchDialog.isOpen) {
          const [closedDialog, dialogCommands] = Dialog.close(model.searchDialog)
          const [closedCommand, commandCommands] = SearchCommand.close(model.searchCommand)
          return [
            evo(model, { searchDialog: () => closedDialog, searchCommand: () => closedCommand }),
            [
              ...Command.mapMessages(dialogCommands, (childMessage) =>
                GotSearchDialogMessage({ message: childMessage }),
              ),
              ...Command.mapMessages(commandCommands, (childMessage) =>
                GotSearchCommandMessage({ message: childMessage }),
              ),
            ],
          ]
        }
        const [nextDialog, dialogCommands] = Dialog.open(model.searchDialog)
        const [nextCommand, commandCommands] = SearchCommand.open(initialSearchCommand())
        return [
          evo(model, { searchDialog: () => nextDialog, searchCommand: () => nextCommand }),
          [
            ...Command.mapMessages(dialogCommands, (childMessage) => GotSearchDialogMessage({ message: childMessage })),
            ...Command.mapMessages(commandCommands, (childMessage) =>
              GotSearchCommandMessage({ message: childMessage }),
            ),
          ],
        ]
      },
      GotSearchDialogMessage: ({ message: dialogMessage }) => {
        const [nextDialog, dialogCommands] = Dialog.update(model.searchDialog, dialogMessage)
        return [
          evo(model, { searchDialog: () => nextDialog }),
          Command.mapMessages(dialogCommands, (childMessage) => GotSearchDialogMessage({ message: childMessage })),
        ]
      },
      GotSearchCommandMessage: ({ message: commandMessage }) => {
        const [nextCommand, commandCommands, maybeOutMessage] = SearchCommand.update(
          model.searchCommand,
          commandMessage,
        )
        const forwardedCommands = Command.mapMessages(commandCommands, (childMessage) =>
          GotSearchCommandMessage({ message: childMessage }),
        )
        const commandJustDismissed = model.searchCommand.isOpen && !nextCommand.isOpen
        return Option.match(maybeOutMessage, {
          onNone: (): Update => {
            if (commandJustDismissed) {
              const [closedDialog, closeCommands] = Dialog.close(model.searchDialog)
              return [
                evo(model, { searchCommand: () => nextCommand, searchDialog: () => closedDialog }),
                [
                  ...forwardedCommands,
                  ...Command.mapMessages(closeCommands, (childMessage) =>
                    GotSearchDialogMessage({ message: childMessage }),
                  ),
                ],
              ]
            }
            return [evo(model, { searchCommand: () => nextCommand }), forwardedCommands]
          },
          onSome: (outMessage): Update => {
            const [closedDialog, closeCommands] = Dialog.close(model.searchDialog)
            return [
              evo(model, { searchCommand: () => nextCommand, searchDialog: () => closedDialog }),
              [
                ...forwardedCommands,
                ...Command.mapMessages(closeCommands, (childMessage) =>
                  GotSearchDialogMessage({ message: childMessage }),
                ),
                NavigateInternal({ url: itemToPath(outMessage.value) }),
              ],
            ]
          },
        })
      },
      ClickedCopyCode: ({ source }) => [evo(model, { copiedCode: () => Option.some(source) }), [CopyCode({ source })]],
      CompletedCopyCode: ({ source }) => [model, [ScheduleClearCopiedCode({ source })]],
      ClearedCopiedCode: ({ source }) => [
        Option.contains(model.copiedCode, source) ? evo(model, { copiedCode: () => Option.none() }) : model,
        [],
      ],
      SelectedThemePreference: ({ preference }) => [
        evo(model, { themePreference: () => preference }),
        [ApplyTheme({ preference }), SaveThemePreference({ preference })],
      ],
      GotThemePreference: ({ preference }) => [
        evo(model, { themePreference: () => preference }),
        [ApplyTheme({ preference })],
      ],
      ChangedSystemTheme: () => [model, [ApplyTheme({ preference: model.themePreference })]],
      ToggledSidebarGroup: ({ group }) => {
        const open = {
          ...model.openSidebarGroups,
          [group]: !isSidebarGroupOpen(model.openSidebarGroups, group),
        }
        return [evo(model, { openSidebarGroups: () => open }), [SaveSidebarGroups({ open })]]
      },
      GotSidebarGroups: ({ open }) => [evo(model, { openSidebarGroups: () => open }), []],
      ChangedActiveSection: ({ sectionId }) => [evo(model, { maybeActiveSectionId: () => Option.some(sectionId) }), []],
      ToggledMobileTableOfContents: ({ isOpen }) => [evo(model, { isMobileTocOpen: () => isOpen }), []],
      ClickedMobileTableOfContentsLink: ({ sectionId }) => [
        evo(model, {
          maybeActiveSectionId: () => Option.some(sectionId),
          isMobileTocOpen: () => false,
        }),
        [],
      ],
      ToggledMobileNav: ({ isOpen }) => [evo(model, { isMobileNavOpen: () => isOpen }), []],
      CompletedApplyTheme: () => [model, []],
      CompletedSaveThemePreference: () => [model, []],
      CompletedSaveSidebarGroups: () => [model, []],
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
    }),
  )

const NavigateInternal = Command.define(
  "NavigateInternal",
  { url: Schema.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

const LoadExternal = Command.define(
  "LoadExternal",
  { href: Schema.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

export const RedirectLegacy = Command.define(
  "RedirectLegacy",
  { url: Schema.String },
  CompletedNavigateInternal,
)(({ url }) => replaceUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

const CopyCode = Command.define(
  "CopyCode",
  { source: Schema.String },
  CompletedCopyCode,
)(({ source }) =>
  Effect.promise(() => navigator.clipboard.writeText(source).catch(() => undefined)).pipe(
    Effect.as(CompletedCopyCode({ source })),
  ),
)

const ScheduleClearCopiedCode = Command.define(
  "ScheduleClearCopiedCode",
  { source: Schema.String },
  ClearedCopiedCode,
)(({ source }) => Effect.sleep("2 seconds").pipe(Effect.as(ClearedCopiedCode({ source }))))

const THEME_STORAGE_KEY = "theme-preference"

const readThemePreference = (): ThemePreference => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === null) {
      return "System"
    }
    const parsed: unknown = JSON.parse(raw)
    return parsed === "Light" || parsed === "Dark" || parsed === "System" ? parsed : "System"
  } catch {
    return "System"
  }
}

const prefersDark = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches

export const LoadThemePreference = Command.define(
  "LoadThemePreference",
  GotThemePreference,
)(Effect.sync(() => GotThemePreference({ preference: readThemePreference() })))

const ApplyTheme = Command.define(
  "ApplyTheme",
  { preference: ThemePreference },
  CompletedApplyTheme,
)(({ preference }) =>
  Effect.sync(() => {
    const isDark = preference === "Dark" || (preference === "System" && prefersDark())
    document.documentElement.classList.toggle("dark", isDark)
    return CompletedApplyTheme()
  }),
)

const SaveThemePreference = Command.define(
  "SaveThemePreference",
  { preference: ThemePreference },
  CompletedSaveThemePreference,
)(({ preference }) =>
  Effect.sync(() => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference))
    return CompletedSaveThemePreference()
  }),
)

export const LoadSidebarGroups = Command.define(
  "LoadSidebarGroups",
  GotSidebarGroups,
)(Effect.sync(() => GotSidebarGroups({ open: readSidebarGroups() })))

const SaveSidebarGroups = Command.define(
  "SaveSidebarGroups",
  { open: SidebarGroups },
  CompletedSaveSidebarGroups,
)(({ open }) =>
  Effect.sync(() => {
    writeSidebarGroups(open)
    return CompletedSaveSidebarGroups()
  }),
)
