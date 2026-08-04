import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const PROMPT_TEXT_NODE_CLASS = "TE_prompt_text";
const PROMPT_TEXT_TARGET_CONFIGS = {
    TE_image_pro_grok_image: {
        imageInputs: [
            { name: "image", label: "图片1", insertText: "图1" },
            { name: "image_2", label: "图片2", insertText: "图2" },
            { name: "image_3", label: "图片3", insertText: "图3" },
        ],
    },
    TE_image_pro_happyh_video: {
        imageInputs: Array.from({ length: 9 }, (_, index) => ({
            name: `image_${index + 1}`,
            label: `图片${index + 1}`,
            insertText: `图${index + 1}`,
        })),
    },
    MiniMaxH3ReferenceToVideo: {
        minimaxH3References: true,
    },
    MiniMaxH3ImageToVideo: {
        imageInputs: [
            { name: "first_frame", label: "首帧", insertText: "<Picture 1>" },
            { name: "last_frame", label: "尾帧", insertText: "<Picture 2>" },
        ],
    },
};

let activeMenu = null;

function markCanvasDirty() {
    app.graph?.setDirtyCanvas?.(true, false);
    app.canvas?.setDirty?.(true, false);
}

function buildViewUrl(fileInfo) {
    if (!fileInfo?.filename) {
        return "";
    }
    const params = new URLSearchParams({
        filename: fileInfo.filename,
        type: fileInfo.type || "output",
        rand: String(Date.now()),
    });
    if (fileInfo.subfolder) {
        params.set("subfolder", fileInfo.subfolder);
    }
    return api.apiURL(`/view?${params.toString()}`);
}

function getWidgetByName(node, name) {
    return Array.isArray(node?.widgets)
        ? node.widgets.find((widget) => widget?.name === name) || null
        : null;
}

function getWidgetTextElement(widget) {
    const candidates = [widget?.inputEl, widget?.element, widget?.domElement, widget?.inputElement];
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        if (candidate instanceof HTMLTextAreaElement || candidate instanceof HTMLInputElement) {
            return candidate;
        }
        const found = candidate.querySelector?.("textarea,input");
        if (found instanceof HTMLTextAreaElement || found instanceof HTMLInputElement) {
            return found;
        }
    }
    return null;
}

function getGraph(node) {
    return node?.graph || app.canvas?.getCurrentGraph?.() || app.canvas?.graph || app.graph || null;
}

function getGraphLink(graph, linkOrId) {
    if (linkOrId && typeof linkOrId === "object") {
        return linkOrId;
    }
    const links = graph?.links;
    return links instanceof Map ? links.get(linkOrId) : links?.[linkOrId];
}

function getGraphLinks(graph) {
    const links = graph?.links;
    if (links instanceof Map) {
        return Array.from(links.values());
    }
    return Array.isArray(links) ? links.filter(Boolean) : Object.values(links || {});
}

function getNodeById(graph, nodeId) {
    return graph?.getNodeById?.(nodeId) || graph?._nodes_by_id?.[nodeId] || null;
}

function getLinkOriginId(link) {
    return Array.isArray(link) ? link[1] : link?.origin_id ?? link?.originId;
}

function getLinkOriginSlot(link) {
    return Array.isArray(link) ? link[2] : link?.origin_slot ?? link?.originSlot;
}

function getLinkTargetId(link) {
    return Array.isArray(link) ? link[3] : link?.target_id ?? link?.targetId;
}

function getLinkTargetSlot(link) {
    return Array.isArray(link) ? link[4] : link?.target_slot ?? link?.targetSlot;
}

function getInputLeafName(input) {
    return String(input?.name || "").split(".").pop();
}

function findInputByName(node, inputName) {
    return (node?.inputs || []).find((input) => (
        input?.name === inputName || getInputLeafName(input) === inputName
    )) || null;
}

function getOriginNodeFromInput(node, inputName) {
    const input = findInputByName(node, inputName);
    const linkId = input?.link ?? input?.links?.[0];
    const graph = getGraph(node);
    if (linkId == null || !graph) {
        return null;
    }
    const link = getGraphLink(graph, linkId);
    const originId = getLinkOriginId(link);
    return originId == null ? null : getNodeById(graph, originId);
}

function getPromptTextTargetConfig(nodeOrType) {
    if (typeof nodeOrType === "string") {
        return PROMPT_TEXT_TARGET_CONFIGS[nodeOrType] || null;
    }
    const names = [
        nodeOrType?.comfyClass,
        nodeOrType?.type,
        nodeOrType?.constructor?.comfyClass,
        nodeOrType?.constructor?.type,
    ].map((value) => String(value || "")).filter(Boolean);
    for (const name of names) {
        if (PROMPT_TEXT_TARGET_CONFIGS[name]) {
            return PROMPT_TEXT_TARGET_CONFIGS[name];
        }
        if (name.endsWith("MiniMaxH3ReferenceToVideo")) {
            return PROMPT_TEXT_TARGET_CONFIGS.MiniMaxH3ReferenceToVideo;
        }
        if (name.endsWith("MiniMaxH3ImageToVideo")) {
            return PROMPT_TEXT_TARGET_CONFIGS.MiniMaxH3ImageToVideo;
        }
    }
    const title = String(nodeOrType?.title || "");
    if (title === "MiniMax H3 Reference to Video") {
        return PROMPT_TEXT_TARGET_CONFIGS.MiniMaxH3ReferenceToVideo;
    }
    return title === "MiniMax H3 Image to Video"
        ? PROMPT_TEXT_TARGET_CONFIGS.MiniMaxH3ImageToVideo
        : null;
}

function getDownstreamPromptTargetNode(promptNode) {
    const graph = getGraph(promptNode);
    if (!graph) {
        return null;
    }

    const outputLinks = promptNode?.outputs?.[0]?.links;
    const linkValues = outputLinks instanceof Set
        ? Array.from(outputLinks)
        : Array.isArray(outputLinks)
            ? outputLinks
            : outputLinks == null
                ? []
                : [outputLinks];
    const links = linkValues.map((value) => getGraphLink(graph, value)).filter(Boolean);
    if (!links.length) {
        links.push(...getGraphLinks(graph).filter((link) => (
            String(getLinkOriginId(link)) === String(promptNode?.id)
            && Number(getLinkOriginSlot(link) || 0) === 0
        )));
    }

    for (const link of links) {
        if (!link) {
            continue;
        }
        const targetId = getLinkTargetId(link);
        const targetNode = targetId == null ? null : getNodeById(graph, targetId);
        const targetSlot = getLinkTargetSlot(link);
        const targetInput = targetNode?.inputs?.[targetSlot];
        if (getPromptTextTargetConfig(targetNode) && getInputLeafName(targetInput) === "prompt") {
            return targetNode;
        }
    }
    return null;
}

function getLoadImageFileInfo(node) {
    if (!node || node.type !== "LoadImage") {
        return null;
    }
    const uploadWidget = getWidgetByName(node, "image") || node.widgets?.[0];
    const filename = String(uploadWidget?.value || node.widgets_values?.[0] || "").trim();
    return filename ? { filename, subfolder: "", type: "input" } : null;
}

function getFirstImageFileInfo(node) {
    const outputImages = app.nodeOutputs?.[String(node?.id)]?.images;
    if (Array.isArray(outputImages) && outputImages.length) {
        return outputImages[0];
    }
    if (Array.isArray(node?.images) && node.images.length) {
        return node.images[0];
    }
    return getLoadImageFileInfo(node);
}

function getFirstImageSrc(node) {
    if (Array.isArray(node?.imgs) && node.imgs.length && node.imgs[0]?.src) {
        return node.imgs[0].src;
    }
    return buildViewUrl(getFirstImageFileInfo(node));
}

function getConnectedInputsByPrefix(targetNode, prefix) {
    const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
    return (targetNode?.inputs || []).map((input) => {
        const match = getInputLeafName(input).match(pattern);
        if (!match) {
            return null;
        }
        const originNode = getOriginNodeFromInput(targetNode, input.name);
        return originNode ? { input, originNode, slot: Number(match[1]) } : null;
    }).filter(Boolean).sort((left, right) => left.slot - right.slot);
}

function getMiniMaxH3ReferenceOptions(targetNode) {
    const options = [];
    const images = getConnectedInputsByPrefix(targetNode, "ref_image_");
    images.forEach((entry, index) => {
        options.push({
            name: entry.input.name,
            label: `参考图${index + 1}`,
            insertText: `<Picture ${index + 1}>`,
            src: getFirstImageSrc(entry.originNode),
            previewLabel: "图片",
        });
    });

    let audioIndex = 0;
    const videos = getConnectedInputsByPrefix(targetNode, "ref_video_")
        .filter((entry) => !entry.input.name.startsWith("ref_video_audio_"));
    videos.forEach((entry, index) => {
        const soundtrackName = `ref_video_audio_${entry.slot}`;
        if (getOriginNodeFromInput(targetNode, soundtrackName)) {
            audioIndex += 1;
            options.push({
                name: soundtrackName,
                label: `视频音频${index + 1}`,
                insertText: `<Audio ${audioIndex}>`,
                previewLabel: "音频",
            });
        }
        options.push({
            name: entry.input.name,
            label: `参考视频${index + 1}`,
            insertText: `<Video ${index + 1}>`,
            previewLabel: "视频",
        });
    });

    getConnectedInputsByPrefix(targetNode, "ref_audio_").forEach((entry) => {
        audioIndex += 1;
        options.push({
            name: entry.input.name,
            label: `参考音频${audioIndex}`,
            insertText: `<Audio ${audioIndex}>`,
            previewLabel: "音频",
        });
    });
    return options;
}

function getConnectedReferenceOptions(promptNode) {
    const targetNode = getDownstreamPromptTargetNode(promptNode);
    const config = getPromptTextTargetConfig(targetNode);
    if (!targetNode || !config) {
        return [];
    }
    if (config.minimaxH3References) {
        return getMiniMaxH3ReferenceOptions(targetNode);
    }

    return (config.imageInputs || []).map((inputDef) => {
        const originNode = getOriginNodeFromInput(targetNode, inputDef.name);
        if (!originNode) {
            return null;
        }
        return { ...inputDef, src: getFirstImageSrc(originNode) };
    }).filter(Boolean);
}

function makeChip(option) {
    const chip = document.createElement("span");
    chip.className = "te-prompt-image-chip";
    chip.dataset.insertText = option.insertText;
    chip.contentEditable = "false";
    Object.assign(chip.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        margin: "0 4px",
        padding: "2px 8px 2px 3px",
        borderRadius: "8px",
        border: "1px solid rgba(92, 154, 255, 0.9)",
        background: "rgba(55, 105, 180, 0.55)",
        color: "#eaf2ff",
        verticalAlign: "middle",
        whiteSpace: "nowrap",
    });

    if (option.src) {
        const img = document.createElement("img");
        img.src = option.src;
        Object.assign(img.style, {
            width: "28px",
            height: "28px",
            borderRadius: "5px",
            objectFit: "cover",
            display: "inline-block",
        });
        chip.appendChild(img);
    }

    const label = document.createElement("span");
    label.textContent = option.insertText;
    chip.appendChild(label);
    return chip;
}

function plainTextFromEditor(root) {
    let text = "";
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.nodeValue || "";
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }
        if (node.classList?.contains("te-prompt-image-chip")) {
            text += node.dataset.insertText || node.textContent || "";
            return;
        }
        if (node.tagName === "BR") {
            text += "\n";
            return;
        }
        for (const child of node.childNodes) {
            walk(child);
        }
        if (["DIV", "P"].includes(node.tagName) && node !== root) {
            text += "\n";
        }
    };
    walk(root);
    return text.replace(/\n$/g, "");
}

function setHiddenWidgetValue(node, widget, textarea, value) {
    const text = String(value || "");
    if (widget) {
        widget.value = text;
        widget.callback?.(text);
    }
    if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const index = Array.isArray(node.widgets) ? node.widgets.indexOf(widget) : -1;
    if (index >= 0) {
        node.widgets_values ??= [];
        node.widgets_values[index] = text;
    }
    markCanvasDirty();
}

function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPromptTokenPattern(promptNode) {
    const tokens = Array.from(new Set(getConnectedReferenceOptions(promptNode)
        .map((item) => String(item?.insertText || "").trim())
        .filter(Boolean)))
        .sort((left, right) => right.length - left.length);
    if (!tokens.length) {
        return /(图(?:[1-9]|10|11|12))/g;
    }
    return new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "g");
}

function renderEditorFromText(editor, text, promptNode) {
    const optionsByText = new Map(getConnectedReferenceOptions(promptNode).map((item) => [item.insertText, item]));
    editor.replaceChildren();

    const value = String(text || "");
    const pattern = getPromptTokenPattern(promptNode);
    let last = 0;
    for (const match of value.matchAll(pattern)) {
        if (match.index > last) {
            editor.appendChild(document.createTextNode(value.slice(last, match.index)));
        }
        const option = optionsByText.get(match[0]);
        editor.appendChild(option ? makeChip(option) : document.createTextNode(match[0]));
        last = match.index + match[0].length;
    }
    if (last < value.length) {
        editor.appendChild(document.createTextNode(value.slice(last)));
    }
    if (!editor.childNodes.length) {
        editor.appendChild(document.createElement("br"));
    }
}

function getCaretRect(fallbackEl) {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
        const range = selection.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getClientRects()[0] || range.getBoundingClientRect();
        if (rect && (rect.width || rect.height || rect.left || rect.top)) {
            return rect;
        }
    }
    return fallbackEl.getBoundingClientRect();
}

function positionMentionMenu(menu, anchorRect) {
    const margin = 8;
    const gap = 8;
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(margin, Math.min(
        window.innerWidth - menuRect.width - margin,
        anchorRect.left,
    ));
    let top = anchorRect.bottom + gap;
    if (top + menuRect.height > window.innerHeight - margin) {
        top = anchorRect.top - menuRect.height - gap;
    }
    top = Math.max(margin, Math.min(window.innerHeight - menuRect.height - margin, top));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
}

function getMentionRangeInEditor(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
        return null;
    }
    const anchor = selection.anchorNode;
    const offset = selection.anchorOffset;
    if (anchor.nodeType !== Node.TEXT_NODE) {
        return null;
    }
    const before = (anchor.nodeValue || "").slice(0, offset);
    const match = before.match(/@[\u4e00-\u9fa5\w]*$/);
    if (!match) {
        return null;
    }
    const range = document.createRange();
    range.setStart(anchor, offset - match[0].length);
    range.setEnd(anchor, offset);
    return range;
}

function closeMenu() {
    activeMenu?.element?.remove();
    activeMenu = null;
}

function updateMenuSelection() {
    if (!activeMenu) {
        return;
    }
    activeMenu.rows.forEach((row, index) => {
        row.style.background = index === activeMenu.selectedIndex
            ? "rgba(44, 221, 118, 0.18)"
            : "transparent";
        row.style.color = index === activeMenu.selectedIndex ? "#ffffff" : "inherit";
    });
    activeMenu.rows[activeMenu.selectedIndex]?.scrollIntoView?.({ block: "nearest" });
}

function syncEditorToWidget(promptNode) {
    const state = promptNode.__tePromptTextState;
    if (!state) {
        return;
    }
    setHiddenWidgetValue(promptNode, state.textWidget, state.textarea, plainTextFromEditor(state.editor));
}

function chooseOption(option, promptNode) {
    const state = promptNode.__tePromptTextState;
    if (!state) {
        return;
    }
    const range = getMentionRangeInEditor(state.editor);
    if (!range) {
        return;
    }

    range.deleteContents();
    const chip = makeChip(option);
    const spacer = document.createTextNode(" ");
    range.insertNode(spacer);
    range.insertNode(chip);

    const selection = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(spacer);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);

    syncEditorToWidget(promptNode);
    closeMenu();
    state.editor.focus();
}

function showMentionMenu(promptNode) {
    const state = promptNode.__tePromptTextState;
    if (!state) {
        return;
    }
    const options = getConnectedReferenceOptions(promptNode);
    const mentionRange = getMentionRangeInEditor(state.editor);
    if (!options.length || !mentionRange) {
        closeMenu();
        return;
    }

    closeMenu();
    const rect = getCaretRect(state.editor);
    const menu = document.createElement("div");
    menu.className = "te-prompt-image-mention-menu";
    Object.assign(menu.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: `${Math.min(320, Math.max(160, window.innerWidth - 16))}px`,
        maxHeight: `${Math.max(120, window.innerHeight - 16)}px`,
        overflowY: "auto",
        overscrollBehavior: "contain",
        boxSizing: "border-box",
        padding: "10px",
        borderRadius: "14px",
        background: "rgba(38, 38, 38, 0.98)",
        color: "#f2f2f2",
        boxShadow: "0 18px 45px rgba(0, 0, 0, 0.35)",
        zIndex: "100000",
        fontFamily: "sans-serif",
        visibility: "hidden",
    });

    const rows = [];
    options.forEach((option, index) => {
        const row = document.createElement("button");
        row.type = "button";
        Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            gap: "14px",
            width: "100%",
            border: "0",
            borderRadius: "10px",
            padding: "9px",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            fontSize: "20px",
            textAlign: "left",
        });
        row.addEventListener("mouseenter", () => {
            if (activeMenu) {
                activeMenu.selectedIndex = index;
                updateMenuSelection();
            }
        });
        row.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            chooseOption(option, promptNode);
        });

        const preview = document.createElement("div");
        Object.assign(preview.style, {
            width: "54px",
            height: "54px",
            borderRadius: "7px",
            overflow: "hidden",
            flex: "0 0 auto",
            background: "rgba(255, 255, 255, 0.12)",
        });
        if (option.src) {
            const img = document.createElement("img");
            img.src = option.src;
            Object.assign(img.style, {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
            });
            preview.appendChild(img);
        } else if (option.previewLabel) {
            preview.textContent = option.previewLabel;
            Object.assign(preview.style, {
                display: "grid",
                placeItems: "center",
                color: "rgba(255, 255, 255, 0.72)",
                fontSize: "12px",
                fontWeight: "700",
            });
        }

        const label = document.createElement("span");
        label.textContent = `${option.label}  ->  ${option.insertText}`;
        label.style.flex = "1 1 auto";
        row.append(preview, label);
        rows.push(row);
        menu.appendChild(row);
    });

    document.body.appendChild(menu);
    positionMentionMenu(menu, rect);
    activeMenu = { element: menu, rows, options, selectedIndex: 0, promptNode };
    updateMenuSelection();
}

function handleMenuKeydown(event) {
    if (!activeMenu) {
        return false;
    }
    if (event.key === "ArrowDown") {
        event.preventDefault();
        activeMenu.selectedIndex = (activeMenu.selectedIndex + 1) % activeMenu.options.length;
        updateMenuSelection();
        return true;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeMenu.selectedIndex = (activeMenu.selectedIndex - 1 + activeMenu.options.length) % activeMenu.options.length;
        updateMenuSelection();
        return true;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        chooseOption(activeMenu.options[activeMenu.selectedIndex], activeMenu.promptNode);
        return true;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return true;
    }
    return false;
}

function hideOriginalTextWidget(widget) {
    if (!widget) {
        return;
    }
    widget.computeSize = () => [0, -4];
    const el = widget.element || widget.inputEl || widget.domElement || widget.inputElement;
    if (el?.style) {
        el.style.display = "none";
    }
}

function getPromptEditorHeight(node) {
    return Math.max(160, (node?.size?.[1] || 240) - 76);
}

function updatePromptTextEditorLayout(node) {
    const state = node?.__tePromptTextState;
    if (!state) {
        return;
    }
    const height = getPromptEditorHeight(node);
    state.container.style.height = `${height + 8}px`;
    state.editor.style.height = `${height}px`;
    state.editor.style.minHeight = `${height}px`;
    state.domWidget.computeSize = (width) => [width, height + 8];
    markCanvasDirty();
}

function createPromptTextEditor(node) {
    if (node.__tePromptTextState) {
        return;
    }

    const textWidget = getWidgetByName(node, "text");
    const textarea = getWidgetTextElement(textWidget);
    hideOriginalTextWidget(textWidget);

    const container = document.createElement("div");
    Object.assign(container.style, {
        width: "100%",
        boxSizing: "border-box",
        padding: "2px 0 6px",
        height: `${getPromptEditorHeight(node) + 8}px`,
    });

    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.spellcheck = false;
    editor.className = "te-prompt-text-editor";
    Object.assign(editor.style, {
        height: `${getPromptEditorHeight(node)}px`,
        minHeight: `${getPromptEditorHeight(node)}px`,
        width: "100%",
        boxSizing: "border-box",
        padding: "10px",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        background: "rgba(24, 24, 24, 0.96)",
        color: "#f2f2f2",
        font: "14px/1.55 sans-serif",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        outline: "none",
        resize: "none",
    });

    container.appendChild(editor);
    const domWidget = node.addDOMWidget("te_prompt_editor", "prompt", container, {
        serialize: false,
        hideOnZoom: false,
        getValue() {
            return plainTextFromEditor(editor);
        },
        setValue(value) {
            renderEditorFromText(editor, value, node);
        },
    });
    domWidget.computeSize = (width) => [width, getPromptEditorHeight(node) + 8];

    node.__tePromptTextState = { textWidget, textarea, editor, container, domWidget };
    renderEditorFromText(editor, textWidget?.value || textarea?.value || "", node);
    syncEditorToWidget(node);

    const update = () => showMentionMenu(node);
    editor.addEventListener("input", () => {
        syncEditorToWidget(node);
        update();
    });
    editor.addEventListener("keydown", (event) => {
        if (handleMenuKeydown(event)) {
            return;
        }
        setTimeout(update, 0);
    });
    editor.addEventListener("click", update);
    editor.addEventListener("blur", () => {
        setTimeout(closeMenu, 160);
        syncEditorToWidget(node);
    });
    editor.addEventListener("paste", (event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") || "";
        document.execCommand("insertText", false, text);
    });

    for (const eventName of ["pointerdown", "mousedown", "dblclick", "wheel"]) {
        container.addEventListener(eventName, (event) => {
            event.stopPropagation();
        }, true);
    }

    const originalOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const result = originalOnConnectionsChange?.apply(this, arguments);
        renderEditorFromText(editor, plainTextFromEditor(editor), node);
        syncEditorToWidget(node);
        return result;
    };

    const originalOnResize = node.onResize;
    node.onResize = function () {
        const result = originalOnResize?.apply(this, arguments);
        updatePromptTextEditorLayout(this);
        return result;
    };

    node.setSize?.([
        Math.max(node.size?.[0] || 360, 380),
        Math.max(node.size?.[1] || 240, 240),
    ]);
    updatePromptTextEditorLayout(node);
    markCanvasDirty();
}

document.addEventListener("pointerdown", (event) => {
    if (activeMenu && !activeMenu.element.contains(event.target)) {
        closeMenu();
    }
}, true);

app.registerExtension({
    name: "TE.PromptText",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== PROMPT_TEXT_NODE_CLASS) {
            return;
        }

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            setTimeout(() => createPromptTextEditor(this), 0);
            return result;
        };

        const originalOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = originalOnConfigure?.apply(this, arguments);
            setTimeout(() => {
                createPromptTextEditor(this);
                const state = this.__tePromptTextState;
                if (state) {
                    renderEditorFromText(state.editor, state.textWidget?.value || state.textarea?.value || "", this);
                }
            }, 0);
            return result;
        };
    },
});
