from app.providers.base import Turn
from app.sessions import MAX_SESSIONS, MAX_TURNS, SessionStore


def test_session_history_caps_turns_and_evicts_least_recent_session():
    sessions = SessionStore()
    recent = "recent"
    turns = [Turn(f"Question {number}", f"Answer {number}") for number in range(MAX_TURNS + 2)]
    sessions.remember(recent, turns[0])
    for number in range(MAX_SESSIONS - 1):
        sessions.remember(f"session-{number}", turns[0])
    for turn in turns[1:]:
        sessions.remember(recent, turn)
    sessions.remember("new", turns[0])

    assert sessions.history(recent) == tuple(turns[-MAX_TURNS:])
    assert sessions.history("session-0") == ()
    assert sessions.history("session-1") == (turns[0],)
    assert sessions.history("new") == (turns[0],)
