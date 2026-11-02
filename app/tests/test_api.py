import asyncio
import json
import unittest
from unittest.mock import patch

import httpx
import main

SOURCES = [{"reference": "Phil 1:21-25", "text": "Christus ist mein Leben.", "score": .5}]


class Upstream:
    def __init__(self, chunks=None, error=None):
        self.chunks = chunks or []
        self.error = error
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.closed = True

    def stream(self, *args, **kwargs):
        return self

    def raise_for_status(self):
        if self.error:
            raise self.error

    async def aiter_lines(self):
        for chunk in self.chunks:
            yield json.dumps(chunk)


class StreamTests(unittest.IsolatedAsyncioTestCase):
    async def collect(self):
        response = await main.ask_stream(main.Question(question="Was gibt Hoffnung?"))
        return [json.loads(line) async for line in response.body_iterator]

    async def test_unicode_sources_metrics_and_truncation(self):
        upstream = Upstream([{"message": {"content": "Hoffnung trägt [1]."}},
                             {"done": True, "done_reason": "length", "eval_count": 20,
                              "eval_duration": 1_000_000_000}])
        with patch.object(main, "retrieve", return_value=SOURCES), patch.object(main.httpx, "AsyncClient", return_value=upstream):
            events = await self.collect()
        self.assertEqual(next(e for e in events if e['type'] == 'sources')['sources'], SOURCES)
        self.assertEqual(next(e for e in events if e['type'] == 'token')['text'], 'Hoffnung trägt [1].')
        self.assertTrue(events[-1]['metrics']['truncated'])
        self.assertEqual(events[-1]['metrics']['tokens_per_second'], 20)
        self.assertTrue(upstream.closed)

    async def test_timeout_becomes_stream_error_and_closes_upstream(self):
        upstream = Upstream(error=httpx.ReadTimeout('timeout'))
        with patch.object(main, "retrieve", return_value=SOURCES), patch.object(main.httpx, "AsyncClient", return_value=upstream):
            events = await self.collect()
        self.assertEqual(events[-1]['type'], 'error')
        self.assertIn('lange', events[-1]['message'])
        self.assertTrue(upstream.closed)

    async def test_missing_done_is_not_success(self):
        upstream = Upstream([{"message": {"content": "Unvollständig"}}])
        with patch.object(main, "retrieve", return_value=SOURCES), patch.object(main.httpx, "AsyncClient", return_value=upstream):
            events = await self.collect()
        self.assertEqual(events[-1]['type'], 'error')

    async def test_cancellation_closes_generation(self):
        upstream = Upstream([{"message": {"content": "Ein Anfang"}}, {"done": True}])
        with patch.object(main, "retrieve", return_value=SOURCES), patch.object(main.httpx, "AsyncClient", return_value=upstream):
            response = await main.ask_stream(main.Question(question="Hoffnung?"))
            async for line in response.body_iterator:
                if json.loads(line)['type'] == 'token':
                    break
            with self.assertRaises(asyncio.CancelledError):
                await response.body_iterator.athrow(asyncio.CancelledError())
        self.assertTrue(upstream.closed)

    async def test_no_sources_skips_generation(self):
        with patch.object(main, "retrieve", return_value=[]), patch.object(main.httpx, "AsyncClient") as client:
            events = await self.collect()
        client.assert_not_called()
        self.assertEqual(events[-1]['type'], 'done')

    async def test_invalid_inputs_rejected_before_work(self):
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
            with patch.object(main, 'retrieve') as retrieve:
                for data in [{'question': '   '}, {'question': 'x', 'top_k': 99}, {'question': 'x' * 2001}]:
                    response = await client.post('/ask/stream', json=data)
                    self.assertEqual(response.status_code, 422)
                retrieve.assert_not_called()


if __name__ == '__main__':
    unittest.main()
