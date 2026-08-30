type SkillCatalogFacade = Omit<typeof import("../skill-catalog.js"), "listing" | "Frontmatter">
type CoreSkillCatalog = import("../skill-catalog.js").SkillCatalog
type CoreSkillCatalogError = import("../skill-catalog.js").SkillCatalogError

import {
  DESCRIPTION_CAP,
  layer,
  layerEmpty,
  layerSkills,
  layerTest,
  merge,
  selectListings,
  SkillCatalog as SkillCatalogService,
  SkillCatalogError,
} from "../skill-catalog.js"

export const SkillCatalog: SkillCatalogFacade = {
  DESCRIPTION_CAP,
  SkillCatalogError,
  SkillCatalog: SkillCatalogService,
  layerSkills,
  layerEmpty,
  layerTest,
  merge,
  layer,
  selectListings,
}
export namespace SkillCatalog {
  export type DESCRIPTION_CAP = typeof import("../skill-catalog.js").DESCRIPTION_CAP
  export type SkillCatalogError = CoreSkillCatalogError
  export type SkillCatalog = CoreSkillCatalog
  export type layerSkills = typeof import("../skill-catalog.js").layerSkills
  export type layerEmpty = typeof import("../skill-catalog.js").layerEmpty
  export type layerTest = typeof import("../skill-catalog.js").layerTest
  export type merge = typeof import("../skill-catalog.js").merge
  export type layer = typeof import("../skill-catalog.js").layer
  export type selectListings = typeof import("../skill-catalog.js").selectListings
  export type Service = import("../skill-catalog.js").Service
  export type Skill = import("../skill-catalog.js").Skill
}
