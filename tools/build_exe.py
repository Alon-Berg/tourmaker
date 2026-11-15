"""Builds dist/tourmaker.exe: the single-file page in its own window (pywebview + Edge WebView2), one exe, no console.

usage: python tools/build_exe.py [--work DIR] [--low] [--no-test]
  --work DIR   scratch folder for PyInstaller (default: <temp>/htm-exe-build; it is emptied first)
  --low        run at below-normal priority (the build uses a lot of CPU for a minute)
  --no-test    skip the final `tourmaker.exe --selftest`
needs: Windows 10/11, Python 3.10+ and `pip install pywebview pyinstaller` (and Pillow for the icon; without it the exe has the default icon)
"""
import argparse
import ctypes
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = 'tourmaker'


def make_icon(path):
    """A knockout bracket (4 players -> final) in white on dark grey."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    s = 256
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=44, fill=(43, 43, 43, 255))
    w, c = 14, (240, 240, 240, 255)
    for y in (60, 108, 156, 204):
        d.line((34, y, 104, y), fill=c, width=w)
    d.line((104, 60 - w // 2 + 1, 104, 108 + w // 2 - 1), fill=c, width=w)
    d.line((104, 156 - w // 2 + 1, 104, 204 + w // 2 - 1), fill=c, width=w)
    for y in (84, 180):
        d.line((104, y, 168, y), fill=c, width=w)
    d.line((168, 84 - w // 2 + 1, 168, 180 + w // 2 - 1), fill=c, width=w)
    d.line((168, 132, 224, 132), fill=c, width=w)
    im.save(path, format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work')
    ap.add_argument('--low', action='store_true')
    ap.add_argument('--no-test', action='store_true')
    args = ap.parse_args()
    if args.low:
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)    # BELOW_NORMAL, inherited by children

    subprocess.check_call([sys.executable, str(ROOT / 'tools' / 'build_single.py')])                  # make sure the single-file page is current
    work = Path(args.work) if args.work else Path(tempfile.gettempdir()) / 'htm-exe-build'
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    cmd = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--noconsole', '--name', NAME,
           '--distpath', str(work / 'dist'), '--workpath', str(work / 'build'), '--specpath', str(work),
           '--add-data', '%s;.' % (ROOT / 'tourmaker.html')]
    icon = make_icon(work / 'icon.ico')
    if icon:
        cmd += ['--icon', str(icon)]
    cmd.append(str(ROOT / 'launcher.py'))
    subprocess.check_call(cmd, cwd=str(work))

    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    exe = out / (NAME + '.exe')
    shutil.copy2(work / 'dist' / (NAME + '.exe'), exe)
    print('built %s (%.1f MB)' % (exe, exe.stat().st_size / 1e6))

    if not args.no_test:
        result = work / 'selftest.json'
        p = subprocess.run([str(exe), '--selftest', str(result)], timeout=300)
        res = json.loads(result.read_text(encoding='utf-8')) if result.exists() else {'ok': False, 'error': 'no result file'}
        print('selftest exit code %d:' % p.returncode, json.dumps(res.get('checks', res)))
        if p.returncode != 0 or not res.get('ok'):
            sys.exit('selftest FAILED: ' + json.dumps(res))


if __name__ == '__main__':
    main()
