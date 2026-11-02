import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Compatibility patch for TE_prompt_text + MiniMax H3 Image to Video.
// The original editor can preview a direct LoadImage node, but first/last
// frames commonly pass through resize/crop nodes. Follow IMAGE links upstream
// so <Picture N> can still receive a thumbnail.

const PROMPT_TEXT = "TE_prompt_text";
const H3_I2V = "MiniMaxH3ImageToVideo";
const TEXT_BRIDGES = new Set([
  "QwenTE_ImageInfer",
  "TE_text_display",
  "TE_H3_Prompt_Enhancer",
  "TE_H3_Reference_Bridge",
]);

function nodeIs(node, type) {
  return [node?.comfyClass, node?.type, node?.constructor?.comfyClass, node?.constructor?.type]
    .some((value) => String(value || "") === type);
}

function graphFor(node) {
  return node?.graph || app.graph?.getCurrentGraph?.() || app.canvas?.graph || app.graph;
}

function graphLink(graph, link) {
  if (link && typeof link === "object") return link;
  return graph?.links instanceof Map ? graph.links.get(link) : graph?.links?.[link];
}

function linkOriginId(link) {
  return Array.isArray(link) ? link[1] : link?.origin_id ?? link?.originId;
}

function linkTargetId(link) {
  return Array.isArray(link) ? link[3] : link?.target_id ?? link?.targetId;
}

function nodeById(graph, id) {
  return graph?.getNodeById?.(id) || graph?._nodes_by_id?.[id] || null;
}

function inputByName(node, ...names) {
  return (node?.inputs || []).find((input) => {
    const leaf = String(input?.name || "").split(".").pop();
    return names.includes(input?.name) || names.includes(leaf);
  }) || null;
}

function originFromInput(node, input) {
  const linkId = input?.link ?? input?.links?.[0];
  const link = graphLink(graphFor(node), linkId);
  const originId = linkOriginId(link);
  return originId == null ? null : nodeById(graphFor(node), originId);
}

function outputTargets(node, outputIndex = 0) {
  const graph = graphFor(node);
  if (!graph) return [];
  const output = node?.outputs?.[outputIndex];
  const ids = output?.links instanceof Set
    ? [...output.links]
    : Array.isArray(output?.links)
      ? output.links
      : output?.links == null
        ? []
        : [output.links];
  const links = ids.map((id) => graphLink(graph, id)).filter(Boolean);
  if (!links.length) {
    const allLinks = graph.links instanceof Map ? [...graph.links.values()] : Object.values(graph.links || {});
    links.push(...allLinks.filter((link) => String(linkOriginId(link)) === String(node?.id)));
  }
  return links.map((link) => nodeById(graph, linkTargetId(link))).filter(Boolean);
}

function promptOriginatesFrom(node, promptNode, visited = new Set()) {
  if (!node || visited.has(String(node.id))) return false;
  visited.add(String(node.id));

  const promptInput = inputByName(node, "prompt");
  let source = originFromInput(node, promptInput);
  if (source === promptNode || nodeIs(source, PROMPT_TEXT) && String(source.id) === String(promptNode.id)) return true;

  while (source && TEXT_BRIDGES.has(String(source.comfyClass || source.type || ""))) {
    const sourceInput = nodeIs(source, "QwenTE_ImageInfer")
      ? inputByName(source, "提示词")
      : nodeIs(source, "TE_text_display")
        ? inputByName(source, "input_text", "text")
        : nodeIs(source, "TE_H3_Prompt_Enhancer")
          ? inputByName(source, "输入提示词")
          : inputByName(source, "text");
    source = originFromInput(source, sourceInput);
    if (source === promptNode || nodeIs(source, PROMPT_TEXT) && String(source?.id) === String(promptNode.id)) return true;
  }
  return false;
}

function findI2VTarget(promptNode) {
  const graph = graphFor(promptNode);
  const nodes = graph?._nodes || [];
  return nodes.find((node) => nodeIs(node, H3_I2V) && promptOriginatesFrom(node, promptNode)) || null;
}

function viewUrl(image) {
  if (!image?.filename) return "";
  const query = new URLSearchParams({
    filename: image.filename,
    type: image.type || "output",
    rand: String(Date.now()),
  });
  if (image.subfolder) query.set("subfolder", image.subfolder);
  return api.apiURL(`/view?${query}`);
}

function loadImageInfo(node) {
  if (!nodeIs(node, "LoadImage")) return null;
  const widget = (node.widgets || []).find((item) => item?.name === "image") || node.widgets?.[0];
  const filename = String(widget?.value || node.widgets_values?.[0] || "").trim();
  return filename ? { filename, type: "input" } : null;
}

function directImageSource(node) {
  const outputImage = app.nodeOutputs?.[String(node?.id)]?.images?.[0] || node?.images?.[0];
  if (outputImage?.filename) return viewUrl(outputImage);
  if (node?.imgs?.[0]?.src) return node.imgs[0].src;
  return viewUrl(loadImageInfo(node));
}

function resolveImageSource(node, visited = new Set()) {
  if (!node || visited.has(String(node.id))) return "";
  visited.add(String(node.id));

  const direct = directImageSource(node);
  if (direct) return direct;

  for (const input of node.inputs || []) {
    if (String(input?.type || "").toUpperCase() !== "IMAGE") continue;
    const origin = originFromInput(node, input);
    const source = resolveImageSource(origin, visited);
    if (source) return source;
  }
  return "";
}

function sourceForInput(node, name) {
  return resolveImageSource(originFromInput(node, inputByName(node, name)));
}

function injectThumbnail(editor, token, src) {
  if (!src) return;
  for (const chip of editor.querySelectorAll(".te-prompt-image-chip")) {
    if (chip.dataset.insertText !== token) continue;
    let image = chip.querySelector("img[data-te-i2v-preview]");
    if (!image) {
      image = document.createElement("img");
      image.dataset.teI2vPreview = "true";
      Object.assign(image.style, {
        width: "28px",
        height: "28px",
        borderRadius: "5px",
        objectFit: "cover",
        display: "inline-block",
      });
      chip.insertBefore(image, chip.firstChild);
    }
    if (image.src !== src) image.src = src;
  }
}

function injectMenuThumbnail(token, src) {
  if (!src) return;
  const menu = document.querySelector(".te-prompt-image-mention-menu");
  if (!menu) return;

  for (const row of menu.querySelectorAll("button")) {
    if (!row.textContent?.includes(token)) continue;
    const preview = row.firstElementChild;
    if (!preview) continue;
    let image = preview.querySelector("img[data-te-i2v-menu-preview]");
    if (!image) {
      // Keep an existing thumbnail provided by the original editor intact.
      image = preview.querySelector("img");
      if (!image) {
        image = document.createElement("img");
        image.dataset.teI2vMenuPreview = "true";
        Object.assign(image.style, {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        });
        preview.replaceChildren(image);
      }
    }
    if (image.src !== src) image.src = src;
  }
}

function refreshI2VPreviews() {
  const graph = app.graph?.getCurrentGraph?.() || app.canvas?.graph || app.graph;
  for (const promptNode of graph?._nodes || []) {
    if (!nodeIs(promptNode, PROMPT_TEXT)) continue;
    const editor = promptNode.__tePromptTextState?.editor;
    const target = editor ? findI2VTarget(promptNode) : null;
    if (!target) continue;

    const first = sourceForInput(target, "first_frame");
    const last = sourceForInput(target, "last_frame");
    const firstToken = "<Picture 1>";
    const lastToken = first ? "<Picture 2>" : firstToken;
    if (first) injectThumbnail(editor, firstToken, first);
    if (last) injectThumbnail(editor, lastToken, last);

    // The menu is created by the original script after the @ input event.
    // Only update it for its owning editor, so Reference-to-Video menus are
    // left untouched.
    if (editor === document.activeElement || editor.contains(document.activeElement)) {
      if (first) injectMenuThumbnail(firstToken, first);
      if (last) injectMenuThumbnail(lastToken, last);
    }
  }
}

let queued = false;
function scheduleRefresh() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    refreshI2VPreviews();
  });
}

app.registerExtension({
  name: "TE.Man.PromptTextI2VPreviewCompatibility",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    const type = String(nodeData?.name || nodeData?.comfyClass || "");
    if (type === H3_I2V) {
      const original = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function () {
        const result = original?.apply(this, arguments);
        // The original TE MAN handler rerenders the prompt editor asynchronously.
        // Queue after it, otherwise it would replace the injected thumbnails.
        setTimeout(scheduleRefresh, 0);
        return result;
      };
    }
    if (type === PROMPT_TEXT) {
      for (const method of ["onNodeCreated", "onConfigure"]) {
        const original = nodeType.prototype[method];
        nodeType.prototype[method] = function () {
          const result = original?.apply(this, arguments);
          setTimeout(scheduleRefresh, 0);
          return result;
        };
      }
    }
  },
  setup() {
    document.addEventListener("pointerup", scheduleRefresh, true);
    document.addEventListener("input", scheduleRefresh, true);
    document.addEventListener("keyup", scheduleRefresh, true);
    api.addEventListener?.("executed", scheduleRefresh);
    setTimeout(scheduleRefresh, 0);
    setTimeout(scheduleRefresh, 250);
    setTimeout(scheduleRefresh, 1000);
  },
});
