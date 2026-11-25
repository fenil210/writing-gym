#!/usr/bin/env python3
"""Start, inspect, or stop only this user's local Writing Gym bridge."""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import webbrowser

import bridge


def running():
    try:
        bridge.request('GET', '/api/state')
        return json.loads((bridge.HOME / 'session.json').read_text())
    except (OSError, ValueError, urllib.error.URLError):
        return None


def start(open_browser, port):
    session = running()
    reused = session is not None
    if not session:
        old_token = None
        try:
            old_token = json.loads((bridge.HOME / 'session.json').read_text()).get('token')
        except (OSError, ValueError):
            pass
        child = subprocess.Popen([sys.executable, str(bridge.ROOT / 'bridge.py'), 'serve', '--port', str(port), '--quiet'],
                                 cwd=bridge.ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, start_new_session=True)
        for _ in range(100):
            session = running()
            if session and session.get('token') != old_token:
                break
            if child.poll() is not None:
                break
            time.sleep(0.05)
        if not session or session.get('token') == old_token:
            raise RuntimeError('Could not start the local bridge. Check that this data directory is not in use.')
    try:
        bridge.request('POST', '/api/arm-pair', {})
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise RuntimeError('An older bridge is running. Stop its foreground process with Ctrl-C, then run start again.')
        raise
    url = 'http://127.0.0.1:%d/' % session['port']
    print(('Reusing' if reused else 'Started') + ' the private local bridge.')
    opened = False
    if open_browser and (sys.platform in ('darwin', 'win32') or os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')):
        opened = webbrowser.open(url, new=2)
    print(('Opened ' if opened else 'Open on this computer: ') + url)
    print('Click “Pair this browser”. The pairing secret is not included in this link.')
    print('Keep an agent session active to react to feedback; otherwise feedback waits in the local queue.')
    return 0


def main():
    if sys.version_info < (3, 9):
        sys.exit('Python 3.9 or newer is required.')
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    launch = commands.add_parser('start', help='Start or reuse the bridge and enable browser pairing')
    launch.add_argument('--no-browser', action='store_true', help='Print a non-secret local URL')
    launch.add_argument('--port', type=int, default=8765, help='Stable loopback port for browser data (default: 8765)')
    commands.add_parser('status', help='Check whether this local bridge is running')
    commands.add_parser('stop', help='Stop this local bridge without deleting data')
    args = parser.parse_args()
    if args.command == 'start':
        return start(not args.no_browser, args.port)
    session = running()
    if args.command == 'status':
        print('Writing Gym bridge is ' + ('running on 127.0.0.1:%d.' % session['port'] if session else 'not running.'))
    elif session:
        try:
            bridge.request('POST', '/api/shutdown', {})
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise RuntimeError('An older bridge is running. Stop its foreground process with Ctrl-C; no other process was changed.')
            raise
        for _ in range(100):
            if not running():
                break
            time.sleep(0.05)
        else:
            raise RuntimeError('The stop request was sent, but the bridge is still responding.')
        print('Stopped Writing Gym. Private data was retained.')
    else:
        print('Writing Gym bridge is not running.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, RuntimeError, urllib.error.URLError) as error:
        sys.exit(str(error))
