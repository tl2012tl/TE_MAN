from __future__ import annotations

import base64
import os
import random
import re
import requests
import sys
import threading
import time
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

import comfy.model_management
import comfy.utils
import torch
from PIL import Image

MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_DIR = os.path.dirname(MODULE_DIR) if os.path.basename(MODULE_DIR) == "source_py_backup" else MODULE_DIR
if PLUGIN_DIR not in sys.path:
    sys.path.insert(0, PLUGIN_DIR)

try:
    from .logger import logger
    from .config_manager import ConfigManager
    from .image_codec import ErrorCanvas, ImageCodec
    from .api_client import GeminiApiClient
    from .task_runner import BatchGenerationRunner
except ImportError:
    from logger import logger
    from config_manager import ConfigManager
    from image_codec import ErrorCanvas, ImageCodec
    from api_client import GeminiApiClient
    from task_runner import BatchGenerationRunner


CONFIG_MANAGER = ConfigManager(PLUGIN_DIR)
API_CLIENT = GeminiApiClient(
    CONFIG_MANAGER,
    logger,
    interrupt_checker=comfy.model_management.throw_exception_if_processing_interrupted,
)

QUICK_FUNCTION_NONE = "无"
QUICK_FUNCTION_DIRECTOR_STORYBOARD = "导演故事板"
QUICK_FUNCTION_PREFIXES: Dict[str, str] = {
    QUICK_FUNCTION_NONE: "",
    "白底三视图": "三视图（正面、侧面、背面），白色纯色背景，人物角色设计图，",
    "白底四视图": "参照原图生成人物面部特写搭配全身三视图组合画面； 画面左侧放置超大尺寸人物面部特写，右侧依次排布正面全身照、侧面全身照、背面全身照，所有内容整合在 同一画幅内；采用纯白色背景，严格对齐人物人体比例 ，杜绝透视畸变问题，各视图之间间距均匀规整,无文字描述。",
    "九宫格[剧情]分镜": (
        "根据提供的【剧情概述 / 画面主题 / 参考图】，生成一张具有清晰叙事推进关系的 3×3 九宫格分镜图，共 9 个连续镜头。"
        "全部镜头发生在同一场景与同一时间轴内，九个画面之间必须存在明确的前后承接关系，形成连续的动作、视线或情绪推进，而不是彼此孤立的画面拼接。"
        "分镜采用电影镜头语言进行自由发挥：在整体叙事推进中自然涵盖远景、中景、近景与特写等不同景别，并根据剧情需要灵活使用正视、侧视、背视、过肩、内反打、轻微俯仰等视角变化，用于强化空间关系、人物心理与节奏起伏。"
        "镜头景别与角度不与编号固定绑定，而是由剧情发展自动选择最合适的表现方式，使九个镜头整体读起来具备真实影视分镜的流动感。"
        "当用户仅提供剧情文字时，应主动补全合理的场景结构、人物站位、行动路线与镜头关系，使画面具备清晰空间逻辑；当用户提供参考图时，应将其作为人物外观、服装风格、色彩倾向与整体美术气质的统一依据，并在全部九个镜头中严格继承，不得随镜头推进出现风格变化或角色漂移。"
        "在全部九个分镜中，人物的外观、服装、体型比例、面部特征保持一致，整体色彩倾向与光照条件统一，仅允许人物动作、姿态以及镜头远近和角度发生变化，不得出现角色变形、肢体缺失、结构错乱或美术风格断裂，纯视觉展示，没有任何文字、字母或标签，每个画面之间被清晰的黑色实线分割。"
    ),
    "九宫格[场景]分镜": (
        "生成一张严格的3x3九宫格图像，纯视觉展示。"
        "正中央为场景标准透视效果图；正上方为俯视角度画面；正下方为地面纹理视角；左侧为左侧墙壁平视画面；右侧为右侧墙壁平视画面；"
        "四个角落分别是：正前方视角、正后方视角以及两个无文字的材质道具特写。"
        "要求：九个画面光影逻辑完全统一，全方位展示空间，绝对不要生成任何解释性文字或图表排版，"
    ),
    "九宫格[导演]分镜": (
        "storyboard sheet, 九宫格,black UI layout, grid panel composition, professional film storyboard,"
    ),
    "四宫格[剧情]分镜": (
        "根据提供的【剧情概述 / 画面主题 / 参考图】，生成一张具有清晰叙事推进关系的 2×2 四宫格分镜图，共 4 个连续镜头。"
        "全部镜头发生在同一场景与同一时间轴内，四个画面之间必须存在明确的前后承接关系，形成连续的动作、视线或情绪推进，而不是彼此孤立的画面拼接。"
        "分镜采用电影镜头语言进行自由发挥：在整体叙事推进中自然涵盖远景、中景、近景与特写等不同景别，并根据剧情需要灵活使用正视、侧视、背视、过肩、内反打、轻微俯仰等视角变化，用于强化空间关系、人物心理与节奏起伏。"
        "镜头景别与角度不与编号固定绑定，而是由剧情发展自动选择最合适的表现方式，使四个镜头整体读起来具备真实影视分镜的流动感。"
        "当用户仅提供剧情文字时，应主动补全合理的场景结构、人物站位、行动路线与镜头关系，使画面具备清晰空间逻辑；当用户提供参考图时，应将其作为人物外观、服装风格、色彩倾向与整体美术气质的统一依据，并在全部四个镜头中严格继承，不得随镜头推进出现风格变化或角色漂移。"
        "在全部四个分镜中，人物的外观、服装、体型比例、面部特征保持一致，整体色彩倾向与光照条件统一，仅允许人物动作、姿态以及镜头远近和角度发生变化，不得出现角色变形、肢体缺失、结构错乱或美术风格断裂，纯视觉展示，没有任何文字、字母或标签，每个画面之间被清晰的黑色实线分割。"
    ),
    "四宫格[视角]分镜": (
        "生成一张严格的2x2四宫格图像，纯视觉展示。"
        "场景标准透视效果图；俯视角度画面；正正前方视角；正后方视角。"
        "要求：四个画面光影逻辑完全统一，全方位展示空间，绝对不要生成任何解释性文字或图表排版，"
    ),
    QUICK_FUNCTION_DIRECTOR_STORYBOARD: "",
}
QUICK_FUNCTION_OPTIONS: List[str] = list(QUICK_FUNCTION_PREFIXES.keys())
DIRECTOR_STORYBOARD_PROMPT_PREFIX = """请生成一张中文专业电影故事板图片，用作 Seedance 2.0  视频生成模型的参考图。

这不是海报，不是漫画，不是设定集，不是插画合集，而是一张 cinematic realism 风格的专业导演分镜板。画面需要清楚表达：角色一致性、场景空间、镜头顺序、动作过程、情绪变化和整体影像风格。

====================
【故事信息】
====================

【故事标题】：
如果我没有提供标题，请根据故事自动生成一个简短中文电影标题。

【故事内容】：
"""

DIRECTOR_STORYBOARD_PROMPT_SUFFIX = """


【画面比例】：
默认 16:9 横版。
如果我填写 9:16，则生成 9:16 竖版。

【画面风格】：
如果我填写具体风格，请严格使用。
如果我没有填写，请根据故事自动选择最合适的风格，例如：电影级真实感、都市情绪短片、商业广告感、生活纪实感、轻科幻感、悬疑感、动作电影感、温暖治愈感、唯美国风。

【特殊要求】：
如果我填写特殊要求，请优先执行。
如果没有特殊要求，请自动补全角色、场景、动作节奏、光影、色彩和镜头语言。

====================
【生成要求】
====================

生成一张完整的中文电影故事板。

整体要求：
- 高清、干净、专业、电影感
- cinematic realism
- professional storyboard board
- cinematic pre-production sheet
- sharp details
- clean layout
- large readable storyboard panels
- 不要漫画风，不要草图风，不要海报构图，不要水印，不要乱码

====================
【版面布局】
====================

整张图分为 4 个主要区域，不要拥挤。

1. 顶部极简信息栏
高度约 5%。
只写一行短信息：

《标题》｜类型｜15秒｜镜头数｜布局｜画面比例｜

不要长段文字，不要复杂图标。

2. 左侧锚点栏+极简机位路线示意
宽度约 18%～22%。
只放最必要的参考：

- 主要角色全身小图
- 主要角色脸部特写
- 关键服装或关键道具细节
- 主场景缩略图
- 极简人物运动路线图
- 极简机位路线示意图


文字只用极短标签，例如：主角、反派、关键道具、主场景。
不要做成大面积设定集。
极简机位路线示意图只标人物位置、镜头方向、主要运动路线。 不要复杂地图，不要大量箭头，不要密集说明文字。

3. 右侧核心分镜区
占整张图约 70%～75%，必须是视觉主体。
根据故事自动选择镜头数：

- 默认 6 个镜头
- 动作强、场景宏大、信息复杂：使用 4 个镜头
- 简单流程、产品流程、生活流程、连续动作：使用 8 个镜头

布局规则：

16:9 横版：
- 4 镜头：2×2
- 6 镜头：3×2
- 8 镜头：4×2

9:16 竖版：
- 4 镜头：2×2
- 6 镜头：2×3
- 8 镜头：2×4
每个镜头必须包含：
编号、景别、运镜、起始状态、可见变化、结束状态、情绪、音效或极短对白台词。
每格文字最多两行，必须大而清晰。


每个分镜都必须是电影真实画面，不是漫画格，不是草图，不是静态设定图。

每个镜头必须表现一个正在发生的动作，或者一个清楚的状态变化。
每个镜头之间必须有连续关系，不能像孤立美图。




文字格式：

01｜景别｜运镜
主体动作 + 可见变化 + 结束状态

示例：
01｜远景｜缓慢推进
女人推门进入雨夜街道，回头望向身后灯光

02｜近景｜固定镜头
男人低头握紧信封，指节发白后慢慢抬眼,愤怒的说:"这是胡说八道的."

03｜特写｜快速横移
杯盖旋开，热气升起遮住人物表情

不要只写抽象词，例如：
觉醒、爆发、升级、完成、出现、命运、希望、崩溃、成长。

必须改成可见动作，例如：
- 人物推门进入强光中
- 手机屏幕亮起，人物停步回头
- 雨水打湿照片，人物手指颤抖
- 胸口光源亮起并沿衣纹扩散
- 女孩低头沉默后抬眼微笑
- 剑锋擦过地面，火星飞溅

4. 底部短标签栏
高度约 3%～5%。
只写短标签：

Lighting: 短词组｜Mood: 短词组｜Style: 短词组｜Audio: 短词组｜Camera: 短词组｜Keywords: 短词组

不要长句，不要密集小字。


====================
【清晰度限制】
====================

必须避免：
密集小字、复杂图例、过多箭头、杂乱 UI、粗边框、乱码文字、水印、无关字幕、摄像机设备、漫画风、草图风、儿童绘本风、过度插画风、海报构图、单张大图冒充分镜。

最终画面必须像一张专业影视预制作故事板，核心分镜最大、最清楚，角色一致，动作连续，文字少而大。"""


class TEGPTImage2TestNode:
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "text")
    FUNCTION = "generate_images"
    OUTPUT_NODE = True
    CATEGORY = "TE MAN/GPT"
    DESCRIPTION = "测试版 GPT Image 节点，模型名称可手动输入，用于文生图或图生图测试。"

    _DEFAULT_MODEL_NAME = "gpt-image-2"
    _RESOLUTION_OPTIONS = ("1K", "2K", "4K")
    _IMG2IMG_ENDPOINT_OPTIONS = ("线路1", "线路2")
    _IMAGE_FIELD_NAME_OPTIONS = ("image", "image[]")
    _DEFAULT_BACKGROUND = "auto"
    _DEFAULT_OUTPUT_FORMAT = "png"
    _SIZE_RATIO_OPTIONS = ("Auto", "1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "7:3", "3:7")
    _RESOLUTION_CONFIGS: Dict[str, Dict[str, Any]] = {
        "1K": {
            "model": "gpt-image-2",
            "quality": "auto",
            "size_map": {
                "1:1": "1024x1024",
                "16:9": "1280x720",
                "9:16": "720x1280",
                "3:2": "1248x832",
                "2:3": "832x1248",
                "4:3": "1152x864",
                "3:4": "864x1152",
                "5:4": "1120x896",
                "4:5": "896x1120",
                "7:3": "1456x624",
                "3:7": "624x1456",
            },
        },
        "2K": {
            "model": "gpt-image-2-2k",
            "quality": "Medium",
            "size_map": {
                "1:1": "2048x2048",
                "16:9": "2560x1440",
                "9:16": "1440x2560",
                "3:2": "2496x1664",
                "2:3": "1664x2496",
                "4:3": "2304x1728",
                "3:4": "1728x2304",
                "5:4": "2240x1792",
                "4:5": "1792x2240",
                "7:3": "3024x1296",
                "3:7": "1296x3024",
            },
        },
        "4K": {
            "model": "gpt-image-2-4k",
            "quality": "Medium",
            "size_map": {
                "1:1": "2880x2880",
                "16:9": "3840x2160",
                "9:16": "2160x3840",
                "3:2": "3504x2336",
                "2:3": "2336x3504",
                "4:3": "3264x2448",
                "3:4": "2448x3264",
                "5:4": "3200x2560",
                "4:5": "2560x3200",
                "7:3": "3696x1584",
                "3:7": "1584x3696",
            },
        },
    }
    _LEGACY_SIZE_TO_RATIO = {
        size_value: ratio_label
        for config in _RESOLUTION_CONFIGS.values()
        for ratio_label, size_value in config["size_map"].items()
    }

    def __init__(self):
        self.config_manager = CONFIG_MANAGER
        self.image_codec = ImageCodec(logger, self._ensure_not_interrupted)
        self.error_canvas = ErrorCanvas(logger)
        self.task_runner = BatchGenerationRunner(
            logger,
            self._ensure_not_interrupted,
            lambda total: comfy.utils.ProgressBar(total),
        )

    @staticmethod
    def _ensure_not_interrupted():
        comfy.model_management.throw_exception_if_processing_interrupted()

    def _build_failure_result(self, index: int, seed: int, error_msg: str) -> Dict[str, Any]:
        return {
            "index": index,
            "success": False,
            "error": error_msg,
            "seed": seed,
            "tensor": None,
            "image_count": 0,
        }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "一只戴着墨镜的白色猫咪，电影感，细节丰富",
                        "tooltip": "gpt-image-2 提示词",
                    },
                ),
                "model_name": (
                    "STRING",
                    {
                        "default": cls._DEFAULT_MODEL_NAME,
                        "multiline": False,
                        "tooltip": "测试用模型名称，直接写入请求体的 model 字段。",
                    },
                ),
                "api_key": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "API Key；留空则使用 config.ini 中配置",
                    },
                ),
                "api_base_url": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "服务地址；留空则使用 config.ini 中配置",
                    },
                ),
                "batch_size": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 8,
                        "tooltip": "生成批次数量；每个批次生成 1 张图",
                    },
                ),
                "分辨率(价格不同)": (
                    list(cls._RESOLUTION_OPTIONS),
                    {
                        "default": "1K",
                        "tooltip": "1K / 2K / 4K；分辨率不同,价格不同。",
                    },
                ),
                "size": (
                    list(cls._SIZE_RATIO_OPTIONS),
                    {
                        "default": "Auto",
                        "tooltip": "选择需要生成的分辨率比例。",
                    },
                ),
            },
            "optional": {
                "seed": (
                    "INT",
                    {
                        "default": -1,
                        "min": -1,
                        "max": 102400,
                        "control_after_generate": True,
                        "tooltip": "仅用于 ComfyUI 工作流记录，不写入请求体。",
                    },
                ),
                "image_1": ("IMAGE", {"tooltip": "参考/编辑输入图像 1（可选）"}),
                "image_2": ("IMAGE", {"tooltip": "参考/编辑输入图像 2（可选）"}),
                "image_3": ("IMAGE", {"tooltip": "参考/编辑输入图像 3（可选）"}),
                "image_4": ("IMAGE", {"tooltip": "参考/编辑输入图像 4（可选）"}),
                "image_5": ("IMAGE", {"tooltip": "参考/编辑输入图像 5（可选）"}),
                "image_6": ("IMAGE", {"tooltip": "参考/编辑输入图像 6（可选）"}),
                "image_7": ("IMAGE", {"tooltip": "参考/编辑输入图像 7（可选）"}),
                "image_8": ("IMAGE", {"tooltip": "参考/编辑输入图像 8（可选）"}),
                "image_9": ("IMAGE", {"tooltip": "参考/编辑输入图像 9（可选）"}),
                "线路选择": (
                    list(cls._IMG2IMG_ENDPOINT_OPTIONS),
                    {
                        "default": "线路1",
                        "tooltip": "线路1/线路2 只控制图生图接口方式；测试节点的模型名始终使用 model_name 输入值。",
                    },
                ),
                "图片字段名": (
                    list(cls._IMAGE_FIELD_NAME_OPTIONS),
                    {
                        "default": "image",
                        "tooltip": "测试图生图上传字段名；可切换 image 或 image[]，用于排查多图接口兼容性。",
                    },
                ),
                "1K线路1返回URL": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "开启后，仅 1K + 线路1 请求额外传 response_format=url。",
                    },
                ),
                "绕过代理": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "需要忽略系统代理/梯子时开启",
                    },
                ),
                "快捷功能": (
                    QUICK_FUNCTION_OPTIONS,
                    {
                        "default": QUICK_FUNCTION_NONE,
                        "tooltip": "使用快捷功能生成。",
                    },
                ),
            },
        }

    @classmethod
    def _normalize_resolution(cls, resolution: str) -> str:
        normalized = str(resolution or "1K").strip().upper()
        return normalized if normalized in cls._RESOLUTION_CONFIGS else "1K"

    @classmethod
    def _normalize_size_text(cls, size: str) -> str:
        return str(size or "").strip().replace("×", "x").replace("X", "x")

    @classmethod
    def _get_resolution_config(cls, resolution: str) -> Dict[str, Any]:
        return cls._RESOLUTION_CONFIGS[cls._normalize_resolution(resolution)]

    @classmethod
    def _normalize_ratio_label(cls, size: str) -> str:
        normalized_size = cls._normalize_size_text(size)
        if normalized_size in cls._SIZE_RATIO_OPTIONS:
            return normalized_size
        return cls._LEGACY_SIZE_TO_RATIO.get(normalized_size, "Auto")

    @classmethod
    def _resolve_request_size(cls, resolution: str, size: str) -> Optional[str]:
        normalized_ratio = cls._normalize_ratio_label(size)
        if normalized_ratio == "Auto":
            return None
        config = cls._get_resolution_config(resolution)
        return str(config["size_map"].get(normalized_ratio) or config["size_map"]["1:1"])

    @classmethod
    def _resolve_effective_img2img_endpoint_mode(cls, resolution: str, img2img_endpoint_mode: str) -> str:
        normalized_resolution = cls._normalize_resolution(resolution)
        normalized_mode = str(img2img_endpoint_mode or "线路1").strip()

        if normalized_mode in ("默认", "线路1"):
            if normalized_resolution == "1K":
                return "chat_completions"
            return "edits"

        if normalized_mode in ("edits", "线路2"):
            return "edits"

        if normalized_mode == "chat_completions":
            return "chat_completions"

        if normalized_resolution == "1K":
            return "chat_completions"
        return "edits"

    @classmethod
    def _should_use_line1_edits_for_1k_img2img(
        cls,
        resolution: str,
        is_img2img: bool,
        img2img_endpoint_mode: str,
    ) -> bool:
        normalized_resolution = cls._normalize_resolution(resolution)
        normalized_mode = str(img2img_endpoint_mode or "线路1").strip()
        return is_img2img and normalized_resolution == "1K" and normalized_mode in ("默认", "线路1")

    @classmethod
    def _resolve_request_model(
        cls,
        resolution: str,
        is_img2img: bool,
        img2img_endpoint_mode: str,
        model_name: str = "",
    ) -> str:
        custom_model_name = str(model_name or "").strip()
        if custom_model_name:
            return custom_model_name

        normalized_resolution = cls._normalize_resolution(resolution)
        resolution_config = cls._get_resolution_config(normalized_resolution)
        normalized_mode = str(img2img_endpoint_mode or "线路1").strip()
        effective_mode = cls._resolve_effective_img2img_endpoint_mode(
            normalized_resolution, img2img_endpoint_mode
        )

        if normalized_resolution == "1K" and normalized_mode in ("edits", "线路2") and effective_mode == "edits":
            return "gpt-image-2-1k"

        return str(resolution_config["model"])

    @classmethod
    def _should_strip_line2_optional_fields(cls, img2img_endpoint_mode: str) -> bool:
        normalized_mode = str(img2img_endpoint_mode or "线路1").strip()
        return normalized_mode in ("edits", "线路2")

    @staticmethod
    def _strip_line2_optional_fields(request_data: Any) -> Any:
        removable_fields = {"background", "output_format", "quality"}
        if isinstance(request_data, dict):
            for field_name in removable_fields:
                request_data.pop(field_name, None)
            return request_data
        if isinstance(request_data, list):
            return [
                item for item in request_data
                if not (
                    isinstance(item, tuple)
                    and len(item) >= 1
                    and item[0] in removable_fields
                )
            ]
        return request_data

    @classmethod
    def _should_add_line1_1k_response_url(cls, resolution: str, img2img_endpoint_mode: str, enabled: bool) -> bool:
        if not enabled:
            return False
        normalized_resolution = cls._normalize_resolution(resolution)
        normalized_mode = str(img2img_endpoint_mode or "线路1").strip()
        return normalized_resolution == "1K" and normalized_mode in ("默认", "线路1")

    @staticmethod
    def _add_response_format_url(request_data: Any) -> Any:
        if isinstance(request_data, dict):
            request_data["response_format"] = "url"
            return request_data
        if isinstance(request_data, list):
            request_data.append(("response_format", "url"))
            return request_data
        return request_data

    def _resolve_key_and_url(self, api_key: str, api_url: str) -> Tuple[str, str]:
        resolved_key = self.config_manager.sanitize_api_key(api_key) or self.config_manager.sanitize_api_key(
            self.config_manager.load_api_key()
        )
        if not resolved_key:
            raise ValueError("请在 config.ini 中配置 API Key 或在节点中填写")

        resolved_url = (api_url or "").strip() or self.config_manager.get_effective_api_base_url()
        resolved_url = resolved_url.strip()
        if not resolved_url:
            raise ValueError("请在 config.ini 中配置 API URL 或在节点中填写")

        return resolved_key, resolved_url

    def _build_gpt_image_2_request(
        self,
        prompt: str,
        model_name: str,
        resolution: str,
        size: str,
        input_images: List[torch.Tensor],
        img2img_endpoint_mode: str,
        image_field_name: str = "image",
        line1_1k_response_url: bool = False,
    ) -> Tuple[Any, List, bool, bool, bool]:
        prompt_text = (prompt or "").strip()
        if not prompt_text:
            raise ValueError("请输入提示词")

        is_img2img = bool(input_images)
        resolution_config = self._get_resolution_config(resolution)
        request_model = self._resolve_request_model(
            resolution=resolution,
            is_img2img=is_img2img,
            img2img_endpoint_mode=img2img_endpoint_mode,
            model_name=model_name,
        )
        effective_mode = self._resolve_effective_img2img_endpoint_mode(
            resolution,
            img2img_endpoint_mode,
        )
        if self._should_use_line1_edits_for_1k_img2img(
            resolution=resolution,
            is_img2img=is_img2img,
            img2img_endpoint_mode=img2img_endpoint_mode,
        ):
            effective_mode = "edits"
        request_quality = str(resolution_config.get("quality") or "").strip()
        request_size = self._resolve_request_size(resolution, size)
        request_background = self._DEFAULT_BACKGROUND
        request_output_format = self._DEFAULT_OUTPUT_FORMAT
        use_generations_for_img2img = is_img2img and effective_mode == "generations"
        use_chat_completions_for_img2img = is_img2img and effective_mode == "chat_completions"

        if use_chat_completions_for_img2img:
            content: List[Dict[str, Any]] = [{"type": "text", "text": prompt_text}]
            for encoded_image in self.image_codec.prepare_input_images(input_images):
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{encoded_image}"},
                })
            request_data = {
                "model": request_model,
                "messages": [{"role": "user", "content": content}],
                "stream": False,
                "background": request_background,
                "output_format": request_output_format,
            }
            if request_quality:
                request_data["quality"] = request_quality
            if request_size:
                request_data["size"] = request_size
        elif use_generations_for_img2img:
            request_data = {
                "model": request_model,
                "prompt": prompt_text,
                "image": self.image_codec.prepare_input_images(input_images),
                "background": request_background,
                "output_format": request_output_format,
            }
            if request_quality:
                request_data["quality"] = request_quality
            if request_size:
                request_data["size"] = request_size
        elif is_img2img:
            request_data: List[Tuple[str, str]] = [
                ("model", request_model),
                ("prompt", prompt_text),
                ("background", request_background),
                ("output_format", request_output_format),
            ]
            if request_quality:
                request_data.append(("quality", request_quality))
            if request_size:
                request_data.append(("size", request_size))
        else:
            request_data = {
                "model": request_model,
                "prompt": prompt_text,
                "background": request_background,
                "output_format": request_output_format,
            }
            if request_quality:
                request_data["quality"] = request_quality
            if request_size:
                request_data["size"] = request_size

        if self._should_add_line1_1k_response_url(resolution, img2img_endpoint_mode, line1_1k_response_url):
            request_data = self._add_response_format_url(request_data)

        if self._should_strip_line2_optional_fields(img2img_endpoint_mode):
            request_data = self._strip_line2_optional_fields(request_data)

        files = []
        if is_img2img:
            upload_field_name = str(image_field_name or "image").strip() or "image"
            image_index = 0
            for tensor in input_images:
                if tensor is None:
                    continue
                for sample in self.image_codec.extract_numpy_images(tensor):
                    try:
                        image_uint8 = (sample * 255).astype("uint8")
                        pil_image = Image.fromarray(image_uint8)
                        buffered = BytesIO()
                        pil_image.save(buffered, format="PNG")
                        buffered.seek(0)
                        files.append((upload_field_name, (f"image_{image_index + 1}.png", buffered, "image/png")))
                        image_index += 1
                    except Exception as exc:
                        logger.warning(f"处理输入图像 {image_index + 1} 失败: {exc}")

        return request_data, files, is_img2img, use_generations_for_img2img, use_chat_completions_for_img2img

    def _resolve_gpt_image_2_endpoint(
        self,
        api_base_url: str,
        is_img2img: bool,
        use_generations_for_img2img: bool = False,
        use_chat_completions_for_img2img: bool = False,
    ) -> str:
        base = (api_base_url or "").strip().rstrip("/")
        if not base:
            raise ValueError("未配置有效的 API Base URL")
        if use_chat_completions_for_img2img:
            if base.endswith("/v1/chat/completions"):
                return base
            if base.endswith("/chat/completions"):
                return base
            if base.endswith("/v1"):
                return f"{base}/chat/completions"
            return f"{base}/v1/chat/completions"
        if use_generations_for_img2img:
            if base.endswith("/v1/images/generations"):
                return base
            if base.endswith("/images/generations"):
                return base
            if base.endswith("/v1"):
                return f"{base}/images/generations"
            return f"{base}/v1/images/generations"
        if is_img2img:
            if base.endswith("/v1/images/edits"):
                return base
            if base.endswith("/images/edits"):
                return base
            if base.endswith("/v1"):
                return f"{base}/images/edits"
            return f"{base}/v1/images/edits"
        if base.endswith("/v1/images/generations"):
            return base
        if base.endswith("/images/generations"):
            return base
        if base.endswith("/v1"):
            return f"{base}/images/generations"
        return f"{base}/v1/images/generations"

    def _resolve_gpt_image_2_task_endpoint(self, api_base_url: str, task_id: str) -> str:
        base = (api_base_url or "").strip().rstrip("/")
        if not base:
            raise ValueError("未配置有效的 API Base URL")

        for suffix in (
            "/v1/images/generations",
            "/images/generations",
            "/v1/images/edits",
            "/images/edits",
        ):
            if base.endswith(suffix):
                base = base[: -len(suffix)]
                break

        if base.endswith("/v1"):
            return f"{base}/images/tasks/{task_id}"
        return f"{base}/v1/images/tasks/{task_id}"

    def _normalize_task_result(self, task_response: Dict[str, Any]) -> Tuple[str, Optional[Dict[str, Any]]]:
        if not isinstance(task_response, dict):
            return "unknown", None

        top_data = task_response.get("data")
        if isinstance(top_data, list):
            return "completed", {"data": top_data}

        if isinstance(top_data, dict):
            status = str(
                top_data.get("status")
                or top_data.get("task_status")
                or top_data.get("state")
                or "unknown"
            ).lower()

            nested_data = top_data.get("data")
            if isinstance(nested_data, list):
                return status, {"data": nested_data}
            if isinstance(nested_data, dict):
                nested_items = nested_data.get("data")
                if isinstance(nested_items, list):
                    return status, {"data": nested_items}
                if "b64_json" in nested_data or "url" in nested_data:
                    return status, {"data": [nested_data]}

            if "b64_json" in top_data or "url" in top_data:
                return status, {"data": [top_data]}

            return status, None

        if "b64_json" in task_response or "url" in task_response:
            return "completed", {"data": [task_response]}

        return "unknown", None

    def _poll_gpt_image_2_task(
        self,
        api_key: str,
        api_base_url: str,
        task_id: str,
        timeout: Optional[Any] = None,
        bypass_proxy: bool = False,
        verify_ssl: bool = True,
    ) -> Dict[str, Any]:
        sanitized_key = self.config_manager.sanitize_api_key(api_key)
        if not sanitized_key:
            raise ValueError("请填写有效的 API Key")

        session = API_CLIENT._get_session(bypass_proxy)
        API_CLIENT._suppress_insecure_warning(verify_ssl)
        connect_timeout, read_timeout = API_CLIENT._resolve_timeout(timeout)
        endpoint = self._resolve_gpt_image_2_task_endpoint(api_base_url, task_id)
        headers = {
            "Authorization": f"Bearer {sanitized_key}",
            "Content-Type": "application/json",
        }

        max_attempts = 100
        interval_seconds = 5

        for attempt in range(1, max_attempts + 1):
            self._ensure_not_interrupted()
            response = session.get(
                endpoint,
                headers=headers,
                timeout=(connect_timeout, read_timeout),
                verify=verify_ssl,
            )
            response.raise_for_status()
            result = response.json()

            status, normalized = self._normalize_task_result(result)
            logger.info(f"gpt-image-2 任务轮询 {attempt}/{max_attempts}: status={status}")

            if normalized and normalized.get("data"):
                return normalized

            if status in ("failed", "error", "failure", "cancelled", "canceled"):
                raise RuntimeError(f"gpt-image-2 异步任务失败: {result}")

            if attempt < max_attempts:
                time.sleep(interval_seconds)

        raise TimeoutError(f"gpt-image-2 异步任务超时，task_id={task_id}")

    def _send_sync_gpt_image_2_request(
        self,
        api_key: str,
        request_data: Any,
        files: List,
        api_base_url: str,
        is_img2img: bool,
        use_generations_for_img2img: bool = False,
        use_chat_completions_for_img2img: bool = False,
        timeout: Optional[Any] = None,
        bypass_proxy: bool = False,
        verify_ssl: bool = True,
        async_compat: bool = False,
    ) -> Dict[str, Any]:
        sanitized_key = self.config_manager.sanitize_api_key(api_key)
        if not sanitized_key:
            raise ValueError("请填写有效的 API Key")

        endpoint = self._resolve_gpt_image_2_endpoint(
            api_base_url,
            is_img2img,
            use_generations_for_img2img=use_generations_for_img2img,
            use_chat_completions_for_img2img=use_chat_completions_for_img2img,
        )
        session = API_CLIENT._get_session(bypass_proxy)
        API_CLIENT._suppress_insecure_warning(verify_ssl)
        connect_timeout, read_timeout = API_CLIENT._resolve_timeout(timeout)

        headers = {
            "Authorization": f"Bearer {sanitized_key}",
        }
        params = {"async": "true"} if (async_compat and not use_chat_completions_for_img2img) else None

        try:
            if is_img2img and not use_generations_for_img2img and not use_chat_completions_for_img2img:
                response = session.post(
                    endpoint,
                    headers=headers,
                    params=params,
                    data=request_data,
                    files=files,
                    timeout=(connect_timeout, read_timeout),
                    verify=verify_ssl,
                )
            else:
                headers["Content-Type"] = "application/json"
                response = session.post(
                    endpoint,
                    headers=headers,
                    params=params,
                    json=request_data,
                    timeout=(connect_timeout, read_timeout),
                    verify=verify_ssl,
                )

            response.raise_for_status()
            result = response.json()
            task_id = result.get("task_id") if isinstance(result, dict) else None
            if async_compat and (not use_chat_completions_for_img2img) and isinstance(task_id, str) and task_id.strip():
                logger.info(f"gpt-image-2 收到 task_id，开始自动轮询: {task_id}")
                return self._poll_gpt_image_2_task(
                    api_key=api_key,
                    api_base_url=api_base_url,
                    task_id=task_id.strip(),
                    timeout=timeout,
                    bypass_proxy=bypass_proxy,
                    verify_ssl=verify_ssl,
                )
            return result
        except requests.RequestException as exc:
            raise RuntimeError(f"gpt-image-2 请求失败: {exc}")

    def _extract_sync_gpt_image_2_content(
        self,
        response_data: Dict[str, Any],
        bypass_proxy: bool = False,
        verify_ssl: bool = True,
        use_chat_completions_for_img2img: bool = False,
    ) -> Tuple[List[str], str]:
        if use_chat_completions_for_img2img:
            return self._extract_chat_completions_content(
                response_data,
                bypass_proxy=bypass_proxy,
                verify_ssl=verify_ssl,
            )

        images: List[str] = []

        direct_items = response_data.get("data", []) if isinstance(response_data, dict) else []
        if not isinstance(direct_items, list):
            direct_items = []

        if not direct_items:
            try:
                return API_CLIENT.extract_openai_content(response_data)
            except Exception as exc:
                raise ValueError(f"响应中无图像数据: {exc}")

        session = API_CLIENT._get_session(bypass_proxy)
        API_CLIENT._suppress_insecure_warning(verify_ssl)
        seen_urls: set[str] = set()

        for item in direct_items:
            if not isinstance(item, dict):
                continue
            b64_value = item.get("b64_json")
            if isinstance(b64_value, str) and b64_value.strip():
                images.append(b64_value.strip())
                continue

            image_url = item.get("url")
            if isinstance(image_url, str) and image_url.strip():
                cleaned_url = image_url.strip()
                if cleaned_url in seen_urls:
                    continue
                seen_urls.add(cleaned_url)
                try:
                    resp = session.get(cleaned_url, timeout=(15, 60), verify=verify_ssl)
                    resp.raise_for_status()
                    images.append(base64.b64encode(resp.content).decode("utf-8"))
                except Exception as exc:
                    logger.warning(f"下载图片失败: {exc}")

        if not images:
            raise ValueError("响应中无可用图像数据")

        return images, f"成功获取 {len(images)} 张图像"

    def _extract_chat_completions_content(
        self,
        response_data: Dict[str, Any],
        bypass_proxy: bool = False,
        verify_ssl: bool = True,
    ) -> Tuple[List[str], str]:
        images: List[str] = []
        text_parts: List[str] = []
        seen_urls: set[str] = set()

        choices = response_data.get("choices", []) if isinstance(response_data, dict) else []
        if not isinstance(choices, list) or not choices:
            raise ValueError("chat/completions 响应中没有 choices")

        message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        content = message.get("content")
        session = API_CLIENT._get_session(bypass_proxy)
        API_CLIENT._suppress_insecure_warning(verify_ssl)

        def append_url(url: str) -> None:
            if not isinstance(url, str) or not url.strip():
                return
            cleaned_url = url.strip()
            if cleaned_url.startswith("data:image/"):
                _, _, payload = cleaned_url.partition(",")
                if payload:
                    images.append(payload)
                return
            if not cleaned_url.startswith(("http://", "https://")):
                return
            if cleaned_url in seen_urls:
                return
            seen_urls.add(cleaned_url)
            try:
                resp = session.get(cleaned_url, timeout=(15, 60), verify=verify_ssl)
                resp.raise_for_status()
                images.append(base64.b64encode(resp.content).decode("utf-8"))
            except Exception as exc:
                logger.warning(f"下载 chat/completions 图片失败: {exc}")

        def collect_from_text(text: str) -> None:
            if not isinstance(text, str) or not text.strip():
                return
            text_parts.append(text.strip())
            for raw_url in re.findall(r"https?://[^\s'\"<>]+", text):
                append_url(raw_url.rstrip("),.]}>"))

        if isinstance(content, str):
            collect_from_text(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, str):
                    collect_from_text(item)
                    continue
                if not isinstance(item, dict):
                    continue
                item_type = item.get("type")
                if item_type in ("text", "output_text"):
                    collect_from_text(item.get("text", ""))
                    continue
                if item_type == "image_url":
                    image_url_value = item.get("image_url")
                    if isinstance(image_url_value, dict):
                        append_url(image_url_value.get("url", ""))
                    elif isinstance(image_url_value, str):
                        append_url(image_url_value)
                    continue
                if item_type in ("image", "output_image"):
                    b64_value = item.get("b64_json") or item.get("image_base64") or item.get("base64")
                    if isinstance(b64_value, str) and b64_value.strip():
                        images.append(b64_value.strip())
                    image_url_value = item.get("url")
                    if isinstance(image_url_value, str):
                        append_url(image_url_value)

        for extra_key in ("images", "image_urls", "urls"):
            extra_value = message.get(extra_key)
            if isinstance(extra_value, list):
                for entry in extra_value:
                    if isinstance(entry, str):
                        append_url(entry)
                    elif isinstance(entry, dict):
                        append_url(entry.get("url", ""))

        if not images:
            raise ValueError("chat/completions 响应中无可用图像数据")

        text_response = "\n".join(part for part in text_parts if part).strip() or f"成功获取 {len(images)} 张图像"
        return images, text_response

    def _generate_single_image_gpt_image_2(self, args):
        (
            i,
            current_seed,
            api_key,
            prompt,
            model_name,
            resolution,
            size,
            input_images,
            img2img_endpoint_mode,
            image_field_name,
            line1_1k_response_url,
            timeout,
            stagger_delay,
            bypass_proxy,
            api_base_url,
            verify_ssl,
            decode_workers,
            async_compat,
        ) = args

        self._ensure_not_interrupted()
        if stagger_delay > 0 and i > 0:
            time.sleep(i * stagger_delay)

        thread_id = threading.current_thread().name
        logger.info(f"批次 {i + 1} 开始请求...")

        try:
            self._ensure_not_interrupted()
            data, files, is_img2img, use_generations_for_img2img, use_chat_completions_for_img2img = self._build_gpt_image_2_request(
                prompt=prompt,
                model_name=model_name,
                resolution=resolution,
                size=size,
                input_images=input_images,
                img2img_endpoint_mode=img2img_endpoint_mode,
                image_field_name=image_field_name,
                line1_1k_response_url=line1_1k_response_url,
            )

            mode_text = (
                "chat_completions(img2img)"
                if use_chat_completions_for_img2img
                else ("generations(img2img)" if use_generations_for_img2img else ("edits" if is_img2img else "generations"))
            )
            input_count = (
                len(self.image_codec.prepare_input_images(input_images))
                if (use_generations_for_img2img or use_chat_completions_for_img2img)
                else (len(files) if is_img2img else 0)
            )
            logger.info(f"批次 {i + 1}: 模式={mode_text}, 输入图像={input_count}")

            response_data = self._send_sync_gpt_image_2_request(
                api_key=api_key,
                request_data=data,
                files=files,
                api_base_url=api_base_url,
                is_img2img=is_img2img,
                use_generations_for_img2img=use_generations_for_img2img,
                use_chat_completions_for_img2img=use_chat_completions_for_img2img,
                timeout=timeout,
                bypass_proxy=bypass_proxy,
                verify_ssl=verify_ssl,
                async_compat=async_compat,
            )

            base64_images, text_content = self._extract_sync_gpt_image_2_content(
                response_data,
                bypass_proxy=bypass_proxy,
                verify_ssl=verify_ssl,
                use_chat_completions_for_img2img=use_chat_completions_for_img2img,
            )

            decoded_tensor = None
            decoded_count = 0
            if base64_images:
                self._ensure_not_interrupted()
                decoded_tensor = self.image_codec.base64_to_tensor_parallel(
                    base64_images,
                    log_prefix=f"[{thread_id}] 批次 {i + 1}",
                    max_workers=decode_workers,
                )
                decoded_count = decoded_tensor.shape[0]

            if decoded_count > 0:
                logger.success(f"批次 {i + 1} 完成 - 生成 {decoded_count} 张图片")
            else:
                logger.warning(f"批次 {i + 1} 完成，但未返回任何图片")

            return {
                "index": i,
                "success": True,
                "tensor": decoded_tensor,
                "image_count": decoded_count,
                "text": text_content,
                "seed": current_seed,
            }

        except comfy.model_management.InterruptProcessingException:
            logger.warning(f"批次 {i + 1} 已取消")
            raise
        except Exception as exc:
            error_msg = str(exc)[:200]
            logger.error(f"批次 {i + 1} 失败")
            logger.error(f"错误: {error_msg}")
            return self._build_failure_result(i, current_seed, error_msg)

    def _generate_with_gpt_image_2_api(
        self,
        prompt: str,
        model_name: str,
        api_key: str,
        api_base_url: str,
        batch_size: int,
        resolution: str,
        size: str,
        seed: int,
        input_images: List[torch.Tensor],
        img2img_endpoint_mode: str,
        image_field_name: str,
        line1_1k_response_url: bool,
        bypass_proxy: bool,
        verify_ssl: bool,
        start_time: float,
        async_compat: bool,
    ):
        if batch_size > 1:
            logger.info(f"gpt-image-2 模式将循环调用 {batch_size} 次")

        stagger_delay = 0.2
        # Reverse-proxy img2img uploads can take noticeably longer than direct calls.
        # Keep a generous connect/upload window to avoid aborting multipart requests mid-stream.
        timeout = (60, 500)
        decode_workers = max(1, self.config_manager.load_max_workers())
        actual_resolution = self._normalize_resolution(resolution)
        actual_ratio = self._normalize_ratio_label(size)
        actual_size = self._resolve_request_size(actual_resolution, size)
        normalized_img2img_endpoint_mode = str(img2img_endpoint_mode or "线路1").strip() or "线路1"
        effective_img2img_endpoint_mode = self._resolve_effective_img2img_endpoint_mode(
            actual_resolution, normalized_img2img_endpoint_mode
        )
        if self._should_use_line1_edits_for_1k_img2img(
            resolution=actual_resolution,
            is_img2img=bool(input_images),
            img2img_endpoint_mode=normalized_img2img_endpoint_mode,
        ):
            effective_img2img_endpoint_mode = "edits"
        resolution_config = self._get_resolution_config(actual_resolution)
        request_model = self._resolve_request_model(
            resolution=actual_resolution,
            is_img2img=bool(input_images),
            img2img_endpoint_mode=normalized_img2img_endpoint_mode,
            model_name=model_name,
        )

        if seed == -1:
            base_seed = random.randint(0, 102400)
        else:
            base_seed = seed

        tasks = []
        for i in range(batch_size):
            current_seed = base_seed + i if seed != -1 else -1
            tasks.append(
                (
                    i,
                    current_seed,
                    api_key,
                    prompt,
                    model_name,
                    actual_resolution,
                    str(size or "Auto"),
                    input_images,
                    normalized_img2img_endpoint_mode,
                    image_field_name,
                    line1_1k_response_url,
                    timeout,
                    stagger_delay,
                    bypass_proxy,
                    api_base_url,
                    verify_ssl,
                    decode_workers,
                    async_compat,
                )
            )

        logger.header("🎨 TE GPT image 2 任务")
        logger.info(f"批次数量: {batch_size} 张")
        logger.info(f"分辨率: {actual_resolution}")
        logger.info(f"模型: {request_model}")
        logger.info(f"比例: {actual_ratio}")
        logger.info(f"实际尺寸: {actual_size or 'Auto'}")
        logger.info(f"背景: {self._DEFAULT_BACKGROUND}")
        logger.info(f"输出格式: {self._DEFAULT_OUTPUT_FORMAT}")
        logger.info(f"图片字段名: {image_field_name}")
        logger.info(f"1K线路1返回URL: {'开启' if line1_1k_response_url else '关闭'}")
        logger.info(
            f"线路选择: {'线路2' if normalized_img2img_endpoint_mode in ('edits', '线路2') else '线路1'}"
        )
        logger.info(f"异步兼容: {'开启' if async_compat else '关闭'}")
        input_image_count = sum(
            len(self.image_codec.extract_numpy_images(tensor))
            for tensor in input_images
            if tensor is not None
        )
        logger.info(f"输入图像: {input_image_count} 张")
        logger.separator()

        actual_workers = min(4, batch_size)

        def progress_callback(result: Dict[str, Any], completed_count: int, total_count: int, progress_bar: object):
            if result.get("success"):
                logger.success(f"[{completed_count}/{total_count}] 批次 {result['index'] + 1} 完成")
            else:
                batch_label = result.get("index", -1)
                batch_text = "?" if batch_label < 0 else batch_label + 1
                logger.error(f"[{completed_count}/{total_count}] 批次 {batch_text} 失败")

            preview_tensor = result.get("tensor")
            if result.get("success") and preview_tensor is not None:
                preview_tuple = self.image_codec.build_preview_tuple(preview_tensor, result["index"])
                if preview_tuple is not None:
                    progress_bar.update_absolute(completed_count, total_count, preview_tuple)
                else:
                    progress_bar.update(1)
            else:
                progress_bar.update(1)

        results = self.task_runner.run(
            tasks,
            self._generate_single_image_gpt_image_2,
            batch_size,
            actual_workers,
            continue_on_error=True,
            progress_callback=progress_callback,
        )

        if not results:
            elapsed = time.time() - start_time
            error_text = f"未生成任何图像\n总耗时: {elapsed:.2f}s"
            logger.error(error_text)
            error_tensor = self.error_canvas.build_error_tensor_from_text("生成失败", error_text)
            return (error_tensor, error_text)

        results.sort(key=lambda x: x["index"])
        decoded_tensors: List[torch.Tensor] = []
        total_generated_images = 0
        all_texts: List[str] = []

        for result in results:
            if result.get("success"):
                tensor = result.get("tensor")
                if tensor is not None:
                    decoded_tensors.append(tensor)
                    total_generated_images += result.get("image_count", tensor.shape[0])
                if result.get("text"):
                    all_texts.append(f"[批次 {result['index'] + 1}] {result['text']}")
            else:
                error_msg = f"[批次 {result['index'] + 1}] ❌ {result.get('error', '未知错误')}"
                all_texts.append(error_msg)

        total_time = time.time() - start_time
        if not decoded_tensors or total_generated_images == 0:
            error_text = f"未生成任何图像\n总耗时: {total_time:.2f}s\n\n" + "\n".join(all_texts)
            logger.error(error_text)
            error_tensor = self.error_canvas.build_error_tensor_from_text("生成失败", error_text)
            return (error_tensor, error_text)

        image_tensor = decoded_tensors[0] if len(decoded_tensors) == 1 else torch.cat(decoded_tensors, dim=0)
        actual_count = total_generated_images
        avg_time = total_time / actual_count if actual_count > 0 else 0

        summary_text = (
            f"✅ 成功生成 {actual_count} 张图像\n"
            f"分辨率: {actual_resolution}\n"
            f"模型: {request_model}\n"
            f"质量: {resolution_config['quality'] or '不传'}\n"
            f"比例: {actual_ratio}\n"
            f"实际尺寸: {actual_size or 'Auto'}\n"
            f"背景: {self._DEFAULT_BACKGROUND}\n"
            f"输出格式: {self._DEFAULT_OUTPUT_FORMAT}\n"
            f"总耗时: {total_time:.2f}s，平均 {avg_time:.2f}s/张"
        )
        if all_texts:
            summary_text += "\n\n" + "\n".join(all_texts)

        logger.summary(
            "任务完成",
            {
                "总批次": f"{batch_size} 个",
                "成功生成": f"{actual_count} 张",
                "总耗时": f"{total_time:.2f}s",
                "平均速度": f"{avg_time:.2f}s/张",
            },
        )

        return (image_tensor, summary_text)

    def generate_images(
        self,
        prompt,
        model_name="gpt-image-2",
        api_key="",
        api_base_url="",
        batch_size=1,
        分辨率="1K",
        size="Auto",
        seed=-1,
        image_1=None,
        image_2=None,
        image_3=None,
        image_4=None,
        image_5=None,
        image_6=None,
        image_7=None,
        image_8=None,
        image_9=None,
        线路选择="线路1",
        图片字段名="image",
        一K线路1返回URL=False,
        绕过代理=False,
        快捷功能: str = QUICK_FUNCTION_NONE,
        异步兼容=False,
        **kwargs,
    ):
        if "分辨率(价格不同)" in kwargs and "分辨率" not in kwargs:
            分辨率 = kwargs.get("分辨率(价格不同)", 分辨率)

        prompt_text = (prompt or "").strip()
        quick_function_value = str(快捷功能 or QUICK_FUNCTION_NONE).strip() or QUICK_FUNCTION_NONE
        if quick_function_value == QUICK_FUNCTION_DIRECTOR_STORYBOARD:
            final_prompt_text = (
                f"{DIRECTOR_STORYBOARD_PROMPT_PREFIX}"
                f"{prompt_text}"
                f"{DIRECTOR_STORYBOARD_PROMPT_SUFFIX}"
            ).strip()
        else:
            quick_prefix = QUICK_FUNCTION_PREFIXES.get(quick_function_value, "")
            final_prompt_text = f"{quick_prefix}{prompt_text}".strip()

        try:
            resolved_api_key, effective_base_url = self._resolve_key_and_url(api_key, api_base_url)
        except Exception as exc:
            error_msg = str(exc)
            logger.error(error_msg)
            error_tensor = self.error_canvas.build_error_tensor_from_text(
                "配置缺失",
                f"{error_msg}\n请在 config.ini 或节点输入中填写有效配置",
            )
            return (error_tensor, error_msg)

        masked_key = resolved_api_key[:8] + "..." + resolved_api_key[-4:] if len(resolved_api_key) > 12 else "***"
        logger.info("使用 API Base URL: [已脱敏]")
        logger.info(f"使用 API Key: {masked_key}")

        raw_input_images = [image_1, image_2, image_3, image_4, image_5, image_6, image_7, image_8, image_9]
        input_tensors = [img for img in raw_input_images if img is not None]

        return self._generate_with_gpt_image_2_api(
            prompt=final_prompt_text,
            model_name=model_name,
            api_key=resolved_api_key,
            api_base_url=effective_base_url,
            batch_size=batch_size,
            resolution=分辨率,
            size=size,
            seed=seed,
            input_images=input_tensors,
            img2img_endpoint_mode=str(
                kwargs.get("图生图接口", 线路选择) or "线路1"
            ).strip() or "线路1",
            image_field_name=str(图片字段名 or "image").strip() or "image",
            line1_1k_response_url=bool(kwargs.get("1K线路1返回URL", 一K线路1返回URL)),
            bypass_proxy=bool(绕过代理),
            verify_ssl=True,
            start_time=time.time(),
            async_compat=False,
        )


NODE_CLASS_MAPPINGS = {
    "TE_image_pro_gpt_image_2_test": TEGPTImage2TestNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TE_image_pro_gpt_image_2_test": "TE MAN GPT Image 2 Test",
}
