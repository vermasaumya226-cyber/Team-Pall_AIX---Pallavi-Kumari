"""
inject_notifications.py
Injects <script src="db.js"></script> and <script src="notifications.js"></script>
before </body> in every HTML file that doesn't already have it.
"""
import os, re

FOLDER = r"C:\Users\LOQ\.gemini\antigravity\scratch\study-planner-agent"
HTML_FILES = [
    "index.html",
    "attendance.html",
    "attendance-history.html",
    "register.html",
    "summarizer.html",
    "planner.html",
    "studio.html",
    "dashboard.html",
    "analytics.html",
    "profile.html",
    "settings.html",
]

INJECT = '\n  <script src="db.js"></script>\n  <script src="notifications.js"></script>\n</body>'

for fname in HTML_FILES:
    path = os.path.join(FOLDER, fname)
    if not os.path.exists(path):
        print(f"SKIP (not found): {fname}")
        continue

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if "notifications.js" in content:
        print(f"ALREADY OK: {fname}")
        continue

    # Make sure db.js is loaded before notifications.js
    # Replace last </body> with injection
    if "</body>" not in content:
        print(f"NO </body>: {fname}")
        continue

    # Insert before the LAST </body>
    idx = content.rfind("</body>")
    new_content = content[:idx] + '\n  <script src="notifications.js"></script>\n</body>'

    # If db.js is not in file at all, also add it
    if "db.js" not in new_content:
        idx2 = new_content.rfind("</body>")
        new_content = new_content[:idx2] + '\n  <script src="db.js"></script>\n  <script src="notifications.js"></script>\n</body>'

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"INJECTED: {fname}")

print("\nDone.")
