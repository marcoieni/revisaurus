import {
    DIFFS_TAG_NAME,
    FileDiff,
    parsePatchFiles,
    type BaseDiffOptions,
    type DiffLineAnnotation,
    type FileDiffMetadata,
    type ThemeTypes,
} from "@pierre/diffs";
import hljs from "highlight.js/lib/core";
import markdown from "highlight.js/lib/languages/markdown";
import { collapseChevronSvg } from "./icons.js";

hljs.registerLanguage("markdown", markdown);

const diffs: FileDiff<ReviewAnnotation>[] = [];
const diffRenderState = new Map<
    FileDiff<ReviewAnnotation>,
    {
        container: HTMLElement;
        fileDiff: FileDiffMetadata;
        lineAnnotations: DiffLineAnnotation<ReviewAnnotation>[];
    }
>();
const currentTheme = getCurrentTheme();
let currentOverflow = getCurrentOverflow();
let currentDiffStyle = getCurrentDiffStyle();
const copyFileNameLabel = "Copy file name to clipboard";

for (const summary of document.querySelectorAll<HTMLElement>(".summary")) {
    const markdownSource = summary.textContent;
    summary.textContent = "";
    renderMarkdownSource(summary, markdownSource);
}

document.addEventListener("theme:selected", (event) => {
    const selectedTheme = getCustomEventValue(event, "theme");
    const theme = isThemeType(selectedTheme) ? selectedTheme : getCurrentTheme();
    for (const diff of diffs) {
        diff.setThemeType(theme);
    }
});

document.addEventListener("diff-overflow:selected", (event) => {
    const selectedOverflow = getCustomEventValue(event, "overflow");
    const overflow = isDiffOverflow(selectedOverflow) ? selectedOverflow : getCurrentOverflow();
    currentOverflow = overflow;
    updateRenderedDiffOptions({ overflow });
});

document.addEventListener("diff-layout:selected", (event) => {
    const selectedLayout = getCustomEventValue(event, "layout");
    const diffStyle = isDiffLayout(selectedLayout) ? getDiffStyleForLayout(selectedLayout) : getCurrentDiffStyle();
    currentDiffStyle = diffStyle;
    updateRenderedDiffOptions({ diffStyle });
});

function updateRenderedDiffOptions(options: {
    diffStyle?: NonNullable<BaseDiffOptions["diffStyle"]>;
    overflow?: NonNullable<BaseDiffOptions["overflow"]>;
}): void {
    for (const diff of diffs) {
        diff.setOptions({ ...diff.options, ...options });
        rerenderDiff(diff);
    }
}

for (const container of document.querySelectorAll<HTMLElement>(".diff-view")) {
    const patch = decodeURIComponent(container.dataset.patch ?? "");
    const comments = parseReviewComments(decodeURIComponent(container.dataset.comments ?? "[]"));

    const parsed = parsePatchFiles(patch);
    const fragment = document.createDocumentFragment();

    for (const patchSet of parsed) {
        for (const fileDiff of patchSet.files) {
            const element = document.createElement(DIFFS_TAG_NAME);
            const lineAnnotations: DiffLineAnnotation<ReviewAnnotation>[] = comments
                .filter((comment) => comment.path === fileDiff.name || comment.path === fileDiff.prevName)
                .map((comment) => ({
                    lineNumber: comment.line,
                    side: comment.side === "right" ? ("additions" as const) : ("deletions" as const),
                    metadata: {
                        path: comment.path,
                        line: comment.line,
                        severity: comment.severity,
                        body: comment.body,
                    },
                }));
            const collapsed = lineAnnotations.length === 0;
            element.toggleAttribute("data-collapsed", collapsed);

            const diff = new FileDiff<ReviewAnnotation>({
                collapsed,
                diffStyle: currentDiffStyle,
                overflow: currentOverflow,
                theme: {
                    light: "pierre-light",
                    dark: "pierre-dark",
                },
                themeType: currentTheme,
                unsafeCSS: "::slotted([data-annotation-slot]) { color: #171717; }",
                renderHeaderPrefix(): HTMLButtonElement {
                    return createCollapseButton({
                        container: element,
                        diff,
                    });
                },
                renderAnnotation(annotation) {
                    const comment = annotation.metadata;
                    const location = `${comment.path}:${comment.line.toString()}`;
                    const node = document.createElement("div");
                    node.className = `review-comment ${comment.severity}`;
                    node.style.color = "#171717";
                    node.innerHTML = `<div class="review-comment-header"><strong>${comment.severity}</strong><button class="copy-location-button" type="button" data-location="${escapeAttribute(location)}" data-tooltip="${copyFileNameLabel}" aria-label="${copyFileNameLabel}"><span class="copy-location-icon" aria-hidden="true"></span><span class="sr-only">${copyFileNameLabel}</span></button></div>`;
                    renderMarkdownSource(node, comment.body);
                    const button = node.querySelector<HTMLButtonElement>(".copy-location-button");
                    button?.addEventListener("click", () => {
                        void copyLocation(button, location);
                    });
                    return node;
                },
            });
            diffs.push(diff);
            diffRenderState.set(diff, {
                container: element,
                fileDiff,
                lineAnnotations,
            });

            diff.render({
                fileDiff,
                fileContainer: element,
                lineAnnotations,
            });
            fragment.append(element);
        }
    }

    container.replaceChildren(fragment);
}

function getCurrentTheme(): ThemeTypes {
    const theme = document.documentElement.dataset.theme;
    if (isThemeType(theme)) {
        return theme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getCurrentOverflow(): NonNullable<BaseDiffOptions["overflow"]> {
    return isDiffOverflow(document.documentElement.dataset.diffOverflow)
        ? document.documentElement.dataset.diffOverflow
        : "scroll";
}

function getCurrentDiffStyle(): NonNullable<BaseDiffOptions["diffStyle"]> {
    const layout = document.documentElement.dataset.diffLayout ?? localStorage.getItem("revisaur:diff-layout");
    return isDiffLayout(layout) ? getDiffStyleForLayout(layout) : "split";
}

function isThemeType(value: unknown): value is ThemeTypes {
    return value === "light" || value === "dark";
}

function isDiffOverflow(value: unknown): value is NonNullable<BaseDiffOptions["overflow"]> {
    return value === "scroll" || value === "wrap";
}

function isDiffLayout(value: unknown): value is "split" | "stacked" {
    return value === "split" || value === "stacked";
}

function getDiffStyleForLayout(layout: "split" | "stacked"): NonNullable<BaseDiffOptions["diffStyle"]> {
    return layout === "stacked" ? "unified" : "split";
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
    return escapeHtml(value).replaceAll('"', "&quot;");
}

function renderMarkdownSource(container: HTMLElement, markdownSource: string): void {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.className = "markdown-source";
    code.className = "hljs language-markdown";
    code.innerHTML = hljs.highlight(markdownSource, { language: "markdown" }).value;
    pre.append(code);
    container.append(pre);
}

async function copyLocation(button: HTMLButtonElement, location: string): Promise<void> {
    try {
        if ("clipboard" in navigator) {
            await navigator.clipboard.writeText(location);
        } else {
            throw new Error("Clipboard unavailable");
        }
        setCopyButtonState(button, "Copied!");
    } catch {
        setCopyButtonState(button, "Copy failed");
    }
}

function setCopyButtonState(button: HTMLButtonElement, status: string): void {
    const originalLabel = button.dataset.copyLabel ?? button.getAttribute("aria-label") ?? copyFileNameLabel;
    button.dataset.copyLabel = originalLabel;
    button.setAttribute("aria-label", status);
    button.dataset.tooltip = status;
    button.dataset.copied = status === "Copied!" ? "true" : "false";

    window.setTimeout(() => {
        button.setAttribute("aria-label", originalLabel);
        button.dataset.tooltip = originalLabel;
        delete button.dataset.copied;
    }, 1400);
}

function createCollapseButton({
    container,
    diff,
}: {
    container: HTMLElement;
    diff: FileDiff<ReviewAnnotation>;
}): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "diff-collapse-toggle";
    button.type = "button";
    updateCollapseButtonState(button, container.hasAttribute("data-collapsed"));
    button.innerHTML = collapseChevronSvg;

    button.addEventListener("click", () => {
        const collapsed = !container.hasAttribute("data-collapsed");
        container.toggleAttribute("data-collapsed", collapsed);
        updateCollapseButtonState(button, collapsed);
        diff.setOptions({ ...diff.options, collapsed });
        rerenderDiff(diff);
    });

    return button;
}

function rerenderDiff(diff: FileDiff<ReviewAnnotation>): void {
    const renderState = diffRenderState.get(diff);
    if (!renderState) {
        return;
    }

    diff.render({
        fileDiff: renderState.fileDiff,
        fileContainer: renderState.container,
        forceRender: true,
        lineAnnotations: renderState.lineAnnotations,
    });
}

function updateCollapseButtonState(button: HTMLButtonElement, collapsed: boolean): void {
    button.title = collapsed ? "Expand file" : "Collapse file";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!collapsed));
}

interface ReviewAnnotation {
    path: string;
    line: number;
    severity: string;
    body: string;
}

interface ReviewCommentData extends ReviewAnnotation {
    side: "left" | "right";
}

function getCustomEventValue(event: Event, key: string): unknown {
    if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
        return undefined;
    }

    return event.detail[key];
}

function parseReviewComments(value: string): ReviewCommentData[] {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.filter(isReviewCommentData);
}

function isReviewCommentData(value: unknown): value is ReviewCommentData {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.path === "string" &&
        typeof value.line === "number" &&
        (value.side === "left" || value.side === "right") &&
        typeof value.severity === "string" &&
        typeof value.body === "string"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
