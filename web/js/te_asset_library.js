import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const EXTENSION_NAME = "TEImagePro.AssetLibrary";
const IMAGE_NODE_CLASS = "TE_image_pro_save_image_with_output";
const TEXT_NODE_CLASS = "TE_text_display";
const PANEL_ID = "te-asset-library-panel";
const MENU_BUTTON_ID = "te-asset-library-menu-button";
const STYLE_ID = "te-asset-library-style";
const STORAGE_KEY = "te_asset_library_state_v1";
const DEFAULT_CATEGORY = "__all__";
const DEFAULT_PROJECT = "默认项目";
const TEXT_CATEGORY = "提示词";
const ASSET_KIND_IMAGE = "image";
const ASSET_KIND_TEXT = "text";
const PROTECTED_CATEGORIES = new Set([DEFAULT_CATEGORY, "全部", "未分类", "", TEXT_CATEGORY]);

let panel = null;
let addDialog = null;
let previewDialog = null;
let state = {
    visible: false,
    project: "",
    category: DEFAULT_CATEGORY,
    query: "",
    viewSize: 128,
    projects: [],
    assets: [],
    selectedAsset: null,
    loading: false,
    status: "",
};

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        state.project = saved.project || "";
        state.category = saved.category || DEFAULT_CATEGORY;
        state.query = saved.query || "";
        state.viewSize = Number(saved.viewSize) || 128;
    } catch {
    }
}

function saveState() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            project: state.project,
            category: state.category,
            query: state.query,
            viewSize: state.viewSize,
        })
    );
}

function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --te-asset-bg: rgba(12, 15, 17, 0.94);
            --te-asset-panel: rgba(24, 29, 32, 0.96);
            --te-asset-line: rgba(255, 255, 255, 0.1);
            --te-asset-line-strong: rgba(255, 204, 102, 0.38);
            --te-asset-text: rgba(244, 241, 231, 0.95);
            --te-asset-muted: rgba(244, 241, 231, 0.58);
            --te-asset-accent: #f3b44e;
            --te-asset-accent-2: #65d1b7;
            --te-asset-danger: #ff7b7b;
            --te-asset-radius: 18px;
        }

        #te-asset-library-menu-button {
            display: flex;
            align-items: center;
            min-height: 34px;
        }

        .te-asset-menu-button {
            min-height: 32px;
            min-width: 86px;
            padding: 8px 12px;
            border-radius: 14px;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
        }

        button.te-asset-menu-button {
            min-width: 86px;
            border: 1px solid rgba(255, 196, 90, 0.42);
            background: linear-gradient(135deg, rgba(28, 33, 34, 0.88), rgba(66, 49, 26, 0.72));
            color: var(--te-asset-text);
            border-radius: 14px;
            padding: 8px 12px;
            font: 700 13px/1.1 ui-sans-serif, "Microsoft YaHei", sans-serif;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
            cursor: pointer;
            user-select: none;
        }

        button.te-asset-menu-button:hover,
        button.te-asset-menu-button.active,
        #te-asset-library-menu-button[data-visible="true"] .te-asset-menu-button {
            transform: translateY(-1px);
            border-color: rgba(255, 218, 132, 0.9);
            background: linear-gradient(135deg, rgba(243, 180, 78, 0.24), rgba(101, 209, 183, 0.12));
        }

        .te-asset-panel {
            position: fixed;
            top: 112px;
            right: 16px;
            width: min(720px, calc(100vw - 32px));
            height: min(720px, calc(100vh - 164px));
            z-index: 901;
            display: grid;
            grid-template-columns: 210px minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr);
            overflow: hidden;
            border: 1px solid var(--te-asset-line);
            border-radius: var(--te-asset-radius);
            background:
                radial-gradient(circle at top left, rgba(243, 180, 78, 0.18), transparent 35%),
                linear-gradient(145deg, rgba(16, 20, 22, 0.97), rgba(9, 11, 13, 0.97));
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
            color: var(--te-asset-text);
            font-family: ui-sans-serif, "Microsoft YaHei", sans-serif;
        }

        .te-asset-panel[hidden] {
            display: none;
        }

        .te-asset-sidebar {
            min-width: 0;
            min-height: 0;
            overflow: hidden;
            border-right: 1px solid var(--te-asset-line);
            background: rgba(255, 255, 255, 0.035);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .te-asset-main {
            min-width: 0;
            min-height: 0;
            display: grid;
            grid-template-rows: auto auto minmax(0, 1fr) auto;
            gap: 12px;
            padding: 14px;
            overflow: hidden;
        }

        .te-asset-title-row,
        .te-asset-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .te-asset-drag-handle {
            cursor: move;
            user-select: none;
            touch-action: none;
        }

        .te-asset-title {
            font-size: 17px;
            font-weight: 900;
            letter-spacing: 0.02em;
        }

        .te-asset-subtitle {
            color: var(--te-asset-muted);
            font-size: 12px;
            line-height: 1.4;
        }

        .te-asset-launcher-link {
            margin-top: auto;
            display: block;
            border: 1px solid rgba(101, 209, 183, 0.3);
            border-radius: 11px;
            padding: 7px 8px;
            color: rgba(235, 255, 247, 0.92);
            background: linear-gradient(135deg, rgba(101, 209, 183, 0.12), rgba(243, 180, 78, 0.08));
            font-size: 11px;
            font-weight: 800;
            line-height: 1.35;
            text-decoration: none;
        }

        .te-asset-launcher-link:hover {
            border-color: rgba(101, 209, 183, 0.62);
            background: linear-gradient(135deg, rgba(101, 209, 183, 0.2), rgba(243, 180, 78, 0.12));
            transform: translateY(-1px);
        }

        .te-asset-spacer {
            flex: 1;
        }

        .te-asset-button,
        .te-asset-input,
        .te-asset-select {
            border: 1px solid var(--te-asset-line);
            background: rgba(255, 255, 255, 0.07);
            color: var(--te-asset-text);
            border-radius: 12px;
            font: 600 12px/1 ui-sans-serif, "Microsoft YaHei", sans-serif;
            outline: none;
        }

        .te-asset-button {
            padding: 9px 11px;
            cursor: pointer;
            transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
        }

        .te-asset-button:hover {
            border-color: var(--te-asset-line-strong);
            background: rgba(243, 180, 78, 0.14);
            transform: translateY(-1px);
        }

        .te-asset-button.primary {
            border-color: rgba(243, 180, 78, 0.7);
            background: linear-gradient(135deg, rgba(243, 180, 78, 0.27), rgba(101, 209, 183, 0.12));
        }

        .te-asset-button.ghost {
            padding: 7px 9px;
            background: transparent;
        }

        .te-asset-button.danger {
            width: 100%;
            color: #ffd7d7;
            border-color: rgba(255, 123, 123, 0.36);
            background: rgba(255, 123, 123, 0.08);
        }

        .te-asset-button.danger:hover:not(:disabled) {
            border-color: rgba(255, 123, 123, 0.68);
            background: rgba(255, 123, 123, 0.15);
        }

        .te-asset-button:disabled {
            opacity: 0.42;
            cursor: not-allowed;
            transform: none;
        }

        .te-asset-button:disabled:hover {
            border-color: var(--te-asset-line);
            background: rgba(255, 255, 255, 0.07);
            transform: none;
        }

        .te-asset-input,
        .te-asset-select {
            min-width: 0;
            padding: 10px 11px;
        }

        .te-asset-input::placeholder {
            color: rgba(244, 241, 231, 0.38);
        }

        .te-asset-select {
            width: 100%;
            appearance: none;
        }

        .te-asset-select option {
            background: #161a1c;
            color: #f6f0df;
        }

        .te-asset-label {
            color: var(--te-asset-muted);
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.09em;
            text-transform: uppercase;
        }

        .te-asset-stack {
            display: grid;
            gap: 8px;
        }

        .te-asset-categories {
            display: grid;
            gap: 6px;
            overflow: auto;
            min-height: 0;
            padding-right: 3px;
        }

        .te-asset-category {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            border: 1px solid transparent;
            border-radius: 13px;
            padding: 9px 10px;
            color: var(--te-asset-text);
            background: rgba(255, 255, 255, 0.045);
            cursor: pointer;
            text-align: left;
        }

        .te-asset-category:hover,
        .te-asset-category.active {
            border-color: var(--te-asset-line-strong);
            background: rgba(243, 180, 78, 0.13);
        }

        .te-asset-count {
            color: var(--te-asset-muted);
            font-size: 11px;
        }

        .te-asset-toolbar {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto auto;
            gap: 8px;
            align-items: center;
        }

        .te-asset-grid {
            min-height: 0;
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(var(--te-asset-thumb, 128px), 1fr));
            align-content: start;
            gap: 12px;
            padding: 2px 4px 8px 2px;
        }

        .te-asset-card {
            position: relative;
            overflow: hidden;
            border: 1px solid var(--te-asset-line);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.055);
            cursor: pointer;
            user-select: none;
            display: grid;
            grid-template-rows: var(--te-asset-thumb, 128px) 56px;
            height: calc(var(--te-asset-thumb, 128px) + 56px);
        }

        .te-asset-card:hover,
        .te-asset-card.selected {
            border-color: rgba(243, 180, 78, 0.72);
            box-shadow: 0 0 0 1px rgba(243, 180, 78, 0.2), 0 14px 34px rgba(0, 0, 0, 0.28);
        }

        .te-asset-thumb {
            width: 100%;
            height: var(--te-asset-thumb, 128px);
            display: grid;
            place-items: center;
            overflow: hidden;
            background:
                linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%),
                linear-gradient(-45deg, rgba(255,255,255,0.035) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.035) 75%),
                linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.035) 75%);
            background-size: 18px 18px;
            background-position: 0 0, 0 9px, 9px -9px, -9px 0;
        }

        .te-asset-thumb img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }

        .te-asset-card.text {
            grid-template-rows: var(--te-asset-thumb, 128px) 56px;
            height: calc(var(--te-asset-thumb, 128px) + 56px);
        }

        .te-asset-thumb.te-asset-text-thumb {
            display: flex;
            align-items: stretch;
            padding: 13px 14px;
            box-sizing: border-box;
            background:
                radial-gradient(circle at top right, rgba(243, 180, 78, 0.12), transparent 46%),
                linear-gradient(145deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.025));
            color: rgba(246, 243, 232, 0.88);
            font: 600 12px/1.5 ui-sans-serif, "Microsoft YaHei", sans-serif;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .te-asset-text-preview {
            width: 100%;
            min-width: 0;
            height: 100%;
            display: -webkit-box;
            -webkit-line-clamp: 6;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-align: left;
        }

        .te-asset-meta {
            padding: 9px 10px 10px;
            display: grid;
            gap: 4px;
            min-width: 0;
            overflow: hidden;
        }

        .te-asset-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 12px;
            font-weight: 800;
        }

        .te-asset-path {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--te-asset-muted);
            font-size: 11px;
        }

        .te-asset-actions {
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            gap: 6px;
            opacity: 0;
            transform: translateY(-3px);
            transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .te-asset-card:hover .te-asset-actions {
            opacity: 1;
            transform: translateY(0);
        }

        .te-asset-chip {
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 999px;
            padding: 6px 8px;
            background: rgba(0, 0, 0, 0.56);
            color: var(--te-asset-text);
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
        }

        .te-asset-more {
            position: relative;
            padding-bottom: 10px;
            margin-bottom: -10px;
        }

        .te-asset-more-menu {
            position: absolute;
            top: calc(100% - 1px);
            right: 0;
            min-width: 76px;
            display: none;
            gap: 5px;
            padding: 6px;
            border: 1px solid var(--te-asset-line);
            border-radius: 12px;
            background: rgba(9, 11, 13, 0.94);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
        }

        .te-asset-more:hover .te-asset-more-menu {
            display: grid;
        }

        .te-asset-chip.danger {
            color: #ffd7d7;
            border-color: rgba(255, 123, 123, 0.42);
        }

        .te-asset-footer {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 30px;
            color: var(--te-asset-muted);
            font-size: 12px;
        }

        .te-asset-empty {
            grid-column: 1 / -1;
            border: 1px dashed rgba(255, 255, 255, 0.16);
            border-radius: 18px;
            padding: 36px 18px;
            text-align: center;
            color: var(--te-asset-muted);
            background: rgba(255, 255, 255, 0.035);
        }

        .te-asset-drop-hint {
            position: fixed;
            pointer-events: none;
            z-index: 902;
            padding: 9px 12px;
            border-radius: 999px;
            border: 1px solid rgba(243, 180, 78, 0.6);
            background: rgba(13, 16, 18, 0.92);
            color: var(--te-asset-text);
            box-shadow: 0 10px 30px rgba(0,0,0,0.35);
            transform: translate(-50%, -50%);
            font-size: 12px;
            font-weight: 800;
        }

        .te-asset-modal-backdrop {
            position: fixed;
            inset: 0;
            z-index: 910;
            display: grid;
            place-items: center;
            background: rgba(0, 0, 0, 0.34);
            backdrop-filter: blur(2px);
        }

        .te-asset-modal {
            width: min(430px, calc(100vw - 32px));
            border: 1px solid var(--te-asset-line);
            border-radius: 18px;
            background:
                radial-gradient(circle at top right, rgba(101, 209, 183, 0.15), transparent 36%),
                linear-gradient(145deg, rgba(21, 25, 27, 0.98), rgba(11, 13, 15, 0.98));
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52);
            color: var(--te-asset-text);
            padding: 16px;
            display: grid;
            gap: 12px;
        }

        .te-asset-modal-title {
            font-size: 16px;
            font-weight: 900;
        }

        .te-asset-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding-top: 4px;
        }

        .te-asset-preview-backdrop {
            position: fixed;
            inset: 0;
            z-index: 912;
            display: grid;
            place-items: start center;
            box-sizing: border-box;
            padding: 112px 22px 52px;
            background: rgba(0, 0, 0, 0.62);
            backdrop-filter: blur(3px);
        }

        .te-asset-preview {
            width: min(920px, calc(100vw - 44px));
            height: min(720px, calc(100vh - 164px));
            border: 1px solid var(--te-asset-line);
            border-radius: 20px;
            background:
                radial-gradient(circle at top left, rgba(243, 180, 78, 0.13), transparent 38%),
                rgba(10, 12, 14, 0.98);
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            overflow: hidden;
        }

        .te-asset-preview-head {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            border-bottom: 1px solid var(--te-asset-line);
        }

        .te-asset-preview-title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 900;
            color: var(--te-asset-text);
        }

        .te-asset-preview-body {
            min-height: 0;
            display: grid;
            place-items: center;
            padding: 14px;
            overflow: hidden;
            user-select: none;
        }

        .te-asset-preview-body img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 12px;
            box-shadow: 0 12px 46px rgba(0, 0, 0, 0.38);
            transform-origin: center center;
            cursor: zoom-in;
            user-select: none;
            -webkit-user-drag: none;
        }

        .te-asset-preview-body.text {
            place-items: stretch;
            overflow: hidden;
        }

        .te-asset-preview-text {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            overflow: auto;
            border: 1px solid var(--te-asset-line);
            border-radius: 14px;
            padding: 14px;
            background: rgba(255, 255, 255, 0.045);
            color: rgba(248, 245, 235, 0.94);
            font: 600 13px/1.65 ui-sans-serif, "Microsoft YaHei", sans-serif;
            white-space: pre-wrap;
            word-break: break-word;
        }

        @media (max-width: 760px) {
            .te-asset-panel {
                top: 88px;
                right: 10px;
                width: calc(100vw - 20px);
                height: calc(100vh - 140px);
                grid-template-columns: 1fr;
            }

            .te-asset-preview-backdrop {
                padding: 88px 10px 52px;
            }

            .te-asset-preview {
                width: calc(100vw - 20px);
                height: calc(100vh - 140px);
            }

            .te-asset-sidebar {
                border-right: none;
                border-bottom: 1px solid var(--te-asset-line);
                max-height: 230px;
            }

            .te-asset-toolbar {
                grid-template-columns: 1fr 1fr;
            }
        }
    `;
    document.head.appendChild(style);
}

function qs(root, selector) {
    return root.querySelector(selector);
}

function setStatus(text) {
    state.status = text || "";
    if (panel) {
        const status = qs(panel, "[data-role='status']");
        if (status) {
            status.textContent = state.status;
        }
    }
}

function markCanvasDirty() {
    app.graph?.setDirtyCanvas?.(true, false);
    app.canvas?.setDirty?.(true, false);
}

function clampPanelPosition(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function placePanelAtCurrentPosition(element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
        return rect;
    }

    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    if (getComputedStyle(element).position !== "fixed") {
        element.style.position = "fixed";
    }
    return rect;
}

function clampDraggablePanel(element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
        return;
    }

    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = clampPanelPosition(rect.left, margin, maxLeft);
    const top = clampPanelPosition(rect.top, margin, maxTop);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
}

function enableDraggablePanel(element, handles) {
    if (!element || element.__teAssetDragBound) {
        return;
    }

    const handleList = (Array.isArray(handles) ? handles : [handles]).filter(Boolean);
    if (!handleList.length) {
        return;
    }

    element.__teAssetDragBound = true;
    let dragState = null;
    let previousUserSelect = "";

    const stopDrag = (event) => {
        if (!dragState) {
            return;
        }
        try {
            dragState.handle?.releasePointerCapture?.(event.pointerId);
        } catch {
        }
        document.body.style.userSelect = previousUserSelect;
        dragState = null;
    };

    const moveDrag = (event) => {
        if (!dragState) {
            return;
        }

        const nextLeft = dragState.startLeft + event.clientX - dragState.startX;
        const nextTop = dragState.startTop + event.clientY - dragState.startY;
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - dragState.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - dragState.height - margin);
        element.style.left = `${clampPanelPosition(nextLeft, margin, maxLeft)}px`;
        element.style.top = `${clampPanelPosition(nextTop, margin, maxTop)}px`;
        element.style.right = "auto";
        element.style.bottom = "auto";
        event.preventDefault();
    };

    for (const handle of handleList) {
        handle.classList.add("te-asset-drag-handle");
        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || event.target?.closest?.("button,a,input,select,textarea")) {
                return;
            }

            const rect = placePanelAtCurrentPosition(element);
            if (!rect.width || !rect.height) {
                return;
            }

            dragState = {
                startX: event.clientX,
                startY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                width: rect.width,
                height: rect.height,
                handle: event.currentTarget,
            };
            previousUserSelect = document.body.style.userSelect;
            document.body.style.userSelect = "none";
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener("pointermove", moveDrag);
        handle.addEventListener("pointerup", stopDrag);
        handle.addEventListener("pointercancel", stopDrag);
    }

    window.addEventListener("resize", () => clampDraggablePanel(element));
}

function getAssetGridScrollTop() {
    const grid = panel ? qs(panel, "[data-role='assets']") : null;
    return Number(grid?.scrollTop || 0);
}

function restoreAssetGridScrollTop(scrollTop) {
    if (!Number.isFinite(scrollTop) || scrollTop <= 0) {
        return;
    }
    requestAnimationFrame(() => {
        const grid = panel ? qs(panel, "[data-role='assets']") : null;
        if (!grid) {
            return;
        }
        grid.scrollTop = Math.min(scrollTop, Math.max(0, grid.scrollHeight - grid.clientHeight));
    });
}

function imageInfoFromAsset(asset) {
    const subfolder = asset.subfolder || asset.relative_path.split("/").slice(0, -1).join("/");
    return {
        filename: asset.name || asset.relative_path.split("/").pop(),
        subfolder,
        type: "input",
    };
}

function buildViewUrl(asset) {
    const info = imageInfoFromAsset(asset);
    const params = new URLSearchParams({
        filename: info.filename,
        type: info.type,
        rand: String(Math.floor(asset.mtime || Date.now())),
    });
    if (info.subfolder) {
        params.set("subfolder", info.subfolder);
    }
    return api.apiURL(`/view?${params.toString()}`);
}

function buildImageInfoViewUrl(imageInfo) {
    if (!imageInfo?.filename && !imageInfo?.path) {
        return "";
    }

    if (String(imageInfo.type || "") === "te_custom_save") {
        const params = new URLSearchParams({
            filename: imageInfo.filename || "",
            path: imageInfo.path || "",
            token: imageInfo.token || "",
            type: "te_custom_save",
        });
        return api.apiURL(`/te_image/view_saved?${params.toString()}`);
    }

    const params = new URLSearchParams({
        filename: imageInfo.filename || "",
        type: imageInfo.type || "output",
        rand: String(Date.now()),
    });
    if (imageInfo.subfolder) {
        params.set("subfolder", imageInfo.subfolder);
    }
    return api.apiURL(`/view?${params.toString()}`);
}

function buildThumbUrl(asset) {
    const params = new URLSearchParams({
        path: asset.relative_path,
        size: String(Math.max(state.viewSize * 2, 220)),
        rand: String(Math.floor(asset.mtime || Date.now())),
    });
    return api.apiURL(`/te_asset_library/thumbnail?${params.toString()}`);
}

function getAssetKind(asset) {
    const kind = String(asset?.kind || "").toLowerCase();
    if (kind) {
        return kind;
    }
    const path = String(asset?.relative_path || asset?.name || "").toLowerCase();
    return path.endsWith(".txt") ? ASSET_KIND_TEXT : ASSET_KIND_IMAGE;
}

function isTextAsset(asset) {
    return getAssetKind(asset) === ASSET_KIND_TEXT;
}

async function requestJson(path, options = {}) {
    const response = await api.fetchApi(path, options);
    if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try {
            const body = await response.json();
            message = body.error || message;
        } catch {
        }
        throw new Error(message);
    }
    return await response.json();
}

async function requestJsonWithGetFallback(path, payload, errorCode = "405") {
    try {
        return await requestJson(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {}),
        });
    } catch (error) {
        if (!String(error?.message || "").includes(errorCode)) {
            throw error;
        }
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(payload || {})) {
            params.set(key, value ?? "");
        }
        return await requestJson(`${path}?${params.toString()}`);
    }
}

async function getTextAssetContent(asset) {
    const params = new URLSearchParams({
        path: asset.relative_path,
        rand: String(Math.floor(asset.mtime || Date.now())),
    });
    const data = await requestJson(`/te_asset_library/text/get?${params.toString()}`);
    return String(data.text ?? "");
}

async function copyTextToClipboard(text) {
    const value = String(text ?? "");
    if (!value) {
        return false;
    }
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "readonly");
        Object.assign(textarea.style, {
            position: "fixed",
            left: "-9999px",
            opacity: "0",
        });
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand?.("copy");
        document.body.removeChild(textarea);
        return !!copied;
    } catch {
        return false;
    }
}

async function refreshLibrary(options = {}) {
    const preserveScrollTop = options.preserveScroll ? getAssetGridScrollTop() : null;
    state.loading = true;
    setStatus("加载中...");
    renderPanel();

    try {
        const params = new URLSearchParams();
        if (state.project) {
            params.set("project", state.project);
        }
        if (state.category) {
            params.set("category", state.category);
        }
        if (state.query) {
            params.set("q", state.query);
        }

        const data = await requestJson(`/te_asset_library/list?${params.toString()}`);
        state.projects = data.projects || [];
        state.assets = data.assets || [];
        state.project = data.current_project || state.projects[0]?.name || DEFAULT_PROJECT;
        state.category = data.current_category || state.category || DEFAULT_CATEGORY;
        state.loading = false;
        saveState();
        renderPanel();
        if (options.preserveScroll) {
            restoreAssetGridScrollTop(preserveScrollTop);
        }
        if (!options.quiet) {
            setStatus(`已加载 ${state.assets.length} 个素材`);
        }
    } catch (error) {
        state.loading = false;
        renderPanel();
        if (options.preserveScroll) {
            restoreAssetGridScrollTop(preserveScrollTop);
        }
        setStatus(`加载失败：${error.message || error}`);
    }
}

function getCurrentProject() {
    return state.projects.find((project) => project.name === state.project) || state.projects[0] || null;
}

function getCategoriesForCurrentProject() {
    const project = getCurrentProject();
    const categories = project?.categories || [];
    const total = categories.reduce((sum, category) => sum + (Number(category.count) || 0), 0);
    return [{ name: DEFAULT_CATEGORY, label: "全部", count: total }, ...categories.map((category) => ({
        name: category.name,
        label: category.name,
        count: category.count,
    }))];
}

function isProtectedCategory(category) {
    return PROTECTED_CATEGORIES.has(String(category || "").trim());
}

function isSerializedWidget(widget) {
    return widget?.serialize !== false && widget?.options?.serialize !== false;
}

function getSerializedWidgetIndex(node, targetWidget) {
    if (!Array.isArray(node?.widgets) || !targetWidget) {
        return -1;
    }

    let serializedIndex = 0;
    for (const widget of node.widgets) {
        if (widget === targetWidget) {
            return isSerializedWidget(widget) ? serializedIndex : -1;
        }
        if (isSerializedWidget(widget)) {
            serializedIndex += 1;
        }
    }
    return -1;
}

function setWidgetValue(node, widgetName, value) {
    const widget = node?.widgets?.find((item) => item?.name === widgetName);
    if (!widget) {
        return false;
    }
    if (Array.isArray(widget.options?.values) && !widget.options.values.includes(value)) {
        widget.options.values.push(value);
    }
    widget.value = value;
    const index = getSerializedWidgetIndex(node, widget);
    if (index >= 0) {
        node.widgets_values ??= [];
        node.widgets_values[index] = value;
    }
    widget.callback?.(value);
    return true;
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

function setTextNodeText(node, text) {
    const value = String(text ?? "");
    const ok = setWidgetValue(node, "text", value);
    if (!ok) {
        throw new Error("目标节点没有 text 字段");
    }

    const widget = node?.widgets?.find((item) => item?.name === "text");
    const element = getWidgetTextElement(widget);
    if (element) {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    markCanvasDirty();
}

function setNodePreview(node, asset) {
    const info = imageInfoFromAsset(asset);
    node.images = [info];
    node.imageIndex = 0;
    node.overIndex = 0;
    app.nodeOutputs ??= {};
    app.nodeOutputs[String(node.id)] = {
        ...(app.nodeOutputs[String(node.id)] || {}),
        images: [info],
    };

    const img = new Image();
    img.src = buildViewUrl(asset);
    node.imgs = [img];
}

function screenPointToCanvasPoint(clientX, clientY) {
    const canvas = app.canvas;
    if (canvas?.convertEventToCanvasOffset && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const point = canvas.convertEventToCanvasOffset({ clientX, clientY });
        const x = Array.isArray(point) ? point[0] : point?.x;
        const y = Array.isArray(point) ? point[1] : point?.y;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return [x, y];
        }
    }
    const ds = canvas?.ds;
    if (ds) {
        return [
            (clientX - ds.offset[0]) / ds.scale,
            (clientY - ds.offset[1]) / ds.scale,
        ];
    }
    return [100, 100];
}

function canvasPointFromEvent(event) {
    const canvasEl = app.canvas?.canvas;
    const path = event?.composedPath?.() || [];
    const eventIsOnCanvas = !!canvasEl && (event?.target === canvasEl || path.includes(canvasEl));
    if (!eventIsOnCanvas && canvasEl?.getBoundingClientRect) {
        const rect = canvasEl.getBoundingClientRect();
        return screenPointToCanvasPoint(rect.left + rect.width * 0.38, rect.top + rect.height / 2);
    }
    return screenPointToCanvasPoint(event?.clientX, event?.clientY);
}

function createImageNodeAtEvent(event, asset) {
    const LiteGraph = window.LiteGraph;
    if (!LiteGraph) {
        throw new Error("LiteGraph 未加载");
    }
    const node = LiteGraph.createNode(IMAGE_NODE_CLASS);
    if (!node) {
        throw new Error("找不到 TE MAN 加载图像&保存图像 节点");
    }

    node.pos = canvasPointFromEvent(event);
    node.size = [Math.max(node.size?.[0] || 420, 420), Math.max(node.size?.[1] || 520, 520)];
    app.graph.add(node);
    applyAssetToImageNode(node, asset);
    app.canvas.selectNode?.(node);
    markCanvasDirty();
    return node;
}

async function createTextNodeAtEvent(event, asset) {
    const LiteGraph = window.LiteGraph;
    if (!LiteGraph) {
        throw new Error("LiteGraph 未加载");
    }
    const node = LiteGraph.createNode(TEXT_NODE_CLASS);
    if (!node) {
        throw new Error("找不到 TE MAN TEXT文本展示 节点");
    }

    const text = await getTextAssetContent(asset);
    node.pos = canvasPointFromEvent(event);
    node.size = [Math.max(node.size?.[0] || 420, 420), Math.max(node.size?.[1] || 240, 240)];
    app.graph.add(node);
    setTextNodeText(node, text);
    app.canvas.selectNode?.(node);
    markCanvasDirty();
    return node;
}

async function createNodeFromAssetAtEvent(event, asset) {
    if (isTextAsset(asset)) {
        return await createTextNodeAtEvent(event, asset);
    }
    return createImageNodeAtEvent(event, asset);
}

function applyAssetToImageNode(node, asset) {
    const ok = setWidgetValue(node, "upload_image", asset.relative_path);
    if (!ok) {
        throw new Error("目标节点没有 upload_image 字段");
    }
    setNodePreview(node, asset);
    markCanvasDirty();
}

function updateNodesAfterAssetRename(oldPath, newAsset) {
    if (!oldPath || !newAsset?.relative_path || !Array.isArray(app.graph?._nodes)) {
        return;
    }

    for (const node of app.graph._nodes) {
        if (node?.comfyClass !== IMAGE_NODE_CLASS && node?.type !== IMAGE_NODE_CLASS) {
            continue;
        }
        const widget = node.widgets?.find((item) => item?.name === "upload_image");
        if (widget?.value !== oldPath) {
            continue;
        }
        setWidgetValue(node, "upload_image", newAsset.relative_path);
        setNodePreview(node, newAsset);
    }
    markCanvasDirty();
}

function closePreviewDialog() {
    previewDialog?.remove();
    previewDialog = null;
}

async function openTextPreview(asset) {
    closePreviewDialog();
    const text = await getTextAssetContent(asset);
    previewDialog = document.createElement("div");
    previewDialog.className = "te-asset-preview-backdrop";
    previewDialog.innerHTML = `
        <div class="te-asset-preview" role="dialog" aria-modal="true">
            <div class="te-asset-preview-head">
                <div class="te-asset-preview-title">${escapeHtml(asset.name)}</div>
                <div class="te-asset-spacer"></div>
                <button class="te-asset-button ghost" data-action="copy-preview-text">复制</button>
                <button class="te-asset-button ghost" data-action="close-preview">关闭</button>
            </div>
            <div class="te-asset-preview-body text">
                <pre class="te-asset-preview-text">${escapeHtml(text)}</pre>
            </div>
        </div>
    `;
    document.body.appendChild(previewDialog);
    enableDraggablePanel(qs(previewDialog, ".te-asset-preview"), qs(previewDialog, ".te-asset-preview-head"));
    qs(previewDialog, "[data-action='copy-preview-text']").onclick = async () => {
        const copied = await copyTextToClipboard(text);
        setStatus(copied ? `已复制：${asset.name}` : "复制失败");
    };
    qs(previewDialog, "[data-action='close-preview']").onclick = closePreviewDialog;
    previewDialog.addEventListener("mousedown", (event) => {
        if (event.target === previewDialog) {
            closePreviewDialog();
        }
    });
}

function openImagePreviewDialog(title, imageUrl) {
    if (!imageUrl) {
        throw new Error("没有可预览的图片。");
    }

    closePreviewDialog();
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panStartX = 0;
    let panStartY = 0;
    previewDialog = document.createElement("div");
    previewDialog.className = "te-asset-preview-backdrop";
    previewDialog.innerHTML = `
        <div class="te-asset-preview" role="dialog" aria-modal="true">
            <div class="te-asset-preview-head">
                <div class="te-asset-preview-title">${escapeHtml(title || "图片预览")}</div>
                <div class="te-asset-spacer"></div>
                <div class="te-asset-subtitle" data-role="preview-zoom">100%</div>
                <button class="te-asset-button ghost" data-action="close-preview">关闭</button>
            </div>
            <div class="te-asset-preview-body">
                <img src="${escapeHtml(imageUrl)}" alt="">
            </div>
        </div>
    `;
    document.body.appendChild(previewDialog);
    enableDraggablePanel(qs(previewDialog, ".te-asset-preview"), qs(previewDialog, ".te-asset-preview-head"));
    const body = qs(previewDialog, ".te-asset-preview-body");
    const image = qs(previewDialog, ".te-asset-preview-body img");
    const zoomLabel = qs(previewDialog, "[data-role='preview-zoom']");
    const applyZoom = () => {
        if (zoom <= 1) {
            panX = 0;
            panY = 0;
        }
        image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        image.style.cursor = zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in";
        body.style.overflow = zoom > 1 ? "auto" : "hidden";
        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    };
    body.addEventListener("wheel", (event) => {
        event.preventDefault();
        const step = event.deltaY < 0 ? 0.12 : -0.12;
        zoom = Math.max(1, Math.min(5, Number((zoom + step).toFixed(2))));
        applyZoom();
    }, { passive: false });
    image.addEventListener("pointerdown", (event) => {
        if (zoom <= 1) {
            return;
        }
        dragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        panStartX = panX;
        panStartY = panY;
        image.setPointerCapture?.(event.pointerId);
        applyZoom();
        event.preventDefault();
    });
    image.addEventListener("pointermove", (event) => {
        if (!dragging) {
            return;
        }
        panX = panStartX + event.clientX - dragStartX;
        panY = panStartY + event.clientY - dragStartY;
        applyZoom();
        event.preventDefault();
    });
    const stopDragging = (event) => {
        if (!dragging) {
            return;
        }
        dragging = false;
        image.releasePointerCapture?.(event.pointerId);
        applyZoom();
    };
    image.addEventListener("pointerup", stopDragging);
    image.addEventListener("pointercancel", stopDragging);
    qs(previewDialog, "[data-action='close-preview']").onclick = closePreviewDialog;
    previewDialog.addEventListener("mousedown", (event) => {
        if (event.target === previewDialog) {
            closePreviewDialog();
        }
    });
}

async function openPreview(asset) {
    if (isTextAsset(asset)) {
        await openTextPreview(asset);
        return;
    }

    openImagePreviewDialog(asset.name, buildViewUrl(asset));
}

async function renameAsset(asset) {
    const nextName = window.prompt("输入新的素材文件名", asset.name);
    if (!nextName || nextName === asset.name) {
        return;
    }

    try {
        const data = await requestJsonWithGetFallback("/te_asset_library/rename", {
            relative_path: asset.relative_path,
            new_name: nextName,
        });
        updateNodesAfterAssetRename(asset.relative_path, data.asset);
        state.selectedAsset = data.asset || null;
        await refreshLibrary({ quiet: true, preserveScroll: true });
        setStatus(`已更名：${data.asset?.name || nextName}`);
    } catch (error) {
        setStatus(`更名失败：${error.message || error}`);
    }
}

async function deleteAsset(asset) {
    const confirmed = window.confirm(`确定删除这个素材吗？\n\n${asset.name}`);
    if (!confirmed) {
        return;
    }

    try {
        await requestJsonWithGetFallback("/te_asset_library/delete", {
            relative_path: asset.relative_path,
        });
        if (state.selectedAsset?.relative_path === asset.relative_path) {
            state.selectedAsset = null;
        }
        await refreshLibrary({ quiet: true, preserveScroll: true });
        setStatus(`已删除：${asset.name}`);
    } catch (error) {
        setStatus(`删除失败：${error.message || error}`);
    }
}

function setSelectedAsset(asset) {
    state.selectedAsset = asset;
    renderAssets();
}

async function createProject() {
    const name = window.prompt("新建项目名称", state.project || DEFAULT_PROJECT);
    if (!name) {
        return;
    }
    try {
        const data = await requestJsonWithGetFallback("/te_asset_library/project", { project: name });
        state.project = data.project || name;
        state.category = DEFAULT_CATEGORY;
        await refreshLibrary({ quiet: true });
        setStatus(`已新建项目：${state.project}`);
    } catch (error) {
        setStatus(`新建项目失败：${error.message || error}`);
    }
}

async function createCategory() {
    const name = window.prompt("新建分类名称", "人物");
    if (!name) {
        return;
    }
    try {
        const data = await requestJsonWithGetFallback("/te_asset_library/category", {
            project: state.project || DEFAULT_PROJECT,
            category: name,
        });
        state.category = data.category || name;
        await refreshLibrary({ quiet: true });
        setStatus(`已新建分类：${state.category}`);
    } catch (error) {
        setStatus(`新建分类失败：${error.message || error}`);
    }
}

async function deleteCurrentCategory() {
    const category = String(state.category || "").trim();
    const project = state.project || DEFAULT_PROJECT;
    if (isProtectedCategory(category)) {
        setStatus("请先选择一个可删除的分类。");
        return;
    }

    const confirmed = window.confirm(
        `确定删除当前分类吗？\n\n项目：${project}\n分类：${category}\n\n这个分类里的所有素材都会一起删除。`
    );
    if (!confirmed) {
        return;
    }

    try {
        await requestJsonWithGetFallback("/te_asset_library/category/delete", {
            project,
            category,
        });
        state.category = DEFAULT_CATEGORY;
        state.selectedAsset = null;
        await refreshLibrary({ quiet: true });
        setStatus(`已删除分类：${category}`);
    } catch (error) {
        setStatus(`删除分类失败：${error.message || error}`);
    }
}

function getNodeUploadImage(node) {
    const widget = node?.widgets?.find((item) => item?.name === "upload_image");
    return String(widget?.value || "").trim();
}

function getNodePreviewImageInfo(node) {
    const images = node?.images || app.nodeOutputs?.[String(node?.id)]?.images;
    if (Array.isArray(images) && images[0]?.filename) {
        return images[0];
    }
    const serialized = node?.properties?.te_saved_preview_images;
    if (Array.isArray(serialized) && serialized[0]?.filename) {
        return serialized[0];
    }
    return null;
}

function isImagesInputConnected(node) {
    const imageInput = node?.inputs?.find((input) => input?.name === "images");
    return !!imageInput?.link;
}

function getAddableNodeImagePayload(node) {
    const previewImageInfo = getNodePreviewImageInfo(node);
    const uploadImage = isImagesInputConnected(node) ? "" : getNodeUploadImage(node);
    const imageInfo = uploadImage ? null : previewImageInfo;
    if (!uploadImage && !imageInfo) {
        setStatus("当前节点没有可添加的图片。请先选择/上传图片，或运行生成一次。");
        return null;
    }
    return { uploadImage, imageInfo };
}

function getNodeTextValue(node) {
    const widget = node?.widgets?.find((item) => item?.name === "text");
    const element = getWidgetTextElement(widget);
    return String(element?.value ?? widget?.value ?? "");
}

function closeAddDialog() {
    addDialog?.remove();
    addDialog = null;
}

function projectOptionsHtml(selectedProject) {
    const projects = state.projects.length ? state.projects : [{ name: selectedProject || DEFAULT_PROJECT }];
    return projects.map((project) => {
        const selected = project.name === selectedProject ? " selected" : "";
        return `<option value="${escapeHtml(project.name)}"${selected}>${escapeHtml(project.name)}</option>`;
    }).join("");
}

function categoryOptionsHtml(projectName, selectedCategory) {
    const project = state.projects.find((item) => item.name === projectName) || getCurrentProject();
    const categories = (project?.categories || []).filter((category) => (
        category.name !== "未分类" && category.name !== TEXT_CATEGORY
    ));
    const fallback = categories.length ? categories : [{ name: selectedCategory || "人物" }];
    return fallback.map((category) => {
        const selected = category.name === selectedCategory ? " selected" : "";
        return `<option value="${escapeHtml(category.name)}"${selected}>${escapeHtml(category.name)}</option>`;
    }).join("");
}

async function addImageToLibraryFromDialog(payload, project, category, filenameStem = "") {
    try {
        const data = await requestJson("/te_asset_library/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                project,
                category,
                filename_stem: filenameStem,
                upload_image: payload.uploadImage,
                image_info: payload.imageInfo,
            }),
        });
        state.project = data.asset?.project || project;
        state.category = data.asset?.category || category;
        await refreshLibrary({ quiet: true });
        setStatus(`已添加到素材库：${data.asset?.relative_path || ""}`);
        showPanel(true);
        closeAddDialog();
    } catch (error) {
        setStatus(`添加失败：${error.message || error}`);
    }
}

async function addTextToLibraryFromDialog(text, project, title = "") {
    try {
        const data = await requestJson("/te_asset_library/text/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                project,
                title,
                text,
            }),
        });
        state.project = data.asset?.project || project;
        state.category = data.asset?.category || TEXT_CATEGORY;
        await refreshLibrary({ quiet: true });
        setStatus(`已添加提示词：${data.asset?.relative_path || ""}`);
        showPanel(true);
        closeAddDialog();
    } catch (error) {
        setStatus(`添加提示词失败：${error.message || error}`);
    }
}

async function openAddTextToLibraryDialog(node) {
    ensurePanel();
    if (!state.projects.length && !state.loading) {
        await refreshLibrary({ quiet: true });
    }

    const text = getNodeTextValue(node).trim();
    if (!text) {
        setStatus("当前文本节点没有可添加的提示词。");
        showPanel(true);
        return;
    }

    closeAddDialog();

    const currentProject = state.project || getCurrentProject()?.name || DEFAULT_PROJECT;
    addDialog = document.createElement("div");
    addDialog.className = "te-asset-modal-backdrop";
    addDialog.innerHTML = `
        <div class="te-asset-modal" role="dialog" aria-modal="true">
            <div>
                <div class="te-asset-modal-title">添加提示词到 TE MAN 资产库</div>
                <div class="te-asset-subtitle">提示词会保存到当前项目的“${TEXT_CATEGORY}”分类。</div>
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">项目</div>
                <div class="te-asset-row">
                    <select class="te-asset-select" data-role="add-project">${projectOptionsHtml(currentProject)}</select>
                    <button class="te-asset-button ghost" data-action="add-new-project">+</button>
                </div>
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">标题，可留空</div>
                <input class="te-asset-input" data-role="add-title" placeholder="留空则自动命名为 TE_MAN_prompt_年月日时分秒" />
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">预览</div>
                <div class="te-asset-preview-text" style="height:140px;">${escapeHtml(text)}</div>
            </div>

            <div class="te-asset-modal-actions">
                <button class="te-asset-button ghost" data-action="cancel-add">取消</button>
                <button class="te-asset-button primary" data-action="confirm-add">添加</button>
            </div>
        </div>
    `;
    document.body.appendChild(addDialog);
    enableDraggablePanel(qs(addDialog, ".te-asset-modal"), qs(addDialog, ".te-asset-modal-title"));

    const projectSelect = qs(addDialog, "[data-role='add-project']");
    const titleInput = qs(addDialog, "[data-role='add-title']");

    qs(addDialog, "[data-action='cancel-add']").onclick = closeAddDialog;
    addDialog.addEventListener("mousedown", (event) => {
        if (event.target === addDialog) {
            closeAddDialog();
        }
    });

    qs(addDialog, "[data-action='add-new-project']").onclick = async () => {
        const name = window.prompt("新建项目名称", projectSelect.value || DEFAULT_PROJECT);
        if (!name) {
            return;
        }
        try {
            const data = await requestJsonWithGetFallback("/te_asset_library/project", { project: name });
            state.project = data.project || name;
            await refreshLibrary({ quiet: true });
            projectSelect.innerHTML = projectOptionsHtml(state.project);
            setStatus(`已新建项目：${state.project}`);
        } catch (error) {
            setStatus(`新建项目失败：${error.message || error}`);
        }
    };

    qs(addDialog, "[data-action='confirm-add']").onclick = () => {
        addTextToLibraryFromDialog(
            text,
            projectSelect.value || DEFAULT_PROJECT,
            titleInput.value || ""
        );
    };
}

async function openAddToLibraryDialog(node) {
    ensurePanel();
    if (!state.projects.length && !state.loading) {
        await refreshLibrary({ quiet: true });
    }

    const payload = getAddableNodeImagePayload(node);
    if (!payload) {
        return;
    }

    closeAddDialog();

    const currentProject = state.project || getCurrentProject()?.name || DEFAULT_PROJECT;
    const currentCategory = state.category && state.category !== DEFAULT_CATEGORY && state.category !== TEXT_CATEGORY
        ? state.category
        : "人物";
    addDialog = document.createElement("div");
    addDialog.className = "te-asset-modal-backdrop";
    addDialog.innerHTML = `
        <div class="te-asset-modal" role="dialog" aria-modal="true">
            <div>
                <div class="te-asset-modal-title">添加到 TE MAN 资产库</div>
                <div class="te-asset-subtitle">选择项目和分类，不需要手动输入已有名称。</div>
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">项目</div>
                <div class="te-asset-row">
                    <select class="te-asset-select" data-role="add-project">${projectOptionsHtml(currentProject)}</select>
                    <button class="te-asset-button ghost" data-action="add-new-project">+</button>
                </div>
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">分类</div>
                <div class="te-asset-row">
                    <select class="te-asset-select" data-role="add-category">${categoryOptionsHtml(currentProject, currentCategory)}</select>
                    <button class="te-asset-button ghost" data-action="add-new-category">+</button>
                </div>
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">文件名，可留空</div>
                <input class="te-asset-input" data-role="add-filename" placeholder="留空则沿用原文件名" />
            </div>

            <div class="te-asset-modal-actions">
                <button class="te-asset-button ghost" data-action="cancel-add">取消</button>
                <button class="te-asset-button primary" data-action="confirm-add">添加</button>
            </div>
        </div>
    `;
    document.body.appendChild(addDialog);
    enableDraggablePanel(qs(addDialog, ".te-asset-modal"), qs(addDialog, ".te-asset-modal-title"));

    const projectSelect = qs(addDialog, "[data-role='add-project']");
    const categorySelect = qs(addDialog, "[data-role='add-category']");
    const filenameInput = qs(addDialog, "[data-role='add-filename']");

    projectSelect.onchange = () => {
        categorySelect.innerHTML = categoryOptionsHtml(projectSelect.value, "");
    };

    qs(addDialog, "[data-action='cancel-add']").onclick = closeAddDialog;
    addDialog.addEventListener("mousedown", (event) => {
        if (event.target === addDialog) {
            closeAddDialog();
        }
    });

    qs(addDialog, "[data-action='add-new-project']").onclick = async () => {
        const name = window.prompt("新建项目名称", projectSelect.value || DEFAULT_PROJECT);
        if (!name) {
            return;
        }
        try {
            const data = await requestJsonWithGetFallback("/te_asset_library/project", { project: name });
            state.project = data.project || name;
            await refreshLibrary({ quiet: true });
            projectSelect.innerHTML = projectOptionsHtml(state.project);
            categorySelect.innerHTML = categoryOptionsHtml(state.project, "");
            setStatus(`已新建项目：${state.project}`);
        } catch (error) {
            setStatus(`新建项目失败：${error.message || error}`);
        }
    };

    qs(addDialog, "[data-action='add-new-category']").onclick = async () => {
        const name = window.prompt("新建分类名称", categorySelect.value || "人物");
        if (!name) {
            return;
        }
        try {
            const data = await requestJsonWithGetFallback("/te_asset_library/category", {
                project: projectSelect.value || DEFAULT_PROJECT,
                category: name,
            });
            state.project = data.project || projectSelect.value;
            state.category = data.category || name;
            await refreshLibrary({ quiet: true });
            projectSelect.innerHTML = projectOptionsHtml(state.project);
            categorySelect.innerHTML = categoryOptionsHtml(state.project, state.category);
            setStatus(`已新建分类：${state.category}`);
        } catch (error) {
            setStatus(`新建分类失败：${error.message || error}`);
        }
    };

    qs(addDialog, "[data-action='confirm-add']").onclick = () => {
        addImageToLibraryFromDialog(
            payload,
            projectSelect.value || DEFAULT_PROJECT,
            categorySelect.value || "人物",
            filenameInput.value || ""
        );
    };
}

async function addNodeImageToLibrary(node) {
    await openAddToLibraryDialog(node);
}

async function addNodeTextToLibrary(node) {
    await openAddTextToLibraryDialog(node);
}

async function previewImageInfo(imageInfo, options = {}) {
    const imageUrl = buildImageInfoViewUrl(imageInfo || {});
    if (!imageUrl) {
        throw new Error("当前节点没有可预览的图片。");
    }
    openImagePreviewDialog(
        options.title || imageInfo?.name || imageInfo?.filename || "图片预览",
        imageUrl
    );
}

function registerAssetLibraryAction() {
    window.TEImageAssetLibrary = {
        ...(window.TEImageAssetLibrary || {}),
        addNodeImageToLibrary: async (node) => {
            ensurePanel();
            await addNodeImageToLibrary(node);
        },
        addNodeTextToLibrary: async (node) => {
            ensurePanel();
            await addNodeTextToLibrary(node);
        },
        previewImageInfo,
        refreshLibrary: async (options = {}) => {
            ensurePanel();
            await refreshLibrary({ quiet: true, ...(options || {}) });
        },
        showPanel,
    };
}

function removeLegacyFloatingToggle() {
    for (const toggle of document.querySelectorAll(".te-asset-toggle")) {
        toggle.remove();
    }
}

function updateMenuButtonState() {
    const wrapper = document.getElementById(MENU_BUTTON_ID);
    if (!wrapper) {
        return;
    }

    const visible = panel?.hidden === false;
    wrapper.dataset.visible = visible ? "true" : "false";
    for (const button of wrapper.querySelectorAll("[data-role='asset-library-toggle']")) {
        button.classList.toggle("active", visible);
    }
}

async function tryInstallMenuButton() {
    if (document.getElementById(MENU_BUTTON_ID)) {
        updateMenuButtonState();
        return true;
    }

    const menu = document.querySelector(".comfy-menu");
    if (!menu) {
        return false;
    }

    injectStyle();

    try {
        const [{ ComfyButton }, { ComfyButtonGroup }] = await Promise.all([
            import("../../../scripts/ui/components/button.js"),
            import("../../../scripts/ui/components/buttonGroup.js"),
        ]);

        const button = new ComfyButton({
            icon: "image-multiple-outline",
            action: () => showPanel(panel?.hidden !== false),
            tooltip: "TE MAN 资产素材库",
            content: "资产库",
        }).element;
        button.classList.add("te-asset-menu-button");
        button.dataset.role = "asset-library-toggle";

        const group = new ComfyButtonGroup(button);
        const wrapper = document.createElement("div");
        wrapper.id = MENU_BUTTON_ID;
        wrapper.append(group.element);

        const anchor = app.menu?.settingsGroup?.element;
        if (anchor?.after) {
            anchor.after(wrapper);
        } else {
            menu.appendChild(wrapper);
        }

        updateMenuButtonState();
        return true;
    } catch (error) {
        const wrapper = document.createElement("div");
        wrapper.id = MENU_BUTTON_ID;

        const button = document.createElement("button");
        button.className = "te-asset-menu-button";
        button.dataset.role = "asset-library-toggle";
        button.type = "button";
        button.textContent = "资产库";
        button.title = "TE MAN 资产素材库";
        button.onclick = () => showPanel(panel?.hidden !== false);
        wrapper.appendChild(button);

        const anchor = app.menu?.settingsGroup?.element;
        if (anchor?.after) {
            anchor.after(wrapper);
        } else {
            menu.appendChild(wrapper);
        }

        updateMenuButtonState();
        console.warn("[TE MAN] 新版顶部菜单按钮不可用，已使用兼容按钮。", error);
        return true;
    }
}

async function installMenuButtonWithRetry({ timeoutMs = 30000, intervalMs = 200 } = {}) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
        if (await tryInstallMenuButton()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    console.warn("[TE MAN] 未找到 ComfyUI 顶部菜单，资产库入口按钮未安装。");
}

function ensurePanel() {
    if (panel) {
        return panel;
    }

    injectStyle();
    removeLegacyFloatingToggle();

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "te-asset-panel";
    panel.hidden = true;
    panel.innerHTML = `
        <aside class="te-asset-sidebar">
            <div class="te-asset-title-row">
                <div>
                    <div class="te-asset-title">TE MAN 资产素材库</div>
                    <div class="te-asset-subtitle">项目 / 分类 / 图片 / 提示词</div>
                </div>
            </div>

            <div class="te-asset-stack">
                <div class="te-asset-label">项目</div>
                <div class="te-asset-row">
                    <select class="te-asset-select" data-role="project"></select>
                    <button class="te-asset-button ghost" data-action="new-project">+</button>
                </div>
            </div>

            <div class="te-asset-stack" style="min-height:0;">
                <div class="te-asset-row">
                    <div class="te-asset-label">分类</div>
                    <div class="te-asset-spacer"></div>
                    <button class="te-asset-button ghost" data-action="new-category">+</button>
                </div>
                <div class="te-asset-categories" data-role="categories"></div>
                <button class="te-asset-button danger" data-action="delete-category">删除当前分类</button>
            </div>

            <div class="te-asset-subtitle">
                点“添加”或双击素材创建对应节点。
            </div>

            <a class="te-asset-launcher-link"
                href="https://www.bilibili.com/video/BV1xu9cByELa/?share_source=copy_web&amp;vd_source=a74fe7a15dbf45f77a4ef19aacacd83c"
                target="_blank"
                rel="noopener noreferrer">
                推荐配合 ComfyUI TE 启动器使用，开启并发功能
            </a>
        </aside>

        <main class="te-asset-main">
            <div class="te-asset-title-row">
                <div>
                    <div class="te-asset-title" data-role="heading">素材</div>
                    <div class="te-asset-subtitle" data-role="summary">input/TE_MAN</div>
                </div>
                <div class="te-asset-spacer"></div>
                <button class="te-asset-button ghost" data-action="close">关闭</button>
            </div>

            <div class="te-asset-toolbar">
                <input class="te-asset-input" data-role="search" placeholder="搜索当前项目素材..." />
                <button class="te-asset-button" data-action="smaller">缩小</button>
                <button class="te-asset-button" data-action="larger">放大</button>
                <button class="te-asset-button primary" data-action="refresh">刷新</button>
            </div>

            <div class="te-asset-grid" data-role="assets"></div>

            <div class="te-asset-footer">
                <span data-role="status"></span>
                <span class="te-asset-spacer"></span>
                <span data-role="selected"></span>
            </div>
        </main>
    `;
    document.body.appendChild(panel);
    enableDraggablePanel(panel, [
        qs(panel, ".te-asset-sidebar .te-asset-title-row"),
        qs(panel, ".te-asset-main > .te-asset-title-row"),
    ]);

    bindPanelEvents();
    return panel;
}

function bindPanelEvents() {
    qs(panel, "[data-action='close']").onclick = () => showPanel(false);
    qs(panel, "[data-action='refresh']").onclick = () => refreshLibrary();
    qs(panel, "[data-action='new-project']").onclick = () => createProject();
    qs(panel, "[data-action='new-category']").onclick = () => createCategory();
    qs(panel, "[data-action='delete-category']").onclick = () => deleteCurrentCategory();
    qs(panel, "[data-action='smaller']").onclick = () => {
        state.viewSize = Math.max(88, state.viewSize - 20);
        saveState();
        renderAssets();
    };
    qs(panel, "[data-action='larger']").onclick = () => {
        state.viewSize = Math.min(220, state.viewSize + 20);
        saveState();
        renderAssets();
    };

    qs(panel, "[data-role='project']").onchange = (event) => {
        state.project = event.target.value;
        state.category = DEFAULT_CATEGORY;
        saveState();
        refreshLibrary({ quiet: true });
    };

    const search = qs(panel, "[data-role='search']");
    let searchTimer = null;
    search.oninput = (event) => {
        state.query = event.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            saveState();
            refreshLibrary({ quiet: true });
        }, 220);
    };
}

function showPanel(visible) {
    ensurePanel();
    state.visible = visible;
    panel.hidden = !visible;
    updateMenuButtonState();
    if (visible && !state.projects.length && !state.loading) {
        refreshLibrary({ quiet: true });
    } else {
        renderPanel();
    }
}

function renderPanel() {
    ensurePanel();

    const projectSelect = qs(panel, "[data-role='project']");
    projectSelect.innerHTML = "";
    for (const project of state.projects) {
        const option = document.createElement("option");
        option.value = project.name;
        option.textContent = project.name;
        option.selected = project.name === state.project;
        projectSelect.appendChild(option);
    }

    qs(panel, "[data-role='search']").value = state.query || "";
    qs(panel, "[data-role='heading']").textContent = state.project || "素材";
    qs(panel, "[data-role='summary']").textContent = `input/TE_MAN/${state.project || ""}`;

    renderCategories();
    renderAssets();
    setStatus(state.status);
}

function renderCategories() {
    const root = qs(panel, "[data-role='categories']");
    root.innerHTML = "";
    const categories = getCategoriesForCurrentProject();

    for (const category of categories) {
        const button = document.createElement("button");
        button.className = `te-asset-category ${category.name === state.category ? "active" : ""}`;
        button.innerHTML = `<span>${category.label}</span><span class="te-asset-count">${category.count ?? 0}</span>`;
        button.onclick = () => {
            state.category = category.name;
            saveState();
            refreshLibrary({ quiet: true });
        };
        root.appendChild(button);
    }

    const deleteButton = qs(panel, "[data-action='delete-category']");
    if (deleteButton) {
        deleteButton.disabled = isProtectedCategory(state.category);
        deleteButton.title = deleteButton.disabled ? "请选择具体分类后再删除" : `删除分类：${state.category}`;
    }
}

function renderAssets() {
    if (!panel) {
        return;
    }

    const root = qs(panel, "[data-role='assets']");
    root.style.setProperty("--te-asset-thumb", `${state.viewSize}px`);
    root.innerHTML = "";

    const selectedText = qs(panel, "[data-role='selected']");
    selectedText.textContent = state.selectedAsset ? state.selectedAsset.relative_path : "";

    if (state.loading) {
        root.innerHTML = `<div class="te-asset-empty">正在加载素材...</div>`;
        return;
    }

    if (!state.assets.length) {
        root.innerHTML = `<div class="te-asset-empty">这个项目/分类里还没有素材。可以从 TE 图像节点或文本展示节点添加。</div>`;
        return;
    }

    for (const asset of state.assets) {
        const textAsset = isTextAsset(asset);
        const card = document.createElement("article");
        card.className = `te-asset-card ${textAsset ? "text" : ""} ${state.selectedAsset?.relative_path === asset.relative_path ? "selected" : ""}`;
        card.title = asset.relative_path;
        if (textAsset) {
            card.innerHTML = `
                <div class="te-asset-thumb te-asset-text-thumb">
                    <div class="te-asset-text-preview">${escapeHtml(asset.text_preview || asset.name)}</div>
                </div>
                <div class="te-asset-actions">
                    <button class="te-asset-chip" data-action="add">添加</button>
                    <button class="te-asset-chip" data-action="copy">复制</button>
                    <button class="te-asset-chip" data-action="preview">预览</button>
                    <div class="te-asset-more">
                        <button class="te-asset-chip" data-action="more">更多</button>
                        <div class="te-asset-more-menu">
                            <button class="te-asset-chip" data-action="rename">更名</button>
                            <button class="te-asset-chip danger" data-action="delete">删除</button>
                        </div>
                    </div>
                </div>
                <div class="te-asset-meta">
                    <div class="te-asset-name">${escapeHtml(asset.name)}</div>
                    <div class="te-asset-path">${escapeHtml(asset.category)} · ${asset.line_count || 0}行 · ${asset.char_count || 0}字</div>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="te-asset-thumb">
                    <img loading="lazy" draggable="false" src="${buildThumbUrl(asset)}" alt="">
                </div>
                <div class="te-asset-actions">
                    <button class="te-asset-chip" data-action="add">添加</button>
                    <button class="te-asset-chip" data-action="preview">预览</button>
                    <div class="te-asset-more">
                        <button class="te-asset-chip" data-action="more">更多</button>
                        <div class="te-asset-more-menu">
                            <button class="te-asset-chip" data-action="rename">更名</button>
                            <button class="te-asset-chip danger" data-action="delete">删除</button>
                        </div>
                    </div>
                </div>
                <div class="te-asset-meta">
                    <div class="te-asset-name">${escapeHtml(asset.name)}</div>
                    <div class="te-asset-path">${escapeHtml(asset.category)} · ${asset.width || "?"}x${asset.height || "?"}</div>
                </div>
            `;
        }

        card.onclick = () => setSelectedAsset(asset);
        card.ondblclick = (event) => {
            event.preventDefault();
            Promise.resolve(createNodeFromAssetAtEvent(event, asset))
                .then(() => setStatus(`已创建${textAsset ? "文本" : "加载图像"}节点：${asset.name}`))
                .catch((error) => setStatus(`创建节点失败：${error.message || error}`));
        };
        qs(card, "[data-action='add']").onclick = (event) => {
            event.stopPropagation();
            Promise.resolve(createNodeFromAssetAtEvent(event, asset))
                .then(() => setStatus(`已创建${textAsset ? "文本" : "加载图像"}节点：${asset.name}`))
                .catch((error) => setStatus(`创建节点失败：${error.message || error}`));
        };
        qs(card, "[data-action='copy']")?.addEventListener("click", (event) => {
            event.stopPropagation();
            getTextAssetContent(asset)
                .then((text) => copyTextToClipboard(text))
                .then((copied) => setStatus(copied ? `已复制：${asset.name}` : "复制失败"))
                .catch((error) => setStatus(`复制失败：${error.message || error}`));
        });
        qs(card, "[data-action='preview']").onclick = (event) => {
            event.stopPropagation();
            Promise.resolve(openPreview(asset)).catch((error) => setStatus(`预览失败：${error.message || error}`));
        };
        qs(card, "[data-action='more']").onclick = (event) => {
            event.stopPropagation();
        };
        qs(card, "[data-action='rename']").onclick = (event) => {
            event.stopPropagation();
            renameAsset(asset);
        };
        qs(card, "[data-action='delete']").onclick = (event) => {
            event.stopPropagation();
            deleteAsset(asset);
        };

        root.appendChild(card);
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function removeLegacyAssetButtonOnImageNode(node) {
    if (!Array.isArray(node?.widgets)) {
        return;
    }

    for (let index = node.widgets.length - 1; index >= 0; index -= 1) {
        const widget = node.widgets[index];
        if (widget?.name !== "添加到素材库") {
            continue;
        }
        widget.onRemove?.();
        widget.onRemoved?.();
        node.widgets.splice(index, 1);
        if (Array.isArray(node.widgets_values) && index < node.widgets_values.length) {
            node.widgets_values.splice(index, 1);
        }
    }
}

function installAssetButtonOnImageNode(node) {
    if (!node) {
        return;
    }

    registerAssetLibraryAction();
    removeLegacyAssetButtonOnImageNode(node);
    node.__teAssetLibraryButtonInstalled = true;
    markCanvasDirty();
}

function patchImageNode(nodeType, nodeData) {
    if (nodeData.name !== IMAGE_NODE_CLASS) {
        return;
    }

    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const result = originalOnNodeCreated?.apply(this, arguments);
        installAssetButtonOnImageNode(this);
        return result;
    };
}

loadState();
registerAssetLibraryAction();

app.registerExtension({
    name: EXTENSION_NAME,
    async setup() {
        registerAssetLibraryAction();
        ensurePanel();
        installMenuButtonWithRetry();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        patchImageNode(nodeType, nodeData);
    },
    async nodeCreated(node) {
        if (node?.comfyClass === IMAGE_NODE_CLASS || node?.type === IMAGE_NODE_CLASS) {
            installAssetButtonOnImageNode(node);
        }
    },
});
