import { Effect, Match, Option, Schema } from "effect"
import { Command } from "foldkit"
import { load, pushUrl } from "foldkit/navigation"
import { evo } from "foldkit/struct"
import * as Url from "foldkit/url"

import * as Dialog from "@/components/ui/dialog"

import { urlToRoute } from "../route/route"
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  GotSearchCommandMessage,
  GotSearchDialogMessage,
  type Message,
} from "./message"
import type { Model } from "./model"
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
      ChangedUrl: ({ url }) => [
        evo(model, {
          route: () => urlToRoute(url),
          url: () => url,
        }),
        [],
      ],
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
