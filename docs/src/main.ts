import { Effect, Option, Schema, Stream } from "effect"
import type { Command } from "foldkit/command"
import { Dom, Subscription, Url } from "foldkit"
import { m } from "foldkit/message"
import { UrlRequest } from "foldkit/navigation"
import type { RoutingApplicationInit } from "foldkit/runtime"
import { CodeHighlights } from "./code"
import { pageForPath, searchPages } from "./pages"
import { Spring, advance, aim, at, moving, springs } from "./motion"
import {
  CopyCode,
  EffectCompleted,
  FinishedCopy,
  FocusArticle,
  LoadedPreferences,
  Navigate,
  PersistTheme,
  ReadPreferences,
  ScrollSearchResult,
  SyncDialog,
  Theme,
} from "./browser"
import { page } from "./view"

export const Flags = Schema.Struct({ code: CodeHighlights })
export type Flags = typeof Flags.Type
export const Model = Schema.Struct({
  code: CodeHighlights,
  path: Schema.String,
  origin: Schema.String,
  focusAfterNavigation: Schema.String,
  theme: Theme,
  reducedMotion: Schema.Boolean,
  query: Schema.String,
  searchOpen: Schema.Boolean,
  searchMotion: Spring,
  searchIndex: Schema.Finite,
  searchHighlight: Spring,
  drawerOpen: Schema.Boolean,
  drawerMotion: Spring,
  hoverGroup: Schema.String,
  hoverIndex: Schema.Finite,
  hoverY: Spring,
  hoverAlpha: Spring,
  copyStatus: Schema.NullOr(Schema.Struct({ id: Schema.String, failed: Schema.Boolean })),
})
export type Model = typeof Model.Type

export const RequestedUrl = m("RequestedUrl", { request: UrlRequest })
export const ChangedUrl = m("ChangedUrl", { url: Url.Url })
export const FollowedLink = m("FollowedLink", { href: Schema.String })
export const OpenedSearch = m("OpenedSearch")
export const ClosedSearch = m("ClosedSearch")
export const ChangedQuery = m("ChangedQuery", { query: Schema.String })
export const SelectedResult = m("SelectedResult", { index: Schema.Finite })
export const MovedSelection = m("MovedSelection", { direction: Schema.Finite })
export const ActivatedResult = m("ActivatedResult")
export const OpenedDrawer = m("OpenedDrawer")
export const ClosedDrawer = m("ClosedDrawer")
export const HoveredItem = m("HoveredItem", { group: Schema.String, index: Schema.Finite })
export const LeftNavigation = m("LeftNavigation")
export const ChangedTheme = m("ChangedTheme", { theme: Theme })
export const ChangedMotionPreference = m("ChangedMotionPreference", { reducedMotion: Schema.Boolean })
export const Ticked = m("Ticked", { delta: Schema.Finite })
export const ClickedCopy = m("ClickedCopy", { id: Schema.String })
export const Message = Schema.Union([
  RequestedUrl,
  ChangedUrl,
  FollowedLink,
  OpenedSearch,
  ClosedSearch,
  ChangedQuery,
  SelectedResult,
  MovedSelection,
  ActivatedResult,
  OpenedDrawer,
  ClosedDrawer,
  HoveredItem,
  LeftNavigation,
  ChangedTheme,
  ChangedMotionPreference,
  Ticked,
  ClickedCopy,
  EffectCompleted,
  FinishedCopy,
  LoadedPreferences,
])
export type Message = typeof Message.Type
type Update = readonly [Model, ReadonlyArray<Command<Message>>]

export const searchPresent = (model: Model): boolean => model.searchOpen || model.searchMotion.value > 0
export const drawerPresent = (model: Model): boolean => model.drawerOpen || model.drawerMotion.value > 0

const init: RoutingApplicationInit<Model, Message, Flags> = (flags, url) => [
  {
    code: flags.code,
    path: url.pathname,
    origin: new URL(Url.toString(url)).origin,
    focusAfterNavigation: "",
    theme: "system",
    reducedMotion: false,
    query: "",
    searchOpen: false,
    searchMotion: at(0),
    searchIndex: 0,
    searchHighlight: at(0),
    drawerOpen: false,
    drawerMotion: at(0),
    hoverGroup: "",
    hoverIndex: 0,
    hoverY: at(0),
    hoverAlpha: at(0),
    copyStatus: null,
  },
  [ReadPreferences()],
]

const closeOverlays = (model: Model): Model => ({
  ...model,
  searchOpen: false,
  searchMotion: aim(model.searchMotion, 0, model.reducedMotion),
  drawerOpen: false,
  drawerMotion: aim(model.drawerMotion, 0, model.reducedMotion),
  hoverAlpha: aim(model.hoverAlpha, 0, model.reducedMotion),
})

const followLink = (model: Model, href: string): Update => [
  closeOverlays(model),
  [Navigate({ href, external: false }), SyncDialog({ id: "search-dialog" }), SyncDialog({ id: "navigation-dialog" })],
]

const tick = (model: Model, delta: number): Update => {
  const next = {
    ...model,
    hoverY: advance(model.hoverY, delta, springs.fast),
    hoverAlpha: advance(model.hoverAlpha, delta, springs.fast),
    searchMotion: advance(model.searchMotion, delta, springs.slow),
    searchHighlight: advance(model.searchHighlight, delta, springs.fast),
    drawerMotion: advance(model.drawerMotion, delta, springs.moderate),
  }
  const commands: Array<Command<Message>> = []
  if (searchPresent(model) && !searchPresent(next)) commands.push(SyncDialog({ id: "search-dialog" }))
  if (drawerPresent(model) && !drawerPresent(next)) commands.push(SyncDialog({ id: "navigation-dialog" }))
  return [next, commands]
}

const selectResult = (model: Model, index: number): Update => {
  const result = searchPages(model.query)[index]
  if (result === undefined) return [model, []]
  return [
    { ...model, searchIndex: index, searchHighlight: aim(model.searchHighlight, index * 64, model.reducedMotion) },
    [ScrollSearchResult({ id: `search-result-${index}` })],
  ]
}

const setReducedMotion = (model: Model, reducedMotion: boolean): Model => ({
  ...model,
  reducedMotion,
  hoverY: aim(model.hoverY, model.hoverY.target, reducedMotion),
  hoverAlpha: aim(model.hoverAlpha, model.hoverAlpha.target, reducedMotion),
  searchMotion: aim(model.searchMotion, model.searchMotion.target, reducedMotion),
  searchHighlight: aim(model.searchHighlight, model.searchHighlight.target, reducedMotion),
  drawerMotion: aim(model.drawerMotion, model.drawerMotion.target, reducedMotion),
})

const navigationUpdate = (model: Model, message: Message): Update => {
  switch (message._tag) {
    case "RequestedUrl": {
      const request = message.request
      if (request._tag === "External") return [model, [Navigate({ href: request.href, external: true })]]
      if (pageForPath(request.url.pathname) === undefined)
        return [model, [Navigate({ href: Url.toString(request.url), external: true })]]
      return followLink(model, Url.toString(request.url))
    }
    case "ChangedUrl":
      return [
        {
          ...closeOverlays(model),
          path: message.url.pathname,
          copyStatus: null,
          focusAfterNavigation: Option.getOrElse(message.url.hash, () => "article"),
        },
        [FocusArticle({ hash: Option.getOrElse(message.url.hash, () => "") })],
      ]
    case "FollowedLink":
      return followLink(model, message.href)
    case "OpenedDrawer":
      return [
        {
          ...model,
          focusAfterNavigation: "",
          drawerOpen: true,
          drawerMotion: aim(model.drawerMotion, 1, model.reducedMotion),
        },
        [SyncDialog({ id: "navigation-dialog" })],
      ]
    case "ClosedDrawer":
      return [
        { ...model, drawerOpen: false, drawerMotion: aim(model.drawerMotion, 0, model.reducedMotion) },
        [SyncDialog({ id: "navigation-dialog" })],
      ]
    case "HoveredItem": {
      if (model.hoverGroup === message.group && model.hoverIndex === message.index && model.hoverAlpha.target === 1)
        return [model, []]
      const position = message.index * 36
      return [
        {
          ...model,
          hoverGroup: message.group,
          hoverIndex: message.index,
          hoverY: model.hoverGroup === message.group ? aim(model.hoverY, position, model.reducedMotion) : at(position),
          hoverAlpha: aim(model.hoverAlpha, 1, model.reducedMotion),
        },
        [],
      ]
    }
    case "LeftNavigation":
      return [{ ...model, hoverAlpha: aim(model.hoverAlpha, 0, model.reducedMotion) }, []]
    default:
      return [model, []]
  }
}

const searchUpdate = (model: Model, message: Message): Update => {
  switch (message._tag) {
    case "OpenedSearch":
      return [
        {
          ...model,
          focusAfterNavigation: "",
          searchOpen: true,
          searchMotion: aim(model.searchMotion, 1, model.reducedMotion),
          drawerOpen: false,
          drawerMotion: at(0),
        },
        [SyncDialog({ id: "navigation-dialog" }), SyncDialog({ id: "search-dialog" })],
      ]
    case "ClosedSearch":
      return [
        { ...model, searchOpen: false, searchMotion: aim(model.searchMotion, 0, model.reducedMotion) },
        [SyncDialog({ id: "search-dialog" })],
      ]
    case "ChangedQuery":
      return [{ ...model, query: message.query, searchIndex: 0, searchHighlight: at(0) }, []]
    case "SelectedResult":
      return selectResult(model, message.index)
    case "MovedSelection": {
      const count = searchPages(model.query).length
      if (count === 0) return [model, []]
      return selectResult(model, (model.searchIndex + message.direction + count) % count)
    }
    case "ActivatedResult": {
      const result = searchPages(model.query)[model.searchIndex]
      return result === undefined ? [model, []] : followLink(model, result.href)
    }
    default:
      return navigationUpdate(model, message)
  }
}

const update = (model: Model, message: Message): Update => {
  switch (message._tag) {
    case "Ticked":
      return tick(model, message.delta)
    case "ChangedTheme":
      return [{ ...model, theme: message.theme }, [PersistTheme({ theme: message.theme })]]
    case "LoadedPreferences":
      return [{ ...setReducedMotion(model, message.reducedMotion), theme: message.theme }, []]
    case "ChangedMotionPreference":
      return [
        setReducedMotion(model, message.reducedMotion),
        [SyncDialog({ id: "search-dialog" }), SyncDialog({ id: "navigation-dialog" })],
      ]
    case "ClickedCopy":
      return [{ ...model, copyStatus: null }, [CopyCode({ id: message.id })]]
    case "FinishedCopy":
      return [{ ...model, copyStatus: { id: message.id, failed: message.failed } }, []]
    case "EffectCompleted":
      return [model, []]
    default:
      return searchUpdate(model, message)
  }
}

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  frame: Subscription.animationFrame({
    isActive: (model: Model) =>
      !model.reducedMotion &&
      [model.hoverY, model.hoverAlpha, model.searchMotion, model.searchHighlight, model.drawerMotion].some(moving),
    toMessage: (delta) => Ticked({ delta }),
  }),
  shortcut: Subscription.persistent(
    Subscription.fromEventFilterMap<KeyboardEvent, Message>({
      target: () => document,
      type: "keydown",
      toMessage: (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault()
          return Option.some(OpenedSearch())
        }
        return Option.none()
      },
    }),
  ),
  motionPreference: Subscription.persistent(
    Subscription.fromEvent<MediaQueryListEvent, Message>({
      target: () => window.matchMedia("(prefers-reduced-motion: reduce)"),
      type: "change",
      toMessage: (event) => ChangedMotionPreference({ reducedMotion: event.matches }),
    }),
  ),
  scrollLock: entry(
    { locked: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ locked: searchPresent(model) || drawerPresent(model) }),
      dependenciesToStream: ({ locked }) =>
        locked
          ? Stream.unwrap(Effect.acquireRelease(Dom.lockScroll, () => Dom.unlockScroll).pipe(Effect.as(Stream.never)))
          : Stream.empty,
    },
  ),
}))

export const application = {
  Flags,
  Model,
  init,
  update,
  view: page.view,
  subscriptions,
  routing: {
    onUrlRequest: (request: UrlRequest) => RequestedUrl({ request }),
    onUrlChange: (url: Url.Url) => ChangedUrl({ url }),
  },
}
