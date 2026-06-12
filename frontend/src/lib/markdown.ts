import { toHtml } from "@mizchi/markdown";
import katex from "katex";

const FRONT_MATTER_PATTERN =
  /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractFrontMatter(content: string): { block: string; body: string } {
  const match = content.match(FRONT_MATTER_PATTERN);
  if (!match || match[0].length === 0) {
    return { block: "", body: content };
  }

  return {
    block: match[1],
    body: content.slice(match[0].length),
  };
}

type FrontMatterCell = {
  key: string;
  values: string[];
};

type FootnoteDefinition = {
  label: string;
  body: string;
};

function splitFrontMatterRows(block: string): FrontMatterCell[] {
  const rows: FrontMatterCell[] = [];
  const lines = block.split(/\r?\n/);
  let current: FrontMatterCell | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const listMatch = /^(\s+)-\s*(.*)$/.exec(line);
    if (listMatch && current) {
      current.values.push(listMatch[2]);
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    if (!key) {
      continue;
    }

    const value = line.slice(colonIndex + 1).trim();
    current = { key, values: value ? [value] : [] };
    rows.push(current);
  }

  return rows;
}

function renderFrontMatter(block: string): string {
  const rows = splitFrontMatterRows(block);
  if (rows.length === 0) {
    return `<pre><code class="language-yaml">${escapeHtml(block.trim())}</code></pre>`;
  }

  const rowsHtml = rows
    .map((row) => {
      const valueHtml = row.values.length
        ? row.values.map((value) => escapeHtml(value)).join("<br />")
        : "";

      return `<tr><td class="frontmatter-key">${escapeHtml(row.key)}</td><td class="frontmatter-value">${valueHtml}</td></tr>`;
    })
    .join("");

    return `
    <div class="frontmatter-table-wrap">
      <table class="frontmatter-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function extractFootnotes(content: string): { body: string; footnotes: FootnoteDefinition[] } {
  const lines = content.split("\n");
  const bodyLines: string[] = [];
  const footnotes: FootnoteDefinition[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(lines[i]);
    if (!match) {
      bodyLines.push(lines[i]);
      i++;
      continue;
    }

    const noteLines = [match[2]];
    i++;
    while (i < lines.length && /^(?:[ \t]{2,4}|\t)/.test(lines[i])) {
      noteLines.push(lines[i].replace(/^(?:[ \t]{2,4}|\t)/, ""));
      i++;
    }
    footnotes.push({
      label: match[1],
      body: noteLines.join("\n").trim(),
    });
  }

  return { body: bodyLines.join("\n").trimEnd(), footnotes };
}

function footnoteDomId(label: string): string {
  const normalized = label.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "-");
  return normalized || "note";
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;

/**
 * Converts wiki-style links [[link]] or [[link|alias]] to HTML spans.
 * Converts image embeds ![[image.png]] to <img> tags.
 */
export function convertWikiLinks(html: string): string {
  // First pass: convert ![[image.png]] embeds to <img> tags
  html = html.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, path, altOrSize) => {
    if (IMAGE_EXTENSIONS.test(path)) {
      const alt = altOrSize || path;
      return `<img class="vault-image" data-vault-path="${path}" alt="${alt}" />`;
    }
    // Non-image embed (transclusion) — leave as wiki-link for now
    const displayText = altOrSize || path;
    return `<span class="wiki-link" data-link="${path}">${displayText}</span>`;
  });

  // Second pass: convert [[link]] and [[link|alias]] to wiki-link spans
  return html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) => {
    const displayText = alias || link;
    return `<span class="wiki-link" data-link="${link}">${displayText}</span>`;
  });
}

// ---------------------------------------------------------------------------
// Protection pipeline
//
// @mizchi/markdown は ![[fig1_geometry_3d.png]] の `_` を <em> に変換したり、
// $a_i$ のような数式を壊したりする。そこで toHtml() に渡す【前】に、
// コードブロック以外の wiki 構文・数式・callout をプレースホルダへ退避し、
// toHtml() の【後】に最終 HTML を復元する多段パイプラインにしている。
// ---------------------------------------------------------------------------

type TokenStore = {
  /** token -> 最終的に埋め込む HTML（または生 Markdown） */
  map: Map<string, string>;
  counter: number;
};

function newStore(): TokenStore {
  return { map: new Map(), counter: 0 };
}

// 英数字のみのトークンは @mizchi/markdown を素通りする（probe済み）
function makeToken(store: TokenStore, kind: string, value: string): string {
  const token = `OBAILSTK${kind}${store.counter++}X`;
  store.map.set(token, value);
  return token;
}

function restoreTokens(html: string, store: TokenStore): string {
  // ネストした callout 等は「子トークンが親の値の中」にあるため、
  // 親（後に作られた方）から逆順で復元する。
  const entries = [...store.map.entries()].reverse();
  for (const [token, value] of entries) {
    // ブロック要素を <p> で包まれた場合は <p> ごと置換する
    html = html.split(`<p>${token}</p>`).join(value);
    html = html.split(token).join(value);
  }
  return html;
}

/** フェンスコード・インラインコードを退避（中身の数式や wiki 構文を守る） */
function protectCode(src: string, store: TokenStore): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let buffer: string[] = [];

  const flushFence = () => {
    out.push(makeToken(store, "C", buffer.join("\n")));
    buffer = [];
    fence = null;
  };

  for (const line of lines) {
    if (fence) {
      buffer.push(line);
      const trimmed = line.trim();
      // 閉じフェンス: 同種の記号のみ・開始と同じ長さ以上
      if (/^(`{3,}|~{3,})$/.test(trimmed) && trimmed[0] === fence[0] && trimmed.length >= fence.length) {
        flushFence();
      }
      continue;
    }
    const open = /^(\s*)(```+|~~~+)(.*)$/.exec(line);
    if (open) {
      fence = open[2];
      buffer = [line];
      continue;
    }
    // インラインコード `...` を退避
    out.push(
      line.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (m) =>
        makeToken(store, "C", m),
      ),
    );
  }
  if (fence) {
    // 閉じ忘れフェンスは EOF まで
    flushFence();
  }
  return out.join("\n");
}

/** KaTeX で数式 HTML を生成（壊れた数式でも throw せず赤字表示） */
function renderMath(tex: string, displayMode: boolean): string {
  const trimmed = tex.trim();
  try {
    const html = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
    return displayMode
      ? `<div class="math-block">${html}</div>`
      : `<span class="math-inline">${html}</span>`;
  } catch {
    const cls = displayMode ? "math-block math-error" : "math-inline math-error";
    return `<code class="${cls}">${escapeHtml(trimmed)}</code>`;
  }
}

/** $$...$$ / \[...\] / $...$ / \(...\) を退避して KaTeX レンダリング */
function protectMath(src: string, store: TokenStore): string {
  // ブロック数式 $$...$$（複数行可）
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) =>
    makeToken(store, "M", renderMath(tex, true)),
  );
  // ブロック数式 \[...\]
  src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) =>
    makeToken(store, "M", renderMath(tex, true)),
  );
  // インライン数式 \(...\)
  src = src.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) =>
    makeToken(store, "M", renderMath(tex, false)),
  );
  // インライン数式 $...$（行内・前後が空白でない・空でない）
  src = src.replace(
    /\$((?:[^$\n\\]|\\[^\n])+?)\$/g,
    (match, tex: string) => {
      if (!tex.trim() || /^\s|\s$/.test(tex)) {
        return match;
      }
      return makeToken(store, "M", renderMath(tex, false));
    },
  );
  return src;
}

/** ![[...]] / [[...]] を退避して HTML 化（_ が <em> に化けるのを防ぐ） */
function protectWikiLinks(src: string, store: TokenStore): string {
  src = src.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, path, altOrSize) => {
    if (IMAGE_EXTENSIONS.test(path)) {
      const alt = altOrSize || path;
      return makeToken(
        store,
        "W",
        `<img class="vault-image" data-vault-path="${escapeHtml(path)}" alt="${escapeHtml(alt)}" />`,
      );
    }
    const displayText = altOrSize || path;
    return makeToken(
      store,
      "W",
      `<span class="wiki-link" data-link="${escapeHtml(path)}">${escapeHtml(displayText)}</span>`,
    );
  });

  return src.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) => {
    const displayText = alias || link;
    return makeToken(
      store,
      "W",
      `<span class="wiki-link" data-link="${escapeHtml(link)}">${escapeHtml(displayText)}</span>`,
    );
  });
}

function protectFootnoteRefs(src: string, store: TokenStore): string {
  return src.replace(/\[\^([^\]\s]+)\]/g, (_, label) => {
    const id = footnoteDomId(label);
    return makeToken(
      store,
      "F",
      `<sup class="footnote-ref" id="fnref-${escapeHtml(id)}"><a href="#fn-${escapeHtml(id)}" data-footnote-ref="${escapeHtml(label)}">${escapeHtml(label)}</a></sup>`,
    );
  });
}

// Obsidian callout タイプ → アイコン
const CALLOUT_ICONS: Record<string, string> = {
  note: "📝",
  abstract: "📋", summary: "📋", tldr: "📋",
  info: "ℹ️",
  todo: "☑️",
  tip: "💡", hint: "💡", important: "💡",
  success: "✅", check: "✅", done: "✅",
  question: "❓", help: "❓", faq: "❓",
  warning: "⚠️", caution: "⚠️", attention: "⚠️",
  failure: "❌", fail: "❌", missing: "❌",
  danger: "⚡", error: "⚡",
  bug: "🐛",
  example: "🧪",
  quote: "💬", cite: "💬",
};

const CALLOUT_HEAD = /^>\s*\[!([a-zA-Z]+)\]([+-]?)[ \t]*(.*)$/;

function renderInline(markdown: string): string {
  const html = toHtml(markdown).trim();
  const m = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return m ? m[1] : html;
}

/**
 * Obsidian callout (> [!tip] タイトル) をプレースホルダへ退避。
 * 中身は再帰的にレンダリングするためネストにも対応する。
 */
function protectCallouts(
  src: string,
  store: TokenStore,
  renderBody: (markdown: string) => string,
): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const head = CALLOUT_HEAD.exec(lines[i]);
    if (!head) {
      out.push(lines[i]);
      i++;
      continue;
    }

    // blockquote の連続行を収集
    const bodyLines: string[] = [];
    i++;
    while (i < lines.length && /^>/.test(lines[i])) {
      bodyLines.push(lines[i].replace(/^>[ \t]?/, ""));
      i++;
    }

    const type = head[1].toLowerCase();
    const fold = head[2];
    const rawTitle = head[3].trim();
    const icon = CALLOUT_ICONS[type] || "📝";
    const titleHtml = rawTitle
      ? renderInline(rawTitle)
      : type.charAt(0).toUpperCase() + type.slice(1);
    const bodyMarkdown = bodyLines.join("\n").trim();
    const bodyHtml = bodyMarkdown
      ? `<div class="callout-content">${renderBody(bodyMarkdown)}</div>`
      : "";
    const titleInner = `<span class="callout-icon">${icon}</span><span class="callout-title-text">${titleHtml}</span>`;

    let html: string;
    if (fold) {
      const open = fold === "+" ? " open" : "";
      html = `<details class="callout" data-callout="${type}"${open}><summary class="callout-title">${titleInner}<span class="callout-fold" aria-hidden="true"></span></summary>${bodyHtml}</details>`;
    } else {
      html = `<div class="callout" data-callout="${type}"><div class="callout-title">${titleInner}</div>${bodyHtml}</div>`;
    }

    out.push("", makeToken(store, "L", html), "");
  }

  return out.join("\n");
}

/**
 * 先頭・中間ヘッダセルが空の表が @mizchi/markdown で <table> 化されない問題対策。
 * ヘッダ行（次行がセパレータの行）の空セルへ &nbsp; を注入する。
 */
function fixEmptyTableHeaderCells(src: string): string {
  const SEPARATOR = /^\s*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?\s*$/;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (!line.includes("|") || !SEPARATOR.test(lines[i + 1])) {
      continue;
    }
    const cells = line.split("|");
    let changed = false;
    // cells[0]/末尾は外側（パイプの外）なので触らない
    for (let c = 1; c < cells.length - 1; c++) {
      if (cells[c].trim() === "") {
        cells[c] = " &nbsp; ";
        changed = true;
      }
    }
    if (changed) {
      lines[i] = cells.join("|");
    }
  }
  return lines.join("\n");
}

/** 本文 Markdown を HTML へ（callout の中身でも再帰利用する） */
function renderMarkdownBody(body: string, store: TokenStore): string {
  const withCallouts = protectCallouts(body, store, (inner) =>
    renderMarkdownBody(inner, store),
  );
  const fixed = fixEmptyTableHeaderCells(withCallouts);
  return toHtml(fixed);
}

function renderFootnoteBody(body: string): string {
  const store = newStore();
  let processed = protectCode(body, store);
  processed = protectMath(processed, store);
  processed = protectWikiLinks(processed, store);
  processed = protectFootnoteRefs(processed, store);
  const codeRestored = restoreTokensOfKind(processed, store, "C");
  return restoreTokens(renderMarkdownBody(codeRestored, store), store);
}

function renderFootnotes(footnotes: FootnoteDefinition[]): string {
  if (footnotes.length === 0) {
    return "";
  }

  const items = footnotes
    .map((footnote) => {
      const id = footnoteDomId(footnote.label);
      const bodyHtml = renderFootnoteBody(footnote.body || " ");
      return `<li id="fn-${escapeHtml(id)}" data-footnote-label="${escapeHtml(footnote.label)}">${bodyHtml}<a class="footnote-backref" href="#fnref-${escapeHtml(id)}" aria-label="Back to reference">↩</a></li>`;
    })
    .join("");

  return `<section class="footnotes"><ol>${items}</ol></section>`;
}

/**
 * Parses markdown content to HTML with wiki-link support
 */
export function parseMarkdown(content: string): string {
  const { block, body } = extractFrontMatter(content);
  const trimmedBody = body.replace(/^\r?\n+/, "");
  const { body: bodyWithoutFootnotes, footnotes } = extractFootnotes(trimmedBody);
  const frontMatterHtml = block
    ? `<section class="frontmatter"><details class="frontmatter-details"><summary class="frontmatter-summary" aria-label="Toggle metadata"><span class="frontmatter-summary-label">Metadata</span><span class="frontmatter-summary-icon" aria-hidden="true"></span></summary>${renderFrontMatter(block)}</details></section>`
    : "";

  const store = newStore();
  let processed = protectCode(bodyWithoutFootnotes.replace(/\r\n/g, "\n"), store);
  processed = protectMath(processed, store);
  processed = protectWikiLinks(processed, store);
  processed = protectFootnoteRefs(processed, store);

  // コードは toHtml に普通に処理させたいので先に復元する
  // （数式・wiki・callout のトークンはコード退避後に作られたため衝突しない）
  const codeRestored = restoreTokensOfKind(processed, store, "C");
  const html = `${frontMatterHtml}${renderMarkdownBody(codeRestored, store)}`;

  // 数式・wiki・callout の HTML を復元
  // （旧 convertWikiLinks の後段適用はコードブロック内まで変換してしまうため廃止）
  return `${restoreTokens(html, store)}${renderFootnotes(footnotes)}`;
}

function restoreTokensOfKind(src: string, store: TokenStore, kind: string): string {
  const prefix = `OBAILSTK${kind}`;
  for (const [token, value] of store.map) {
    if (token.startsWith(prefix)) {
      src = src.split(token).join(value);
      store.map.delete(token);
    }
  }
  return src;
}
