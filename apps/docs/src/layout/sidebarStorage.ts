import { Option, Schema } from "effect"
import { dual } from "effect/Function"

export const SIDEBAR_GROUPS_STORAGE_KEY = "sidebar-groups"

export const SidebarGroups = Schema.Record(Schema.String, Schema.Boolean)
export type SidebarGroups = typeof SidebarGroups.Type
const SidebarGroupsJson = Schema.fromJsonString(SidebarGroups)

export const isSidebarGroupOpen: {
  (open: SidebarGroups, group: string): boolean
  (group: string): (open: SidebarGroups) => boolean
} = dual(2, (open: SidebarGroups, group: string): boolean => open[group] ?? true)

export const readSidebarGroups = (): SidebarGroups => {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY)
    if (raw === null) {
      return {}
    }
    return Option.getOrElse(Schema.decodeUnknownOption(SidebarGroupsJson)(raw), () => ({}))
  } catch {
    return {}
  }
}

export const writeSidebarGroups = (open: SidebarGroups): void => {
  try {
    sessionStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, Schema.encodeSync(SidebarGroupsJson)(open))
  } catch {
    return
  }
}
