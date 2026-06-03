import os
import re

dir_path = r"c:\Users\usher\Capstone\ashcol-service-api"
pattern = re.compile(r'@PreAuthorize\s*\(\s*"([^"]+)"\s*\)')

print("--- PreAuthorize annotations without ADMIN/admin ---")
for root, dirs, files in os.walk(dir_path):
    for file in files:
        if file.endswith(".java"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                matches = pattern.finditer(content)
                for m in matches:
                    expr = m.group(1)
                    if "ADMIN" not in expr.upper():
                        # print file relative path and match
                        rel_path = os.path.relpath(path, dir_path)
                        print(f"{rel_path}: {m.group(0)}")
