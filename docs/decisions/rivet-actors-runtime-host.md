# Retired: Rivet compute host over object durability

This decision records a removed adapter. Generalist previously used the raw Rivet SDK to own one scoped Runtime per actor partition. Rivet wake, sleep, destroy, schedules, and cron mapped to scope ownership and reconciliation; they never owned canonical Runs, Sessions, operations, or receipts.

The adapter first replaced an earlier actor-local database design with the shared object-storage contract. That avoided a second durability engine and kept ownership fencing, lost-response reconciliation, and branch retention in one protocol.

Generalist no longer ships a Rivet host or SDK dependency. Applications can host the provider-neutral Runtime contracts on their chosen compute platform and must own wake delivery, scope lifecycle, credentials, and qualification.

See [small core and external adapters](./small-core-external-adapters.md) for the current ownership boundary and [object-native state](./object-native-state-model.md) for canonical authority.
