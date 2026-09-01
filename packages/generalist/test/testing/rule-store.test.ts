import { Permissions } from "generalist"
import { Testing } from "generalist/testing"

Testing.ruleStore({ layer: Permissions.layerRuleStoreMemory() })
