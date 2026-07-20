# Steering

Steering is an optional two-queue service. Steering input drains after tool results and before the next model turn. Follow-up input drains only when the run would otherwise complete. Interruption leaves undrained inputs in the service layer.

Without Steering, turn and completion behavior is unchanged.
