from __future__ import annotations

import inspect
import math
from typing import Any, List, Optional

from .logger import logger

try:
    from .Grok_Image_Generator import BananaGrokImageNode as _BaseGrokImageNode
except Exception as exc:  # pragma: no cover
    raise ImportError(f"无法加载 Grok_Image_Generator 基础节点: {exc}")

try:
    from .Grok_Video_Generator import BananaGrokVideoNode as _BaseGrokVideoNode
except Exception as exc:  # pragma: no cover
    raise ImportError(f"无法加载 Grok_Video_Generator 基础节点: {exc}")

try:
    from .GPT_Image_2_Generator import TEGPTImage2Node as _BaseGPTImage2Node
except Exception as exc:  # pragma: no cover
    raise ImportError(f"无法加载 GPT_Image_2_Generator 基础节点: {exc}")

try:
    from .Gemini_Imagen_Generator import (
        BananaImageNode as _BaseGeminiImageNode,
        BananaSpecialAsyncNode as _BaseGeminiAsyncNode,
    )
except Exception as exc:  # pragma: no cover
    raise ImportError(f"无法加载 Gemini_Imagen_Generator 基础节点: {exc}")

try:
    from .Jimeng_Video_Generator import BananaJimengVideoNode as _BaseJimengVideoNode
except Exception as exc:  # pragma: no cover
    raise ImportError(f"无法加载 Jimeng_Video_Generator 基础节点: {exc}")

try:
    from .TE_JM_Video import BananaTEJMVideoNode as _BaseTEJMVideoNode
except Exception as exc:  # pragma: no cover
    _BaseTEJMVideoNode = None  # type: ignore
    logger.warning(f"TE_JM_Video 基础节点暂不可用，等待编译后的模块: {exc}")

try:
    from .TE_VEO_Video import BananaTEVeoVideoNode as _BaseTEVeoVideoNode
except Exception as exc:  # pragma: no cover
    _BaseTEVeoVideoNode = None  # type: ignore
    logger.warning(f"TE_VEO_Video 基础节点暂不可用，等待编译后的模块: {exc}")

try:
    from .TE_HappyH_Video import TEHappyHVideoNode as _BaseTEHappyHVideoNode
except Exception as exc:  # pragma: no cover
    try:
        from .TE_HappyH_Video import NODE_CLASS_MAPPINGS as _HappyHNodeClassMappings

        _BaseTEHappyHVideoNode = _HappyHNodeClassMappings.get("TE_image_pro_happyh_video")  # type: ignore
        if _BaseTEHappyHVideoNode is None:
            raise ImportError("NODE_CLASS_MAPPINGS 中未找到 TE_image_pro_happyh_video")
    except Exception as mapping_exc:
        _BaseTEHappyHVideoNode = None  # type: ignore
        logger.warning(
            f"TE_HappyH_Video 基础节点暂不可用，等待编译后的模块: {exc}; {mapping_exc}"
        )

try:
    from .Sora_2_Video_Generator import BananaSora2VideoNode as _BaseSora2VideoNode
except Exception as exc:  # pragma: no cover
    raise ImportError(f"无法加载 Sora_2_Video_Generator 基础节点: {exc}")


_ENABLE_INPUT_IMAGE_AUTOSCALE = False
_MAX_INPUT_IMAGE_MEGAPIXELS = 1.0
_EDIT_IMAGE_URL_FORMAT_OPTION_NAME = "图生图image_url格式测试"
_OFFICIAL_SCALE_METHOD = "nearest-exact"
DEFAULT_MAX_INPUT_IMAGE_MEGAPIXELS = _MAX_INPUT_IMAGE_MEGAPIXELS


def _shape_to_hw_text(image_value: Any) -> str:
    if image_value is None or not hasattr(image_value, "shape"):
        return "unknown"
    shape = tuple(int(x) for x in image_value.shape)
    if len(shape) == 4:
        return f"{shape[2]}x{shape[1]}"
    if len(shape) == 3:
        return f"{shape[1]}x{shape[0]}"
    return str(shape)


def shape_to_hw_text(image_value: Any) -> str:
    return _shape_to_hw_text(image_value)


def _scale_image_tensor_to_total_pixels_if_needed(
    image_tensor,
    megapixels: float = _MAX_INPUT_IMAGE_MEGAPIXELS,
    resolution_steps: int = 1,
):
    if not _ENABLE_INPUT_IMAGE_AUTOSCALE:
        return image_tensor

    if image_tensor is None or not hasattr(image_tensor, "shape"):
        return image_tensor

    try:
        import numpy as np
        import torch
        import comfy.utils
    except Exception:
        return image_tensor

    is_torch_like = hasattr(image_tensor, "detach") and hasattr(image_tensor, "cpu")
    if is_torch_like:
        arr = image_tensor.detach().cpu().numpy()
    elif hasattr(image_tensor, "cpu"):
        arr = image_tensor.cpu().numpy()
    else:
        arr = np.array(image_tensor)

    original_ndim = arr.ndim
    if original_ndim == 3:
        arr = arr[None, ...]
    if arr.ndim != 4:
        return image_tensor

    target_total = float(megapixels) * 1024.0 * 1024.0
    step = max(1, int(resolution_steps or 1))
    resized_images: List[Any] = []
    changed = False

    for i in range(arr.shape[0]):
        img = arr[i]
        if img.ndim != 3:
            resized_images.append(img)
            continue

        source_height = int(img.shape[0])
        source_width = int(img.shape[1])
        if source_width <= 0 or source_height <= 0:
            resized_images.append(img)
            continue

        current_total = float(source_width * source_height)
        if current_total <= 0 or current_total <= target_total:
            resized_images.append(img)
            continue

        scale_by = math.sqrt(target_total / current_total)
        target_width = max(1, round(source_width * scale_by / step) * step)
        target_height = max(1, round(source_height * scale_by / step) * step)
        if target_width == source_width and target_height == source_height:
            resized_images.append(img)
            continue

        changed = True
        tensor_img = torch.from_numpy(img).movedim(-1, 0).unsqueeze(0)
        resized_tensor = comfy.utils.common_upscale(
            tensor_img,
            int(target_width),
            int(target_height),
            _OFFICIAL_SCALE_METHOD,
            "disabled",
        )
        resized = resized_tensor.squeeze(0).movedim(0, -1).cpu().numpy()
        resized = resized.astype(img.dtype, copy=False)
        resized_images.append(resized)

    if not changed:
        return image_tensor

    stacked = np.stack(resized_images, axis=0)
    if original_ndim == 3:
        stacked = stacked[0]
    if is_torch_like:
        return torch.from_numpy(stacked).to(device=image_tensor.device, dtype=image_tensor.dtype)
    return stacked


def scale_image_to_total_pixels_if_needed(
    image_tensor,
    megapixels: float = DEFAULT_MAX_INPUT_IMAGE_MEGAPIXELS,
    resolution_steps: int = 1,
    prefer_tensor: bool = False,
):
    scaled = _scale_image_tensor_to_total_pixels_if_needed(
        image_tensor,
        megapixels=megapixels,
        resolution_steps=resolution_steps,
    )
    if prefer_tensor:
        return scaled
    return scaled


def _to_bhwc_batch_array(image_tensor):
    if image_tensor is None or not hasattr(image_tensor, "shape"):
        return None

    try:
        import numpy as np
    except Exception:
        return None

    if hasattr(image_tensor, "detach") and hasattr(image_tensor, "cpu"):
        arr = image_tensor.detach().cpu().numpy()
    elif hasattr(image_tensor, "cpu"):
        arr = image_tensor.cpu().numpy()
    else:
        arr = np.array(image_tensor)

    if arr.ndim == 3:
        arr = arr[None, ...]
    if arr.ndim != 4:
        return None
    return arr


def _merge_scaled_images(*images):
    batches: List[Any] = []
    for image in images:
        if image is None:
            continue
        scaled = _scale_image_tensor_to_total_pixels_if_needed(image)
        arr = _to_bhwc_batch_array(scaled)
        if arr is not None:
            batches.append(arr)

    if not batches:
        return None
    if len(batches) == 1:
        return batches[0]
    return batches


def _count_batch_images(image_value: Any) -> int:
    if image_value is None:
        return 0
    if isinstance(image_value, (list, tuple)):
        return sum(_count_batch_images(item) for item in image_value)
    if not hasattr(image_value, "shape"):
        return 0
    shape = tuple(int(x) for x in image_value.shape)
    if len(shape) == 4:
        return max(1, shape[0])
    if len(shape) == 3:
        return 1
    return 0


def scale_image_list_to_total_pixels(
    images,
    logger_instance: Optional[Any] = None,
    label: str = "输入图",
    megapixels: float = DEFAULT_MAX_INPUT_IMAGE_MEGAPIXELS,
    prefer_tensor: bool = False,
):
    scaled_images: List[Any] = []
    for idx, image in enumerate(images, start=1):
        if image is None:
            continue
        scaled = scale_image_to_total_pixels_if_needed(
            image,
            megapixels=megapixels,
            prefer_tensor=prefer_tensor,
        )
        if scaled is not image and logger_instance is not None:
            logger_instance.info(
                f"{label}{idx}自动缩放: {shape_to_hw_text(image)} -> "
                f"{shape_to_hw_text(scaled)} (目标约 {megapixels:.1f}MP)"
            )
        scaled_images.append(scaled)
    return scaled_images


def _scale_named_image_kwargs(
    kwargs: dict,
    image_keys: List[str],
    label: str,
    log_unscaled: bool = False,
):
    input_routes = 0
    merged_count = 0
    for idx, key in enumerate(image_keys, start=1):
        img = kwargs.get(key)
        if img is None:
            continue
        input_routes += 1
        scaled = _scale_image_tensor_to_total_pixels_if_needed(img)
        if scaled is not img:
            logger.info(
                f"{label}{idx}自动缩放: "
                f"{_shape_to_hw_text(img)} -> {_shape_to_hw_text(scaled)} "
                f"(目标约 {_MAX_INPUT_IMAGE_MEGAPIXELS:.1f}MP)"
            )
        elif log_unscaled:
            logger.info(
                f"{label}{idx}未缩放: "
                f"{_shape_to_hw_text(img)} "
                f"(未超过约 {_MAX_INPUT_IMAGE_MEGAPIXELS:.1f}MP)"
            )
        kwargs[key] = scaled
        merged_count += _count_batch_images(scaled)
    return kwargs, input_routes, merged_count


def _supports_kwarg(callable_obj, kwarg_name: str) -> bool:
    try:
        signature = inspect.signature(callable_obj)
    except Exception:
        return False

    for parameter in signature.parameters.values():
        if parameter.kind == inspect.Parameter.VAR_KEYWORD:
            return True
    return kwarg_name in signature.parameters


class BananaGrokImageSafePyNode(_BaseGrokImageNode):
    CATEGORY = "TE MAN/Grok"

    @classmethod
    def INPUT_TYPES(cls):
        input_types = super().INPUT_TYPES()
        try:
            prompt_config = input_types["required"]["prompt"][1]
            if isinstance(prompt_config, dict):
                prompt_config = dict(prompt_config)
                prompt_config["defaultInput"] = True
                input_types["required"]["prompt"] = (
                    input_types["required"]["prompt"][0],
                    prompt_config,
                )
        except Exception:
            pass
        return input_types

    def generate_images(
        self,
        prompt: str,
        快捷功能: str = "无",
        api_key: str = "",
        api_base_url: str = "",
        image_count: int = 1,
        size: str = "1024x1024",
        seed: int = -1,
        image=None,
        image_2=None,
        image_3=None,
        timeout_s: int = 180,
        绕过代理: bool = False,
        图生图image_url格式测试: str = "对象格式",
    ):
        scaled_images: List[Optional[Any]] = []
        input_routes = 0
        merged_count = 0
        for idx, img in enumerate((image, image_2, image_3), start=1):
            if img is None:
                scaled_images.append(None)
                continue
            input_routes += 1
            scaled = _scale_image_tensor_to_total_pixels_if_needed(img)
            if scaled is not img:
                logger.info(
                    f"Grok Safe PY 输入图{idx}自动缩放: "
                    f"{_shape_to_hw_text(img)} -> {_shape_to_hw_text(scaled)} "
                    f"(目标约 {_MAX_INPUT_IMAGE_MEGAPIXELS:.1f}MP)"
                )
            else:
                logger.info(
                    f"Grok Safe PY 输入图{idx}未缩放: "
                    f"{_shape_to_hw_text(img)} "
                    f"(未超过约 {_MAX_INPUT_IMAGE_MEGAPIXELS:.1f}MP)"
                )
            merged_count += _count_batch_images(scaled)
            scaled_images.append(scaled)

        if input_routes > 0:
            logger.info(
                f"Grok Safe PY 参考图数量: "
                f"{input_routes} 路输入, 合并后 {merged_count} 张"
            )

        super_generate_images = super().generate_images
        call_kwargs = dict(
            prompt=prompt,
            快捷功能=快捷功能,
            api_key=api_key,
            api_base_url=api_base_url,
            image_count=image_count,
            size=size,
            seed=seed,
            image=scaled_images[0],
            image_2=scaled_images[1],
            image_3=scaled_images[2],
            timeout_s=timeout_s,
            绕过代理=绕过代理,
        )
        if _supports_kwarg(super_generate_images, _EDIT_IMAGE_URL_FORMAT_OPTION_NAME):
            call_kwargs[_EDIT_IMAGE_URL_FORMAT_OPTION_NAME] = 图生图image_url格式测试
        return super_generate_images(**call_kwargs)


class BananaGrokVideoSafePyNode(_BaseGrokVideoNode):
    CATEGORY = "TE MAN/Grok"

    @classmethod
    def INPUT_TYPES(cls):
        input_types = super().INPUT_TYPES()
        try:
            required_inputs = dict(input_types.get("required", {}))
            required_inputs.pop("aspect_ratio", None)
            required_inputs.pop("线路1清晰度", None)
            input_types["required"] = required_inputs

            optional_inputs = dict(input_types.get("optional", {}))
            image_schema = optional_inputs.get("image")
            if image_schema:
                optional_inputs["image_2"] = ("IMAGE", {"tooltip": "参考图片 2（可选）"})
                optional_inputs["image_3"] = ("IMAGE", {"tooltip": "参考图片 3（可选）"})
                optional_inputs["image_4"] = ("IMAGE", {"tooltip": "参考图片 4（可选）"})
                optional_inputs["image_5"] = ("IMAGE", {"tooltip": "参考图片 5（可选）"})
                input_types["optional"] = optional_inputs
        except Exception:
            pass
        return input_types

    def generate_video(
        self,
        prompt: str,
        api_key: str = "",
        api_base_url: str = "",
        model: str = "grok-imagine-video",
        seconds: str = "10",
        size: str = "1792x1024",
        resolution_name: str = "720p",
        preset: str = "normal",
        seed: int = -1,
        image=None,
        image_2=None,
        image_3=None,
        image_4=None,
        image_5=None,
        timeout_s: int = 600,
        绕过代理: bool = False,
        线路选择: str = "线路1",
        **extra_kwargs,
    ):
        original_images = (image, image_2, image_3, image_4, image_5)
        scaled_images: List[Optional[Any]] = []
        for idx, img in enumerate(original_images, start=1):
            if img is None:
                scaled_images.append(None)
                continue

            scaled = _scale_image_tensor_to_total_pixels_if_needed(img)
            if scaled is not img:
                logger.info(
                    f"Grok Video Safe PY 输入图{idx}自动缩放: "
                    f"{_shape_to_hw_text(img)} -> {_shape_to_hw_text(scaled)} "
                    f"(目标约 {_MAX_INPUT_IMAGE_MEGAPIXELS:.1f}MP)"
                )
            else:
                logger.info(
                    f"Grok Video Safe PY 输入图{idx}未缩放: "
                    f"{_shape_to_hw_text(img)} "
                    f"(未超过约 {_MAX_INPUT_IMAGE_MEGAPIXELS:.1f}MP)"
                )
            scaled_images.append(scaled)

        scaled_image = _merge_scaled_images(*scaled_images)
        if any(img is not None for img in original_images) and scaled_image is not None:
            logger.info(
                f"Grok Video Safe PY 参考图数量: "
                f"{len([img for img in original_images if img is not None])} 路输入, "
                f"合并后 {_count_batch_images(scaled_image)} 张"
            )

        super_generate_video = super().generate_video
        call_kwargs = dict(
            prompt=prompt,
            api_key=api_key,
            api_base_url=api_base_url,
            model=model,
            seconds=seconds,
            size=size,
            resolution_name=resolution_name,
            preset=preset,
            seed=seed,
            image=scaled_image,
            timeout_s=timeout_s,
            绕过代理=绕过代理,
            线路选择=线路选择,
        )
        return super_generate_video(**call_kwargs)


class TEGPTImage2SafePyNode(_BaseGPTImage2Node):
    CATEGORY = "TE MAN/OpenAI"

    def generate_images(self, *args, **kwargs):
        call_kwargs = dict(kwargs)
        call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
            call_kwargs,
            [f"image_{i}" for i in range(1, 10)],
            "GPT Image 2 Safe PY 输入图",
            log_unscaled=True,
        )
        if input_routes > 0:
            logger.info(
                f"GPT Image 2 Safe PY 参考图数量: "
                f"{input_routes} 路输入, 合并后 {merged_count} 张"
            )
        return super().generate_images(*args, **call_kwargs)


class BananaGeminiImageSafePyNode(_BaseGeminiImageNode):
    CATEGORY = "TE MAN/Gemini"

    def generate_images(self, *args, **kwargs):
        call_kwargs = dict(kwargs)
        call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
            call_kwargs,
            [f"image_{i}" for i in range(1, 10)],
            "Gemini Safe PY 输入图",
            log_unscaled=True,
        )
        if input_routes > 0:
            logger.info(
                f"Gemini Safe PY 参考图数量: "
                f"{input_routes} 路输入, 合并后 {merged_count} 张"
            )
        return super().generate_images(*args, **call_kwargs)


class BananaGeminiAsyncSafePyNode(_BaseGeminiAsyncNode):
    CATEGORY = "TE MAN/Gemini"

    def generate_images(self, *args, **kwargs):
        call_kwargs = dict(kwargs)
        call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
            call_kwargs,
            [f"image_{i}" for i in range(1, 10)],
            "Gemini Async Safe PY 输入图",
            log_unscaled=True,
        )
        if input_routes > 0:
            logger.info(
                f"Gemini Async Safe PY 参考图数量: "
                f"{input_routes} 路输入, 合并后 {merged_count} 张"
            )
        return super().generate_images(*args, **call_kwargs)


class BananaJimengVideoSafePyNode(_BaseJimengVideoNode):
    CATEGORY = "TE MAN/Jimeng"

    def generate_video(self, *args, **kwargs):
        call_kwargs = dict(kwargs)
        call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
            call_kwargs,
            [f"image_{i}" for i in range(1, 10)],
            "Jimeng Safe PY 输入图",
            log_unscaled=True,
        )
        if input_routes > 0:
            logger.info(
                f"Jimeng Safe PY 参考图数量: "
                f"{input_routes} 路输入, 合并后 {merged_count} 张"
            )
        return super().generate_video(*args, **call_kwargs)


if _BaseTEJMVideoNode is not None:
    class BananaTEJMVideoSafePyNode(_BaseTEJMVideoNode):
        CATEGORY = "TE MAN/Jimeng"

        def generate_video(self, *args, **kwargs):
            call_kwargs = dict(kwargs)
            call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
                call_kwargs,
                ["image", "image_2", "image_3", "image_4"],
                "TE JM Safe PY 输入图",
                log_unscaled=True,
            )
            if input_routes > 0:
                logger.info(
                    f"TE JM Safe PY 参考图数量: "
                    f"{input_routes} 路输入, 合并后 {merged_count} 张"
                )
            return super().generate_video(*args, **call_kwargs)
else:
    BananaTEJMVideoSafePyNode = None  # type: ignore


if _BaseTEVeoVideoNode is not None:
    class BananaTEVeoVideoSafePyNode(_BaseTEVeoVideoNode):
        CATEGORY = "TE MAN/Veo"

        def generate_video(self, *args, **kwargs):
            call_kwargs = dict(kwargs)
            call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
                call_kwargs,
                [
                    "reference_image_1",
                    "reference_image_2",
                    "reference_image_3",
                    "first_frame_image",
                    "last_frame_image",
                ],
                "TE veo Safe PY 输入图",
                log_unscaled=True,
            )
            if input_routes > 0:
                logger.info(
                    f"TE veo Safe PY 参考图数量: "
                    f"{input_routes} 路输入, 合并后 {merged_count} 张"
                )
            return super().generate_video(*args, **call_kwargs)
else:
    BananaTEVeoVideoSafePyNode = None  # type: ignore


if _BaseTEHappyHVideoNode is not None:
    class TEHappyHVideoSafePyNode(_BaseTEHappyHVideoNode):
        CATEGORY = "TE MAN/HappyHorse"

        @classmethod
        def INPUT_TYPES(cls):
            input_types = super().INPUT_TYPES()
            try:
                prompt_schema = input_types["required"]["prompt"]
                prompt_config = prompt_schema[1]
                if isinstance(prompt_config, dict):
                    prompt_config = dict(prompt_config)
                    prompt_config["defaultInput"] = True
                    input_types["required"]["prompt"] = (prompt_schema[0], prompt_config)
            except Exception:
                pass
            return input_types

        def generate_video(self, *args, **kwargs):
            call_kwargs = dict(kwargs)
            call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
                call_kwargs,
                [f"image_{i}" for i in range(1, 10)],
                "HappyH Safe PY 输入图",
                log_unscaled=True,
            )
            if input_routes > 0:
                logger.info(
                    f"HappyH Safe PY 参考图数量: "
                    f"{input_routes} 路输入, 合并后 {merged_count} 张"
                )
            return super().generate_video(*args, **call_kwargs)
else:
    TEHappyHVideoSafePyNode = None  # type: ignore


class BananaSora2VideoSafePyNode(_BaseSora2VideoNode):
    CATEGORY = "TE MAN/Sora"

    def generate_video(self, *args, **kwargs):
        call_kwargs = dict(kwargs)
        call_kwargs, input_routes, merged_count = _scale_named_image_kwargs(
            call_kwargs,
            ["image"],
            "Sora2 Safe PY 输入图",
            log_unscaled=True,
        )
        if input_routes > 0:
            logger.info(
                f"Sora2 Safe PY 参考图数量: "
                f"{input_routes} 路输入, 合并后 {merged_count} 张"
            )
        return super().generate_video(*args, **call_kwargs)


NODE_CLASS_MAPPINGS = {}

NODE_DISPLAY_NAME_MAPPINGS = {}
