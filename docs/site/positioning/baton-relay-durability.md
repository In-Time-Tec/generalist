# Baton + Relay: When You Need Durability

Baton is standalone, non-durable, and Effect-native. Relay is a durable runtime that can host Baton when executions need addresses, event logs, resumable waits, and cross-process recovery.

The ownership rule is simple: if code needs durable runtime schema, event-log storage, database state, or execution addressability, it belongs in Relay or another durable runtime. If code is the process-local agent primitive over `effect/unstable/ai`, it belongs in Baton.

This boundary lets Baton stay small and lets Relay compose the same primitives at a higher level.
