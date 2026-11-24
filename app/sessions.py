from collections import OrderedDict, deque

from app.providers.base import Turn

MAX_SESSIONS = 100
MAX_TURNS = 4


class SessionStore:
    def __init__(self) -> None:
        self._sessions: OrderedDict[str, deque[Turn]] = OrderedDict()

    def history(self, session_id: str) -> tuple[Turn, ...]:
        return tuple(self._sessions.get(session_id, ()))

    def remember(self, session_id: str, turn: Turn) -> None:
        turns = self._sessions.get(session_id)
        if turns is None:
            turns = deque(maxlen=MAX_TURNS)
            self._sessions[session_id] = turns

        turns.append(turn)
        self._sessions.move_to_end(session_id)
        if len(self._sessions) > MAX_SESSIONS:
            self._sessions.popitem(last=False)
