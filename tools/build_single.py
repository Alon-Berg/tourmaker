"""Builds tourmaker.html: index.html with app.css and all scripts inlined, one file that works by double-click.

usage: python tools/build_single.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    def css(m):
        return "<style>\n" + (ROOT / m.group(1)).read_text(encoding="utf-8").strip() + "\n</style>"

    def js(m):
        src = (ROOT / m.group(1)).read_text(encoding="utf-8").strip()
        assert "</script" not in src, m.group(1)
        return "<script>\n" + src + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    out = ROOT / "tourmaker.html"
    out.write_text(html, encoding="utf-8", newline="\n")
    print("wrote %s (%d bytes)" % (out.name, out.stat().st_size))


if __name__ == "__main__":
    main()
