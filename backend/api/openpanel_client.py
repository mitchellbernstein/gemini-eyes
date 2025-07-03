import os
import time
from typing import Dict, Any, List, Optional

import httpx

class OpenPanel:
    """Minimal Python client for sending events to OpenPanel via its HTTP ingest API.

    This wrapper only implements the two calls used by ``analytics.py`` (``track`` and
    ``identify``).  It keeps zero state on the server; each call is a standalone POST.
    """

    _DEFAULT_ENDPOINT = os.getenv("OPENPANEL_INGEST_URL", "https://api.openpanel.dev/ingest")

    def __init__(self, client_id: str, client_secret: str, endpoint: str = None, timeout: float = 2.0):
        self.client_id = client_id
        self.client_secret = client_secret
        self.endpoint = endpoint or self._DEFAULT_ENDPOINT
        self._client = httpx.Client(timeout=timeout)

    # ---------------------------------------------------------------------
    # Public helpers
    # ---------------------------------------------------------------------
    def track(self, event: str, properties: Dict[str, Any] | None = None, user_id: str | None = None):
        """Send a single event.

        If *user_id* is omitted the event will be stored as anonymous on OpenPanel's side.
        """
        event_payload: Dict[str, Any] = {
            "event": event,
            "timestamp": int(time.time() * 1000),  # epoch millis in case OP uses it
            "properties": properties or {},
        }
        if user_id:
            event_payload["user_id"] = user_id

        self._post_bulk([event_payload])

    def identify(self, user_id: str, traits: Dict[str, Any] | None = None):
        """Upsert a user profile.

        OpenPanel treats an "identify" call as just another event with a reserved name.
        """
        self._post_bulk([
            {
                "event": "$identify",
                "user_id": user_id,
                "timestamp": int(time.time() * 1000),
                "properties": traits or {},
            }
        ])

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _post_bulk(self, events: List[Dict[str, Any]]):
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "events": events,
        }
        try:
            response = self._client.post(self.endpoint, json=payload)
            response.raise_for_status()
        except Exception as exc:
            # We swallow the exception rather than crashing the request pipeline.
            # Real deployments could swap this for proper logging.
            print(f"OpenPanel request failed: {exc}") 