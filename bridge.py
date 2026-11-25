#!/usr/bin/env python3
"""Private loopback queue for a locally running Writing Gym and writing agent."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
HOME = Path(os.environ.get('WRITING_GYM_HOME', Path.home() / '.writing-gym')).expanduser()
MAX_BODY = 250_000
ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$')
FILES = {'/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css',
         '/core.js': 'core.js', '/fixtures.js': 'fixtures.js', '/app.js': 'app.js',
         '/bridge-client.js': 'bridge-client.js'}
TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.js': 'text/javascript; charset=utf-8'}


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def validate_deck(deck):
    if not isinstance(deck, dict) or deck.get('kind') != 'writing-gym-deck' or deck.get('version') != 1:
        raise ValueError('Expected a version 1 Writing Gym deck')
    for key in ('id', 'title', 'seed'):
        if not isinstance(deck.get(key), str) or not deck[key].strip() or len(deck[key]) > 100:
            raise ValueError('Invalid deck ' + key)
    if not ID.fullmatch(deck['id']) or deck['id'] in ('constructor', 'prototype'):
        raise ValueError('Invalid deck ID')
    cards = deck.get('cards')
    if not isinstance(cards, list) or not 1 <= len(cards) <= 100:
        raise ValueError('Deck requires 1–100 cards')
    ids = set()
    for card in cards:
        if not isinstance(card, dict) or not isinstance(card.get('id'), str) or not ID.fullmatch(card['id']):
            raise ValueError('Invalid card ID')
        if card['id'] in ids or card['id'] in ('constructor', 'prototype'):
            raise ValueError('Duplicate or reserved card ID')
        ids.add(card['id'])
        if not isinstance(card.get('sentence'), str) or not card['sentence'].strip() or len(card['sentence']) > 2000:
            raise ValueError('Invalid card sentence')
        for field, limit in [('context', 150), ('pairId', 100), ('hypothesis', 500), ('variant', 200), ('topic', 200)]:
            if field in card and (not isinstance(card[field], str) or len(card[field]) > limit):
                raise ValueError('Invalid card ' + field)


class Bridge:
    def __init__(self):
        self.path = HOME / 'queue.json'
        self.condition = threading.Condition()
        self.watchers = 0
        self.pairing_armed = False
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {
            'sessionId': secrets.token_hex(16), 'decks': [], 'proposals': [], 'events': [], 'context': {}}

    def save(self):
        atomic_json(self.path, self.data)


class Handler(BaseHTTPRequestHandler):
    server_version = 'WritingGym/1'

    def log_message(self, *args):
        pass  # URLs and private material never enter the server log.

    def send(self, status, data, content_type='application/json; charset=utf-8'):
        body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def allowed(self, api=False):
        if self.client_address[0] != '127.0.0.1' or self.headers.get('Host') != self.server.host:
            return False
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.server.host:
            return False
        if api and not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + self.server.token):
            return False
        return True

    def do_GET(self):
        if not self.allowed(self.path.startswith('/api/')):
            return self.send(403, {'error': 'Not paired or invalid local origin'})
        if self.path in FILES:
            target = ROOT / FILES[self.path]
            return self.send(200, target.read_bytes(), TYPES[target.suffix])
        bridge = self.server.bridge
        with bridge.condition:
            if self.path == '/api/state':
                return self.send(200, {'sessionId': bridge.data['sessionId'], 'decks': bridge.data['decks'],
                                       'proposals': bridge.data['proposals'], 'listening': bridge.watchers > 0})
            if self.path == '/api/status':
                return self.send(200, bridge.data)
            parsed = urlsplit(self.path)
            query = parse_qs(parsed.query)
            if parsed.path == '/api/agent-state':
                deck_id = query.get('deck', [''])[0]
                decks = bridge.data['decks']
                selected = next((deck for deck in decks if deck['id'] == deck_id), None) if deck_id else None
                if deck_id and not selected:
                    return self.send(404, {'error': 'Unknown deck'})
                context = bridge.data['context']
                return self.send(200, {'sessionId': bridge.data['sessionId'],
                    'decks': [{'id': d['id'], 'title': d['title'], 'cards': len(d['cards'])} for d in decks[:100]],
                    'moreDecks': len(decks) > 100, 'deck': selected, 'context': context,
                    'eventCount': len(bridge.data['events'])})
            if parsed.path == '/api/feedback':
                try:
                    after = max(0, int(query.get('after', ['0'])[0]))
                    limit = min(100, max(1, int(query.get('limit', ['50'])[0])))
                except ValueError:
                    return self.send(400, {'error': 'Invalid cursor or limit'})
                if after > len(bridge.data['events']):
                    return self.send(400, {'error': 'Cursor is beyond the event log'})
                candidates = bridge.data['events'][after:after + limit]
                events = []
                size = 0
                for event in candidates:
                    item_size = len(json.dumps(event, ensure_ascii=False).encode())
                    if events and size + item_size > 200_000:
                        break
                    events.append(event)
                    size += item_size
                cursor = after + len(events)
                return self.send(200, {'events': events, 'cursor': cursor,
                                       'hasMore': cursor < len(bridge.data['events'])})
            if self.path.startswith('/api/watch?'):
                try:
                    after = max(0, int(self.path.split('after=', 1)[1].split('&', 1)[0]))
                except (ValueError, IndexError):
                    return self.send(400, {'error': 'Invalid event cursor'})
                bridge.watchers += 1
                try:
                    bridge.condition.wait_for(lambda: len(bridge.data['events']) > after, timeout=20)
                    return self.send(200, {'events': bridge.data['events'][after:], 'cursor': len(bridge.data['events'])})
                finally:
                    bridge.watchers -= 1
        return self.send(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path == '/api/pair':
            origin = self.headers.get('Origin')
            if (not self.allowed(False) or origin != 'http://' + self.server.host or
                    self.headers.get('Sec-Fetch-Site') != 'same-origin'):
                return self.send(403, {'error': 'Pairing requires the local app page'})
            with self.server.bridge.condition:
                if not self.server.bridge.pairing_armed:
                    return self.send(403, {'error': 'Run the start command to enable pairing'})
                self.server.bridge.pairing_armed = False
            return self.send(200, {'token': self.server.token})
        if not self.allowed(True):
            return self.send(403, {'error': 'Not paired or invalid local origin'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY:
                raise ValueError('Invalid request size')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Expected an object')
            bridge = self.server.bridge
            with bridge.condition:
                data = bridge.data
                if self.path == '/api/arm-pair':
                    bridge.pairing_armed = True
                elif self.path == '/api/shutdown':
                    threading.Timer(0.1, self.server.shutdown).start()
                elif self.path == '/api/decks':
                    validate_deck(payload)
                    existing = {card['id'] for deck in data['decks'] for card in deck['cards']}
                    if any(deck['id'] == payload['id'] for deck in data['decks']) or any(card['id'] in existing for card in payload['cards']):
                        raise ValueError('Deck or card ID already exists')
                    data['decks'].append(payload)
                elif self.path == '/api/proposals':
                    if not isinstance(payload.get('sentence'), str) or not payload['sentence'].strip() or len(payload['sentence']) > 2000:
                        raise ValueError('Invalid candidate')
                    if not isinstance(payload.get('section'), str) or not payload['section'].strip() or len(payload['section']) > 100:
                        raise ValueError('Invalid section')
                    payload = {'id': secrets.token_hex(16), 'sentence': payload['sentence'], 'section': payload['section']}
                    data['proposals'].append(payload)
                elif self.path == '/api/events':
                    if not isinstance(payload.get('id'), str) or not ID.fullmatch(payload['id']):
                        raise ValueError('Invalid event ID')
                    if payload.get('sessionId') != data['sessionId']:
                        raise ValueError('Wrong session')
                    if not any(event['id'] == payload['id'] for event in data['events']):
                        data['events'].append(payload)
                elif self.path == '/api/context':
                    data['context'] = payload
                else:
                    return self.send(404, {'error': 'Not found'})
                bridge.save()
                bridge.condition.notify_all()
            return self.send(200, {'ok': True})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send(400, {'error': str(error)})


def request(method, path, payload=None, timeout=25):
    session = json.loads((HOME / 'session.json').read_text())
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request('http://127.0.0.1:%s%s' % (session['port'], path), data=data, method=method,
                                 headers={'Authorization': 'Bearer ' + session['token'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve', help='Start private local app and queue')
    serve.add_argument('--port', type=int, default=8765)
    serve.add_argument('--quiet', action='store_true', help=argparse.SUPPRESS)
    enqueue = commands.add_parser('enqueue', help='Send a version 1 deck from file, or - for stdin')
    enqueue.add_argument('file')
    proposal = commands.add_parser('propose', help='Send one Article Lab candidate')
    proposal.add_argument('--section', required=True)
    proposal.add_argument('--sentence', required=True)
    commands.add_parser('status', help='Read private queued decks, article context and feedback')
    watch = commands.add_parser('watch', help='Wait for feedback; Ctrl-C to stop')
    watch.add_argument('--after', type=int, default=0, help='Resume after this event cursor')
    args = parser.parse_args()
    HOME.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(HOME, 0o700)
    os.umask(0o077)
    if args.command == 'serve':
        lock = open(HOME / 'server.lock', 'a+')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit('A Writing Gym bridge is already running for this data directory.')
        bridge = Bridge()
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
        server.daemon_threads = True
        server.host = '127.0.0.1:%d' % server.server_address[1]
        server.token = secrets.token_urlsafe(32)
        server.bridge = bridge
        atomic_json(HOME / 'session.json', {'port': server.server_address[1], 'token': server.token})
        if not args.quiet:
            print('Open this private pairing link in the same computer browser:', flush=True)
            print('http://%s/#pair=%s' % (server.host, server.token), flush=True)
            print('Keep this process running. Data stays in %s.' % HOME, flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
            (HOME / 'session.json').unlink(missing_ok=True)
    elif args.command == 'enqueue':
        data = json.load(sys.stdin if args.file == '-' else open(args.file, encoding='utf-8'))
        validate_deck(data)
        print(json.dumps(request('POST', '/api/decks', data)))
    elif args.command == 'propose':
        print(json.dumps(request('POST', '/api/proposals', {'section': args.section, 'sentence': args.sentence})))
    elif args.command == 'status':
        print(json.dumps(request('GET', '/api/status'), ensure_ascii=False, indent=2))
    elif args.command == 'watch':
        cursor = args.after
        print('Waiting for feedback. Stop with Ctrl-C.', file=sys.stderr, flush=True)
        while True:
            result = request('GET', '/api/watch?after=' + str(cursor))
            for event in result['events']:
                cursor += 1
                print(json.dumps({'cursor': cursor, 'event': event}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, urllib.error.URLError) as error:
        sys.exit(str(error))
