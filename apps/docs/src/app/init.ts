import { Runtime } from "foldkit"
import { Url } from "foldkit/url"

import * as Dialog from "@/components/ui/dialog"

import { urlToRoute } from "../route/route"
import type { Message } from "./message"
import type { Model } from "./model"
import { initialSearchCommand } from "./searchPalette"

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => [
  {
    route: urlToRoute(url),
    url,
    searchDialog: Dialog.init({
      id: "search-dialog",
      isAnimated: false,
      focusSelector: '[data-slot="command-input"]',
    }),
    searchCommand: initialSearchCommand(),
  },
  [],
]
