#!/usr/bin/env python3
"""Require a real, uncached speech test pass for the supplied source snapshot."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
(root / "bin").mkdir(exist_ok=True)
subprocess.run([
    "swiftc", "-O", "build/darwin/transcribe/main.swift",
    "-o", "bin/obails-transcribe",
], cwd=root, check=True)
test_name = "TestTranscribeService_Transcribe_RealPipeline"
result = subprocess.run([
    "go", "test", "./services", "-run", f"^{test_name}$", "-count=1", "-json",
], cwd=root, text=True, stdout=subprocess.PIPE)
passed = False
for line in result.stdout.splitlines():
    event = json.loads(line)
    if "Output" in event:
        print(event["Output"], end="")
    if event.get("Test") == test_name and event.get("Action") == "pass":
        passed = True
if result.returncode or not passed:
    sys.exit("Push blocked: the real speech test must PASS; missing or skipped tests do not count.")
