import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const VIDEO_NODE_CLASS = "TE_image_pro_save_video";
const IMAGE_NODE_CLASS = "TE_image_pro_save_image_with_output";
const SERIALIZED_VIDEO_KEY = "te_saved_preview_videos";
const SERIALIZED_PROMPT_KEY = "te_saved_prompt_text";
const DEFAULT_PROMPT_TEXT = "";
const PLAY_BUTTON_TEXT = "暂停预览";
const RESUME_BUTTON_TEXT = "播放预览";
const CAPTURE_BUTTON_TEXT = "截取当前帧";
const CAPTURE_BUSY_TEXT = "截取中...";
const LOCAL_UPLOAD_BUTTON_TEXT = "加载视频";
const TE_VIDEO_ACTION_BAR_NAME = "te_video_action_bar";
const TE_VIDEO_ACTION_BAR_HEIGHT = 34;
const TE_VIDEO_ACTION_BAR_SIDE_MARGIN = 10;
const TE_VIDEO_ACTION_BAR_PADDING_X = 5;
const TE_VIDEO_ACTION_BAR_GAP = 6;
const MIN_NODE_WIDTH = 360;
const MIN_NODE_HEIGHT = 360;
const MIN_PREVIEW_HEIGHT = 120;
const NEW_IMAGE_NODE_GAP_X = 48;
const NEW_IMAGE_NODE_GAP_Y = 24;
const NEW_IMAGE_NODE_MIN_WIDTH = 360;
const NEW_IMAGE_NODE_MIN_HEIGHT = 360;

function markCanvasDirty() {
    app.graph?.setDirtyCanvas?.(true, false);
    app.canvas?.setDirty?.(true, false);
}

function applyNodeSize(node, size) {
    if (!node || !Array.isArray(size)) {
        return;
    }

    node.__teInternalResize = true;
    node.__teLastManagedSize = [size[0], size[1]];
    try {
        node.setSize?.(size);
    } finally {
        node.__teInternalResize = false;
    }
}

function buildViewUrl(fileInfo) {
    const params = new URLSearchParams({
        filename: fileInfo.filename,
        type: fileInfo.type || "output",
    });
    if (fileInfo.subfolder) {
        params.set("subfolder", fileInfo.subfolder);
    }
    params.set("rand", String(Date.now()));
    return api.apiURL(`/view?${params.toString()}`);
}

function getWidgetByName(node, widgetName) {
    if (!Array.isArray(node?.widgets)) {
        return null;
    }
    return node.widgets.find((widget) => widget?.name === widgetName) || null;
}

function setWidgetValue(node, widgetName, value) {
    const widget = getWidgetByName(node, widgetName);
    if (!widget) {
        return false;
    }

    if (Array.isArray(widget.options?.values) && !widget.options.values.includes(value)) {
        widget.options.values.push(value);
    }

    widget.value = value;
    const widgetIndex = node.widgets.indexOf(widget);
    if (widgetIndex >= 0) {
        node.widgets_values ??= [];
        node.widgets_values[widgetIndex] = value;
    }
    widget.callback?.(value);
    return true;
}

function normalizePromptText(value) {
    if (Array.isArray(value)) {
        return value.join("");
    }
    if (typeof value === "string") {
        return value;
    }
    return "";
}

function getStoredPromptText(node) {
    return normalizePromptText(node?.properties?.[SERIALIZED_PROMPT_KEY]).trim() || DEFAULT_PROMPT_TEXT;
}

function setStoredPromptText(node, text) {
    node.properties = {
        ...(node.properties ?? {}),
        [SERIALIZED_PROMPT_KEY]: normalizePromptText(text).trim() || DEFAULT_PROMPT_TEXT,
    };
}

function ensureMinNodeSize(node) {
    if (node?.__tePreviewSizeLocked) {
        return;
    }
    const nextSize = node.computeSize?.();
    if (!nextSize) {
        return;
    }
    applyNodeSize(node, [
        Math.max(nextSize[0], MIN_NODE_WIDTH),
        Math.max(nextSize[1], MIN_NODE_HEIGHT),
    ]);
    markCanvasDirty();
}

function ensureImageNodeSize(node) {
    const nextSize = node.computeSize?.();
    if (!nextSize) {
        return;
    }
    applyNodeSize(node, [
        Math.max(nextSize[0], NEW_IMAGE_NODE_MIN_WIDTH),
        Math.max(nextSize[1], NEW_IMAGE_NODE_MIN_HEIGHT),
    ]);
}

function removeLegacyCustomPreview(node) {
    if (!Array.isArray(node?.widgets)) {
        return;
    }

    for (let index = node.widgets.length - 1; index >= 0; index -= 1) {
        const widget = node.widgets[index];
        if (widget?.name !== "te_videopreview") {
            continue;
        }

        if (widget === node.__teVideoPreviewWidget) {
            continue;
        }

        widget?.onRemove?.();
        node.widgets.splice(index, 1);
        if (Array.isArray(node.widgets_values) && index < node.widgets_values.length) {
            node.widgets_values.splice(index, 1);
        }
    }
}

function setNodeImageState(node, images) {
    const nodeId = String(node.id);
    node.images = images;
    app.nodeOutputs ??= {};
    app.nodeOutputs[nodeId] = {
        ...(app.nodeOutputs[nodeId] ?? {}),
        images,
    };
}

// 只负责清理官方预览遗留的 nodeOutputs 字段。
// 本节点自绘预览，不再向 app.nodeOutputs 写 images / animated，
// 否则官方 updatePreviews 会判定为视频输出并额外建一个 <video>，导致上下两个重复预览。
function setOfficialPreviewState(node) {
    const nodeId = String(node.id);

    node.images = [];
    node.imageIndex = 0;
    node.overIndex = 0;

    const outputs = app.nodeOutputs?.[nodeId];
    if (!outputs) {
        return;
    }
    delete outputs.images;
    delete outputs.animated;
}

function restorePreviewImages(node, images) {
    if (!Array.isArray(images) || !images.length) {
        return;
    }

    setNodeImageState(node, images);
    node.imageIndex = 0;
    node.overIndex = 0;

    const loadedImages = images.map((imageInfo) => {
        const img = new Image();
        img.src = buildViewUrl(imageInfo);
        return img;
    });
    node.imgs = loadedImages;
}

function updatePlayButtonLabel(node) {
    if (!node?.__teTogglePreviewWidget) {
        return;
    }
    if (!Array.isArray(node.__teSavedVideos) || !node.__teSavedVideos.length) {
        node.__teTogglePreviewWidget.name = PLAY_BUTTON_TEXT;
        if (node.__teVideoActionBarWidget) {
            markCanvasDirty();
        }
        return;
    }
    node.__teTogglePreviewWidget.name = node.__tePreviewPaused ? RESUME_BUTTON_TEXT : PLAY_BUTTON_TEXT;
    if (node.__teVideoActionBarWidget) {
        markCanvasDirty();
    }
}

function updateCaptureButtonLabel(node) {
    if (!node?.__teCaptureFrameWidget) {
        return;
    }
    node.__teCaptureFrameWidget.name = node.__teFrameCaptureBusy ? CAPTURE_BUSY_TEXT : CAPTURE_BUTTON_TEXT;
    if (node.__teVideoActionBarWidget) {
        markCanvasDirty();
    }
}

function collectVideoElements(value, results, visited = new Set(), depth = 0) {
    if (!value || visited.has(value) || depth > 2) {
        return;
    }
    visited.add(value);

    if (value instanceof HTMLVideoElement) {
        results.push(value);
        return;
    }

    if (value instanceof HTMLElement) {
        if (value.tagName === "VIDEO") {
            results.push(value);
            return;
        }
        results.push(...value.querySelectorAll("video"));
    }

    for (const key of ["element", "el", "inputEl", "parentEl", "container", "videoEl"]) {
        if (value?.[key]) {
            collectVideoElements(value[key], results, visited, depth + 1);
        }
    }
}

function releaseVideoElement(videoEl) {
    if (!(videoEl instanceof HTMLVideoElement)) {
        return;
    }
    try {
        videoEl.pause();
        videoEl.removeAttribute("src");
        videoEl.load?.();
    } catch {
    }
}

function removeOfficialPreviewArtifacts(node) {
    node.__teOfficialVideoEl = null;
    node.__teExpectOfficialPreview = false;
    node.__teHideCustomPreview = false;

    // 官方 useNodeVideo 会设 previewMediaType="video" 并挂上 videoContainer。
    // 只要这两者还留着，isVideoNode() 就恒为真，官方预览每次重绘都会重建，
    // 光删 widget 是删不掉的 —— 必须一并清掉。
    if (node.previewMediaType === "video" || node.previewMediaType === "image") {
        node.previewMediaType = undefined;
    }
    if (node.videoContainer) {
        [...(node.videoContainer.querySelectorAll?.("video") ?? [])].forEach(releaseVideoElement);
        node.videoContainer = undefined;
    }

    if (Array.isArray(node?.imgs)) {
        node.imgs.forEach(releaseVideoElement);
    }
    node.imgs = [];

    if (!Array.isArray(node?.widgets)) {
        return;
    }

    for (let index = node.widgets.length - 1; index >= 0; index -= 1) {
        const widget = node.widgets[index];
        if (widget === node.__teVideoPreviewWidget || widget?.name === "te_videopreview") {
            continue;
        }

        const videoElements = [];
        collectVideoElements(widget, videoElements);
        if (!videoElements.length) {
            continue;
        }

        [...new Set(videoElements)].forEach(releaseVideoElement);
        widget?.onRemove?.();
        node.widgets.splice(index, 1);
        if (Array.isArray(node.widgets_values) && index < node.widgets_values.length) {
            node.widgets_values.splice(index, 1);
        }
    }
}

function getActiveVideoElement(node) {
    return node?.__teCustomVideoEl || null;
}

function updateCustomPreviewVisibility(node) {
    if (!node?.__teVideoPreviewWidget) {
        return;
    }

    node.__teHideCustomPreview = false;
    ensureMinNodeSize(node);
    markCanvasDirty();
}

function syncPreviewSource(node, videos) {
    const normalizedVideos = Array.isArray(videos)
        ? videos.filter((video) => video?.filename)
        : [];
    node.__teSavedVideos = normalizedVideos.length ? [normalizedVideos[0]] : [];

    removeOfficialPreviewArtifacts(node);
    setOfficialPreviewState(node);

    const customVideoEl = node.__teCustomVideoEl;
    const videoInfo = node.__teSavedVideos[0];
    if (customVideoEl) {
        releaseVideoElement(customVideoEl);
        if (!videoInfo) {
            node.__teVideoAspectRatio = null;
        } else {
            customVideoEl.src = buildViewUrl(videoInfo);
            customVideoEl.load?.();
        }
    }

    updateCustomPreviewVisibility(node);
    updatePlayButtonLabel(node);
    ensureMinNodeSize(node);
    markCanvasDirty();
}

function buildInputVideoInfo(filename) {
    const normalized = String(filename || "").trim();
    if (!normalized) {
        return null;
    }
    return {
        filename: normalized,
        subfolder: "",
        type: "input",
    };
}

function isVideoInputConnected(node) {
    const input = Array.isArray(node?.inputs)
        ? node.inputs.find((item) => item?.name === "video")
        : null;
    return !!input?.link;
}

function syncLocalVideoPreview(node, force = false) {
    if (!node || (!force && isVideoInputConnected(node))) {
        return;
    }

    const localVideoWidget = getWidgetByName(node, "local_video");
    const localVideoInfo = buildInputVideoInfo(localVideoWidget?.value);
    if (!localVideoInfo) {
        if (!isVideoInputConnected(node)) {
            syncPreviewSource(node, []);
        }
        return;
    }

    syncPreviewSource(node, [localVideoInfo]);
}

async function uploadVideoFile(file, progressCallback) {
    try {
        const body = new FormData();
        const uploadedFile = new File([file], file.name, {
            type: file.type,
            lastModified: file.lastModified,
        });
        body.append("image", uploadedFile);
        body.append("type", "input");

        const url = api.apiURL("/upload/image");
        const response = await new Promise((resolve) => {
            const request = new XMLHttpRequest();
            request.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    progressCallback?.(event.loaded / event.total);
                }
            };
            request.onload = () => resolve(request);
            request.open("post", url, true);
            request.send(body);
        });

        if (response.status !== 200) {
            throw new Error(`${response.status} - ${response.statusText}`);
        }

        return JSON.parse(response.responseText);
    } catch (error) {
        throw new Error(error?.message || "上传视频失败。");
    }
}

function installLocalVideoUploadButton(node) {
    if (node.__teLocalVideoUploadWidget) {
        return;
    }

    const localVideoWidget = getWidgetByName(node, "local_video");
    if (!localVideoWidget) {
        return;
    }

    const fileInput = document.createElement("input");
    Object.assign(fileInput, {
        type: "file",
        accept: "video/webm,video/mp4,video/x-matroska,image/gif,video/quicktime,video/x-msvideo",
        style: "display: none",
    });

    fileInput.onchange = async () => {
        const selectedFile = fileInput.files?.[0];
        fileInput.value = "";
        if (!selectedFile) {
            return;
        }

        try {
            const uploaded = await uploadVideoFile(selectedFile, (progress) => {
                node.progress = progress;
            });
            node.progress = undefined;

            if (!uploaded?.name) {
                throw new Error("上传视频失败。");
            }

            if (Array.isArray(localVideoWidget.options?.values) && !localVideoWidget.options.values.includes(uploaded.name)) {
                localVideoWidget.options.values.push(uploaded.name);
            }

            localVideoWidget.value = uploaded.name;
            const widgetIndex = node.widgets?.indexOf?.(localVideoWidget) ?? -1;
            if (widgetIndex >= 0) {
                node.widgets_values ??= [];
                node.widgets_values[widgetIndex] = uploaded.name;
            }
            localVideoWidget.callback?.(uploaded.name);
            syncLocalVideoPreview(node, true);
            markCanvasDirty();
        } catch (error) {
            node.progress = undefined;
            console.error(error);
            window.alert?.(error?.message || "上传视频失败。");
        }
    };

    document.body.appendChild(fileInput);

    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        releaseVideoElement(this.__teCustomVideoEl);
        if (Array.isArray(this.imgs)) {
            this.imgs.forEach(releaseVideoElement);
        }
        try {
            fileInput.remove();
        } catch {
        }
        return onRemoved?.apply(this, arguments);
    };

    node.__teLocalVideoUploadInput = fileInput;
    node.__teLocalVideoUploadWidget = node.addWidget("button", LOCAL_UPLOAD_BUTTON_TEXT, "", () => {
        app.canvas.node_widget = null;
        fileInput.click();
    });
    node.__teLocalVideoUploadWidget.serialize = false;
    hideNativeVideoActionWidget(node.__teLocalVideoUploadWidget);
}

function forwardCanvasEvent(event, handlerName) {
    if (!app.canvas?.[handlerName]) {
        return;
    }
    event.preventDefault();
    app.canvas[handlerName](event);
}

function forwardCanvasEventIfBackground(event, handlerName, container) {
    if (event.target && event.target !== container) {
        return;
    }
    forwardCanvasEvent(event, handlerName);
}

function forwardContextMenuToCanvas(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const canvasElement = app.canvas?.canvas;
    if (canvasElement?.dispatchEvent) {
        canvasElement.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
        }));
        return;
    }

    app.canvas?._mousedown_callback?.(event);
}

function installVideoPreviewWidget(node) {
    if (node.__teVideoPreviewWidget) {
        updateCustomPreviewVisibility(node);
        return;
    }

    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.borderRadius = "10px";
    container.style.overflow = "hidden";
    container.style.background = "#050505";
    container.style.border = "1px solid rgba(255,255,255,0.08)";

    const previewWidget = node.addDOMWidget("te_videopreview", "preview", container, {
        serialize: false,
        hideOnZoom: false,
        getValue() {
            return container.value;
        },
        setValue(value) {
            container.value = value;
        },
    });

    previewWidget.computeSize = function (width) {
        if (node.__teHideCustomPreview) {
            return [width, -4];
        }

        const aspectRatio = node.__teVideoAspectRatio;
        if (aspectRatio && aspectRatio > 0) {
            const previewWidth = Math.max((node.size?.[0] ?? MIN_NODE_WIDTH) - 20, 240);
            let previewHeight = previewWidth / aspectRatio;
            previewHeight = Math.max(MIN_PREVIEW_HEIGHT, previewHeight);
            return [width, previewHeight + 8];
        }
        return [width, MIN_PREVIEW_HEIGHT];
    };

    container.addEventListener("contextmenu", forwardContextMenuToCanvas, true);
    container.addEventListener("pointerdown", (event) => forwardCanvasEventIfBackground(event, "_mousedown_callback", container), true);
    container.addEventListener("mousewheel", (event) => forwardCanvasEventIfBackground(event, "_mousewheel_callback", container), true);
    container.addEventListener("pointermove", (event) => forwardCanvasEventIfBackground(event, "_mousemove_callback", container), true);
    container.addEventListener("pointerup", (event) => forwardCanvasEventIfBackground(event, "_mouseup_callback", container), true);

    const videoEl = document.createElement("video");
    videoEl.controls = true;
    videoEl.loop = false;
    videoEl.muted = false;
    videoEl.autoplay = false;
    videoEl.playsInline = true;
    videoEl.preload = "metadata";
    videoEl.style.display = "block";
    videoEl.style.width = "100%";
    videoEl.style.height = "auto";
    videoEl.style.background = "#000";

    videoEl.addEventListener("loadedmetadata", () => {
        if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            node.__teVideoAspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        } else {
            node.__teVideoAspectRatio = null;
        }
        ensureMinNodeSize(node);
        if (node.__tePreviewPaused) {
            videoEl.pause();
        }
        updateCustomPreviewVisibility(node);
        markCanvasDirty();
    });

    videoEl.addEventListener("canplay", () => {
        updateCustomPreviewVisibility(node);
        markCanvasDirty();
    });

    videoEl.addEventListener("play", () => {
        node.__tePreviewPaused = false;
        updatePlayButtonLabel(node);
        markCanvasDirty();
    });

    videoEl.addEventListener("pause", () => {
        node.__tePreviewPaused = true;
        updatePlayButtonLabel(node);
        markCanvasDirty();
    });

    videoEl.addEventListener("error", () => {
        node.__teVideoAspectRatio = null;
        updatePlayButtonLabel(node);
        ensureMinNodeSize(node);
        markCanvasDirty();
    });

    container.appendChild(videoEl);

    node.__teVideoPreviewWidget = previewWidget;
    node.__teCustomVideoEl = videoEl;
    updateCustomPreviewVisibility(node);
}

async function togglePreviewPlayback(node) {
    const videoEl = getActiveVideoElement(node);
    if (!videoEl || !Array.isArray(node.__teSavedVideos) || !node.__teSavedVideos.length) {
        return;
    }

    if (videoEl.paused) {
        node.__tePreviewPaused = false;
        await videoEl.play?.().catch(() => {});
    } else {
        videoEl.pause();
    }
    updatePlayButtonLabel(node);
    markCanvasDirty();
}

function buildCaptureFilename(videoInfo, currentTimeSeconds) {
    const baseName = String(videoInfo?.filename || "te_video")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "te_video";
    const milliseconds = Math.max(0, Math.round((currentTimeSeconds || 0) * 1000));
    return `${baseName}_frame_${milliseconds}ms.png`;
}

async function uploadCapturedFrame(node) {
    const videoEl = getActiveVideoElement(node);
    const videoInfo = Array.isArray(node?.__teSavedVideos) ? node.__teSavedVideos[0] : null;
    if (!videoEl || !videoInfo) {
        throw new Error("当前节点还没有可截帧的视频。");
    }

    if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
        throw new Error("视频还没加载完成，暂时不能截帧。");
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("创建截图画布失败。");
    }
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!(blob instanceof Blob)) {
        throw new Error("当前帧转图片失败。");
    }

    const formData = new FormData();
    formData.append(
        "image",
        new File([blob], buildCaptureFilename(videoInfo, videoEl.currentTime), {
            type: "image/png",
        })
    );
    formData.append("type", "input");

    const response = await api.fetchApi("/upload/image", {
        method: "POST",
        body: formData,
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (response.status !== 200 || !data?.name) {
        throw new Error("上传截帧图片失败。");
    }

    return {
        filename: data.name,
        subfolder: data.subfolder || "",
        type: data.type || "input",
    };
}

function createCapturedFrameNode(sourceNode, imageInfo, promptText) {
    if (!app.graph || !window.LiteGraph?.createNode) {
        throw new Error("当前画布还没准备好，无法创建截图节点。");
    }

    const newNode = window.LiteGraph.createNode(IMAGE_NODE_CLASS);
    if (!newNode) {
        throw new Error(`创建节点失败: ${IMAGE_NODE_CLASS}`);
    }

    const offsetIndex = sourceNode.__teCaptureCreatedCount || 0;
    sourceNode.__teCaptureCreatedCount = offsetIndex + 1;

    app.graph.add(newNode);
    newNode.pos = [
        (sourceNode.pos?.[0] ?? 0) + (sourceNode.size?.[0] ?? MIN_NODE_WIDTH) + NEW_IMAGE_NODE_GAP_X,
        (sourceNode.pos?.[1] ?? 0) + offsetIndex * NEW_IMAGE_NODE_GAP_Y,
    ];

    ensureImageNodeSize(newNode);

    const filenamePrefix = getWidgetByName(sourceNode, "filename_prefix")?.value;
    if (filenamePrefix) {
        setWidgetValue(newNode, "filename_prefix", filenamePrefix);
    }
    setWidgetValue(newNode, "upload_image", imageInfo.filename);

    newNode.properties = {
        ...(newNode.properties ?? {}),
        [SERIALIZED_PROMPT_KEY]: normalizePromptText(promptText).trim() || DEFAULT_PROMPT_TEXT,
    };

    restorePreviewImages(newNode, [imageInfo]);
    markCanvasDirty();
    return newNode;
}

async function captureCurrentFrame(node) {
    if (node.__teFrameCaptureBusy) {
        return;
    }

    node.__teFrameCaptureBusy = true;
    updateCaptureButtonLabel(node);
    markCanvasDirty();

    try {
        const uploadedImage = await uploadCapturedFrame(node);
        createCapturedFrameNode(node, uploadedImage, getStoredPromptText(node));
    } finally {
        node.__teFrameCaptureBusy = false;
        updateCaptureButtonLabel(node);
        markCanvasDirty();
    }
}

function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function isPointInsideRect(pos, rect) {
    if (!Array.isArray(pos) || !Array.isArray(rect)) {
        return false;
    }
    const [x, y] = pos;
    const [rx, ry, rw, rh] = rect;
    return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function hideNativeVideoActionWidget(widget) {
    if (!widget || widget.__teVideoActionHidden) {
        return;
    }
    widget.__teVideoActionHidden = true;
    widget.__teOriginalComputeSize = widget.computeSize;
    widget.__teOriginalDraw = widget.draw;
    widget.serialize = false;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
}

function hideNativeVideoActionWidgets(node) {
    [
        node?.__teLocalVideoUploadWidget,
        node?.__teTogglePreviewWidget,
        node?.__teCaptureFrameWidget,
    ].forEach(hideNativeVideoActionWidget);
}

function getVideoActionBarItems(node) {
    const hasVideo = Array.isArray(node?.__teSavedVideos) && node.__teSavedVideos.length > 0;
    const uploadBusy = typeof node?.progress === "number";
    const captureBusy = !!node?.__teFrameCaptureBusy;

    return [
        {
            key: "upload",
            label: uploadBusy ? "上传中" : LOCAL_UPLOAD_BUTTON_TEXT,
            title: LOCAL_UPLOAD_BUTTON_TEXT,
            weight: 1.1,
            disabled: uploadBusy,
            active: uploadBusy,
            run: async () => {
                app.canvas.node_widget = null;
                node.__teLocalVideoUploadInput?.click();
            },
        },
        {
            key: "preview",
            label: node?.__tePreviewPaused ? RESUME_BUTTON_TEXT : PLAY_BUTTON_TEXT,
            title: node?.__tePreviewPaused ? RESUME_BUTTON_TEXT : PLAY_BUTTON_TEXT,
            weight: 1,
            disabled: !hasVideo,
            active: hasVideo && !node?.__tePreviewPaused,
            run: async () => {
                await togglePreviewPlayback(node);
            },
        },
        {
            key: "capture",
            label: captureBusy ? CAPTURE_BUSY_TEXT : CAPTURE_BUTTON_TEXT,
            title: CAPTURE_BUTTON_TEXT,
            weight: 1.1,
            disabled: !hasVideo || captureBusy,
            active: captureBusy,
            run: async () => {
                await captureCurrentFrame(node);
            },
        },
    ];
}

function fitActionBarLabel(ctx, label, maxWidth) {
    const text = String(label ?? "");
    if (ctx.measureText(text).width <= maxWidth) {
        return text;
    }

    let fitted = text;
    while (fitted.length > 1 && ctx.measureText(`${fitted}...`).width > maxWidth) {
        fitted = fitted.slice(0, -1);
    }
    return `${fitted}...`;
}

function getVideoActionBarLayout(items, width, y, height) {
    const barX = TE_VIDEO_ACTION_BAR_SIDE_MARGIN;
    const barWidth = Math.max(0, width - TE_VIDEO_ACTION_BAR_SIDE_MARGIN * 2);
    const buttonHeight = Math.min(26, Math.max(20, height - 6));
    const buttonY = y + Math.max(3, (height - buttonHeight) / 2);
    const gapTotal = Math.max(0, items.length - 1) * TE_VIDEO_ACTION_BAR_GAP;
    const usableWidth = Math.max(0, barWidth - TE_VIDEO_ACTION_BAR_PADDING_X * 2 - gapTotal);
    const weightTotal = items.reduce((sum, item) => sum + (item.weight || 1), 0) || 1;
    const layout = [];
    let cursorX = barX + TE_VIDEO_ACTION_BAR_PADDING_X;
    let usedWidth = 0;

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const isLast = index === items.length - 1;
        const rawWidth = usableWidth * ((item.weight || 1) / weightTotal);
        const buttonWidth = isLast
            ? Math.max(34, usableWidth - usedWidth)
            : Math.max(34, Math.round(rawWidth));
        layout.push({
            item,
            rect: [cursorX, buttonY, buttonWidth, buttonHeight],
        });
        cursorX += buttonWidth + TE_VIDEO_ACTION_BAR_GAP;
        usedWidth += buttonWidth;
    }

    return layout;
}

function drawVideoActionBarButton(ctx, rect, item) {
    const [x, y, width, height] = rect;
    if (width <= 0 || height <= 0) {
        return;
    }

    const disabled = !!item.disabled;
    const active = !!item.active;
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, disabled ? "rgba(255, 255, 255, 0.06)" : active ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.085)");
    gradient.addColorStop(1, disabled ? "rgba(255, 255, 255, 0.03)" : active ? "rgba(255, 255, 255, 0.09)" : "rgba(255, 255, 255, 0.045)");

    ctx.save();
    ctx.shadowColor = disabled ? "rgba(0, 0, 0, 0)" : "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = active ? 8 : 5;
    ctx.shadowOffsetY = 1;
    drawRoundRect(ctx, x, y, width, height, 8);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.strokeStyle = disabled
        ? "rgba(255, 255, 255, 0.10)"
        : active ? "rgba(255, 255, 255, 0.34)" : "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "500 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = disabled
        ? "rgba(210, 210, 210, 0.42)"
        : active ? "rgba(255, 255, 255, 0.98)" : "rgba(238, 238, 238, 0.90)";
    ctx.fillText(fitActionBarLabel(ctx, item.label, width - 10), x + width / 2, y + height / 2 + 0.5);
    ctx.restore();
}

function hitTestVideoActionBar(widget, pos) {
    if (!Array.isArray(pos)) {
        return null;
    }
    const hit = widget.__teVideoActionBarRects?.find((entry) => isPointInsideRect(pos, entry.rect));
    return hit?.key ?? null;
}

function createVideoActionBarWidget(node) {
    return {
        name: TE_VIDEO_ACTION_BAR_NAME,
        type: "custom",
        value: "",
        serialize: false,
        options: { serialize: false, hideOnZoom: false },
        __teVideoActionBar: true,
        __teVideoActionBarRects: [],
        computeSize(width) {
            return [Math.max(width || 320, 260), TE_VIDEO_ACTION_BAR_HEIGHT];
        },
        draw(ctx, drawNode, width, y, height) {
            const items = getVideoActionBarItems(drawNode || node);
            const layout = getVideoActionBarLayout(items, width, y, height || TE_VIDEO_ACTION_BAR_HEIGHT);
            this.__teVideoActionBarRects = layout.map(({ item, rect }) => ({
                key: item.key,
                rect,
            }));

            ctx.save();
            for (const { item, rect } of layout) {
                drawVideoActionBarButton(ctx, rect, item);
            }
            ctx.restore();
        },
        mouse(event, pos, mouseNode) {
            const eventType = event?.type;
            if (eventType !== "pointerdown" && eventType !== "mousedown") {
                return false;
            }
            if (typeof event?.button === "number" && event.button !== 0) {
                return false;
            }

            const activeNode = mouseNode || node;
            const key = hitTestVideoActionBar(this, pos);
            const item = getVideoActionBarItems(activeNode).find((entry) => entry.key === key);
            if (!item) {
                return false;
            }

            event?.preventDefault?.();
            event?.stopPropagation?.();
            event?.stopImmediatePropagation?.();

            if (item.disabled) {
                return true;
            }

            Promise.resolve(item.run(event)).catch((error) => {
                console.error(error);
                window.alert?.(error?.message || `${item.title || item.label} 失败。`);
            });
            return true;
        },
    };
}

function ensureVideoActionBar(node) {
    if (!node) {
        return null;
    }
    if (!Array.isArray(node.widgets)) {
        node.widgets = [];
    }

    hideNativeVideoActionWidgets(node);
    const existingWidget = node.widgets.find((widget) => widget?.__teVideoActionBar || widget?.name === TE_VIDEO_ACTION_BAR_NAME);
    if (existingWidget) {
        existingWidget.__teVideoActionBar = true;
        node.__teVideoActionBarWidget = existingWidget;
        return existingWidget;
    }

    const widget = createVideoActionBarWidget(node);
    const filenamePrefixIndex = node.widgets.findIndex((entry) => entry?.name === "filename_prefix");
    const localVideoIndex = node.widgets.findIndex((entry) => entry?.name === "local_video");
    const insertAfter = filenamePrefixIndex >= 0 ? filenamePrefixIndex : localVideoIndex;
    const insertIndex = insertAfter >= 0 ? insertAfter + 1 : node.widgets.length;
    node.widgets.splice(insertIndex, 0, widget);
    node.__teVideoActionBarWidget = widget;
    markCanvasDirty();
    return widget;
}

app.registerExtension({
    name: "TEImagePro.SaveVideoWithFrameCapture",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== VIDEO_NODE_CLASS) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            this.__teSavedVideos = this.__teSavedVideos || [];
            this.__tePreviewPaused = this.__tePreviewPaused ?? true;
            this.__teFrameCaptureBusy = this.__teFrameCaptureBusy ?? false;
            this.__teCaptureCreatedCount = this.__teCaptureCreatedCount ?? 0;
            this.__tePreviewSizeLocked = this.__tePreviewSizeLocked ?? false;
            this.__teInternalResize = this.__teInternalResize ?? false;
            this.__teLastManagedSize = Array.isArray(this.__teLastManagedSize) ? this.__teLastManagedSize : null;
            this.properties = {
                ...(this.properties ?? {}),
                [SERIALIZED_PROMPT_KEY]:
                    normalizePromptText(this.properties?.[SERIALIZED_PROMPT_KEY]).trim() || DEFAULT_PROMPT_TEXT,
            };

            removeLegacyCustomPreview(this);
            installVideoPreviewWidget(this);
            installLocalVideoUploadButton(this);

            const localVideoWidget = getWidgetByName(this, "local_video");
            if (localVideoWidget && !localVideoWidget.__tePreviewCallbackInstalled) {
                const originalCallback = localVideoWidget.callback;
                localVideoWidget.callback = (value) => {
                    const callbackResult = originalCallback?.call(localVideoWidget, value);
                    syncLocalVideoPreview(this);
                    markCanvasDirty();
                    return callbackResult;
                };
                localVideoWidget.__tePreviewCallbackInstalled = true;
            }

            if (!this.__teTogglePreviewWidget) {
                this.__teTogglePreviewWidget = this.addWidget("button", PLAY_BUTTON_TEXT, "", async () => {
                    await togglePreviewPlayback(this);
                });
                this.__teTogglePreviewWidget.serialize = false;
            }
            hideNativeVideoActionWidget(this.__teTogglePreviewWidget);

            if (!this.__teCaptureFrameWidget) {
                this.__teCaptureFrameWidget = this.addWidget("button", CAPTURE_BUTTON_TEXT, "", async () => {
                    try {
                        await captureCurrentFrame(this);
                    } catch (error) {
                        console.error(error);
                        window.alert?.(error?.message || "截取当前帧失败。");
                    }
                });
                this.__teCaptureFrameWidget.serialize = false;
            }
            hideNativeVideoActionWidget(this.__teCaptureFrameWidget);
            ensureVideoActionBar(this);

            updatePlayButtonLabel(this);
            updateCaptureButtonLabel(this);
            syncLocalVideoPreview(this);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            let result;
            if (onExecuted) {
                const baseMessage = message && typeof message === "object"
                    ? { ...message }
                    : message;
                if (baseMessage && typeof baseMessage === "object") {
                    delete baseMessage.images;
                    delete baseMessage.video;
                    delete baseMessage.videos;
                    delete baseMessage.animated;
                    delete baseMessage.gifs;
                }
                result = onExecuted.call(this, baseMessage);
            }
            // 后端现在发 "video"；保留 images/videos 回退，兼容旧版本已存盘的工作流。
            syncPreviewSource(this, message?.video ?? message?.images ?? message?.videos);
            setStoredPromptText(this, message?.te_prompt_text);
            updatePlayButtonLabel(this);
            return result;
        };

        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function () {
            const currentSize = Array.isArray(this.size) ? this.size : null;
            const lastManagedSize = Array.isArray(this.__teLastManagedSize) ? this.__teLastManagedSize : null;
            const managedResize =
                !!currentSize &&
                !!lastManagedSize &&
                Math.abs((currentSize[0] ?? 0) - (lastManagedSize[0] ?? 0)) < 0.5 &&
                Math.abs((currentSize[1] ?? 0) - (lastManagedSize[1] ?? 0)) < 0.5;

            if (!this.__teInternalResize && !managedResize) {
                this.__tePreviewSizeLocked = true;
            }
            return onResize?.apply(this, arguments);
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (info) {
            const result = onSerialize?.apply(this, arguments);
            info.properties ??= {};

            if (Array.isArray(this.__teSavedVideos) && this.__teSavedVideos.length) {
                info.properties[SERIALIZED_VIDEO_KEY] = this.__teSavedVideos;
            } else {
                delete info.properties[SERIALIZED_VIDEO_KEY];
            }

            const promptText = this.properties?.[SERIALIZED_PROMPT_KEY];
            if (promptText) {
                info.properties[SERIALIZED_PROMPT_KEY] = promptText;
            } else {
                delete info.properties[SERIALIZED_PROMPT_KEY];
            }

            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);
            this.__tePreviewPaused = true;
            this.__teFrameCaptureBusy = false;
            this.__tePreviewSizeLocked = true;
            this.__teInternalResize = false;
            this.__teLastManagedSize = null;
            removeLegacyCustomPreview(this);
            ensureVideoActionBar(this);
            updateCaptureButtonLabel(this);
            setStoredPromptText(this, info?.properties?.[SERIALIZED_PROMPT_KEY]);

            const videos = info?.properties?.[SERIALIZED_VIDEO_KEY];
            if (Array.isArray(videos) && videos.length) {
                syncPreviewSource(this, videos);
            } else {
                syncLocalVideoPreview(this, true);
            }
            return result;
        };
    },
});
