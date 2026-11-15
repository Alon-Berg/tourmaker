"""Tourmaker as a Windows app: shows tourmaker.html in its own window (Microsoft Edge WebView2).

The page keeps its tournaments in the storage of that window. This launcher gives the window a fixed storage folder
(%LOCALAPPDATA%\\HumanTournamentMaker\\webview), so the tournaments are still there at the next start, and lets the page's
save buttons (JSON file, CSV) download through a normal "Save as" dialog.

usage:  python launcher.py                    start the app (or run the exe built by tools/build_exe.py)
        launcher.py --selftest [RESULT.json]  hidden window: runs a few checks in the page, writes the result as JSON
                                              (default %TEMP%\\htm-selftest.json), exit code 0 = everything passed
"""
import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

import webview

TITLE = 'Tourmaker'
PAGE = 'tourmaker.html'

webview.settings['ALLOW_DOWNLOADS'] = True        # the page saves files with <a download>; pywebview then asks where to save


def page_url():
    here = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))     # PyInstaller unpacks the page next to the script
    p = os.path.join(here, PAGE)
    if not os.path.isfile(p):
        raise FileNotFoundError(p)
    return Path(p).as_uri()


def storage_dir():
    base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    d = os.path.join(base, 'HumanTournamentMaker', 'webview')
    os.makedirs(d, exist_ok=True)
    return d


def run_app():
    webview.create_window(TITLE, url=page_url(), width=1280, height=820, min_size=(900, 600), text_select=True)
    webview.start(private_mode=False, storage_path=storage_dir())      # private_mode=False + fixed folder = localStorage survives restarts


# ----------------------------------------------------------------------------------------------------- --selftest
CHECKS_JS = r"""
(function () {
  const r = {};
  r.title = document.title;
  r.protocol = location.protocol;
  r.engine = typeof HTM === 'object' && ['newTournament', 'addPlayer', 'sortByRating', 'pairSwiss', 'applySwissRound', 'exportJSON'].every(k => typeof HTM[k] === 'function');
  r.ui = typeof UI === 'object' && typeof UI.download === 'function';
  r.rendered = document.querySelectorAll('button').length > 0;
  try {
    const T = HTM.newTournament({ name: 'Selftest', format: 'swiss', rounds: 3 });
    for (let i = 0; i < 8; i++) HTM.addPlayer(T, { name: 'P' + (i + 1), rating: 2000 - i * 10 });
    HTM.sortByRating(T);
    const res = HTM.pairSwiss(T, 1);
    r.pair_error = res.error || null;
    if (!res.error) HTM.applySwissRound(T, 1, res);
    r.round1_games = T.rounds.length ? T.rounds[0].games.length : 0;
    r.export_json = HTM.exportJSON(T);
  } catch (e) { r.exception = String((e && e.stack) || e); }
  try {
    const k = 'htm.selftest.roundtrip';
    localStorage.setItem(k, 'x'); r.ls_roundtrip = localStorage.getItem(k) === 'x'; localStorage.removeItem(k);
    const m = 'htm.selftest.marker';                       // alternates between runs: set on one run, seen (and removed) on the next
    r.ls_marker_from_previous_run = localStorage.getItem(m) !== null;
    if (r.ls_marker_from_previous_run) localStorage.removeItem(m); else localStorage.setItem(m, new Date().toISOString());
  } catch (e) { r.ls_error = String(e); }
  return JSON.stringify(r);
})()
"""


def selftest(result_path):
    res = {'ok': False, 'checks': {}}
    dl_dir = tempfile.mkdtemp(prefix='htm-selftest-')
    code = {'value': 1}

    def finish(window):
        res['ok'] = all(res['checks'].values()) and bool(res['checks'])
        code['value'] = 0 if res['ok'] else 1
        with open(result_path, 'w', encoding='utf-8') as f:
            json.dump(res, f, indent=1)
        try:
            window.destroy()
        finally:
            threading.Timer(10, lambda: os._exit(code['value'])).start()      # if closing the window hangs

    def work(window):
        try:
            if not window.events.loaded.wait(60):
                res['error'] = 'page did not load within 60 s'
                res['checks']['page_loaded'] = False
                return
            r = json.loads(window.evaluate_js(CHECKS_JS))
            export_json = r.pop('export_json', '')
            res['page'] = r
            c = res['checks']
            c['page_loaded'] = True
            c['title'] = (r.get('title') or '').endswith(TITLE)
            c['file_url'] = r.get('protocol') == 'file:'
            c['engine_functions'] = bool(r.get('engine')) and bool(r.get('ui'))
            c['ui_rendered'] = bool(r.get('rendered'))
            c['swiss_round_1'] = r.get('pair_error') is None and r.get('round1_games') == 4 and 'exception' not in r
            c['localstorage_roundtrip'] = bool(r.get('ls_roundtrip'))
            c['downloads_enabled'] = bool(webview.settings['ALLOW_DOWNLOADS'])
            # the page's own save function (a blob link with a download name) must end up as a file; the Save dialog is replaced by a fixed folder
            window.evaluate_js("UI.download('htm-selftest.json', %s, 'application/json'); true" % json.dumps(export_json))
            target = os.path.join(dl_dir, 'htm-selftest.json')
            deadline = time.time() + 30
            while time.time() < deadline and not (os.path.isfile(target) and os.path.getsize(target) >= len(export_json.encode('utf-8'))):
                time.sleep(0.2)
            res['download_file'] = target if os.path.isfile(target) else None
            c['download_saved_file'] = os.path.isfile(target) and open(target, encoding='utf-8').read() == export_json
        except Exception as e:                                       # noqa: BLE001
            res['error'] = repr(e)
            res['checks']['no_exception'] = False
        finally:
            finish(window)

    def watchdog():
        time.sleep(150)
        res['error'] = 'selftest timed out'
        with open(result_path, 'w', encoding='utf-8') as f:
            json.dump(res, f, indent=1)
        os._exit(2)

    threading.Thread(target=watchdog, daemon=True).start()
    from webview.platforms import edgechromium                       # test only: save the download into dl_dir instead of asking
    edgechromium.EdgeChrome.on_download_starting = lambda self, sender, args: setattr(
        args, 'ResultFilePath', os.path.join(dl_dir, os.path.basename(str(args.ResultFilePath))))
    window = webview.create_window(TITLE, url=page_url(), width=1100, height=760, hidden=True)
    webview.start(work, window, private_mode=False, storage_path=storage_dir())
    sys.exit(code['value'])


def main():
    if '--selftest' in sys.argv:
        i = sys.argv.index('--selftest')
        out = sys.argv[i + 1] if len(sys.argv) > i + 1 else os.path.join(tempfile.gettempdir(), 'htm-selftest.json')
        selftest(out)
    else:
        run_app()


if __name__ == '__main__':
    main()
