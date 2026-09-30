import json
import urllib.request
from typing import List, Dict, Any, Optional, Tuple

from src.config import settings

class JevClient:
    """
    Client for TypeSafe Jev API.
    Provides methods for the three core Jev primitives: Choice, Score, and Noul.
    """
    BASE_URL = "https://api.typesafe.ai/v1/jev"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.JEV_API_KEY
        
    def _post(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("JEV_API_KEY is not configured.")
        
        url = f"{self.BASE_URL}/{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode('utf-8'), 
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.URLError as e:
            # Fallback for demonstration when API is not reachable/offline
            print(f"Jev API unreachable ({e}). Returning fallback responses.")
            return self._fallback_response(endpoint, payload)

    def _fallback_response(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Provides offline fallbacks for Jev API."""
        if endpoint == "choice":
            return {"result": payload["options"][0], "confidence": 0.8}
        elif endpoint == "score":
            return {"result": 0.5, "confidence": 0.8}
        elif endpoint == "noul":
            return {"result": True, "confidence": 0.8}
        return {}

    def choice(self, state: str, options: List[str]) -> Tuple[str, float]:
        """Evaluates input against a Choice primitive."""
        payload = {"state": state, "options": options}
        res = self._post("choice", payload)
        return res.get("result", options[0]), res.get("confidence", 0.0)

    def score(self, state: str, scale_min: float = 0.0, scale_max: float = 1.0) -> Tuple[float, float]:
        """Evaluates input against a Score primitive."""
        payload = {"state": state, "min": scale_min, "max": scale_max}
        res = self._post("score", payload)
        return res.get("result", scale_min), res.get("confidence", 0.0)

    def noul(self, state: str, question: str) -> Tuple[bool, float]:
        """Evaluates input against a Noul (Boolean) primitive."""
        payload = {"state": state, "question": question}
        res = self._post("noul", payload)
        return bool(res.get("result", False)), res.get("confidence", 0.0)
