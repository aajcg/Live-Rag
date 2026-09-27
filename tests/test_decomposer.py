import pytest
from src.decomposer import QueryDecomposer

@pytest.fixture
def decomposer():
    return QueryDecomposer(use_llm=False)

def test_single_intent_query(decomposer):
    query = "What is the warranty period for this device?"
    subqueries = decomposer.decompose(query)
    assert len(subqueries) == 1
    assert "warranty period" in subqueries[0].query.lower()

def test_multi_intent_query(decomposer):
    query = "What is the warranty period, what does it cover, and what are the international exceptions?"
    subqueries = decomposer.decompose(query)
    assert len(subqueries) >= 3
    texts = [sq.query.lower() for sq in subqueries]
    assert any("period" in t for t in texts)
    assert any("cover" in t for t in texts)
    assert any("exceptions" in t for t in texts)

def test_atomic_compound_decomposition(decomposer):
    query = "I need venue capacity, cancellation policy and catering options."
    subqueries = decomposer.decompose(query)
    texts = [sq.query.lower() for sq in subqueries]
    assert len(texts) == 3
    assert any("venue capacity" in t for t in texts)
    assert any("cancellation" in t for t in texts)
    assert any("catering" in t for t in texts)

def test_no_over_fragmentation_of_simple_query(decomposer):
    query = "What is the warranty period and coverage?"
    subqueries = decomposer.decompose(query)
    assert len(subqueries) == 1

def test_near_duplicate_subqueries_are_collapsed(decomposer):
    query = "What is the warranty period and warranty period?"
    subqueries = decomposer.decompose(query)
    assert len(subqueries) == 1

def test_ellipsis_stream_fragments_are_cleaned(decomposer):
    query = (
        "I need to plan a customer workshop in... ...Pune for 30 people, "
        "and I need... ...the cancellation policy and the catering options."
    )
    subqueries = decomposer.decompose(query)
    assert len(subqueries) >= 2
    for sq in subqueries:
        assert "..." not in sq.query
        assert "i need" not in sq.query.lower()
