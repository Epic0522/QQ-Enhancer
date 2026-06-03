import { setTimeout as sleep } from "node:timers/promises";
import {
  buildCustomRoastInstructions,
  customRoastInterestPattern,
  customSharpRoastPattern
} from "./qq-roast-persona.js";

const serviceRequestPattern = /(帮我|请问|怎么|如何|为什么|能不能|可以吗|求|查一下|搜一下|写|做|修|装|配置|教程|解释|分析|总结|发给我|告诉我)/i;
const lowValuePattern = /^(\?|？|。|\.|,|，|哈+|啊+|哦+|嗯+|1|6|66|666|草|艹|笑死|哈哈哈*)$/i;

// Deployment customization guide:
// 部署自定义说明：
// These patterns control proactive group replies. They are intentionally
// impossible-to-match by default (`/$a/`) so the release package has no baked-in
// interests, community slang, or private deployment behavior.
// 下面这些正则决定 QQ 群聊的“主动冒泡”兴趣判断。默认的 `/$a/`
// 永远不会命中，表示发布包不内置任何私有兴趣、群体黑话或部署者规则。
//
// How to fill them:
// 怎么填写：
// - Use a JavaScript RegExp with the `i` flag for case-insensitive text.
// - 写成 JavaScript 正则；一般加 `i`，让英文大小写不敏感。
// - Keep each pattern focused on one category so scores stay predictable.
// - 每个正则只负责一类兴趣点，分数会更好理解。
// - If you do not want proactive replies for a category, leave it as `/$a/`.
// - 某类不想启用，就保持 `/$a/`。
// - Proactive replies also require the host setting `qq.proactive.enabled=true`
//   and the group to be in `qq.allowedGroups`.
// - 主动冒泡还需要宿主配置里 `qq.proactive.enabled=true`，并且群号在
//   `qq.allowedGroups` 中。
//
// Scoring:
// 分数规则：
// - activeInterestPattern: +5, a broad "worth replying" signal.
// - activeInterestPattern：+5，泛用兴趣信号。
// - technicalInterestPattern: +6, for deployment-specific technical topics.
// - technicalInterestPattern：+6，部署者指定的技术/项目话题。
// - cultureInterestPattern: +6, for deployment-specific entertainment topics.
// - cultureInterestPattern：+6，部署者指定的娱乐/内容话题。
// - newsInterestPattern: +3, or +6 when activeInterestPattern also matches.
// - newsInterestPattern：+3；如果同时命中 activeInterestPattern，则 +6。
// - activityInterestPattern: +8, for high-signal group activity.
// - activityInterestPattern：+8，强信号群聊动态。
// - sharpReplyPattern: +3, for messages that should allow a sharper style.
// - sharpReplyPattern：+3，允许更尖锐回复的触发词。
// - customRoastInterestPattern/customSharpRoastPattern live in
//   qq-roast-style.js and add +5/+3.
// - customRoastInterestPattern/customSharpRoastPattern 在
//   qq-roast-style.js 里，分别 +5/+3。
// - The proactive threshold is 8, so one strong category or multiple weak
//   signals can trigger a reply.
// - 主动冒泡阈值是 8；一个强信号或多个弱信号叠加都可能触发。
//
// Examples to adapt:
// const technicalInterestPattern = /(电脑|报错|部署|模型|显卡|网络)/i;
// const cultureInterestPattern = /(电影|游戏|动画|音乐|直播)/i;
// const newsInterestPattern = /(新闻|热搜|公告|通报|回应)/i;
// const activityInterestPattern = /(有人在讨论你的 bot 名|固定暗号)/i;
// const sharpReplyPattern = /(锐评|吐槽|评价一下|怎么看)/i;
const activeInterestPattern = /$a/;
const technicalInterestPattern = /$a/;
const cultureInterestPattern = /$a/;
const newsInterestPattern = /$a/;
const activityInterestPattern = /$a/;
const sharpReplyPattern = /$a/;

// These lines are injected into the model prompt when QQ group mode is active.
// QQ 群聊模式启用时，下面这些句子会直接塞进模型提示词。
// Write them as direct behavioral rules, one string per rule. Keep rules public
// and deployment-owned; do not put private account ids, local paths, or private
// private deployment profile here.
// 写法：一条规则一个字符串，直接描述“应该怎么回复”。这里只放公开、
// 可发布的部署者规则，不要写私人账号、本机路径或私有 profile。
//
// Good examples:
// "群聊里优先短句回复；复杂技术问题可以分 2 到 4 个气泡。",
// "遇到管理员时保持礼貌，遇到普通闲聊时像普通群友一样自然接话。",
// "如果信息不足，先说明缺少什么，不要编造上下文。"
const customStyleGuide = [
  // Add deployment-owned style rules here.
];

// These lines tell the model why it is proactively replying and what topics are
// interesting in this deployment. They do not affect scoring by themselves; pair
// them with the RegExp patterns above.
// 下面这些句子用于告诉模型“为什么这次可以主动冒泡”和“哪些话题值得插话”。
// 它们本身不加分；真正触发仍然要靠上面的正则命中。
//
// Good examples:
// "主动冒泡只在群里讨论本项目、部署故障、版本发布或明确点到 bot 名时使用。",
// "主动回复要像自然插话，不要假装自己被正式提问。",
// "如果只是寒暄、刷屏或低信息内容，不要主动冒泡。"
const proactiveInterestGuide = [
  // Add deployment-owned proactive-reply guidance here.
];

export function shouldProactivelyReplyToQq(event, qqState, helpers = {}) {
  if (!qqState?.proactive?.enabled) return { ok: false, reason: "QQ proactive reply is off" };
  if (event.type === "private_message") return { ok: false, reason: "Private message uses direct replies" };
  if (!event.groupId) return { ok: false, reason: "Missing group id" };
  if (!qqState.allowedGroups?.includes(event.groupId)) return { ok: false, reason: "Group is not allowed" };
  if (Array.isArray(event.images) && event.images.length > 0 && !String(helpers.stripMentionText ? helpers.stripMentionText(event.text) : event.text || "").trim()) {
    return { ok: false, reason: "Image-only message waits for explicit text interest" };
  }
  if (event.hasAtSegment || event.hasReplySegment || event.isReplyToSelf) {
    return { ok: false, reason: "Mention/reply path handles this message" };
  }

  const text = helpers.stripMentionText ? helpers.stripMentionText(event.text) : String(event.text || "").trim();
  const now = Date.now();
  const lastReplyAt = qqState.proactive.lastGroupReplyAt?.[event.groupId] || 0;
  const minIntervalMs = Number(qqState.proactive.minIntervalMs || 0);
  if (now - lastReplyAt < minIntervalMs) return { ok: false, reason: "Proactive cooldown" };

  if (event.isOwner) {
    const ownerDecision = buildOwnerContextProactiveDecision(event, text, helpers.recentMessages || []);
    if (ownerDecision.ok) return ownerDecision;
  }

  if (!text || lowValuePattern.test(text)) return { ok: false, reason: "Low-value message ignored" };
  if (serviceRequestPattern.test(text) && !activeInterestPattern.test(text) && !customRoastInterestPattern.test(text)) {
    return { ok: false, reason: "Service-like request ignored unless interesting" };
  }

  const score = scoreProactiveInterest(event, text);
  const threshold = 8;
  if (score < threshold) return { ok: false, reason: `Interest score too low: ${score}` };
  return { ok: true, reason: `Proactive interest score: ${score}`, proactive: true };
}

export function buildQqChatStyleInstructions(event) {
  if (event.type === "private_message") {
    return [
      "QQ 私聊可以认真回答，但不要变成客服；不必每句都承诺继续服务。",
      "如果对方只是随口丢一句，可以轻轻接住，不需要把所有东西展开成教程。"
    ].join("\n");
  }

  return [
    "QQ 群聊增强包已启用。",
    "部署者可在 qq-chat-style.js 和 qq-roast-style.js 中填写自己的公开群聊风格、主动冒泡兴趣点、锐评边界和短句素材。",
    ...customStyleGuide,
    ...proactiveInterestGuide,
    ...buildCustomRoastInstructions(),
    "输出可使用换行分隔多个 QQ 气泡；每个气泡都要能单独发出去。"
  ].join("\n");
}

export function buildQqReplyWorkspaceStyleInstructions() {
  return [
    "QQ 群聊增强包已启用。",
    "部署者可在 qq-chat-style.js 和 qq-roast-style.js 中填写自己的公开群聊风格、主动冒泡兴趣点、锐评边界和短句素材。",
    ...customStyleGuide,
    ...proactiveInterestGuide,
    ...buildCustomRoastInstructions(),
    "可以用换行分隔多个 QQ 气泡。"
  ];
}

export function buildQqSendPlan(event, reply) {
  const maxBubbles = getMaxQqBubbles(event, reply);
  const bubbles = mergeOverflowBubbles(splitReplyIntoBubbles(event, reply)
    .flatMap((bubble) => splitLongBubble(event, normalizeQqBubblePunctuation(event, bubble)))
    .filter(Boolean), event.type === "private_message" ? 1 : maxBubbles);
  return {
    bubbles,
    flattened: bubbles.join("\n")
  };
}

export function scoreQqTextInterest(text, event = {}) {
  return scoreInterestText(text, event);
}

export async function sendQqGroupBubbles({ event, reply, sendGroupMessage, quoteFirstBubble = true }) {
  const plan = buildQqSendPlan(event, reply);
  const results = [];
  for (const [index, bubble] of plan.bubbles.entries()) {
    if (index > 0) await sleep(450 + Math.min(bubble.length * 18, 900));
    results.push(await sendGroupMessage(bubble, { quoteSource: quoteFirstBubble && index === 0 }));
  }
  const failed = results.find((result) => result?.ok === false);
  return {
    ok: !failed,
    bubbles: plan.bubbles,
    results
  };
}

function scoreProactiveInterest(event, text) {
  return scoreInterestText(text, event);
}

function scoreInterestText(text, event = {}) {
  let score = 0;
  if (activeInterestPattern.test(text)) score += 5;
  if (customRoastInterestPattern.test(text)) score += 5;
  if (technicalInterestPattern.test(text)) score += 6;
  if (cultureInterestPattern.test(text)) score += 6;
  if (newsInterestPattern.test(text) && activeInterestPattern.test(text)) score += 6;
  else if (newsInterestPattern.test(text)) score += 3;
  if (activityInterestPattern.test(text)) score += 8;
  if (/[?!？！]{1,3}/.test(text)) score += 1;
  if (/(吗|吧|呢|咋|什么|怎么|为啥)/.test(text)) score += 1;
  if (sharpReplyPattern.test(text)) score += 3;
  if (customSharpRoastPattern.test(text)) score += 3;
  if (event.isOwner) score += 2;
  if (text.length >= 10 && text.length <= 80) score += 1;
  score += stableModulo(`${event.groupId || ""}:${event.senderId || ""}:${event.raw?.message_id || ""}:${text}`, 4);
  return score;
}

function buildOwnerContextProactiveDecision(event, text, recentMessages) {
  const currentScore = text && !lowValuePattern.test(text) ? scoreInterestText(text, event) : 0;
  const currentMessageId = event.raw?.message_id == null ? "" : String(event.raw.message_id);
  const now = Date.now();
  const contextFreshMs = 10 * 60 * 1000;
  const contextWindow = (recentMessages || [])
    .filter((entry) => !currentMessageId || String(entry.messageId || "") !== currentMessageId)
    .filter((entry) => {
      const atMs = Date.parse(entry.at || "");
      return Number.isFinite(atMs) && now - atMs <= contextFreshMs;
    })
    .slice(-8);
  const scoredContext = contextWindow
    .map((entry) => ({
      entry,
      score: scoreInterestText(entry.text || "", {
        groupId: event.groupId,
        senderId: entry.senderId,
        senderLabel: entry.senderLabel,
        raw: { message_id: entry.messageId || "" }
      })
    }))
    .filter((item) => item.score >= 9)
    .sort((a, b) => b.score - a.score);

  const bestContext = scoredContext[0];
  if (currentScore < 7 && !bestContext) {
    return { ok: false, reason: `Owner scan found no fresh interesting context: ${currentScore}` };
  }
  const bestScore = Math.max(currentScore, bestContext?.score || 0);
  if (bestScore < 8) return { ok: false, reason: `Owner context interest score too low: ${bestScore}` };

  return {
    ok: true,
    reason: bestContext && bestContext.score >= currentScore
      ? `Owner context interest score: ${bestContext.score}`
      : `Owner message interest score: ${currentScore}`,
    proactive: true,
    ownerContext: Boolean(bestContext && bestContext.score >= currentScore),
    includeRecentContext: Boolean(bestContext),
    contextMessages: contextWindow.slice(-8)
  };
}

function splitReplyIntoBubbles(event, reply) {
  const text = String(reply || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (event.type === "private_message") return [collapseWhitespace(text).slice(0, 900)];
  const maxBubbles = getMaxQqBubbles(event, reply);

  const explicit = text
    .split(/\n{1,}/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  if (explicit.length > 1) return clampExplicitBubbles(explicit.flatMap(splitMediaMarkersFromText), maxBubbles);

  const sentences = text
    .split(/(?<=[。！？!?])\s*/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  if (sentences.length >= 2 && text.length >= 32) return clampBubbles(sentences, maxBubbles);

  if (text.length > 70) {
    const pieces = text
      .split(/[，,；;]\s*/)
      .map((part) => collapseWhitespace(part))
      .filter(Boolean);
    if (pieces.length >= 2) return clampBubbles(pieces, maxBubbles);
  }

  return splitMediaMarkersFromText(collapseWhitespace(text).slice(0, 900));
}

function normalizeQqBubblePunctuation(event, bubble) {
  const text = collapseWhitespace(bubble);
  if (!text) return "";
  if (isQqMediaMarker(text)) return text;
  if (event.type === "private_message") return trimTerminalPeriod(text);

  if (isSeriousQqContent(event, text)) {
    return trimTerminalPeriod(text)
      .replace(/[；;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return trimTerminalPeriod(text)
    .replace(/……|\.{2,}|…/g, " ")
    .replace(/[，,、；;：:]/g, " ")
    .replace(/[。]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongBubble(event, bubble) {
  if (!bubble) return [];
  if (event.type === "private_message") return [bubble.slice(0, 900)];
  if (isQqMediaMarker(bubble)) return [bubble];

  const maxLength = isSeriousQqContent(event, bubble) ? 90 : 18;
  if ([...bubble].length <= maxLength) return [bubble];

  const pieces = String(bubble || "")
    .replace(/(?<=[。！？?!；;])/g, "\n")
    .split(/\n+/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  if (pieces.length <= 1) return chunkByLength(bubble, maxLength);

  const bubbles = [];
  let current = "";
  for (const piece of pieces) {
    const chunked = [...piece].length > maxLength ? chunkByLength(piece, maxLength) : [piece];
    for (const chunk of chunked) {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if ([...candidate].length <= maxLength) {
        current = candidate;
        continue;
      }
      if (current) bubbles.push(current);
      current = chunk;
    }
  }
  if (current) bubbles.push(current);
  return bubbles;
}

function splitMediaMarkersFromText(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  const markerPattern = /\[\[(?:qq_image|qq_sticker):[^\]\n]+\]\]/g;
  const parts = [];
  let lastIndex = 0;
  for (const match of value.matchAll(markerPattern)) {
    const before = value.slice(lastIndex, match.index).trim();
    if (before) parts.push(before);
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  const tail = value.slice(lastIndex).trim();
  if (tail) parts.push(tail);
  return parts.length ? parts : [value];
}

function isQqMediaMarker(text) {
  return /^\[\[(qq_image|qq_sticker):[^\]\n]+\]\]$/.test(String(text || "").trim());
}

function trimTerminalPeriod(text) {
  return String(text || "")
    .replace(/[。.\s]+$/g, "")
    .trim();
}

function isSeriousQqContent(event, text) {
  const source = `${event?.text || ""} ${text || ""}`;
  const normalized = String(source || "");
  const hasUrlOrCode = /```|`[^`]+`|https?:\/\/|\/[A-Za-z0-9_-]+/.test(normalized);
  const hasQuestionShape = /[?？]|(怎么|如何|为什么|是不是|有没有|能不能|可以吗)/.test(normalized);
  const hasStructuredFacts = /\d{1,4}([月日号点代档nmkKMGTP%]|年)|[A-Za-z]{2,}\s?[A-Za-z0-9+._-]{1,}|[A-Za-z0-9+._-]{3,}\s[A-Za-z0-9+._-]{2,}/.test(normalized);
  const hasClauseDensity = (normalized.match(/[，,；;：:\-]/g) || []).length >= 2;
  const looksExplanatory = [...normalized].length >= 28 && (hasQuestionShape || hasStructuredFacts || hasClauseDensity);
  return hasUrlOrCode || looksExplanatory;
}

function getMaxQqBubbles(event, reply) {
  if (event.type === "private_message") return 1;
  const source = `${event?.text || ""} ${reply || ""}`;
  if (isSeriousQqContent(event, reply)) return /(\b3\b|3个|三个|前三|top\s*3|TOP\s*3)/i.test(source) ? 7 : 6;
  return 4;
}

function chunkByLength(text, maxLength) {
  const chars = [...String(text || "").trim()];
  if (chars.length <= maxLength) return [chars.join("")].filter(Boolean);
  const chunks = [];
  for (let index = 0; index < chars.length; index += maxLength) {
    chunks.push(chars.slice(index, index + maxLength).join("").trim());
  }
  return chunks.filter(Boolean);
}

function clampBubbles(parts, maxBubbles = 4) {
  const bubbles = [];
  for (const part of parts) {
    if (!part) continue;
    const last = bubbles[bubbles.length - 1] || "";
    if (bubbles.length >= maxBubbles || (last && last.length + part.length < 18)) {
      bubbles[bubbles.length - 1] = collapseWhitespace(`${last}${last ? " " : ""}${part}`);
    } else {
      bubbles.push(part);
    }
  }
  return mergeOverflowBubbles(bubbles, maxBubbles).map((bubble) => bubble.slice(0, 360));
}

function clampExplicitBubbles(parts, maxBubbles = 4) {
  return mergeOverflowBubbles(parts.filter(Boolean), maxBubbles).map((bubble) => bubble.slice(0, 360));
}

function mergeOverflowBubbles(parts, maxBubbles) {
  const bubbles = [...(parts || [])].filter(Boolean);
  if (bubbles.length <= maxBubbles) return bubbles;
  const kept = bubbles.slice(0, maxBubbles - 1);
  const overflow = bubbles.slice(maxBubbles - 1).join(" ");
  kept.push(collapseWhitespace(overflow));
  return kept;
}

function collapseWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stableModulo(seed, modulo) {
  const value = [...String(seed || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return value % modulo;
}
