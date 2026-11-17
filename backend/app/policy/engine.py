"""Policy Engine: the gate between an LLM tool call and any backend action.

    LLM tool call -> PolicyEngine.evaluate() -> tool handler (business rules, one transaction) -> DB

It decides, from the call's state only, whether the active agent may run the tool right now:
the agent's configuration must allow the tool, and tools that touch patient-specific data need a
caller verified within the current call session. Business rules (open slot, own hold, no double
booking, cancellation cut-off, …) are enforced afterwards by the tool handlers in
`app/services/tools.py`, which call this engine first.
"""

from dataclasses import dataclass, field
from typing import Any, Literal

ErrorCode = Literal["NOT_ALLOWED", "VERIFICATION_REQUIRED"]


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, Any]
    requires_verified_patient: bool = False


@dataclass(frozen=True)
class SessionContext:
    tenant_id: str
    call_id: str
    agent_key: str
    allowed_tools: frozenset[str]
    patient_verified: bool = False


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    reason: str = ""
    error_code: ErrorCode | None = None
    # What the agent must do first, e.g. ("verify_patient",)
    required_first: tuple[str, ...] = field(default_factory=tuple)


class PolicyEngine:
    def evaluate(self, ctx: SessionContext, call: ToolCall) -> PolicyDecision:
        if call.name not in ctx.allowed_tools:
            return PolicyDecision(False, f"Agent {ctx.agent_key} may not use {call.name}.", "NOT_ALLOWED")
        if call.requires_verified_patient and not ctx.patient_verified:
            return PolicyDecision(
                False,
                "Verify the caller first with verify_patient (date of birth or birth year).",
                "VERIFICATION_REQUIRED",
                required_first=("verify_patient",),
            )
        return PolicyDecision(True)
