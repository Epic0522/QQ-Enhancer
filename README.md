<div align="center">

# QQ Enhancer

**Optional QQ group-chat enhancement package for Codex Remote Contact.**  
**Codex Remote Contact 的可选 QQ 群聊增强包。**

![Node.js](https://img.shields.io/badge/Node.js-20+-339933)
![macOS](https://img.shields.io/badge/macOS-14%2B-blue)
![Memory](https://img.shields.io/badge/free%20memory-3GB%2B-orange)
![Package](https://img.shields.io/badge/package-optional-purple)
![Host](https://img.shields.io/badge/host-codexremotecontact-blue)

</div>

---

## Introduction / 介绍

QQ Enhancer separates enhanced QQ group-chat behavior from the main Codex Remote Contact hub. It provides proactive reply scoring, QQ image preparation, multi-bubble reply planning, local image-material markers, and deployer-owned reply style hooks.

QQ Enhancer 提供主动发言评分、QQ 图片输入处理、多气泡回复规划、本地图片素材标记，以及由部署者自行填写的风格钩子。

The main hub can start without this package. If QQ Enhancer is absent or disabled, Codex Remote Contact falls back to basic QQ reply behavior.

主程序没有安装本包时仍可启动；如果 QQ Enhancer 缺失或被关闭，Codex Remote Contact 会退回基础 QQ 回复能力。

## Features / 功能

| Feature / 功能 | Description / 说明 |
| :--- | :--- |
| Proactive scoring / 主动发言评分 | Uses deployer-defined regular expressions, interest scores, and cooldowns.<br>基于部署者自定义正则、兴趣分数和冷却时间判断是否主动插话。 |
| QQ image handling / QQ 图片处理 | Extracts OneBot image segments, materializes them locally, and prepares model image inputs.<br>解析 OneBot 图片段，下载或物化为本地文件，并准备给模型使用。 |
| Multi-bubble replies / 多气泡回复 | Splits group replies into shorter QQ-friendly bubbles and merges overflow instead of silently truncating the tail.<br>把群聊回复拆成适合 QQ 发送的短气泡，并在超过气泡上限时合并尾部内容，而不是静默截断。 |
| Local image materials / 本地图片素材 | Supports `[[qq_sticker:name]]` markers for local material sending.<br>通过 `[[qq_sticker:name]]` 标记发送本地素材。 |
| Custom sharp style / 自定义锐评风格 | Ships with no baked-in private style; deployers fill public rules in source comments.<br>本仓库默认不内置私有风格；部署者在源码注释位置填写公开规则。 |

## Requirements / 安装要求

| Requirement / 要求 | Notes / 说明 |
| :--- | :--- |
| Codex Remote Contact | This is an optional package and is normally loaded by the main hub.<br>这是可选升级包，通常由主程序加载。 |
| macOS 14 Sonoma or later | Follows the main hub requirement. Tested on macOS 15.7; macOS 14 is expected to work.<br>沿用主程序要求；已在 macOS 15.7 上验证，低一个大版本预计可用。 |
| Node.js 20+ | Used by the host hub and this package's ESM modules.<br>主程序和本包 ESM 模块需要。 |
| 3GB+ free memory | Recommended for the full hub + QQ bridge + Codex CLI workflow.<br>建议至少 3GB 可用内存，尤其是同时运行 Hub、QQ 桥接器和 Codex CLI 时。 |

## Project Structure / 项目结构

```text
qq-enhancer/
  src/qq-enhancer/
    index.js                  # Package exports / 包导出
    qq-chat-style.js          # Proactive scoring and prompt style / 主动判断与群聊风格
    qq-media.js               # QQ image and local material handling / 图片与素材处理
    qq-roast-persona.js       # Optional sharp-style customization / 可选锐评风格自定义
  data/qq-stickers/
    .gitkeep                  # Empty material folder placeholder / 空素材目录占位
  docs/hub-integration.md
  package.json
```

---

## Deployment Guide / 部署教程

### 1. Place next to the main hub / 放在主程序旁边

Recommended layout:

推荐目录结构：

```text
Projects/
  codexremotecontact/
  qq-enhancer/
```

The main hub auto-detects:

主程序会自动尝试加载：

```text
../qq-enhancer/src/qq-enhancer/index.js
```

Manual module path:

手动指定模块路径：

```bash
export CODEX_REMOTE_CONTACT_QQ_ENHANCER_MODULE="/absolute/path/to/qq-enhancer/src/qq-enhancer/index.js"
```

### 2. Enable in the main hub / 在主程序中启用

Edit `codexremotecontact/data/settings.json`:

编辑 `codexremotecontact/data/settings.json`：

```json
{
  "qq": {
    "enhancer": {
      "enabled": true
    },
    "proactive": {
      "enabled": true,
      "minIntervalMs": 180000
    }
  }
}
```

Set `qq.proactive.enabled` to `false` if you want enhanced replies without proactive bubbling.

如果只想启用增强回复、不想主动发言，把 `qq.proactive.enabled` 设为 `false`。

### 3. Configure group-chat behavior / 配置群聊行为

Edit these files:

编辑这些文件：

```text
src/qq-enhancer/qq-chat-style.js
src/qq-enhancer/qq-roast-persona.js
```

| File / 文件 | What to customize / 自定义内容 |
| :--- | :--- |
| `qq-chat-style.js` | Proactive interest patterns, score categories, `customStyleGuide`, and `proactiveInterestGuide`.<br>主动发言兴趣正则、分数分类、`customStyleGuide` 和 `proactiveInterestGuide`。 |
| `qq-roast-persona.js` | Optional sharp-reply interest patterns, phrase banks, boundaries, and avoided styles.<br>可选锐评兴趣正则、短句素材、边界和禁用风格。 |

The default `/$a/` patterns intentionally match nothing, so the default package does not contain private style or community-specific slang.

默认的 `/$a/` 正则不会命中任何内容，因此本仓库不内置私有风格或特定社群黑话。

### 4. Configure local image materials / 配置本地图片素材

Default material folder:

默认素材目录：

```text
codexremotecontact/data/qq-stickers/
```

Custom folder:

自定义目录：

```bash
export CODEX_REMOTE_CONTACT_QQ_STICKER_DIR="/absolute/path/to/qq-stickers"
```

Use semantic filenames:

建议使用语义化文件名：

```text
thinking.png
laugh.gif
watching.jpg
```

The model should only use material names that actually exist in the catalog.

模型只能使用素材库中真实存在的名称，不应编造文件名。

### 5. Restart and verify / 重启并验证

```bash
cd /path/to/codexremotecontact
npm start
```

If the package is loaded, startup logs should no longer show:

如果本包已加载，启动日志里不应再出现：

```text
qq-enhancer not installed; continuing with built-in fallback.
```

Test by mentioning the bot in an allowed QQ group. If proactive replies are enabled, send a message matching your custom interest patterns.

在白名单 QQ 群里 @ 机器人进行测试。若启用了主动发言，再发送能命中自定义兴趣正则的群聊内容。

---

## Disable / 关闭增强包

Temporarily disable all enhanced behavior:

临时关闭全部增强行为：

```bash
export CODEX_REMOTE_CONTACT_QQ_ENHANCER=0
```

Or disable it in main hub settings:

或在主程序设置中关闭：

```json
{
  "qq": {
    "enhancer": {
      "enabled": false
    },
    "proactive": {
      "enabled": false
    }
  }
}
```

---

