# Steering and Interrupts

Steering is optional live input delivered at turn boundaries. The steering queue drains after tool results and before the next model turn. The follow-up queue drains only when the run would otherwise complete.

Baton uses Effect interruption for cancellation. There is no second abort API. Undrained steering messages remain in the service layer after interruption, so in-process hosts can decide whether to reuse or discard them.

Use steering for soft in-run guidance. Use approvals and permissions for hard gates.
