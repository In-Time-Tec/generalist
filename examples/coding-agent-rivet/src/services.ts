import { Layer } from "effect"
import { Approvals, Permissions } from "generalist"
import { fixtureToolLayer, fixtureWorkspaceLayer } from "./fixture.js"
import { specialistMessagingLayer } from "./messaging.js"
import { scriptedModelLayer } from "./model.js"

export const agentServices = Layer.mergeAll(
  scriptedModelLayer,
  fixtureToolLayer,
  fixtureWorkspaceLayer,
  specialistMessagingLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)
