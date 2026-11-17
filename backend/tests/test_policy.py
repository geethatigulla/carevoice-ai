from app.policy.engine import PolicyEngine, SessionContext, ToolCall
from app.services.tools import TOOLS

engine = PolicyEngine()


def ctx(tools: set[str], verified: bool = False) -> SessionContext:
    return SessionContext(tenant_id="t1", call_id="c1", agent_key="appointment", allowed_tools=frozenset(tools), patient_verified=verified)


def call(name: str) -> ToolCall:
    return ToolCall(name, {}, requires_verified_patient=TOOLS[name].requires_verified_patient)


def test_tool_not_in_agent_config_is_denied() -> None:
    d = engine.evaluate(ctx({"search_doctors"}), call("cancel_appointment"))
    assert not d.allowed and d.error_code == "NOT_ALLOWED"


def test_booking_requires_verified_caller() -> None:
    d = engine.evaluate(ctx({"create_appointment"}), call("create_appointment"))
    assert not d.allowed and d.error_code == "VERIFICATION_REQUIRED"
    assert d.required_first == ("verify_patient",)


def test_verified_caller_may_book() -> None:
    assert engine.evaluate(ctx({"create_appointment"}, verified=True), call("create_appointment")).allowed


def test_public_tools_need_no_verification() -> None:
    for name in ("search_doctors", "get_available_slots", "list_departments", "get_hospital_info"):
        assert engine.evaluate(ctx({name}), call(name)).allowed


def test_every_patient_data_tool_is_flagged() -> None:
    flagged = {n for n, t in TOOLS.items() if t.requires_verified_patient}
    assert {"hold_slot", "create_appointment", "get_patient_appointments", "cancel_appointment"} <= flagged
