import { create, init, type CommandModel } from "@/components/ui/command"
import { defaultDocsPath, searchDocs, type SearchResult } from "../content/registry"

export type SearchItem = string

export const itemToPath = (item: SearchItem): string => (item.startsWith("/") ? item : defaultDocsPath)

export const SearchCommand: ReturnType<typeof create<SearchItem>> = create<SearchItem>()

export const initialSearchCommand = (): CommandModel => init({ id: "search-command", isAnimated: false })

export const searchResultsFor = (inputValue: string): ReadonlyArray<SearchResult> => searchDocs(inputValue)
