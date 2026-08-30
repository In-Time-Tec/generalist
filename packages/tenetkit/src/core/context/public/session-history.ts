import {
  compactionCheckpoints as SessionHistory_compactionCheckpoints,
  page as SessionHistory_page,
} from "../session-history.js"

export const SessionHistory = {
  compactionCheckpoints: SessionHistory_compactionCheckpoints,
  page: SessionHistory_page,
}

export namespace SessionHistory {
  export type HistoryPage = import("../session-history.js").HistoryPage
  export type HistoryPageInput = import("../session-history.js").HistoryPageInput
}
