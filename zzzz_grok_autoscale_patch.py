from __future__ import annotations

from .logger import logger
from .Grok_Safe_PY import (
    BananaGeminiAsyncSafePyNode,
    BananaGeminiImageSafePyNode,
    BananaGrokImageSafePyNode,
    BananaGrokVideoSafePyNode,
    BananaSora2VideoSafePyNode,
    BananaTEVeoVideoSafePyNode,
    TEHappyHVideoSafePyNode,
    TEGPTImage2SafePyNode,
)


# Keep the original node ids and display names, but route execution through
# the pure-Python autoscale wrapper before entering the compiled Grok nodes.
NODE_CLASS_MAPPINGS = {
    "TE_image_pro_grok_image": BananaGrokImageSafePyNode,
    "TE_image_pro_grok_video": BananaGrokVideoSafePyNode,
    "TE_image_pro_gpt_image_2": TEGPTImage2SafePyNode,
    "TE_image_pro_banana": BananaGeminiImageSafePyNode,
    "TE_image_pro_special_async2": BananaGeminiAsyncSafePyNode,
    "TE_image_pro_sora2_video": BananaSora2VideoSafePyNode,
}
if BananaTEVeoVideoSafePyNode is not None:
    NODE_CLASS_MAPPINGS["TE_image_pro_te_veo_video"] = BananaTEVeoVideoSafePyNode
if TEHappyHVideoSafePyNode is not None:
    NODE_CLASS_MAPPINGS["TE_image_pro_happyh_video"] = TEHappyHVideoSafePyNode
    logger.success("HappyH Safe PY 包装已启用: TE_image_pro_happyh_video")
else:
    logger.warning("HappyH Safe PY 包装未启用: TEHappyHVideoSafePyNode is None")

NODE_DISPLAY_NAME_MAPPINGS = {
    "TE_image_pro_grok_image": "TE MAN Grok Image",
    "TE_image_pro_grok_video": "TE MAN Grok Video",
    "TE_image_pro_gpt_image_2": "TE MAN GPT Image 2",
    "TE_image_pro_banana": "TE MAN Gemini Image",
    "TE_image_pro_special_async2": "TE MAN Gemini 特渠",
    "TE_image_pro_sora2_video": "TE MAN sora2 video",
}
if BananaTEVeoVideoSafePyNode is not None:
    NODE_DISPLAY_NAME_MAPPINGS["TE_image_pro_te_veo_video"] = "TE veo video"
if TEHappyHVideoSafePyNode is not None:
    NODE_DISPLAY_NAME_MAPPINGS["TE_image_pro_happyh_video"] = "TE MAN HappyH Video"
