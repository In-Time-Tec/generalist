import { type ClassValue, clsx } from "clsx"
import type { Attribute, ChildAttribute } from "foldkit/html"
import { twMerge } from "tailwind-merge"

/** Merges class values with clsx and resolves Tailwind conflicts with tailwind-merge. */
export const cn = (...inputs: Array<ClassValue>): string => twMerge(clsx(inputs))

/**
 * Standard config for a styled part. `class` is the only styling input and is
 * merged through `cn`. `attributes` is the escape hatch for ids, handlers,
 * and attribute groups from headless primitives; never pass `h.Class` through
 * it, because components place their own single `h.Class` last and FoldKit
 * class handling is last-wins.
 */
export type SlotConfig<ParentMessage> = Readonly<{
  class?: string
  attributes?: ReadonlyArray<Attribute<ParentMessage> | ChildAttribute>
}>
