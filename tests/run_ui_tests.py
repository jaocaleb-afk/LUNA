"""Runs every browser test file:  python3 tests/run_ui_tests.py [name ...]

By default the project is served from a throwaway local HTTP server (http://127.0.0.1:<port>), like the real
kiosk. This matters: Chromium does not reliably keep localStorage across reloads for file:// pages.
To test an already-running server instead:  LUNA_URL=http://192.168.1.97:8082 python3 tests/run_ui_tests.py"""
import functools
import http.server
import importlib
import os
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, 'ui'))

from playwright.sync_api import sync_playwright
import helpers

ALL = ['legacy', 'layout', 'idle', 'timer', 'schedules', 'schedule_run', 'voice', 'pin', 'kiosk']


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_local_server():
    handler = functools.partial(QuietHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, 'http://127.0.0.1:%d/index.html' % server.server_address[1]


if __name__ == '__main__':
    wanted = sys.argv[1:] or ALL
    server = None
    if os.environ.get('LUNA_URL'):
        helpers.URL = os.environ['LUNA_URL']
    else:
        server, helpers.URL = start_local_server()
    run = helpers.Run()
    print('Testing', helpers.URL)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name in wanted:
            print('\n--- %s ---' % name)
            importlib.import_module('test_' + name).run(browser, run)
        browser.close()
    if server:
        server.shutdown()
    print('\nconsole errors:', run.errors)
    failed = run.failed()
    print('%d checks, %d failed%s' % (len(run.results), len(failed), ('; ' + '; '.join(failed)) if failed else ''))
    sys.exit(1 if failed or run.errors else 0)
