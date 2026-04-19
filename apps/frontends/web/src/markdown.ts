import {
  getNodeChildren,
  getNodeValue,
  isBlockquoteNode,
  isCodeNode,
  isDeleteNode,
  isEmphasisNode,
  isInlineCodeNode,
  isLinkNode,
  isListItemNode,
  isListNode,
  isParagraphNode,
  isStrongNode,
  isTableNode,
  isTextNode,
  markdownToPlainText,
  parseMarkdown,
  tableToAscii,
  type Blockquote,
  type Code,
  type Content,
  type Link,
  type List,
  type ListItem,
  type MdastTable,
  type Root,
} from "chat";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const sanitizeCodeLanguage = (value: string): string => value.replace(/[^a-z0-9_+-]/giu, "");

const getChildren = (node: Content): Content[] => getNodeChildren(node) ?? [];

const isHeadingNode = (node: Content): node is Content & { depth: number } => node.type === "heading";

const isImageNode = (node: Content): node is Content & { alt: string | null; url: string } => node.type === "image";

const isThematicBreakNode = (node: Content): boolean => node.type === "thematicBreak";

const sanitizeHref = (value: string): string | null => {
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("#")) {
    return value;
  }

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:", "tg:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
};

const renderInlineNodes = (nodes: readonly Content[]): string => nodes.map(renderInlineNode).join("");

const renderLink = (node: Link): string => {
  const href = sanitizeHref(node.url);
  const label = renderInlineNodes(getChildren(node));
  if (href === null) {
    return label;
  }
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
};

const renderInlineNode = (node: Content): string => {
  if (isTextNode(node)) {
    return escapeHtml(getNodeValue(node) ?? "");
  }

  if (isStrongNode(node)) {
    return `<strong>${renderInlineNodes(getChildren(node))}</strong>`;
  }

  if (isEmphasisNode(node)) {
    return `<em>${renderInlineNodes(getChildren(node))}</em>`;
  }

  if (isDeleteNode(node)) {
    return `<del>${renderInlineNodes(getChildren(node))}</del>`;
  }

  if (isInlineCodeNode(node)) {
    return `<code>${escapeHtml(getNodeValue(node) ?? "")}</code>`;
  }

  if (isLinkNode(node)) {
    return renderLink(node);
  }

  if (node.type === "break") {
    return "<br />";
  }

  if (isImageNode(node)) {
    const alt = typeof node.alt === "string" && node.alt.trim().length > 0 ? node.alt.trim() : node.url;
    const href = sanitizeHref(node.url);
    return href === null
      ? escapeHtml(alt)
      : `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(alt)}</a>`;
  }

  return renderInlineNodes(getChildren(node));
};

const renderHeading = (node: Content & { depth: number }): string => {
  const level = Math.min(Math.max(node.depth, 1), 6);
  return `<h${level}>${renderInlineNodes(getChildren(node))}</h${level}>`;
};

const renderCodeBlock = (node: Code): string => {
  const language = sanitizeCodeLanguage(node.lang ?? "");
  const className = language.length > 0 ? ` class="language-${language}"` : "";
  return `<pre><code${className}>${escapeHtml(getNodeValue(node) ?? "")}</code></pre>`;
};

const renderTable = (node: MdastTable): string => `<pre><code>${escapeHtml(tableToAscii(node))}</code></pre>`;

const renderBlockquote = (node: Blockquote): string => `<blockquote>${renderBlocks(getChildren(node))}</blockquote>`;

const renderListItem = (node: ListItem): string => `<li>${renderBlocks(getChildren(node))}</li>`;

const renderList = (node: List): string => {
  const tag = node.ordered ? "ol" : "ul";
  const start = node.ordered && (node.start ?? 1) !== 1 ? ` start="${String(node.start)}"` : "";
  return `<${tag}${start}>${getChildren(node).filter(isListItemNode).map(renderListItem).join("")}</${tag}>`;
};

const renderBlockNode = (node: Content): string => {
  if (isParagraphNode(node)) {
    return `<p>${renderInlineNodes(getChildren(node))}</p>`;
  }

  if (isListNode(node)) {
    return renderList(node);
  }

  if (isBlockquoteNode(node)) {
    return renderBlockquote(node);
  }

  if (isCodeNode(node)) {
    return renderCodeBlock(node);
  }

  if (isTableNode(node)) {
    return renderTable(node);
  }

  if (isHeadingNode(node)) {
    return renderHeading(node);
  }

  if (isThematicBreakNode(node)) {
    return "<hr />";
  }

  if (
    isTextNode(node) ||
    isStrongNode(node) ||
    isEmphasisNode(node) ||
    isDeleteNode(node) ||
    isInlineCodeNode(node) ||
    isLinkNode(node)
  ) {
    return `<p>${renderInlineNode(node)}</p>`;
  }

  return renderBlocks(getChildren(node));
};

const renderBlocks = (nodes: readonly Content[]): string =>
  nodes
    .map((node) => renderBlockNode(node))
    .filter((node) => node.trim().length > 0)
    .join("");

const renderRoot = (root: Root): string => renderBlocks(root.children);

const renderFallbackMarkdown = (markdown: string): string => {
  const text = markdownToPlainText(markdown).trim();
  if (text.length === 0) {
    return "<p>I do not have a useful reply yet.</p>";
  }

  return text
    .split(/\n{2,}/u)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
};

export const renderMarkdownToHtml = (markdown: string): string => {
  const normalized = markdown.replace(/\r\n/gu, "\n").trim();
  if (normalized.length === 0) {
    return "<p>I do not have a useful reply yet.</p>";
  }

  try {
    const ast = parseMarkdown(normalized);
    const rendered = renderRoot(ast).trim();
    if (rendered.length > 0) {
      return rendered;
    }
  } catch {
    // Fall back to plain text paragraphs if the markdown parser rejects the input.
  }

  return renderFallbackMarkdown(normalized);
};
