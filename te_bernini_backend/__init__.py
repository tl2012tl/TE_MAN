"""Private Bernini backend bundled by TE_image.

This package intentionally does not register ComfyUI nodes. The public node is
TE_Bernini_R_Generator.py; backend modules are imported lazily by that wrapper.
"""

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
