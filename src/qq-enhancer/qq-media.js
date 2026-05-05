import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const qqImageMarkerPattern = /\[\[qq_image:([^\]\n]+)\]\]/g;
const qqStickerMarkerPattern = /\[\[qq_sticker:([^\]\n]+)\]\]/g;
const supportedStickerExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export function extractOneBotImageInputs(payload) {
  const segments = Array.isArray(payload?.message) ? payload.message : [];
  return segments
    .filter((segment) => segment?.type === "image")
    .map((segment) => ({
      file: String(segment.data?.file || segment.data?.resource_id || "").trim(),
      url: String(segment.data?.url || segment.data?.temp_url || "").trim(),
      summary: String(segment.data?.summary || "[图片]").trim(),
      raw: segment
    }))
    .filter((image) => image.file || image.url);
}

export function formatQqImageSummary(images) {
  if (!Array.isArray(images) || images.length === 0) return "";
  return images
    .map((image, index) => {
      const label = image.summary || "[图片]";
      const size = image.width && image.height ? ` ${image.width}x${image.height}` : "";
      return `图片${index + 1}：${label}${size}`;
    })
    .join("；");
}

export async function prepareQqModelImages(images, options = {}) {
  const outputDir = options.outputDir || join(process.cwd(), "tmp", "qq-images");
  await mkdir(outputDir, { recursive: true });
  const prepared = [];
  for (const image of images || []) {
    const localPath = await materializeQqImage(image, outputDir, options);
    if (!localPath) continue;
    prepared.push(await normalizeModelImage(localPath, outputDir));
  }
  return prepared;
}

export function extractQqImageAttachments(text) {
  return [...String(text || "").matchAll(qqImageMarkerPattern)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
}

export function stripQqImageAttachmentMarkers(text) {
  return String(text || "")
    .replace(qqImageMarkerPattern, "")
    .replace(qqStickerMarkerPattern, "")
    .trim();
}

export async function buildQqStickerCatalog(stickerDir, options = {}) {
  const limit = options.limit || 160;
  const files = await listStickerFiles(stickerDir).catch(() => []);
  return files.slice(0, limit).map((file) => ({
    name: stickerNameFromFile(file),
    path: join(stickerDir, file),
    file
  }));
}

export function formatQqStickerCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return "本地表情包库目前为空。需要先把常用表情包放进表情包文件夹，并用语义化文件名命名。";
  }
  return catalog
    .map((item) => `${item.name} -> ${item.file}`)
    .join("\n");
}

export async function resolveQqReplyMedia(text, options = {}) {
  const stickerDir = options.stickerDir;
  const catalog = options.catalog || await buildQqStickerCatalog(stickerDir);
  const imagePaths = extractQqImageAttachments(text);
  for (const stickerName of extractQqStickerNames(text)) {
    const sticker = findSticker(catalog, stickerName);
    if (sticker) imagePaths.push(sticker.path);
  }
  return [...new Set(imagePaths)];
}

export function extractQqStickerNames(text) {
  return [...String(text || "").matchAll(qqStickerMarkerPattern)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
}

export function buildQqImageSegment(filePath) {
  const path = String(filePath || "").trim();
  const uri = path.startsWith("http://") || path.startsWith("https://") || path.startsWith("base64://")
    ? path
    : path.startsWith("file://")
      ? path
      : `file://${path}`;
  return {
    type: "image",
    data: {
      file: uri
    }
  };
}

async function materializeQqImage(image, outputDir, options) {
  if (image.path) return image.path;
  if (image.url) return downloadImage(image.url, outputDir);
  if (image.file && options.fetchOneBotImage) {
    const fromApi = await options.fetchOneBotImage(image.file).catch(() => null);
    if (fromApi?.file) return fromApi.file;
    if (fromApi?.url) return downloadImage(fromApi.url, outputDir);
    if (fromApi?.base64) {
      const outputPath = join(outputDir, `${Date.now()}-${randomUUID()}.png`);
      await writeFile(outputPath, Buffer.from(fromApi.base64, "base64"));
      return outputPath;
    }
  }
  return "";
}

async function downloadImage(url, outputDir) {
  const normalizedUrl = decodeHtmlEntities(url);
  const response = await fetch(normalizedUrl, {
    headers: {
      "user-agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`QQ image download failed: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  const ext = imageExtensionFrom(contentType, url);
  const outputPath = join(outputDir, `${Date.now()}-${randomUUID()}${ext}`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  await access(outputPath);
  return outputPath;
}

async function normalizeModelImage(sourcePath, outputDir) {
  const extension = extname(sourcePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) return sourcePath;
  const outputPath = join(outputDir, `${basename(sourcePath, extension)}.png`);
  await runCommand("/usr/bin/sips", ["-s", "format", "png", sourcePath, "--out", outputPath], { timeout: 15000 });
  await runCommand("/usr/bin/xattr", ["-c", outputPath], { timeout: 5000, allowFailure: true });
  await access(outputPath);
  return outputPath;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function imageExtensionFrom(contentType, url) {
  if (/png/i.test(contentType)) return ".png";
  if (/webp/i.test(contentType)) return ".webp";
  if (/gif/i.test(contentType)) return ".gif";
  if (/jpe?g/i.test(contentType)) return ".jpg";
  const ext = extname(new URL(url).pathname).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext) ? ext : ".jpg";
}

async function listStickerFiles(stickerDir) {
  if (!stickerDir) return [];
  const entries = await readdir(stickerDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && supportedStickerExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function findSticker(catalog, requestedName) {
  const normalized = normalizeStickerName(requestedName);
  return (catalog || []).find((item) => {
    const candidates = [
      item.name,
      item.file,
      item.file ? basename(item.file, extname(item.file)) : ""
    ];
    return candidates.some((candidate) => normalizeStickerName(candidate) === normalized);
  });
}

function stickerNameFromFile(file) {
  return basename(file, extname(file))
    .replace(/\.(png|jpe?g|gif|webp)$/i, "")
    .replace(/^\d+[-_\s]+/, "")
    .trim();
}

function normalizeStickerName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(\.(png|jpe?g|gif|webp))+$/i, "")
    .replace(/[\s_\-·.。]+/g, "")
    .trim();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = options.timeout
      ? setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`${command} timed out`));
      }, options.timeout)
      : null;
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      if (timeout) clearTimeout(timeout);
      if (status !== 0 && !options.allowFailure) {
        reject(new Error(`${command} exited ${status}: ${output.trim()}`));
        return;
      }
      resolve({ status, output });
    });
  });
}
