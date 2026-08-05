# FoldKit adapter

`@batonfx/foldkit` adapts Baton transport into FoldKit resources, subscriptions, commands, and a headless chat model. It does not own styled views, durable sessions, or execution semantics.

Each scoped session acquisition owns one transport connection and command route. Overlapping sessions cannot replace each other's route, and finalizing an older acquisition cannot remove its successor. Expected transport and command failures become structured FoldKit actions; defects and interruption keep their Effect meaning.

The chat update drops replayed frames at or below its last accepted sequence and treats a Snapshot as an authoritative reset.
