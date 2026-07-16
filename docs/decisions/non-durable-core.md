# Keep Baton non-durable

Baton owns same-process agent execution and replaceable persistence seams. Durable logs, distributed locking, addressability, and recovery belong to hosts such as Relay. This keeps core usable as an ordinary Effect library and prevents a database or durable runtime from entering its dependency boundary.
