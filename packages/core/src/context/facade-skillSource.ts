type SkillSourceFacade = typeof import("./skill-source.js")
type CoreSkillSource = import("./skill-source.js").SkillSource
type CoreSkillSourceError = import("./skill-source.js").SkillSourceError

import {
  DESCRIPTION_CAP as SkillSource_DESCRIPTION_CAP,
  Frontmatter as SkillSource_Frontmatter,
  SkillSourceError as SkillSource_SkillSourceError,
  SkillSource as SkillSource_SkillSource,
  makeListing as SkillSource_makeListing,
  layerSkills as SkillSource_layerSkills,
  layerEmpty as SkillSource_layerEmpty,
  layerTest as SkillSource_layerTest,
  merge as SkillSource_merge,
  layer as SkillSource_layer,
  selectListings as SkillSource_selectListings,
} from "./skill-source.js"
export const SkillSource = {
  DESCRIPTION_CAP: SkillSource_DESCRIPTION_CAP,
  Frontmatter: SkillSource_Frontmatter,
  SkillSourceError: SkillSource_SkillSourceError,
  SkillSource: SkillSource_SkillSource,
  makeListing: SkillSource_makeListing,
  layerSkills: SkillSource_layerSkills,
  layerEmpty: SkillSource_layerEmpty,
  layerTest: SkillSource_layerTest,
  merge: SkillSource_merge,
  layer: SkillSource_layer,
  selectListings: SkillSource_selectListings,
} as SkillSourceFacade
export namespace SkillSource {
  export type DESCRIPTION_CAP = typeof import("./skill-source.js").DESCRIPTION_CAP
  export type Frontmatter = import("./skill-source.js").Frontmatter
  export type SkillSourceError = CoreSkillSourceError
  export type SkillSource = CoreSkillSource
  export type makeListing = typeof import("./skill-source.js").makeListing
  export type layerSkills = typeof import("./skill-source.js").layerSkills
  export type layerEmpty = typeof import("./skill-source.js").layerEmpty
  export type layerTest = typeof import("./skill-source.js").layerTest
  export type merge = typeof import("./skill-source.js").merge
  export type layer = typeof import("./skill-source.js").layer
  export type selectListings = typeof import("./skill-source.js").selectListings
  export type Interface = import("./skill-source.js").Interface
  export type Skill = import("./skill-source.js").Skill
  export type Source<R = never> = import("./skill-source.js").Source<R>
}
