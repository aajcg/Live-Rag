import pytest
from src.controller import RetrievalController, ControllerDecisionEnum

@pytest.fixture
def controller():
    return RetrievalController(use_llm=False)

# ---------------------------------------------------------------- WAIT path
def test_controller_wait_incomplete_prefix(controller):
    result = controller.evaluate("I want to know about")
    assert result.decision == ControllerDecisionEnum.WAIT
    assert result.retrieval_required is False

def test_controller_wait_trailing_conjunction(controller):
    result = controller.evaluate("What is the coverage period and")
    assert result.decision == ControllerDecisionEnum.WAIT

def test_controller_wait_short_fragment(controller):
    result = controller.evaluate("tell me")
    assert result.decision == ControllerDecisionEnum.WAIT

def test_controller_waits_on_unstable_continuation(controller):
    result = controller.evaluate("I need to plan a customer workshop in...")
    assert result.decision == ControllerDecisionEnum.WAIT
    assert result.intent_stability < 0.75


# ------------------------------------------------------- early RETRIEVE path
def test_controller_retrieve_complete_query(controller):
    result = controller.evaluate("What are the warranty coverage options for international products?")
    assert result.decision == ControllerDecisionEnum.RETRIEVE
    assert result.confidence >= 0.75
    assert result.retrieval_required is True

def test_controller_early_provisional_retrieve_on_stable_entities(controller):
    result = controller.evaluate("I need to plan a customer workshop in... ...Pune for 30 people, and I need...")
    assert result.decision == ControllerDecisionEnum.RETRIEVE
    assert result.trigger == "provisional"
    assert result.intent_stability >= 0.5


# ------------------------------------------------------------ SUPPRESS path
def test_controller_suppress_formatting(controller):
    result = controller.evaluate("Format the previous answer as bullet points")
    assert result.decision == ControllerDecisionEnum.SUPPRESS
    assert result.retrieval_required is False

def test_controller_suppress_rephrase(controller):
    result = controller.evaluate("Explain that in simple terms")
    assert result.decision == ControllerDecisionEnum.SUPPRESS

def test_controller_suppress_greeting(controller):
    result = controller.evaluate("Hello!")
    assert result.decision == ControllerDecisionEnum.SUPPRESS

def test_controller_suppression_spec_example(controller):
    result = controller.evaluate("Please repeat your last answer in two bullets.")
    assert result.decision == ControllerDecisionEnum.SUPPRESS
    assert result.reason == "presentation_restructure"
    assert result.retrieval_required is False

def test_controller_does_not_suppress_new_factual_question(controller):
    result = controller.evaluate("Summarize the warranty policy for the Aventro Zoom SUV")
    assert result.decision == ControllerDecisionEnum.RETRIEVE
    assert result.retrieval_required is True
