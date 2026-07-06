import * as Command from "@/components/ui/command"

import { commandItems } from "../content/docs"

export type SearchItem = string

export const searchItems: ReadonlyArray<SearchItem> = commandItems.map((item) => item.label)

const pathByItem: ReadonlyMap<string, string> = new Map(commandItems.map((item) => [item.label, item.path]))

export const itemToPath = (item: string): string => pathByItem.get(item) ?? "/docs/getting-started"

export const SearchCommand: ReturnType<typeof Command.create<SearchItem>> = Command.create<SearchItem>()

export const initialSearchCommand = (): Command.Model => Command.init({ id: "search-command", isAnimated: false })

export const filterSearchItems = (inputValue: string): ReadonlyArray<SearchItem> =>
  inputValue === "" ? searchItems : searchItems.filter((item) => item.toLowerCase().includes(inputValue.toLowerCase()))
