import { WorkingMemory } from "generalist/memory"
import { Testing } from "generalist/testing"

Testing.memory({ layer: WorkingMemory.layer({ maxMessages: 20 }) })
