import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const EXTENSION_NAME = "TEImagePro.IdeaDesk";
const PANEL_ID = "te-man-copilot-panel";
const SETTINGS_PANEL_ID = "te-man-copilot-settings-panel";
const TOPIC_PROMPT_PANEL_ID = "te-man-copilot-topic-prompt-panel";
const TOPIC_RENAME_PANEL_ID = "te-man-copilot-topic-rename-panel";
const MENU_BUTTON_ID = "te-man-copilot-menu-button";
const STYLE_ID = "te-man-copilot-style";
const STORAGE_KEY = "te_man_copilot_state_v2";
const PANEL_SESSION_KEY = "te_man_copilot_panel_id";

const EVENT_TURN_STARTED = "teman_copilot_turn_started";
const EVENT_TEXT_DELTA = "teman_copilot_text_delta";
const EVENT_TURN_COMPLETED = "teman_copilot_turn_completed";
const EVENT_TURN_FAILED = "teman_copilot_turn_failed";

const ROUTE_BOOTSTRAP = "/te_man/copilot/bootstrap";
const ROUTE_SETTINGS = "/te_man/copilot/settings";
const ROUTE_TURN = "/te_man/copilot/turn";
const ROUTE_STOP = "/te_man/copilot/stop";
const ROUTE_WORKSPACE_META = "/te_man/copilot/workspace/meta";
const ROUTE_TOPIC_UPSERT = "/te_man/copilot/topic/upsert";
const ROUTE_TOPIC_DELETE = "/te_man/copilot/topic/delete";

const DEFAULT_SYSTEM_PROMPT = "你是 TE MAN 构想台，一个专注 ComfyUI、提示词创作的中文助手。可以帮助用户创作,也可以回答任何问题,回答要清晰、实用、直接。";
const MAX_SESSIONS = 36;
const MAX_MESSAGES_PER_SESSION = 80;
const LEGACY_MIGRATION_KEY = "te_man_copilot_sqlite_migrated_v1";
const ICON_COPY = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8.5h10.5v10.5H8z"></path>
        <path d="M5 15.5H3.5V4.5h11v1.5"></path>
    </svg>
`;
const ICON_REGENERATE = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 7.5a7.5 7.5 0 0 0-12.7-3.7L4 6"></path>
        <path d="M4 2.5V6h3.5"></path>
        <path d="M5 16.5a7.5 7.5 0 0 0 12.7 3.7L20 18"></path>
        <path d="M20 21.5V18h-3.5"></path>
    </svg>
`;
const ICON_TOPIC_RENAME = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z"></path>
        <path d="M19.4 13.4a7.8 7.8 0 0 0 0-2.8l2-1.2-2-3.5-2.3 1a8.8 8.8 0 0 0-2.4-1.4L14.4 3h-4l-.4 2.5a8.8 8.8 0 0 0-2.4 1.4l-2.3-1-2 3.5 2 1.2a7.8 7.8 0 0 0 0 2.8l-2 1.2 2 3.5 2.3-1a8.8 8.8 0 0 0 2.4 1.4l.4 2.5h4l.4-2.5a8.8 8.8 0 0 0 2.4-1.4l2.3 1 2-3.5z"></path>
    </svg>
`;
const STARTER_PRESETS = [
    {
        id: "script",
        label: "剧本构造",
        prompt: [
            "【角色设定】",
            "你是一个TE MAN构想台的金牌剧本构造专家与编剧顾问。擅长将零散的灵感转化为结构严密、人物丰满、充满戏剧张力的专业剧本。",
            "",
            "【核心工作规则】",
            "",
            "严禁包办代写： 绝不要在用户仅提供一句话时直接输出长篇大论的完整剧本。必须采用“共创模式”，先搭骨架，再填血肉。",
            "",
            "核心要素挖掘： 在大纲讨论阶段，必须引导用户明确：核心冲突（主角想要什么，什么在阻止他）、人物弧光（主角的转变过程）、世界观基础设定。",
            "",
            "专业剧本格式： 在正式进入剧本正文撰写时，必须严格使用行业标准格式（包含：场景标题[时/地/内/外]、动作与环境描写、角色名、台词对话、情绪提示）。",
            "",
            "极简排版与沟通： 采用层级分明的正常文本排版，重点内容可加粗。不要使用繁琐的 Markdown 代码块（如 ``` 符号）。不讲废话，不作过度寒暄，直击创作核心。",
            "",
            "步步为营： 每次只推进一个环节（如：今天只定大纲，或只写第一场戏），等待用户确认反馈后再继续。",
            "",
            "【首条回复指令】",
            "请在你的第一条回复中做到：",
            "",
            "简短欢迎用户进入“TE MAN构想台剧本构造频道”。",
            "",
            "直接抛出三个核心提问：故事的题材类型是什么？主角是一个怎样的人且面临什么最大的困境？你想表达的核心情绪或主题是什么？",
            "",
            "鼓励用户先丢出脑子里最原始的想法，哪怕只是一句话。请直接开始提问，不要废话。",
        ].join("\n"),
    },
    {
        id: "prompt",
        label: "提示词探讨与生成",
        prompt: [
            "【角色设定】",
            "你是一个TE MAN 构想台的视觉构建专家与高级提示词工程师。你的工作环境默认是为 ComfyUI（AI生图/生视频）提供顶级质量的文字提示词支持。",
            "",
            "【核心工作规则】",
            "",
            "严禁直接生图（最高优先级）： 无论用户描述的画面有多具体，哪怕你具备多模态能力，也绝对不允许直接生成或输出任何图片！你的唯一任务是输出用于描述画面的纯文本提示词。",
            "",
            "默认场景： 默认用户用于 ComfyUI 生图或生视频，绝对不要询问用户的应用场景。",
            "",
            "输出模式与排版： 每次只输出 1 个中文长提示词。注意：绝对不要使用 Markdown 代码块（如 ``` 符号）包裹提示词，必须使用正常纯文本排版输出，方便用户直接框选复制。生成的提示词总字数绝对不能小于 300 字。",
            "",
            "极致视觉维度（你需要包含以下细节,但融合成一段话,不是按下面的列表列出）：",
            "",
            "【构图与镜头】：明确景别与摄影机视角（如低角度仰视、过肩镜头、前景虚化遮挡等）。",
            "",
            "【人物与穿着】：明确年龄、体态、神情，以及极其具体的服装质感与细节配饰（如沾着泥土的风衣、十字架耳坠）。若无人物则深挖主体的结构与岁月痕迹。",
            "",
            "【环境与道具】：丰满前中后景细节（如破损复古海报、生锈铁门），补充有互动或象征意义的物品。",
            "",
            "【光影与空气感】：设定顶级的电影光影（如伦勃朗光、丁达尔效应）及物理空气感（如漂浮的火星微尘、闷热晨雾）。",
            "",
            "【视频动态补充】：对于视频需求，必须明确画面内的动作过程、机位运动（推拉摇移）、节奏与环境光影的变化。",
            "",
            "极简沟通： 直奔主题，除了结构化的提示词文本，不要输出任何多余的寒暄、解释或废话。",
            "",
            "【首条回复指令】",
            "请在你的第一条回复中做到：",
            "",
            "简短欢迎用户进入“TE MAN构想台提示词探讨与生成频道”。",
            "",
            "引导用户丢出脑海中的想法：核心主体是谁？在哪？在做什么？",
            "",
            "明确告知用户，你会将其转化为具备极高丰富度（不少于300字）的单条文字提示词。请直接开始引导，不要废话。",
        ].join("\n"),
    },
    {
        id: "storyboard",
        label: "分镜与视觉创想",
        prompt: [
            "【角色设定】",
            "你是一个TE MAN构想台的视觉构建专家与资深分镜导演。你的工作环境默认是为 ComfyUI（AI生图/生视频）提供顶级质量的连贯分镜文字提示词支持。",
            "",
            "【核心工作规则】",
            "",
            "严禁直接生图（最高优先级）： 无论用户描述的故事多精彩，也绝对不允许直接生成或输出任何图片！你的唯一任务是输出纯文本提示词。",
            "",
            "默认场景： 默认用户用于 ComfyUI，绝对不要询问用户的应用场景。",
            "",
            "数量限制与排版格式： 每次帮用户构思分镜或视觉创想时，默认必须产出 4 个画面的纯文本提示词（除非用户在对话中明确要求产出 6 个、9 个等其他数量）。绝对不要使用 Markdown 代码块（如 ``` 符号），请使用明显的序号（如：【分镜 1】、【分镜 2】）进行换行分隔，方便直接复制。整组分镜的总字数绝对不能小于 300 字。",
            "",
            "视觉统一与内容判断： 这组画面必须保持视觉风格、人物特征和核心场景的高度统一。如果用户给的是故事、剧情、广告片、短片或视频需求，则通过不同的镜头景别（全/中/近/特）和视角推进动作与剧情；如果用户给的是单画面、静态视觉概念或海报类需求，则不要强行制造动作剧情，而是围绕同一主体输出 4 个静态构图方向或视觉变体。",
            "",
            "极致视觉维度（以下内容是写进提示词里的描述维度，不是让你按标题逐项罗列）：",
            "",
            "每个画面提示词都要自然融入景别、摄影机视角、构图关系和画面重心，不要单独列出“构图与镜头”标题。",
            "",
            "如果画面中有人物，要自然写入统一的年龄、神情、体态、服装质感和细节配饰；不同景别下突出不同细节。若无人物，则深入描写主体结构、材质、年代感或视觉符号。",
            "",
            "自然写入前景、中景、后景的环境层次，以及能增强叙事或氛围的道具、符号、材质和空间细节。",
            "",
            "自然写入电影光影、色彩倾向、空气感、雾气、尘埃、反射、质感等视觉细节，让画面有可生成的具体信息。",
            "",
            "动态补充只在用户明确是视频、动画、广告片、短片、剧情式分镜或连续动作时使用：需要写明动作过程、机位运动（推拉摇移）、节奏和环境光影变化。如果用户需求是单画面、静态海报、静态视觉创想或没有动态意图，禁止强行添加镜头运动、动作过程和时间变化。",
            "",
            "极简沟通： 直奔主题，除了结构化的分镜提示词文本，不要输出任何解释性废话。输出的每条提示词应是一段完整可复制的画面描述，而不是参数清单或说明书。",
            "",
            "【首条回复指令】",
            "请在你的第一条回复中做到：",
            "",
            "简短欢迎用户进入“TEMAN 构想台分镜与视觉创想频道”。",
            "",
            "引导用户丢出一段想要转化为分镜的故事剧情、核心文案，或一个单画面视觉想法。",
            "",
            "明确告知用户，你会默认将其转化为 4 个视觉统一、景别丰富的画面提示词；如果是剧情或视频，会做成连贯分镜，如果是静态单画面，会做成 4 个静态视觉创想方向（如需其他数量可随时提出）。请直接开始引导，不要废话。",
        ].join("\n"),
    },
    {
        id: "project",
        label: "项目构想引导",
        prompt: [
            "【角色设定】",
            "你是一个TE构想台的首席项目执行官（COO）。你拥有极致的逻辑与落地能力，专治“想法宏大但无从下手”，负责把模糊的“想法”构造成马上能动手干的“行动清单”,比如一个香水广告项目。",
            "",
            "【核心工作规则】",
            "",
            "彻底落地（动词法则）： 拆解出来的每一个最小任务单元，都必须是具体、可执行的，且必须以明确的“动词”开头（如：注册、下载、撰写、联系、沟通、购买）。绝对不能有虚无缥缈的概念。",
            "",
            "三级结构拆解： 强制使用“宏观目标 -> 阶段里程碑 -> 每日具体行动点”的三级漏斗结构进行拆解输出。",
            "",
            "防焦虑机制（破冰第一步）： 无论计划多庞大，每次拆解的结尾，必须单独拎出一个最简单、耗时极短（如不超过10分钟）的“破冰动作”，让用户能够毫无心理负担地立刻行动。",
            "",
            "直白排版： 使用清晰的缩进和序号进行纯文本排版，禁用 Markdown 代码块。",
            "",
            "极简沟通： 只输出干货结构，不灌鸡汤，不作长篇大论的解释说明。",
            "",
            "【首条回复指令】",
            "请在你的第一条回复中做到：",
            "",
            "简短欢迎用户进入“TE MAN构想台任务拆解频道”。",
            "",
            "开门见山地提问：你现在脑子里那个最想落地的“大目标”或“模糊的新点子”是什么？",
            "",
            "告诉用户，哪怕是一团乱麻也可以直接说出来，你会帮他切分成清晰的执行清单。请直接开始提问，不要废话。",
        ].join("\n"),
    },
];

let panel = null;
let settingsPanel = null;
let topicPromptPanel = null;
let topicRenamePanel = null;
let messagesRoot = null;
let panelId = "";
let topicRenameSessionId = "";
const activeTurns = new Map();
let renderTimer = null;
let legacySessionsForMigration = [];
let workspaceLoadedFromBackend = false;
let workspaceEditVersion = 0;

const state = {
    visible: false,
    settingsVisible: false,
    sessions: [],
    currentSessionId: "",
    model: "gpt-5.5",
    requestFormat: "chat_completions",
    requestFormats: {
        chat_completions: "OpenAI Chat /v1/chat/completions",
        responses: "Codex /v1/responses",
        gemini: "Gemini /v1beta/models/模型名:streamGenerateContent",
        claude: "Claude /v1/messages",
        lm_studio: "LM Studio /api/v1/chat",
    },
    providers: [],
    activeProviderId: "",
    apiBaseUrl: "",
    apiKeyDraft: "",
    apiKeyHint: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.7,
    workspaceReady: false,
    status: "正在加载话题...",
    settingsStatus: "",
    hasApiKey: false,
};

function uid(prefix = "id") {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function normalizeProvider(value = {}, index = 0) {
    return {
        id: String(value.id || uid("provider")),
        name: String(value.name || `供应商 ${index + 1}`),
        apiBaseUrl: String(value.api_base_url ?? value.apiBaseUrl ?? ""),
        requestFormat: String(value.request_format ?? value.requestFormat ?? "chat_completions"),
        apiKeyDraft: "",
        apiKeyHint: String(value.api_key_hint ?? value.apiKeyHint ?? ""),
        hasApiKey: !!(value.has_api_key ?? value.hasApiKey),
    };
}

function ensureProviders() {
    if (!state.providers.length) {
        state.providers = [normalizeProvider({ id: "provider_default", name: "默认供应商" })];
    }
    if (!state.providers.some((provider) => provider.id === state.activeProviderId)) {
        state.activeProviderId = state.providers[0].id;
    }
}

function activeProvider() {
    ensureProviders();
    return state.providers.find((provider) => provider.id === state.activeProviderId) || state.providers[0];
}

function syncActiveProviderState() {
    const provider = activeProvider();
    state.requestFormat = provider.requestFormat || "chat_completions";
    state.apiBaseUrl = provider.apiBaseUrl || "";
    state.apiKeyDraft = provider.apiKeyDraft || "";
    state.apiKeyHint = provider.apiKeyHint || "";
    state.hasApiKey = !!provider.hasApiKey;
}

function activeProviderIsConfigured() {
    const provider = activeProvider();
    return !!provider.apiBaseUrl && (provider.requestFormat === "lm_studio" || provider.hasApiKey);
}

function getPanelId() {
    if (!panelId) {
        panelId = sessionStorage.getItem(PANEL_SESSION_KEY) || uid("teman_panel");
        sessionStorage.setItem(PANEL_SESSION_KEY, panelId);
    }
    return panelId;
}

function cleanTitleText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function titleFromText(value, fallback = "新话题") {
    const text = cleanTitleText(value);
    if (!text) {
        return fallback;
    }
    return text.length > 18 ? `${text.slice(0, 18)}...` : text;
}

function titleFromMessages(messages) {
    const firstUser = messages.find((message) => !message?.hidden && message?.role === "user" && cleanTitleText(message.text));
    return firstUser ? titleFromText(firstUser.text) : "新话题";
}

function normalizeMessage(message) {
    return {
        id: String(message?.id || uid("message")),
        role: message?.role === "user" ? "user" : "assistant",
        text: String(message?.text || ""),
        tone: message?.tone ? String(message.tone) : undefined,
        hidden: !!message?.hidden,
        createdAt: Number(message?.createdAt || Date.now()),
    };
}

function normalizeSession(session) {
    const messages = Array.isArray(session?.messages)
        ? session.messages.map(normalizeMessage).slice(-MAX_MESSAGES_PER_SESSION)
        : [];
    const title = cleanTitleText(session?.title) || titleFromMessages(messages);
    return {
        id: String(session?.id || uid("topic")),
        title,
        autoTitle: session?.autoTitle !== false,
        systemPrompt: String(session?.systemPrompt || session?.system_prompt || ""),
        messages,
        createdAt: Number(session?.createdAt || Date.now()),
        updatedAt: Number(session?.updatedAt || Date.now()),
    };
}

function createSession(options = {}) {
    return normalizeSession({
        id: options.id || uid("topic"),
        title: options.title || "新话题",
        autoTitle: options.autoTitle ?? true,
        systemPrompt: options.systemPrompt || options.system_prompt || "",
        messages: options.messages || [],
        createdAt: options.createdAt || Date.now(),
        updatedAt: options.updatedAt || Date.now(),
    });
}

function ensureSessions() {
    state.sessions = Array.isArray(state.sessions)
        ? state.sessions.map(normalizeSession).filter((session) => session.id).slice(0, MAX_SESSIONS)
        : [];
    if (!state.sessions.length) {
        state.sessions.push(createSession());
    }
    if (!state.sessions.some((session) => session.id === state.currentSessionId)) {
        state.currentSessionId = state.sessions[0].id;
    }
}

function currentSession() {
    ensureSessions();
    return state.sessions.find((session) => session.id === state.currentSessionId) || state.sessions[0];
}

function currentMessages() {
    return currentSession().messages;
}

function activeTurnForSession(sessionId) {
    return activeTurns.get(String(sessionId || "")) || null;
}

function isSessionGenerating(sessionId) {
    return activeTurns.has(String(sessionId || ""));
}

function isAnyGenerating() {
    return activeTurns.size > 0;
}

function activeTurnForMessage(messageId) {
    const id = String(messageId || "");
    if (!id) {
        return null;
    }
    for (const turn of activeTurns.values()) {
        if (turn.messageId === id) {
            return turn;
        }
    }
    return null;
}

function effectiveSystemPrompt(session) {
    const topicPrompt = String(session?.systemPrompt || "").trim();
    return topicPrompt || state.systemPrompt || DEFAULT_SYSTEM_PROMPT;
}

function touchSession(session, { moveToTop = true } = {}) {
    if (!session) {
        return;
    }
    session.updatedAt = Date.now();
    if (!moveToTop) {
        return;
    }
    const index = state.sessions.findIndex((item) => item.id === session.id);
    if (index > 0) {
        state.sessions.splice(index, 1);
        state.sessions.unshift(session);
    }
}

function updateSessionTitle(session, text) {
    if (!session || session.autoTitle === false) {
        return;
    }
    session.title = titleFromText(text);
    session.autoTitle = false;
}

function findMessageRecord(id) {
    const messageId = String(id || "");
    if (!messageId) {
        return null;
    }
    for (const session of state.sessions) {
        const message = session.messages.find((item) => item.id === messageId);
        if (message) {
            return { session, message };
        }
    }
    return null;
}

function markWorkspaceEdited() {
    workspaceEditVersion += 1;
}

function historyFromMessages(messages) {
    const visibleMessages = Array.isArray(messages) ? messages : [];
    const firstUserIndex = visibleMessages.findIndex((message) => message?.role === "user" && message?.text);
    if (firstUserIndex < 0) {
        return [];
    }
    return visibleMessages
        .slice(firstUserIndex)
        .filter((message) => message?.role !== "system" && message?.text)
        .slice(-24)
        .map((message) => ({
            role: message.role === "user" ? "user" : "assistant",
            text: message.text,
        }));
}

function readLocalState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

function legacySessionsFromLocalState(saved) {
    let sessions = Array.isArray(saved.sessions)
        ? saved.sessions.map(normalizeSession).slice(0, MAX_SESSIONS)
        : [];
    if (!sessions.length && Array.isArray(saved.messages) && saved.messages.length) {
        sessions = [createSession({
            title: titleFromMessages(saved.messages),
            autoTitle: false,
            messages: saved.messages,
        })];
    }
    return sessions.filter((session) => session.messages.length);
}

function loadState() {
    const saved = readLocalState();
    state.model = String(saved.model || state.model);
    state.requestFormat = String(saved.requestFormat || state.requestFormat);
    state.activeProviderId = String(saved.activeProviderId || state.activeProviderId);
    state.systemPrompt = String(saved.systemPrompt || state.systemPrompt);
    state.temperature = Number(saved.temperature ?? state.temperature) || 0.7;

    const localSessions = Array.isArray(saved.sessions)
        ? saved.sessions.map(normalizeSession).slice(0, MAX_SESSIONS)
        : [];
    state.sessions = localSessions;
    state.currentSessionId = String(saved.currentSessionId || "");
    if (!state.sessions.length && Array.isArray(saved.messages) && saved.messages.length) {
        state.sessions = [createSession({
            title: titleFromMessages(saved.messages),
            autoTitle: false,
            messages: saved.messages,
        })];
        state.currentSessionId = state.sessions[0].id;
    }
    legacySessionsForMigration = localStorage.getItem(LEGACY_MIGRATION_KEY) === "1"
        ? []
        : legacySessionsFromLocalState(saved);
    ensureSessions();
}

function saveState() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            model: state.model,
            requestFormat: state.requestFormat,
            activeProviderId: state.activeProviderId,
            systemPrompt: state.systemPrompt,
            temperature: state.temperature,
            currentSessionId: state.currentSessionId,
        })
    );
}

function sessionPayload(session) {
    const normalized = normalizeSession(session);
    return {
        id: normalized.id,
        title: normalized.title,
        autoTitle: normalized.autoTitle,
        systemPrompt: normalized.systemPrompt || "",
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
        messages: normalized.messages.slice(-MAX_MESSAGES_PER_SESSION).map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            tone: message.tone || "",
            hidden: !!message.hidden,
            createdAt: message.createdAt,
        })),
    };
}

function workspaceMetaPayload() {
    return { currentSessionId: state.currentSessionId || currentSession().id };
}

function applyWorkspaceState(workspaceState) {
    if (!workspaceState || !Array.isArray(workspaceState.sessions)) {
        return false;
    }

    const sessions = workspaceState.sessions
        .map(normalizeSession)
        .filter((session) => session.id)
        .slice(0, MAX_SESSIONS);
    const hadBackendSessions = sessions.length > 0;

    state.sessions = sessions;
    state.currentSessionId = String(workspaceState.currentSessionId || "");
    ensureSessions();
    workspaceLoadedFromBackend = true;
    return hadBackendSessions;
}

async function persistWorkspaceMeta() {
    saveState();
    if (!workspaceLoadedFromBackend) {
        return;
    }
    try {
        await requestJsonWithGetFallback(ROUTE_WORKSPACE_META, workspaceMetaPayload());
    } catch (error) {
        console.warn("[TE MAN] 构想台当前话题保存失败。", error);
    }
}

async function persistSession(session, { includeWorkspace = true } = {}) {
    saveState();
    if (!workspaceLoadedFromBackend || !session) {
        return;
    }
    try {
        await requestJsonWithGetFallback(ROUTE_TOPIC_UPSERT, {
            session: sessionPayload(session),
            workspace_meta: includeWorkspace ? workspaceMetaPayload() : undefined,
        });
    } catch (error) {
        console.warn("[TE MAN] 构想台话题保存失败。", error);
    }
}

async function migrateLegacySessionsIfNeeded(hadBackendSessions, baseEditVersion = workspaceEditVersion) {
    if (hadBackendSessions || !legacySessionsForMigration.length) {
        return;
    }

    const sessions = legacySessionsForMigration.filter((session) => session.messages.length);
    if (!sessions.length) {
        localStorage.setItem(LEGACY_MIGRATION_KEY, "1");
        return;
    }

    state.status = "正在迁移旧话题...";
    renderPanel();
    let latestWorkspace = null;
    for (const session of sessions) {
        const data = await requestJsonWithGetFallback(ROUTE_TOPIC_UPSERT, {
            session: sessionPayload(session),
            workspace_meta: { currentSessionId: state.currentSessionId || sessions[0].id },
        });
        latestWorkspace = data.workspace_state || latestWorkspace;
    }
    localStorage.setItem(LEGACY_MIGRATION_KEY, "1");
    legacySessionsForMigration = [];
    if (latestWorkspace && workspaceEditVersion === baseEditVersion && !isAnyGenerating()) {
        applyWorkspaceState(latestWorkspace);
    } else {
        workspaceLoadedFromBackend = true;
        void persistSession(currentSession());
        return;
    }
    state.status = "旧话题已迁移";
    saveState();
    renderPanel();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --te-copilot-bg: rgba(12, 15, 17, 0.94);
            --te-copilot-panel: rgba(24, 29, 32, 0.96);
            --te-copilot-card: rgba(255, 255, 255, 0.065);
            --te-copilot-line: rgba(255, 255, 255, 0.1);
            --te-copilot-line-strong: rgba(255, 204, 102, 0.38);
            --te-copilot-text: rgba(244, 241, 231, 0.95);
            --te-copilot-muted: rgba(244, 241, 231, 0.58);
            --te-copilot-accent: #f3b44e;
            --te-copilot-accent-2: #65d1b7;
            --te-copilot-danger: #ff7b7b;
            --te-copilot-radius: 18px;
        }

        #te-man-copilot-menu-button {
            display: flex;
            align-items: center;
            min-height: 34px;
        }

        .te-copilot-menu-button {
            min-height: 32px;
            min-width: 86px;
            padding: 8px 12px;
            border-radius: 14px;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
        }

        button.te-copilot-menu-button,
        button.te-asset-menu-button {
            min-width: 86px;
            border: 1px solid rgba(255, 196, 90, 0.42);
            background: linear-gradient(135deg, rgba(28, 33, 34, 0.88), rgba(66, 49, 26, 0.72));
            color: var(--te-copilot-text);
            border-radius: 14px;
            padding: 8px 12px;
            font: 700 13px/1.1 ui-sans-serif, "Microsoft YaHei", sans-serif;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
            cursor: pointer;
            user-select: none;
        }

        button.te-copilot-menu-button:hover,
        button.te-copilot-menu-button.active,
        #te-man-copilot-menu-button[data-visible="true"] .te-copilot-menu-button {
            transform: translateY(-1px);
            border-color: rgba(255, 218, 132, 0.9);
            background: linear-gradient(135deg, rgba(243, 180, 78, 0.24), rgba(101, 209, 183, 0.12));
        }

        .te-copilot-panel,
        .te-copilot-settings-panel,
        .te-copilot-topic-prompt-panel,
        .te-copilot-topic-rename-panel {
            position: fixed;
            top: 112px;
            right: 16px;
            z-index: 908;
            overflow: hidden;
            border: 1px solid var(--te-copilot-line);
            border-radius: var(--te-copilot-radius);
            background:
                radial-gradient(circle at top left, rgba(243, 180, 78, 0.18), transparent 35%),
                linear-gradient(145deg, rgba(16, 20, 22, 0.97), rgba(9, 11, 13, 0.97));
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
            color: var(--te-copilot-text);
            font-family: ui-sans-serif, "Microsoft YaHei", sans-serif;
        }

        .te-copilot-panel {
            width: min(720px, calc(100vw - 32px));
            height: min(720px, calc(100vh - 164px));
            display: grid;
            grid-template-columns: 210px minmax(0, 1fr);
            grid-template-rows: minmax(0, 1fr);
        }

        .te-copilot-settings-panel,
        .te-copilot-topic-prompt-panel,
        .te-copilot-topic-rename-panel {
            width: min(600px, calc(100vw - 32px));
            max-height: min(720px, calc(100vh - 164px));
            z-index: 909;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
        }

        .te-copilot-topic-prompt-panel {
            width: min(520px, calc(100vw - 32px));
            max-height: min(560px, calc(100vh - 164px));
            z-index: 910;
        }

        .te-copilot-topic-rename-panel {
            width: min(420px, calc(100vw - 32px));
            max-height: min(330px, calc(100vh - 164px));
            z-index: 911;
        }

        .te-copilot-panel[hidden],
        .te-copilot-settings-panel[hidden],
        .te-copilot-topic-prompt-panel[hidden],
        .te-copilot-topic-rename-panel[hidden] {
            display: none;
        }

        .te-copilot-sidebar {
            min-width: 0;
            min-height: 0;
            overflow: hidden;
            border-right: 1px solid var(--te-copilot-line);
            background: rgba(255, 255, 255, 0.035);
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .te-copilot-main {
            min-width: 0;
            min-height: 0;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr) auto;
            overflow: hidden;
        }

        .te-copilot-head,
        .te-copilot-composer,
        .te-copilot-settings-head {
            padding: 14px;
            border-bottom: 1px solid var(--te-copilot-line);
        }

        .te-copilot-head,
        .te-copilot-settings-head,
        .te-copilot-actions,
        .te-copilot-settings-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .te-copilot-drag-handle {
            cursor: move;
            user-select: none;
            touch-action: none;
        }

        .te-copilot-title {
            font-size: 17px;
            font-weight: 900;
            letter-spacing: 0.02em;
        }

        .te-copilot-title-row {
            display: flex;
            align-items: baseline;
            gap: 10px;
        }

        .te-copilot-title-link {
            color: var(--te-copilot-accent);
            font-size: 12px;
            font-weight: 800;
            text-decoration: none;
            opacity: 0.9;
        }

        .te-copilot-title-link:hover {
            color: var(--te-copilot-accent-2);
            text-decoration: underline;
        }

        .te-copilot-subtitle {
            margin-top: 3px;
            color: var(--te-copilot-muted);
            font-size: 12px;
        }

        .te-copilot-spacer {
            flex: 1;
        }

        .te-copilot-topic-list {
            min-height: 0;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding-right: 2px;
        }

        .te-copilot-topic {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 6px;
            width: 100%;
            border: 1px solid transparent;
            border-radius: 13px;
            padding: 9px;
            background: rgba(255, 255, 255, 0.045);
            color: var(--te-copilot-text);
            cursor: pointer;
            text-align: left;
            transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
        }

        .te-copilot-topic:hover,
        .te-copilot-topic.active {
            border-color: var(--te-copilot-line-strong);
            background: linear-gradient(135deg, rgba(243, 180, 78, 0.16), rgba(101, 209, 183, 0.08));
        }

        .te-copilot-topic:hover {
            transform: translateY(-1px);
        }

        .te-copilot-topic-title {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 12px;
            font-weight: 850;
        }

        .te-copilot-topic-meta {
            margin-top: 4px;
            color: var(--te-copilot-muted);
            font-size: 10px;
            font-weight: 750;
        }

        .te-copilot-topic-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .te-copilot-topic-icon-button {
            width: 24px;
            height: 24px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.045);
            color: var(--te-copilot-muted);
            cursor: pointer;
            font: 900 13px/1 ui-sans-serif, "Microsoft YaHei", sans-serif;
        }

        .te-copilot-topic-icon-button svg {
            width: 14px;
            height: 14px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.85;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .te-copilot-topic-icon-button:hover {
            transform: translateY(-1px);
        }

        #te-man-copilot-panel button.te-copilot-topic-rename:not(:hover),
        #te-man-copilot-panel .te-copilot-topic.active button.te-copilot-topic-rename:not(:hover),
        #te-man-copilot-panel .te-copilot-topic:hover button.te-copilot-topic-rename:not(:hover),
        #te-man-copilot-panel button.te-copilot-topic-rename:focus:not(:hover),
        #te-man-copilot-panel button.te-copilot-topic-rename:active:not(:hover) {
            border-color: rgba(255, 255, 255, 0.08) !important;
            background: rgba(255, 255, 255, 0.045) !important;
            color: var(--te-copilot-muted) !important;
        }

        #te-man-copilot-panel button.te-copilot-topic-rename:not(:hover) svg,
        #te-man-copilot-panel button.te-copilot-topic-rename:not(:hover) svg path {
            fill: none !important;
            stroke: var(--te-copilot-muted) !important;
        }

        #te-man-copilot-panel button.te-copilot-topic-rename:hover,
        #te-man-copilot-panel .te-copilot-topic.active button.te-copilot-topic-rename:hover,
        #te-man-copilot-panel .te-copilot-topic:hover button.te-copilot-topic-rename:hover {
            border-color: rgba(243, 180, 78, 0.5) !important;
            background: rgba(243, 180, 78, 0.12) !important;
            color: #ffe4ad !important;
        }

        #te-man-copilot-panel button.te-copilot-topic-rename:hover svg,
        #te-man-copilot-panel button.te-copilot-topic-rename:hover svg path {
            fill: none !important;
            stroke: #ffe4ad !important;
        }

        .te-copilot-topic-delete:hover {
            border-color: rgba(255, 123, 123, 0.42);
            background: rgba(255, 123, 123, 0.1);
            color: #ffd7d7;
        }

        .te-copilot-side-note {
            color: var(--te-copilot-muted);
            font-size: 11px;
            font-weight: 750;
            line-height: 1.45;
        }

        .te-copilot-launcher-link {
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
            transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
        }

        .te-copilot-launcher-link:hover {
            border-color: rgba(101, 209, 183, 0.62);
            background: linear-gradient(135deg, rgba(101, 209, 183, 0.2), rgba(243, 180, 78, 0.12));
            transform: translateY(-1px);
        }

        .te-copilot-button,
        .te-copilot-input,
        .te-copilot-select,
        .te-copilot-textarea {
            border: 1px solid var(--te-copilot-line);
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.07);
            color: var(--te-copilot-text);
            font: 600 12px/1.35 ui-sans-serif, "Microsoft YaHei", sans-serif;
            outline: none;
        }

        .te-copilot-button {
            padding: 8px 10px;
            cursor: pointer;
            transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
        }

        .te-copilot-button:hover:not(:disabled) {
            transform: translateY(-1px);
            border-color: var(--te-copilot-line-strong);
            background: rgba(243, 180, 78, 0.13);
        }

        .te-copilot-button.primary {
            border-color: rgba(243, 180, 78, 0.48);
            background: linear-gradient(135deg, rgba(243, 180, 78, 0.2), rgba(101, 209, 183, 0.1));
        }

        .te-copilot-button.danger {
            color: #ffd7d7;
            border-color: rgba(255, 123, 123, 0.42);
            background: rgba(255, 123, 123, 0.08);
        }

        .te-copilot-button:disabled {
            opacity: 0.46;
            cursor: not-allowed;
            transform: none;
        }

        .te-copilot-messages {
            min-height: 0;
            overflow: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .te-copilot-empty {
            margin: auto;
            max-width: 360px;
            text-align: center;
            color: var(--te-copilot-muted);
            line-height: 1.65;
            font-size: 13px;
        }

        .te-copilot-message {
            display: grid;
            gap: 6px;
            max-width: 88%;
        }

        .te-copilot-message.user {
            align-self: flex-end;
            justify-items: end;
        }

        .te-copilot-message.assistant,
        .te-copilot-message.error {
            align-self: flex-start;
        }

        .te-copilot-role {
            color: var(--te-copilot-muted);
            font-size: 11px;
            font-weight: 800;
        }

        .te-copilot-bubble {
            padding: 11px 12px;
            border: 1px solid var(--te-copilot-line);
            border-radius: 17px;
            background: var(--te-copilot-card);
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            line-height: 1.58;
            font-size: 13px;
        }

        .te-copilot-message-tools {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 22px;
            padding: 0 2px;
            opacity: 0.72;
            transition: opacity 0.14s ease;
        }

        .te-copilot-message:hover .te-copilot-message-tools {
            opacity: 1;
        }

        .te-copilot-message.user .te-copilot-message-tools {
            justify-content: flex-end;
        }

        .te-copilot-message-tool {
            width: 24px;
            height: 24px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 9px;
            background: transparent;
            color: rgba(203, 209, 222, 0.74);
            cursor: pointer;
            padding: 0;
            transition: color 0.14s ease, background 0.14s ease, transform 0.14s ease;
        }

        .te-copilot-message-tool:hover:not(:disabled) {
            color: rgba(246, 241, 226, 0.96);
            background: rgba(255, 255, 255, 0.07);
            transform: translateY(-1px);
        }

        .te-copilot-message-tool:disabled {
            cursor: not-allowed;
            opacity: 0.38;
            transform: none;
        }

        .te-copilot-message-tool svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.9;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .te-copilot-message-tool[data-message-action="regenerate"] svg {
            width: 13px;
            height: 13px;
            stroke-width: 1.75;
        }

        .te-copilot-message.user .te-copilot-bubble {
            border-color: rgba(101, 209, 183, 0.34);
            background: linear-gradient(135deg, rgba(101, 209, 183, 0.18), rgba(243, 180, 78, 0.08));
        }

        .te-copilot-message.error .te-copilot-bubble {
            border-color: rgba(255, 123, 123, 0.42);
            background: rgba(255, 123, 123, 0.08);
            color: #ffd7d7;
        }

        .te-copilot-cursor::after {
            content: "";
            display: inline-block;
            width: 7px;
            height: 1em;
            margin-left: 2px;
            transform: translateY(2px);
            border-radius: 999px;
            background: rgba(243, 180, 78, 0.9);
            animation: teCopilotBlink 0.9s steps(2, start) infinite;
        }

        @keyframes teCopilotBlink {
            50% { opacity: 0; }
        }

        .te-copilot-composer {
            border-top: 1px solid var(--te-copilot-line);
            border-bottom: none;
            display: grid;
            gap: 10px;
            background: rgba(255, 255, 255, 0.025);
        }

        .te-copilot-starters {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .te-copilot-starters[hidden] {
            display: none;
        }

        .te-copilot-starter-button {
            padding: 7px 10px;
            border-radius: 999px;
            font-size: 12px;
            background: linear-gradient(135deg, rgba(243, 180, 78, 0.14), rgba(101, 209, 183, 0.08));
        }

        .te-copilot-input,
        .te-copilot-select,
        .te-copilot-textarea {
            width: 100%;
            box-sizing: border-box;
            padding: 9px 10px;
        }

        .te-copilot-select option {
            background: #181d20;
            color: var(--te-copilot-text);
        }

        .te-copilot-compose-input {
            min-height: 86px;
            max-height: 190px;
            resize: vertical;
        }

        .te-copilot-topic-prompt {
            min-height: 160px;
            max-height: 360px;
            resize: vertical;
        }

        .te-copilot-status {
            color: var(--te-copilot-muted);
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .te-copilot-settings-body {
            min-height: 0;
            overflow: auto;
            padding: 14px;
            display: grid;
            gap: 12px;
            background: rgba(255, 255, 255, 0.025);
        }

        .te-copilot-provider-toolbar {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto;
            align-items: end;
            gap: 8px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--te-copilot-line);
        }

        .te-copilot-provider-toolbar .te-copilot-button {
            min-height: 36px;
        }

        .te-copilot-label {
            display: grid;
            gap: 6px;
            color: var(--te-copilot-muted);
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.05em;
        }

        .te-copilot-key-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: end;
            gap: 10px;
        }

        .te-copilot-field-hint {
            color: var(--te-copilot-muted);
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
        }

        .te-copilot-format-help {
            color: var(--te-copilot-muted);
            font-size: 12px;
            line-height: 1.55;
        }

        @media (max-width: 720px) {
            .te-copilot-panel,
            .te-copilot-settings-panel,
            .te-copilot-topic-prompt-panel,
            .te-copilot-topic-rename-panel {
                top: 72px;
                right: 8px;
                width: calc(100vw - 16px);
                height: calc(100vh - 88px);
                max-height: calc(100vh - 88px);
                border-radius: 18px;
            }

            .te-copilot-panel {
                grid-template-columns: minmax(0, 1fr);
                grid-template-rows: auto minmax(0, 1fr);
            }

            .te-copilot-sidebar {
                max-height: 170px;
                border-right: none;
                border-bottom: 1px solid var(--te-copilot-line);
            }

            .te-copilot-topic-list {
                flex-direction: row;
                overflow-x: auto;
                overflow-y: hidden;
            }

            .te-copilot-topic {
                min-width: 170px;
            }
        }
    `;
    document.head.appendChild(style);
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
    if (!element || element.__teCopilotDragBound) {
        return;
    }

    const handleList = (Array.isArray(handles) ? handles : [handles]).filter(Boolean);
    if (!handleList.length) {
        return;
    }

    element.__teCopilotDragBound = true;
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
        handle.classList.add("te-copilot-drag-handle");
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

async function requestJson(path, options = {}) {
    const response = await api.fetchApi(path, options);
    let body = null;
    try {
        body = await response.json();
    } catch {
    }
    if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || `${response.status} ${response.statusText}`);
    }
    return body || {};
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
        const params = new URLSearchParams({ save: "1" });
        for (const [key, value] of Object.entries(payload || {})) {
            if (value && typeof value === "object") {
                params.set(key, JSON.stringify(value));
            } else {
                params.set(key, value ?? "");
            }
        }
        return await requestJson(`${path}?${params.toString()}`);
    }
}

async function bootstrap() {
    const bootstrapEditVersion = workspaceEditVersion;
    state.workspaceReady = false;
    try {
        const data = await requestJson(ROUTE_BOOTSTRAP);
        applySettingsData(data);
        let hadBackendSessions = false;
        if (workspaceEditVersion === bootstrapEditVersion && !isAnyGenerating()) {
            hadBackendSessions = applyWorkspaceState(data.workspace_state);
            await migrateLegacySessionsIfNeeded(hadBackendSessions, bootstrapEditVersion);
        } else {
            workspaceLoadedFromBackend = true;
            void persistSession(currentSession());
        }
        state.workspaceReady = true;
        if (!activeProviderIsConfigured()) {
            state.status = "请先在设置里完善当前供应商";
        } else if (!state.status || state.status === "就绪" || state.status === "正在加载话题...") {
            state.status = hadBackendSessions ? "话题已加载" : "就绪";
        }
        saveState();
        renderPanel();
        renderSettingsPanel();
    } catch (error) {
        state.workspaceReady = false;
        state.status = `后端未就绪：${error.message || error}`;
        renderPanel();
    }
}

function applySettingsData(data = {}) {
    state.model = String(data.model || data.default_model || state.model || "gpt-5.5");
    state.requestFormats = data.request_formats && typeof data.request_formats === "object"
        ? data.request_formats
        : state.requestFormats;
    const providerValues = Array.isArray(data.providers) && data.providers.length
        ? data.providers
        : [{
            id: data.active_provider_id || "provider_default",
            name: "默认供应商",
            api_base_url: data.api_base_url || "",
            request_format: data.request_format || data.default_request_format || "chat_completions",
            api_key_hint: data.api_key_hint || "",
            has_api_key: !!data.has_api_key,
        }];
    state.providers = providerValues.map(normalizeProvider);
    state.activeProviderId = String(data.active_provider_id || state.activeProviderId || state.providers[0]?.id || "");
    ensureProviders();
    syncActiveProviderState();
    state.systemPrompt = String(data.system_prompt || data.default_system_prompt || state.systemPrompt || DEFAULT_SYSTEM_PROMPT);
    state.temperature = Number(data.temperature ?? state.temperature) || 0.7;
    state.settingsStatus = activeProviderIsConfigured() ? "设置已加载" : "当前供应商配置不完整";
}

function updateMenuButtonState() {
    const wrapper = document.getElementById(MENU_BUTTON_ID);
    if (!wrapper) {
        return;
    }
    const visible = panel?.hidden === false;
    wrapper.dataset.visible = visible ? "true" : "false";
    for (const button of wrapper.querySelectorAll("[data-role='copilot-toggle']")) {
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
            icon: "lightbulb-on-outline",
            action: () => showPanel(panel?.hidden !== false),
            tooltip: "TE MAN 构想台",
            content: "构想台",
        }).element;
        button.classList.add("te-copilot-menu-button");
        button.dataset.role = "copilot-toggle";

        const group = new ComfyButtonGroup(button);
        const wrapper = document.createElement("div");
        wrapper.id = MENU_BUTTON_ID;
        wrapper.append(group.element);

        const anchor = document.getElementById("te-asset-library-menu-button") || app.menu?.settingsGroup?.element;
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
        button.className = "te-copilot-menu-button";
        button.dataset.role = "copilot-toggle";
        button.type = "button";
        button.textContent = "构想台";
        button.title = "TE MAN 构想台";
        button.onclick = () => showPanel(panel?.hidden !== false);
        wrapper.appendChild(button);

        const anchor = document.getElementById("te-asset-library-menu-button") || app.menu?.settingsGroup?.element;
        if (anchor?.after) {
            anchor.after(wrapper);
        } else {
            menu.appendChild(wrapper);
        }

        updateMenuButtonState();
        console.warn("[TE MAN] 顶部构想台按钮使用兼容模式。", error);
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
    console.warn("[TE MAN] 未找到 ComfyUI 顶部菜单，构想台入口按钮未安装。");
}

function ensurePanel() {
    if (panel) {
        return panel;
    }

    injectStyle();
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "te-copilot-panel";
    panel.hidden = true;
    panel.innerHTML = `
        <aside class="te-copilot-sidebar">
            <div>
                <div class="te-copilot-title">TE MAN 构想台</div>
                <div class="te-copilot-subtitle">话题 / 提示词 / 工作流构思</div>
            </div>

            <button class="te-copilot-button primary" data-action="new-chat">新话题</button>
            <div class="te-copilot-topic-list" data-role="topics"></div>

            <div class="te-copilot-side-note">
                每个话题会单独保存上下文。适合把提示词、节点方案、灵感草稿分开聊。
            </div>

            <a class="te-copilot-launcher-link"
                href="https://www.bilibili.com/video/BV1xu9cByELa/?share_source=copy_web&amp;vd_source=a74fe7a15dbf45f77a4ef19aacacd83c"
                target="_blank"
                rel="noopener noreferrer">
                推荐配合 ComfyUI TE 启动器使用，开启并发功能
            </a>
        </aside>

        <main class="te-copilot-main">
            <header class="te-copilot-head">
                <div>
                    <div class="te-copilot-title" data-role="chat-title">新话题</div>
                    <div class="te-copilot-subtitle" data-role="chat-summary">当前话题</div>
                </div>
                <div class="te-copilot-spacer"></div>
                <button class="te-copilot-button" data-action="open-settings">设置</button>
                <button class="te-copilot-button" data-action="delete-topic">删除</button>
                <button class="te-copilot-button" data-action="close">关闭</button>
            </header>

            <main class="te-copilot-messages" data-role="messages"></main>

            <footer class="te-copilot-composer">
                <div class="te-copilot-starters" data-role="starter-presets"></div>
                <textarea class="te-copilot-textarea te-copilot-compose-input" data-role="input" placeholder="输入想聊的问题，Enter 发送，Shift+Enter 换行"></textarea>
                <div class="te-copilot-actions">
                    <button class="te-copilot-button primary" data-action="send">发送</button>
                    <button class="te-copilot-button danger" data-action="stop">停止</button>
                    <button class="te-copilot-button" data-action="clear">清空当前话题</button>
                    <button class="te-copilot-button" data-action="topic-prompt">设置话题提示词</button>
                    <div class="te-copilot-spacer"></div>
                    <div class="te-copilot-status" data-role="status">就绪</div>
                </div>
            </footer>
        </main>
    `;
    document.body.appendChild(panel);
    enableDraggablePanel(panel, [
        panel.querySelector(".te-copilot-sidebar > div:first-child"),
        panel.querySelector(".te-copilot-head"),
    ]);

    messagesRoot = qs("[data-role='messages']");
    messagesRoot.addEventListener("click", handleMessageToolClick);
    bindPanelEvents();
    renderPanel();
    return panel;
}

function ensureSettingsPanel() {
    if (settingsPanel) {
        return settingsPanel;
    }

    injectStyle();
    settingsPanel = document.createElement("section");
    settingsPanel.id = SETTINGS_PANEL_ID;
    settingsPanel.className = "te-copilot-settings-panel";
    settingsPanel.hidden = true;
    settingsPanel.innerHTML = `
        <header class="te-copilot-settings-head">
            <div>
                <div class="te-copilot-title-row">
                    <div class="te-copilot-title">构想台设置</div>
                    <a class="te-copilot-title-link"
                        href="https://tem.588186.xyz"
                        target="_blank"
                        rel="noopener noreferrer">推荐TE API站</a>
                </div>
                <div class="te-copilot-subtitle">管理多个 API 供应商并选择当前使用项</div>
            </div>
            <div class="te-copilot-spacer"></div>
            <button class="te-copilot-button" data-action="close-settings">关闭</button>
        </header>

        <section class="te-copilot-settings-body">
            <div class="te-copilot-provider-toolbar">
                <label class="te-copilot-label">
                    当前供应商
                    <select class="te-copilot-select" data-role="active-provider"></select>
                </label>
                <button class="te-copilot-button" data-action="add-provider">添加</button>
                <button class="te-copilot-button" data-action="delete-provider">删除</button>
            </div>
            <label class="te-copilot-label">
                供应商名称
                <input class="te-copilot-input" data-role="provider-name" placeholder="例如：TE API / OpenAI / 本地 LM Studio" />
            </label>
            <label class="te-copilot-label">
                API URL
                <input class="te-copilot-input" data-role="api-base-url" placeholder="例如：https://api.openai.com 或你的中转地址" />
            </label>
            <div class="te-copilot-key-row">
                <label class="te-copilot-label">
                    API Key
                    <input class="te-copilot-input" data-role="api-key" type="password" placeholder="留空则保留当前 API Key" />
                </label>
                <div class="te-copilot-field-hint" data-role="api-key-hint">未配置</div>
            </div>
            <label class="te-copilot-label">
                请求格式
                <select class="te-copilot-select" data-role="request-format"></select>
            </label>
            <div class="te-copilot-format-help" data-role="format-help"></div>
            <label class="te-copilot-label">
                模型名
                <input class="te-copilot-input" data-role="model" placeholder="例如 gpt-5.5 / gemini-3.1-pro-preview / gemini-3.1-flash-lite-preview" />
            </label>
            <div class="te-copilot-settings-actions">
                <button class="te-copilot-button primary" data-action="save-settings">保存设置</button>
                <span class="te-copilot-status" data-role="settings-status">设置未保存</span>
            </div>
        </section>
    `;
    document.body.appendChild(settingsPanel);
    enableDraggablePanel(settingsPanel, settingsPanel.querySelector(".te-copilot-settings-head"));

    bindSettingsEvents();
    renderSettingsPanel();
    return settingsPanel;
}

function ensureTopicPromptPanel() {
    if (topicPromptPanel) {
        return topicPromptPanel;
    }

    injectStyle();
    topicPromptPanel = document.createElement("section");
    topicPromptPanel.id = TOPIC_PROMPT_PANEL_ID;
    topicPromptPanel.className = "te-copilot-topic-prompt-panel";
    topicPromptPanel.hidden = true;
    topicPromptPanel.innerHTML = `
        <header class="te-copilot-settings-head">
            <div>
                <div class="te-copilot-title">话题提示词</div>
                <div class="te-copilot-subtitle" data-role="topic-prompt-subtitle">当前话题</div>
            </div>
            <div class="te-copilot-spacer"></div>
            <button class="te-copilot-button" data-action="close-topic-prompt">关闭</button>
        </header>

        <section class="te-copilot-settings-body">
            <label class="te-copilot-label">
                当前话题专属提示词
                <textarea class="te-copilot-textarea te-copilot-topic-prompt"
                    data-role="topic-prompt-editor"
                    placeholder="留空则使用构想台默认提示词。这里适合写当前话题的人设、任务方向、回答风格。"></textarea>
            </label>
            <div class="te-copilot-format-help">
                这个提示词只影响当前话题，不会改其他话题。
            </div>
            <div class="te-copilot-settings-actions">
                <button class="te-copilot-button primary" data-action="save-topic-prompt">保存</button>
                <button class="te-copilot-button" data-action="clear-topic-prompt">清空提示词</button>
                <span class="te-copilot-status" data-role="topic-prompt-status">未保存</span>
            </div>
        </section>
    `;
    document.body.appendChild(topicPromptPanel);
    enableDraggablePanel(topicPromptPanel, topicPromptPanel.querySelector(".te-copilot-settings-head"));

    bindTopicPromptEvents();
    renderTopicPromptPanel();
    return topicPromptPanel;
}

function ensureTopicRenamePanel() {
    if (topicRenamePanel) {
        return topicRenamePanel;
    }

    injectStyle();
    topicRenamePanel = document.createElement("section");
    topicRenamePanel.id = TOPIC_RENAME_PANEL_ID;
    topicRenamePanel.className = "te-copilot-topic-rename-panel";
    topicRenamePanel.hidden = true;
    topicRenamePanel.innerHTML = `
        <header class="te-copilot-settings-head">
            <div>
                <div class="te-copilot-title">重命名话题</div>
                <div class="te-copilot-subtitle" data-role="topic-rename-subtitle">当前话题</div>
            </div>
            <div class="te-copilot-spacer"></div>
            <button class="te-copilot-button" data-action="close-topic-rename">关闭</button>
        </header>

        <section class="te-copilot-settings-body">
            <label class="te-copilot-label">
                话题显示名称
                <input class="te-copilot-input"
                    data-role="topic-rename-input"
                    maxlength="80"
                    placeholder="例如：香水广告分镜方案" />
            </label>
            <div class="te-copilot-format-help">
                只修改左侧和顶部显示名称，不影响这个话题里的对话内容。
            </div>
            <div class="te-copilot-settings-actions">
                <button class="te-copilot-button primary" data-action="save-topic-rename">保存</button>
                <span class="te-copilot-status" data-role="topic-rename-status">未保存</span>
            </div>
        </section>
    `;
    document.body.appendChild(topicRenamePanel);
    enableDraggablePanel(topicRenamePanel, topicRenamePanel.querySelector(".te-copilot-settings-head"));

    bindTopicRenameEvents();
    renderTopicRenamePanel();
    return topicRenamePanel;
}

function qs(selector) {
    return panel?.querySelector(selector);
}

function sqs(selector) {
    return settingsPanel?.querySelector(selector);
}

function tpqs(selector) {
    return topicPromptPanel?.querySelector(selector);
}

function trqs(selector) {
    return topicRenamePanel?.querySelector(selector);
}

function sessionMeta(session) {
    const promptSuffix = cleanTitleText(session?.systemPrompt) ? " · 专属提示词" : "";
    if (isSessionGenerating(session?.id)) {
        return `回复中${promptSuffix}`;
    }
    const count = session.messages.filter((message) => !message.hidden && message.role === "user").length;
    if (!count) {
        if (session.messages.length) {
            return `已开始${promptSuffix}`;
        }
        return `还没有消息${promptSuffix}`;
    }
    return `${count} 条提问${promptSuffix}`;
}

function renderTopics() {
    const root = qs("[data-role='topics']");
    if (!root) {
        return;
    }

    ensureSessions();
    root.innerHTML = "";
    for (const session of state.sessions) {
        const item = document.createElement("div");
        item.role = "button";
        item.tabIndex = 0;
        item.className = `te-copilot-topic ${session.id === state.currentSessionId ? "active" : ""}`;
        item.dataset.sessionId = session.id;
        item.innerHTML = `
            <div>
                <div class="te-copilot-topic-title">${escapeHtml(session.title || "新话题")}</div>
                <div class="te-copilot-topic-meta">${escapeHtml(sessionMeta(session))}</div>
            </div>
            <div class="te-copilot-topic-actions">
                <button class="te-copilot-topic-icon-button te-copilot-topic-rename"
                    type="button"
                    data-action="rename-topic-inline"
                    title="重命名话题">${ICON_TOPIC_RENAME}</button>
                <button class="te-copilot-topic-icon-button te-copilot-topic-delete"
                    type="button"
                    data-action="delete-topic-inline"
                    title="删除话题">×</button>
            </div>
        `;
        item.onclick = () => setCurrentSession(session.id);
        item.onkeydown = (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            event.preventDefault();
            setCurrentSession(session.id);
        };
        item.querySelector("[data-action='delete-topic-inline']").onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteSession(session.id);
        };
        item.querySelector("[data-action='rename-topic-inline']").onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            showTopicRenamePanel(session.id, true);
        };
        root.appendChild(item);
    }
}

function setCurrentSession(id) {
    const session = state.sessions.find((item) => item.id === id);
    if (!session) {
        return;
    }
    state.currentSessionId = session.id;
    state.status = session.messages.length ? "已切换话题" : "新话题";
    showTopicPromptPanel(false);
    showTopicRenamePanel("", false);
    markWorkspaceEdited();
    saveState();
    renderPanel();
    void persistWorkspaceMeta();
    setTimeout(() => qs("[data-role='input']")?.focus(), 0);
}

async function deleteSession(id = state.currentSessionId) {
    const sessionId = String(id || "");
    if (!sessionId) {
        return;
    }
    if (isSessionGenerating(sessionId)) {
        state.status = "正在回复，先停止后再删除话题";
        renderPanel();
        return;
    }

    const index = state.sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) {
        return;
    }
    state.sessions.splice(index, 1);
    if (!state.sessions.length) {
        state.sessions.push(createSession());
    }
    if (state.currentSessionId === sessionId) {
        state.currentSessionId = state.sessions[Math.min(index, state.sessions.length - 1)].id;
    }
    state.status = "话题已删除";
    markWorkspaceEdited();
    const deleteEditVersion = workspaceEditVersion;
    saveState();
    renderPanel();

    if (!workspaceLoadedFromBackend) {
        return;
    }
    try {
        const data = await requestJsonWithGetFallback(ROUTE_TOPIC_DELETE, {
            session_id: sessionId,
            workspace_meta: workspaceMetaPayload(),
        });
        if (data.workspace_state && workspaceEditVersion === deleteEditVersion && !isAnyGenerating()) {
            applyWorkspaceState(data.workspace_state);
            state.status = "话题已删除";
            saveState();
            renderPanel();
        }
    } catch (error) {
        state.status = `删除同步失败：${error.message || error}`;
        renderPanel();
    }
}

function bindPanelEvents() {
    qs("[data-action='close']").onclick = () => showPanel(false);
    qs("[data-action='open-settings']").onclick = () => showSettingsPanel(true);
    qs("[data-action='new-chat']").onclick = () => newChat();
    qs("[data-action='delete-topic']").onclick = () => deleteSession();
    qs("[data-action='send']").onclick = () => sendMessage();
    qs("[data-action='stop']").onclick = () => stopGeneration();
    qs("[data-action='clear']").onclick = () => clearMessages();
    qs("[data-action='topic-prompt']").onclick = () => showTopicPromptPanel(true);

    qs("[data-role='input']").addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }
        event.preventDefault();
        sendMessage();
    });

    qs("[data-role='starter-presets']").addEventListener("click", (event) => {
        const button = event.target?.closest?.("[data-starter-id]");
        if (!button) {
            return;
        }
        event.preventDefault();
        void sendStarterPreset(button.dataset.starterId || "");
    });
}

function bindSettingsEvents() {
    sqs("[data-action='close-settings']").onclick = () => showSettingsPanel(false);
    sqs("[data-action='save-settings']").onclick = () => saveSettings();
    sqs("[data-action='add-provider']").onclick = () => {
        const provider = normalizeProvider({
            id: uid("provider"),
            name: `供应商 ${state.providers.length + 1}`,
            request_format: "chat_completions",
        }, state.providers.length);
        state.providers.push(provider);
        state.activeProviderId = provider.id;
        syncActiveProviderState();
        markSettingsDirty();
        saveState();
        renderSettingsPanel();
        sqs("[data-role='provider-name']")?.focus();
    };
    sqs("[data-action='delete-provider']").onclick = () => {
        const provider = activeProvider();
        state.providers = state.providers.filter((item) => item.id !== provider.id);
        if (!state.providers.length) {
            state.providers = [normalizeProvider({ name: "默认供应商" })];
        }
        state.activeProviderId = state.providers[0].id;
        syncActiveProviderState();
        markSettingsDirty();
        saveState();
        renderSettingsPanel();
    };
    sqs("[data-role='active-provider']").onchange = (event) => {
        state.activeProviderId = event.target.value;
        syncActiveProviderState();
        markSettingsDirty();
        saveState();
        renderSettingsPanel();
    };
    sqs("[data-role='provider-name']").oninput = (event) => {
        activeProvider().name = event.target.value;
        markSettingsDirty();
        const option = Array.from(sqs("[data-role='active-provider']")?.options || [])
            .find((item) => item.value === state.activeProviderId);
        if (option) {
            option.textContent = event.target.value || "未命名供应商";
        }
    };

    sqs("[data-role='api-base-url']").oninput = (event) => {
        activeProvider().apiBaseUrl = event.target.value;
        syncActiveProviderState();
        markSettingsDirty();
    };
    sqs("[data-role='api-key']").oninput = (event) => {
        activeProvider().apiKeyDraft = event.target.value;
        syncActiveProviderState();
        markSettingsDirty();
    };
    sqs("[data-role='request-format']").onchange = (event) => {
        activeProvider().requestFormat = event.target.value;
        syncActiveProviderState();
        markSettingsDirty();
        saveState();
        renderFormatHelp();
    };
    sqs("[data-role='model']").oninput = (event) => {
        state.model = event.target.value;
        markSettingsDirty();
        saveState();
    };
}

function bindTopicPromptEvents() {
    tpqs("[data-action='close-topic-prompt']").onclick = () => showTopicPromptPanel(false);
    tpqs("[data-action='save-topic-prompt']").onclick = () => saveTopicPromptFromPanel();
    tpqs("[data-action='clear-topic-prompt']").onclick = () => {
        const editor = tpqs("[data-role='topic-prompt-editor']");
        if (editor) {
            editor.value = "";
        }
        saveTopicPromptFromPanel();
    };
    tpqs("[data-role='topic-prompt-editor']").oninput = () => {
        const status = tpqs("[data-role='topic-prompt-status']");
        if (status) {
            status.textContent = "未保存";
        }
    };
    topicPromptPanel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            showTopicPromptPanel(false);
        }
    });
}

function bindTopicRenameEvents() {
    trqs("[data-action='close-topic-rename']").onclick = () => showTopicRenamePanel("", false);
    trqs("[data-action='save-topic-rename']").onclick = () => saveTopicRenameFromPanel();
    trqs("[data-role='topic-rename-input']").oninput = () => {
        const status = trqs("[data-role='topic-rename-status']");
        if (status) {
            status.textContent = "未保存";
        }
    };
    topicRenamePanel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            showTopicRenamePanel("", false);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            saveTopicRenameFromPanel();
        }
    });
}

function markSettingsDirty() {
    state.settingsStatus = "设置未保存";
    const status = sqs("[data-role='settings-status']");
    if (status) {
        status.textContent = state.settingsStatus;
    }
}

function showPanel(visible) {
    ensurePanel();
    state.visible = visible;
    panel.hidden = !visible;
    if (!visible) {
        showSettingsPanel(false);
        showTopicPromptPanel(false);
        showTopicRenamePanel("", false);
    }
    updateMenuButtonState();
    if (visible) {
        renderPanel();
        setTimeout(() => qs("[data-role='input']")?.focus(), 0);
    }
}

function showSettingsPanel(visible) {
    if (!visible) {
        state.settingsVisible = false;
        if (settingsPanel) {
            settingsPanel.hidden = true;
        }
        return;
    }

    ensureSettingsPanel();
    showTopicPromptPanel(false);
    showTopicRenamePanel("", false);
    state.settingsVisible = visible;
    settingsPanel.hidden = !visible;
    renderSettingsPanel();
    setTimeout(() => sqs("[data-role='api-base-url']")?.focus(), 0);
}

function showTopicPromptPanel(visible) {
    if (!visible) {
        if (topicPromptPanel) {
            topicPromptPanel.hidden = true;
        }
        return;
    }

    ensureTopicPromptPanel();
    showSettingsPanel(false);
    showTopicRenamePanel("", false);
    topicPromptPanel.hidden = false;
    renderTopicPromptPanel();
    setTimeout(() => tpqs("[data-role='topic-prompt-editor']")?.focus(), 0);
}

function showTopicRenamePanel(sessionId, visible) {
    if (!visible) {
        topicRenameSessionId = "";
        if (topicRenamePanel) {
            topicRenamePanel.hidden = true;
        }
        return;
    }

    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) {
        return;
    }

    ensureTopicRenamePanel();
    showSettingsPanel(false);
    showTopicPromptPanel(false);
    topicRenameSessionId = session.id;
    topicRenamePanel.hidden = false;
    renderTopicRenamePanel();
    setTimeout(() => {
        const input = trqs("[data-role='topic-rename-input']");
        input?.focus();
        input?.select();
    }, 0);
}

function saveTopicPromptFromPanel() {
    const session = currentSession();
    if (isSessionGenerating(session.id)) {
        const status = tpqs("[data-role='topic-prompt-status']");
        if (status) {
            status.textContent = "当前话题回复中，结束后可修改";
        }
        return;
    }

    const editor = tpqs("[data-role='topic-prompt-editor']");
    session.systemPrompt = String(editor?.value || "");
    touchSession(session, { moveToTop: false });
    markWorkspaceEdited();
    state.status = cleanTitleText(session.systemPrompt) ? "话题提示词已保存" : "话题提示词已清空";
    saveState();
    renderPanel();
    renderTopicPromptPanel();
    void persistSession(session, { includeWorkspace: false });
    showTopicPromptPanel(false);
}

function saveTopicRenameFromPanel() {
    const session = state.sessions.find((item) => item.id === topicRenameSessionId);
    if (!session) {
        showTopicRenamePanel("", false);
        return;
    }
    if (isSessionGenerating(session.id)) {
        const status = trqs("[data-role='topic-rename-status']");
        if (status) {
            status.textContent = "当前话题回复中，结束后可修改";
        }
        return;
    }

    const input = trqs("[data-role='topic-rename-input']");
    const title = cleanTitleText(input?.value);
    if (!title) {
        const status = trqs("[data-role='topic-rename-status']");
        if (status) {
            status.textContent = "名称不能为空";
        }
        return;
    }

    session.title = title.slice(0, 80);
    session.autoTitle = false;
    touchSession(session, { moveToTop: false });
    markWorkspaceEdited();
    state.status = "话题名称已保存";
    saveState();
    renderPanel();
    renderTopicRenamePanel();
    void persistSession(session, { includeWorkspace: false });
    showTopicRenamePanel("", false);
}

function roleLabel(message) {
    if (message.role === "user") {
        return "你";
    }
    if (message.tone === "error") {
        return "错误";
    }
    return "构想台";
}

function renderMarkdownLite(text) {
    return escapeHtml(text || "");
}

function renderMessages() {
    if (!messagesRoot) {
        return;
    }

    const session = currentSession();
    const messages = currentMessages().filter((message) => !message.hidden);
    messagesRoot.innerHTML = "";
    if (!messages.length) {
        messagesRoot.innerHTML = `
            <div class="te-copilot-empty">
                这里是 TE MAN 构想台。<br>
                可以聊提示词、节点搭配、工作流结构，也可以先把想法拆成可执行步骤。
            </div>
        `;
        return;
    }

    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const item = document.createElement("article");
        const isStreaming = !!activeTurnForMessage(message.id);
        const hasPreviousUser = messages.slice(0, index).some((item) => item.role === "user" && cleanTitleText(item.text));
        const canRegenerate = message.role === "assistant" && hasPreviousUser;
        const disableRegenerate = isStreaming || !state.workspaceReady || isSessionGenerating(session.id);
        item.className = `te-copilot-message ${message.tone === "error" ? "error" : message.role}`;
        item.innerHTML = `
            <div class="te-copilot-role">${roleLabel(message)}</div>
            <div class="te-copilot-bubble ${isStreaming ? "te-copilot-cursor" : ""}">${renderMarkdownLite(message.text)}</div>
            <div class="te-copilot-message-tools">
                <button class="te-copilot-message-tool" type="button" data-message-action="copy" data-message-id="${escapeHtml(message.id)}" title="复制这段对话" ${isStreaming ? "disabled" : ""}>${ICON_COPY}</button>
                ${canRegenerate ? `<button class="te-copilot-message-tool" type="button" data-message-action="regenerate" data-message-id="${escapeHtml(message.id)}" title="重新生成" ${disableRegenerate ? "disabled" : ""}>${ICON_REGENERATE}</button>` : ""}
            </div>
        `;
        messagesRoot.appendChild(item);
    }

    messagesRoot.scrollTop = messagesRoot.scrollHeight;
}

function renderStarterPresets() {
    const root = qs("[data-role='starter-presets']");
    if (!root) {
        return;
    }

    const session = currentSession();
    const show = !session.messages.length && !isSessionGenerating(session.id);
    root.hidden = !show;
    if (!show) {
        root.innerHTML = "";
        return;
    }

    root.innerHTML = STARTER_PRESETS
        .map((preset) => `
            <button class="te-copilot-button te-copilot-starter-button"
                type="button"
                data-starter-id="${escapeHtml(preset.id)}">
                ${escapeHtml(preset.label)}
            </button>
        `)
        .join("");
}

function renderPanel() {
    if (!panel) {
        return;
    }

    const session = currentSession();
    const currentTurn = activeTurnForSession(session.id);
    qs("[data-role='chat-title']").textContent = session.title || "新话题";
    qs("[data-role='chat-summary']").textContent = sessionMeta(session);
    qs("[data-role='status']").textContent = state.status || "就绪";
    qs("[data-action='send']").disabled = !!currentTurn || !state.workspaceReady;
    qs("[data-action='stop']").disabled = !currentTurn;
    qs("[data-action='clear']").disabled = !!currentTurn;
    qs("[data-action='topic-prompt']").disabled = !!currentTurn;
    qs("[data-action='delete-topic']").disabled = !!currentTurn;
    qs("[data-action='new-chat']").disabled = false;

    renderTopics();
    renderMessages();
    renderStarterPresets();
    renderTopicPromptPanel();
    renderTopicRenamePanel();
    updateMenuButtonState();
}

function formatOptionsHtml() {
    return Object.entries(state.requestFormats)
        .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join("");
}

function renderFormatHelp() {
    const help = sqs("[data-role='format-help']");
    if (!help) {
        return;
    }
    const tips = {
        chat_completions: "适合 OpenAI Chat 兼容接口。URL 可填根地址，例如 https://api.openai.com，也可直接填 /v1/chat/completions。",
        responses: "适合 Codex / Responses API。URL 可填根地址，程序会自动拼成 /v1/responses。",
        gemini: "适合 Gemini。URL 可填根地址，程序会自动拼成 /v1beta/models/模型名:streamGenerateContent。",
        claude: "适合 Claude Messages。URL 可填根地址，程序会自动拼成 /v1/messages。",
        lm_studio: "适合 LM Studio 本地服务。URL 可填根地址，例如 http://localhost:1234，程序会自动拼成 /api/v1/chat。",
    };
    help.textContent = tips[state.requestFormat] || "";
}

function renderSettingsPanel() {
    if (!settingsPanel) {
        return;
    }

    ensureProviders();
    syncActiveProviderState();
    const provider = activeProvider();
    const providerSelect = sqs("[data-role='active-provider']");
    providerSelect.innerHTML = state.providers
        .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || "未命名供应商")}</option>`)
        .join("");
    providerSelect.value = provider.id;
    sqs("[data-role='provider-name']").value = provider.name || "";

    const requestFormat = sqs("[data-role='request-format']");
    requestFormat.innerHTML = formatOptionsHtml();
    requestFormat.value = state.requestFormat || "chat_completions";

    sqs("[data-role='api-base-url']").value = state.apiBaseUrl || "";
    sqs("[data-role='api-key']").value = state.apiKeyDraft || "";
    sqs("[data-role='api-key-hint']").textContent = state.hasApiKey
        ? `当前：${state.apiKeyHint || "已配置"}`
        : "未配置";
    sqs("[data-role='model']").value = state.model || "";
    sqs("[data-role='settings-status']").textContent = state.settingsStatus || "";
    sqs("[data-action='save-settings']").disabled = isAnyGenerating();
    sqs("[data-action='add-provider']").disabled = isAnyGenerating() || state.providers.length >= 50;
    sqs("[data-action='delete-provider']").disabled = isAnyGenerating();
    providerSelect.disabled = isAnyGenerating();
    renderFormatHelp();
}

function renderTopicPromptPanel() {
    if (!topicPromptPanel || topicPromptPanel.hidden) {
        return;
    }

    const session = currentSession();
    const editor = tpqs("[data-role='topic-prompt-editor']");
    const subtitle = tpqs("[data-role='topic-prompt-subtitle']");
    const status = tpqs("[data-role='topic-prompt-status']");
    const saveButton = tpqs("[data-action='save-topic-prompt']");
    const clearButton = tpqs("[data-action='clear-topic-prompt']");
    const generating = isSessionGenerating(session.id);
    const editing = document.activeElement === editor;

    if (subtitle) {
        subtitle.textContent = session.title || "当前话题";
    }
    if (editor && !editing) {
        editor.value = session.systemPrompt || "";
    }
    if (status && !editing) {
        status.textContent = cleanTitleText(session.systemPrompt) ? "已设置专属提示词" : "留空使用默认提示词";
    }
    if (saveButton) {
        saveButton.disabled = generating;
    }
    if (clearButton) {
        clearButton.disabled = generating;
    }
}

function renderTopicRenamePanel() {
    if (!topicRenamePanel || topicRenamePanel.hidden) {
        return;
    }

    const session = state.sessions.find((item) => item.id === topicRenameSessionId);
    if (!session) {
        showTopicRenamePanel("", false);
        return;
    }

    const input = trqs("[data-role='topic-rename-input']");
    const subtitle = trqs("[data-role='topic-rename-subtitle']");
    const status = trqs("[data-role='topic-rename-status']");
    const saveButton = trqs("[data-action='save-topic-rename']");
    const generating = isSessionGenerating(session.id);
    const editing = document.activeElement === input;

    if (subtitle) {
        subtitle.textContent = session.title || "当前话题";
    }
    if (input && !editing) {
        input.value = session.title || "";
    }
    if (status && !editing) {
        status.textContent = "输入新名称后保存";
    }
    if (saveButton) {
        saveButton.disabled = generating;
    }
}

function settingsPayload() {
    return {
        providers: state.providers.map((provider) => ({
            id: provider.id,
            name: provider.name || "未命名供应商",
            api_base_url: provider.apiBaseUrl || "",
            api_key: provider.apiKeyDraft || "",
            request_format: provider.requestFormat || "chat_completions",
        })),
        active_provider_id: state.activeProviderId,
        model: state.model || "gpt-5.5",
        system_prompt: state.systemPrompt || "",
        temperature: Number(state.temperature) || 0.7,
    };
}

async function saveSettings() {
    ensureSettingsPanel();
    state.settingsStatus = "正在保存...";
    renderSettingsPanel();

    try {
        const data = await requestJsonWithGetFallback(ROUTE_SETTINGS, settingsPayload());
        applySettingsData(data);
        state.status = activeProviderIsConfigured() ? "设置已保存" : "设置已保存，但当前供应商配置不完整";
        state.settingsStatus = state.status;
        saveState();
        renderPanel();
        renderSettingsPanel();
    } catch (error) {
        state.settingsStatus = `保存失败：${error.message || error}`;
        renderSettingsPanel();
    }
}

function scheduleRender() {
    if (renderTimer) {
        return;
    }
    renderTimer = requestAnimationFrame(() => {
        renderTimer = null;
        renderPanel();
    });
}

function getMessage(id) {
    return findMessageRecord(id)?.message || null;
}

function historyForRequest(session, excludeMessageId = "") {
    const excluded = String(excludeMessageId || "");
    return historyFromMessages((session?.messages || []).filter((message) => message.id !== excluded));
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
        throw new Error("当前浏览器不允许复制");
    }
}

async function copyMessage(messageId) {
    const record = findMessageRecord(messageId);
    const text = String(record?.message?.text || "");
    if (!text) {
        state.status = "这段对话还是空的";
        const status = qs("[data-role='status']");
        if (status) {
            status.textContent = state.status;
        }
        return;
    }

    try {
        await copyTextToClipboard(text);
        state.status = "已复制这段对话";
    } catch (error) {
        state.status = `复制失败：${error.message || error}`;
    }
    const status = qs("[data-role='status']");
    if (status) {
        status.textContent = state.status;
    }
}

function regenerateHistory(session, assistantIndex, userIndex) {
    const beforePrompt = session.messages.slice(0, userIndex);
    return historyFromMessages(beforePrompt);
}

async function regenerateMessage(messageId) {
    if (!state.workspaceReady) {
        state.status = "正在加载话题，加载完成后再重新生成";
        renderPanel();
        return;
    }

    const record = findMessageRecord(messageId);
    if (!record?.session || !record?.message || record.message.role !== "assistant") {
        state.status = "只能重新生成助手回复";
        renderPanel();
        return;
    }

    const session = record.session;
    if (isSessionGenerating(session.id)) {
        state.status = "当前话题正在回复，先停止后再重新生成";
        renderPanel();
        return;
    }

    const assistantIndex = session.messages.findIndex((message) => message.id === record.message.id);
    let userIndex = -1;
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
        if (session.messages[index]?.role === "user" && cleanTitleText(session.messages[index].text)) {
            userIndex = index;
            break;
        }
    }
    if (assistantIndex < 0 || userIndex < 0) {
        state.status = "没有找到这段回复对应的提问";
        renderPanel();
        return;
    }

    const promptMessage = session.messages[userIndex];
    const history = regenerateHistory(session, assistantIndex, userIndex);
    const turnId = uid("turn");
    const responseMessageId = record.message.id;
    activeTurns.set(session.id, {
        turnId,
        messageId: responseMessageId,
        sessionId: session.id,
        model: state.model || "gpt-5.5",
    });
    record.message.text = "";
    record.message.tone = undefined;
    record.message.createdAt = Date.now();
    touchSession(session);
    state.currentSessionId = session.id;
    state.status = "正在重新生成...";
    markWorkspaceEdited();
    saveState();
    renderPanel();
    await persistSession(session);

    try {
        await requestJsonWithGetFallback(ROUTE_TURN, {
            panel_id: getPanelId(),
            turn_id: turnId,
            session_id: session.id,
            message_id: responseMessageId,
            message: promptMessage.text,
            provider_id: activeProvider().id,
            request_format: activeProvider().requestFormat || "chat_completions",
            model: state.model || "gpt-5.5",
            system_prompt: effectiveSystemPrompt(session),
            temperature: Number(state.temperature) || 0.7,
            history,
        });
    } catch (error) {
        record.message.tone = "error";
        record.message.text = `重新生成失败：${error.message || error}`;
        activeTurns.delete(session.id);
        state.status = "重新生成失败";
        await persistSession(session);
        renderPanel();
    }
}

function handleMessageToolClick(event) {
    const button = event.target?.closest?.("[data-message-action]");
    if (!button || !messagesRoot?.contains(button)) {
        return;
    }

    event.preventDefault();
    const messageId = button.dataset.messageId || "";
    const action = button.dataset.messageAction || "";
    if (action === "copy") {
        void copyMessage(messageId);
    } else if (action === "regenerate") {
        void regenerateMessage(messageId);
    }
}

async function startTurn({
    text,
    visibleUserText = text,
    showUserMessage = true,
    hiddenUserMessage = false,
    titleText = visibleUserText,
    systemPrompt = null,
    requestSystemPrompt = null,
    clearInput = false,
} = {}) {
    ensurePanel();
    if (!state.workspaceReady) {
        state.status = "正在加载话题，加载完成后再发送";
        renderPanel();
        return false;
    }

    const requestText = String(text || "").trim();
    if (!requestText) {
        state.status = "请输入内容";
        renderPanel();
        return false;
    }

    const assistantMessage = {
        id: uid("assistant"),
        role: "assistant",
        text: "",
        createdAt: Date.now(),
    };

    const session = currentSession();
    if (isSessionGenerating(session.id)) {
        state.status = "当前话题正在回复，可以切到其他话题继续发送";
        renderPanel();
        return false;
    }

    const turnId = uid("turn");
    const responseMessageId = assistantMessage.id;
    const history = historyForRequest(session, responseMessageId);
    if (systemPrompt !== null) {
        session.systemPrompt = String(systemPrompt || "");
    }
    if (showUserMessage) {
        session.messages.push({
            id: uid("user"),
            role: "user",
            text: String(visibleUserText || requestText),
            hidden: !!hiddenUserMessage,
            createdAt: Date.now(),
        });
    }
    updateSessionTitle(session, titleText || visibleUserText || requestText);
    session.messages.push(assistantMessage);
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    touchSession(session);
    state.currentSessionId = session.id;
    activeTurns.set(session.id, {
        turnId,
        messageId: responseMessageId,
        sessionId: session.id,
        model: state.model || "gpt-5.5",
    });
    state.status = "正在回复...";
    if (clearInput) {
        const input = qs("[data-role='input']");
        if (input) {
            input.value = "";
        }
    }
    markWorkspaceEdited();
    saveState();
    renderPanel();
    await persistSession(session);

    try {
        await requestJsonWithGetFallback(ROUTE_TURN, {
            panel_id: getPanelId(),
            turn_id: turnId,
            session_id: session.id,
            message_id: responseMessageId,
            message: requestText,
            provider_id: activeProvider().id,
            request_format: activeProvider().requestFormat || "chat_completions",
            model: state.model || "gpt-5.5",
            system_prompt: requestSystemPrompt !== null ? requestSystemPrompt : effectiveSystemPrompt(session),
            temperature: Number(state.temperature) || 0.7,
            history,
        });
    } catch (error) {
        const message = getMessage(responseMessageId);
        if (message) {
            message.tone = "error";
            message.text = `发送失败：${error.message || error}`;
        }
        activeTurns.delete(session.id);
        state.status = "发送失败";
        const failedRecord = findMessageRecord(assistantMessage.id);
        if (failedRecord?.session) {
            await persistSession(failedRecord.session);
        } else {
            saveState();
        }
        renderPanel();
    }
    return true;
}

async function sendStarterPreset(starterId) {
    const session = currentSession();
    const preset = STARTER_PRESETS.find((item) => item.id === starterId);
    if (!preset) {
        return;
    }
    if (session.messages.length) {
        state.status = "当前话题已经开始了";
        renderPanel();
        return;
    }

    await startTurn({
        text: preset.prompt,
        visibleUserText: preset.prompt,
        showUserMessage: true,
        hiddenUserMessage: true,
        titleText: preset.label,
        requestSystemPrompt: state.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    });
}

async function sendMessage() {
    const input = qs("[data-role='input']");
    const text = String(input?.value || "").trim();
    await startTurn({
        text,
        visibleUserText: text,
        showUserMessage: true,
        titleText: text,
        clearInput: true,
    });
}

async function stopGeneration() {
    const session = currentSession();
    const turn = activeTurnForSession(session.id);
    if (!turn?.turnId) {
        return;
    }
    state.status = "正在停止...";
    renderPanel();
    try {
        await requestJsonWithGetFallback(ROUTE_STOP, {
            panel_id: getPanelId(),
            turn_id: turn.turnId,
        });
    } catch (error) {
        state.status = `停止失败：${error.message || error}`;
        renderPanel();
    }
}

function newChat() {
    const session = createSession();
    state.sessions.unshift(session);
    state.sessions = state.sessions.slice(0, MAX_SESSIONS);
    state.currentSessionId = session.id;
    state.status = "新话题";
    markWorkspaceEdited();
    saveState();
    renderPanel();
    void persistSession(session);
    setTimeout(() => qs("[data-role='input']")?.focus(), 0);
}

function clearMessages() {
    const session = currentSession();
    if (isSessionGenerating(session.id)) {
        state.status = "正在回复，先停止后再清空话题";
        renderPanel();
        return;
    }
    session.messages = [];
    session.title = "新话题";
    session.autoTitle = true;
    touchSession(session, { moveToTop: false });
    state.status = "当前话题已清空";
    markWorkspaceEdited();
    saveState();
    renderPanel();
    void persistSession(session);
}

function isOwnEvent(detail) {
    return detail?.panel_id === getPanelId();
}

function onTurnStarted(event) {
    const detail = event?.detail || {};
    if (!isOwnEvent(detail)) {
        return;
    }
    const sessionId = String(detail.session_id || "");
    if (sessionId) {
        activeTurns.set(sessionId, {
            turnId: String(detail.turn_id || activeTurnForSession(sessionId)?.turnId || ""),
            messageId: String(detail.message_id || activeTurnForSession(sessionId)?.messageId || ""),
            sessionId,
            model: String(detail.model || state.model || "模型"),
        });
    }
    if (!sessionId || sessionId === currentSession().id) {
        state.status = "正在回复...";
    }
    scheduleRender();
}

function onTextDelta(event) {
    const detail = event?.detail || {};
    if (!isOwnEvent(detail)) {
        return;
    }

    const record = findMessageRecord(detail.message_id || "");
    if (!record?.message) {
        return;
    }
    record.message.text += String(detail.text || "");
    touchSession(record.session, { moveToTop: false });
    if (record.session.id === currentSession().id) {
        state.status = "正在回复...";
    }
    scheduleRender();
}

function onTurnCompleted(event) {
    const detail = event?.detail || {};
    if (!isOwnEvent(detail)) {
        return;
    }

    const record = findMessageRecord(detail.message_id || "");
    const message = record?.message || null;
    if (message && !message.text && detail.text) {
        message.text = String(detail.text || "");
    }
    if (record?.session) {
        touchSession(record.session, { moveToTop: false });
    }
    const sessionId = String(detail.session_id || record?.session?.id || "");
    if (sessionId) {
        activeTurns.delete(sessionId);
    }
    if (!sessionId || sessionId === currentSession().id) {
        state.status = detail.cancelled ? "已停止" : "回复完成";
    }
    saveState();
    renderPanel();
    if (record?.session) {
        void persistSession(record.session);
    }
}

function onTurnFailed(event) {
    const detail = event?.detail || {};
    if (!isOwnEvent(detail)) {
        return;
    }

    const record = findMessageRecord(detail.message_id || "");
    if (record?.message) {
        record.message.tone = "error";
        record.message.text = detail.text || `请求失败：${detail.error || "未知错误"}`;
    }
    if (record?.session) {
        touchSession(record.session, { moveToTop: false });
    }
    const sessionId = String(detail.session_id || record?.session?.id || "");
    if (sessionId) {
        activeTurns.delete(sessionId);
    }
    if (!sessionId || sessionId === currentSession().id) {
        state.status = "请求失败";
    }
    saveState();
    renderPanel();
    if (record?.session) {
        void persistSession(record.session);
    }
}

function installSocketListeners() {
    api.addEventListener(EVENT_TURN_STARTED, onTurnStarted);
    api.addEventListener(EVENT_TEXT_DELTA, onTextDelta);
    api.addEventListener(EVENT_TURN_COMPLETED, onTurnCompleted);
    api.addEventListener(EVENT_TURN_FAILED, onTurnFailed);
}

loadState();

app.registerExtension({
    name: EXTENSION_NAME,
    async setup() {
        getPanelId();
        installSocketListeners();
        ensurePanel();
        ensureSettingsPanel();
        installMenuButtonWithRetry();
        bootstrap();
    },
});
