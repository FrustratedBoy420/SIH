"""Render a .dc.html artboard to PNG via headless Chrome (preview only).
Strips the DC wrapper/runtime, keeps <helmet> styles, renders the static markup.
Usage: python _preview.py Main.dc.html 1280 820
"""
import re, subprocess, sys, pathlib, html

f = pathlib.Path(sys.argv[1]).resolve(); W = sys.argv[2] if len(sys.argv) > 2 else "1280"; H = sys.argv[3] if len(sys.argv) > 3 else "820"
src = f.read_text()
helmet = re.search(r"<helmet>(.*?)</helmet>", src, re.S)
head = helmet.group(1) if helmet else ""
# body = everything between </helmet> and the <script data-dc-script
body = re.search(r"</helmet>(.*?)<script data-dc-script", src, re.S).group(1)
out_html = f.with_suffix(".preview.html")
out_html.write_text(f"<!doctype html><html><head><meta charset='utf-8'>{head}</head><body>{body}</body></html>")
png = f.with_name(f.stem + ".png")
subprocess.run(["google-chrome", "--headless", "--no-sandbox", "--disable-gpu",
                "--hide-scrollbars", "--force-device-scale-factor=2",
                f"--window-size={W},{H}", "--default-background-color=00000000",
                f"--screenshot={png}", out_html.as_uri()], check=True,
               capture_output=True)
out_html.unlink(missing_ok=True)
print(png)
