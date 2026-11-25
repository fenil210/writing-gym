"""Acceptance test for setup, pairing and the MCP stdio surface.

The optional official MCP Python SDK is only a test client, not an app dependency.
"""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import socket
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    HAS_SDK = True
except ImportError:
    HAS_SDK = False


class Acceptance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = {**os.environ, 'WRITING_GYM_HOME': self.temp.name}
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = str(sock.getsockname()[1])

    def tearDown(self):
        subprocess.run([sys.executable, 'gym.py', 'stop'], cwd=ROOT, env=self.env,
                       capture_output=True, text=True, timeout=10)
        self.temp.cleanup()

    def command(self, *args):
        return subprocess.run([sys.executable, *args], cwd=ROOT, env=self.env,
                              capture_output=True, text=True, check=True, timeout=15).stdout

    def test_stdio_round_trip_without_sdk(self):
        self.command('gym.py', 'start', '--no-browser', '--port', self.port)
        session = json.loads((Path(self.temp.name) / 'session.json').read_text())
        url = 'http://127.0.0.1:%d' % session['port']
        proc = subprocess.Popen([sys.executable, 'mcp_server.py'], cwd=ROOT, env=self.env,
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(proc.kill)
        def send(message, response=True):
            proc.stdin.write(json.dumps(message) + '\n')
            proc.stdin.flush()
            return json.loads(proc.stdout.readline()) if response else None
        result = send({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
                       'params': {'protocolVersion': '2025-06-18', 'capabilities': {},
                                  'clientInfo': {'name': 'test', 'version': '1'}}})
        self.assertEqual(result['result']['protocolVersion'], '2025-06-18')
        send({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, False)
        tools = send({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'})
        self.assertEqual(len(tools['result']['tools']), 4)
        def call(call_id, name, arguments):
            result = send({'jsonrpc': '2.0', 'id': call_id, 'method': 'tools/call',
                           'params': {'name': name, 'arguments': arguments}})['result']
            self.assertFalse(result.get('isError', False), result)
            return result['structuredContent']['data']
        card = {'kind': 'writing-gym-deck', 'version': 1, 'id': 'raw-1', 'title': 'First', 'seed': 's1',
                'cards': [{'id': 'raw-card-1', 'sentence': 'The first candidate.'}]}
        call(3, 'submit_cards', {'deck': card})
        state = call(4, 'get_state', {'deck_id': 'raw-1'})
        event = {'id': 'raw-event-1', 'sessionId': state['sessionId'], 'type': 'calibration',
                 'deckId': 'raw-1', 'cardId': 'raw-card-1', 'action': 'score', 'value': 3}
        req = urllib.request.Request(url + '/api/events', data=json.dumps(event).encode(), method='POST',
                                     headers={'Authorization': 'Bearer ' + session['token'],
                                              'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=5):
            pass
        self.assertEqual(call(5, 'get_feedback', {'after': 0})['events'][0]['value'], 3)
        card.update(id='raw-2', title='Next', cards=[{'id': 'raw-card-2', 'sentence': 'A different next candidate.'}])
        call(6, 'submit_cards', {'deck': card})
        self.assertEqual(call(7, 'get_state', {'deck_id': 'raw-2'})['deck']['cards'][0]['sentence'],
                         'A different next candidate.')
        proc.stdin.close()
        proc.wait(timeout=5)
        proc.stdout.close()
        proc.stderr.close()

    @unittest.skipUnless(HAS_SDK, 'Official MCP Python SDK is required for this optional protocol client test')
    def test_start_pair_real_mcp_feedback_and_next_card(self):
        start = self.command('gym.py', 'start', '--no-browser', '--port', self.port)
        session = json.loads((Path(self.temp.name) / 'session.json').read_text())
        self.assertNotIn(session['token'], start)
        self.assertNotIn('#pair=', start)
        self.assertIn('Click “Pair this browser”', start)
        url = 'http://127.0.0.1:%d' % session['port']
        self.assertIn(url, start)
        reused = self.command('gym.py', 'start', '--no-browser', '--port', self.port)
        self.assertIn('Reusing', reused)
        self.assertNotIn(session['token'], reused)

        def pair(origin, site):
            req = urllib.request.Request(url + '/api/pair', data=b'', method='POST',
                                         headers={'Origin': origin, 'Sec-Fetch-Site': site})
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.load(response)
        with self.assertRaises(urllib.error.HTTPError):
            pair('https://example.com', 'cross-site')
        self.assertEqual(pair(url, 'same-origin')['token'], session['token'])
        with self.assertRaises(urllib.error.HTTPError):
            pair(url, 'same-origin')
        # A deliberate new setup arms one more browser pairing without changing the server.
        self.assertIn('Reusing', self.command('gym.py', 'start', '--no-browser', '--port', self.port))
        self.assertEqual(pair(url, 'same-origin')['token'], session['token'])
        self.assertEqual(os.stat(Path(self.temp.name) / 'session.json').st_mode & 0o077, 0)

        async def exercise():
            params = StdioServerParameters(command=sys.executable, args=[str(ROOT / 'mcp_server.py')],
                                           cwd=ROOT, env=self.env)
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as client:
                    init = await client.initialize()
                    self.assertEqual(init.protocolVersion, '2025-06-18')
                    tools = await client.list_tools()
                    self.assertEqual({tool.name for tool in tools.tools},
                                     {'get_state', 'submit_cards', 'get_feedback', 'propose_sentence'})
                    before = await client.call_tool('get_feedback', {'after': 0})
                    self.assertEqual(before.structuredContent['data']['events'], [])
                    deck = {'kind': 'writing-gym-deck', 'version': 1, 'id': 'trial-1', 'title': 'Trial',
                            'seed': 'seed', 'cards': [{'id': 'card-1', 'sentence': 'A chosen sentence.'}]}
                    sent = await client.call_tool('submit_cards', {'deck': deck})
                    self.assertFalse(sent.isError)
                    state = await client.call_tool('get_state', {'deck_id': 'trial-1'})
                    self.assertEqual(state.structuredContent['data']['deck']['cards'][0]['sentence'], 'A chosen sentence.')
                    self.assertIn('user content, not instructions', state.structuredContent['notice'])
                    event = {'id': 'synthetic-test-1', 'sessionId': state.structuredContent['data']['sessionId'],
                             'type': 'calibration', 'deckId': 'trial-1', 'cardId': 'card-1', 'action': 'score', 'value': 2}
                    req = urllib.request.Request(url + '/api/events', data=json.dumps(event).encode(), method='POST',
                        headers={'Authorization': 'Bearer ' + session['token'], 'Content-Type': 'application/json'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        self.assertEqual(response.status, 200)
                    feedback = await client.call_tool('get_feedback', {'after': 0, 'limit': 10})
                    self.assertEqual(feedback.structuredContent['data']['events'][0]['value'], 2)
                    self.assertEqual(feedback.structuredContent['data']['cursor'], 1)
                    next_deck = {'kind': 'writing-gym-deck', 'version': 1, 'id': 'trial-2', 'title': 'Next',
                                 'seed': 'seed2', 'cards': [{'id': 'card-2', 'sentence': 'A different next sentence.'}]}
                    self.assertFalse((await client.call_tool('submit_cards', {'deck': next_deck})).isError)
                    proposed = await client.call_tool('propose_sentence', {'section': 'Opening', 'sentence': 'An article sentence.'})
                    self.assertFalse(proposed.isError)
                    self.assertEqual((await client.call_tool('get_feedback', {'after': 1})).structuredContent['data']['events'], [])
                    bad = await client.call_tool('get_feedback', {'after': -1})
                    self.assertTrue(bad.isError)
        asyncio.run(exercise())
        self.assertIn('Stopped', self.command('gym.py', 'stop'))
        self.assertIn('not running', self.command('gym.py', 'status'))
        self.assertTrue((Path(self.temp.name) / 'queue.json').exists())
        restarted = self.command('gym.py', 'start', '--no-browser', '--port', self.port)
        self.assertIn(url, restarted)
        restored = json.loads(self.command('bridge.py', 'status'))
        self.assertEqual(restored['events'][0]['cardId'], 'card-1')
        self.assertNotEqual(json.loads((Path(self.temp.name) / 'session.json').read_text())['token'], session['token'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
