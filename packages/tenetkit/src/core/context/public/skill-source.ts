type SkillSourceFacade = Omit<typeof import("../skill-source.js"), "listing"> & {
  readonly makeListing: typeof import("../skill-source.js").listing
}
type CoreSkillSource = import("../skill-source.js").SkillSource
type CoreSkillSourceError = import("../skill-source.js").SkillSourceError

import {
  DESCRIPTION_CAP,
  Frontmatter,
  layer,
  layerEmpty,
  layerSkills,
  layerTest,
  listing as makeListing,
  merge,
  selectListings,
  SkillSource as SkillSourceService,
  SkillSourceError,
} from "../skill-source.js"

export const SkillSource: SkillSourceFacade = {
  DESCRIPTION_CAP,
  Frontmatter,
  SkillSourceError,
  SkillSource: SkillSourceService,
  makeListing,
  layerSkills,
  layerEmpty,
  layerTest,
  merge,
  layer,
  selectListings,
}
export namespace SkillSource {
  export type DESCRIPTION_CAP = typeof import("../skill-source.js").DESCRIPTION_CAP
  export type Frontmatter = import("../skill-source.js").Frontmatter
  export type SkillSourceError = CoreSkillSourceError
  export type SkillSource = CoreSkillSource
  export type makeListing = typeof import("../skill-source.js").listing
  export type layerSkills = typeof import("../skill-source.js").layerSkills
  export type layerEmpty = typeof import("../skill-source.js").layerEmpty
  export type layerTest = typeof import("../skill-source.js").layerTest
  export type merge = typeof import("../skill-source.js").merge
  export type layer = typeof import("../skill-source.js").layer
  export type selectListings = typeof import("../skill-source.js").selectListings
  export type Interface = import("../skill-source.js").Interface
  export type Skill = import("../skill-source.js").Skill
  export type Source<R = never> = import("../skill-source.js").Source<R>
}
