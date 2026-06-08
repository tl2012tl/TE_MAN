from __future__ import annotations

import os
import runpy
import sys


_SOURCE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "source_py_backup",
    "TE_MAN_Chat.py",
)
_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_SOURCE_DIR = os.path.dirname(_SOURCE_PATH)
for _path in (_PLUGIN_DIR, _SOURCE_DIR):
    if _path and _path not in sys.path:
        sys.path.insert(0, _path)

_namespace = runpy.run_path(_SOURCE_PATH)

NODE_CLASS_MAPPINGS = _namespace.get("NODE_CLASS_MAPPINGS", {})
NODE_DISPLAY_NAME_MAPPINGS = _namespace.get("NODE_DISPLAY_NAME_MAPPINGS", {})
