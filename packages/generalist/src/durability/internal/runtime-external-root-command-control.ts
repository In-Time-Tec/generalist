import { Schema } from "effect"
import { ExternalRoot, ExternalRootSettlement, RootAdmission } from "../../runtime/child/external/placement.js"

const SettlementAcknowledgement = Schema.Struct({ placementId: Schema.String, settlementId: Schema.String })
const key = (...parts: readonly (string | number)[]) => JSON.stringify(parts)

export const externalRootCommands = {
  admitRoot: {
    tag: "external.admitRoot",
    input: Schema.Tuple([RootAdmission]),
    receipt: ExternalRoot,
    identity: ([input]: readonly [RootAdmission]) => input.placementId,
  },
  activateRoot: {
    tag: "external.activateRoot",
    input: Schema.Tuple([Schema.String]),
    receipt: ExternalRoot,
    identity: ([id]: readonly [string]) => id,
  },
  cancelRoot: {
    tag: "external.cancelRoot",
    input: Schema.Tuple([Schema.String, Schema.optionalKey(Schema.UndefinedOr(Schema.String))]),
    receipt: ExternalRoot,
    identity: ([id]: readonly [string, (string | undefined)?]) => id,
  },
  acknowledgeRootSettlement: {
    tag: "external.acknowledgeRootSettlement",
    input: Schema.Tuple([SettlementAcknowledgement]),
    receipt: ExternalRootSettlement,
    identity: ([input]: readonly [typeof SettlementAcknowledgement.Type]) => key(input.placementId, input.settlementId),
  },
} as const
