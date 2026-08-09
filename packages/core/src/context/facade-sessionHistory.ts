type SessionHistoryFacade = typeof import("./session-history.js")

import {
  compactionCheckpoints as SessionHistory_compactionCheckpoints,
  pageHistory as SessionHistory_pageHistory,
} from "./session-history.js"

export const SessionHistory = {
  compactionCheckpoints: SessionHistory_compactionCheckpoints,
  pageHistory: SessionHistory_pageHistory,
} as SessionHistoryFacade

export namespace SessionHistory {
  export type HistoryPage = import("./session-history.js").HistoryPage
  export type HistoryPageInput = import("./session-history.js").HistoryPageInput
}
