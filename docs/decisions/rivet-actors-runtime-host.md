# Rivet is a compute host over object durability

Generalist uses the raw Rivet SDK to own one scoped Runtime per actor partition. Rivet wake, sleep, destroy, schedules, and cron map to scope ownership and reconciliation; they never own canonical Runs, Sessions, operations, or receipts.

The clean v1 object-storage contract replaces the earlier actor-local database design. The application supplies the same S3/native R2 transport and pinned executable resolver used by other hosts. This avoids a second durability engine and keeps ownership fencing, lost-response reconciliation, and branch retention in one protocol. The cost is explicit object-service configuration and an independent periodic recovery path even when actor scheduling appears reliable.

The current catalog pins `rivetkit@2.3.15`. Earlier raw-SDK experiments and the rejected `@rivetkit/effect` integration do not establish compatibility with 2.3.10 for this implementation. Neither local host tests nor object-emulator tests certify a deployed Rivet or cloud storage configuration.

See [Rivet hosting](../features/rivet.md) for current options and [object-native state](./object-native-state-model.md) for the canonical authority boundary.
