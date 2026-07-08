import { Schema } from "effect"

export const SIDEBAR_GROUPS_STORAGE_KEY = "sidebar-groups"

export const SidebarGroups = Schema.Record(Schema.String, Schema.Boolean)
export type SidebarGroups = typeof SidebarGroups.Type

export const isSidebarGroupOpen = (open: SidebarGroups, group: string): boolean => open[group] ?? true

const isBooleanEntry = (entry: readonly [string, unknown]): entry is readonly [string, boolean] =>
  typeof entry[1] === "boolean"

export const readSidebarGroups = (): SidebarGroups => {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY)
    if (raw === null) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(Object.entries(parsed).filter(isBooleanEntry))
  } catch {
    return {}
  }
}

export const writeSidebarGroups = (open: SidebarGroups): void => {
  try {
    sessionStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify(open))
  } catch {
    return
  }
}
