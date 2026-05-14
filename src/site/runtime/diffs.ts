import {
    DIFFS_TAG_NAME,
    FileDiff,
    parsePatchFiles,
    type DiffLineAnnotation,
    type FileDiffMetadata,
    type ThemeTypes,
} from "@pierre/diffs";
import { collapseChevronSvg } from "./icons.js";

const diffs: FileDiff<ReviewAnnotation>[] = [];
const currentTheme = getCurrentTheme();
const copyFileNameLabel = "Copy file name to clipboard";

document.addEventListener("theme:selected", (event) => {
    const theme =
        event instanceof CustomEvent && isThemeType(event.detail?.theme) ? event.detail.theme : getCurrentTheme();
    for (const diff of diffs) {
        diff.setThemeType(theme);
    }
});

for (const container of document.querySelectorAll<HTMLElement>(".diff-view")) {
    const patch = decodeURIComponent(container.dataset.patch ?? "");
    const comments = JSON.parse(decodeURIComponent(container.dataset.comments ?? "[]")) as Array<{
        path: string;
        line: number;
        side: "left" | "right";
        severity: string;
        body: string;
    }>;

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

            let diff: FileDiff<ReviewAnnotation>;
            diff = new FileDiff<ReviewAnnotation>({
                collapsed,
                diffStyle: "split",
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
                        fileDiff,
                        lineAnnotations,
                    });
                },
                renderAnnotation(annotation) {
                    const comment = annotation.metadata;
                    const location = `${comment.path}:${comment.line}`;
                    const node = document.createElement("div");
                    node.className = `review-comment ${comment.severity}`;
                    node.style.color = "#171717";
                    node.innerHTML = `<div class="review-comment-header"><strong>${comment.severity}</strong><button class="copy-location-button" type="button" data-location="${escapeAttribute(location)}" data-tooltip="${copyFileNameLabel}" aria-label="${copyFileNameLabel}"><span class="copy-location-icon" aria-hidden="true"></span><span class="sr-only">${copyFileNameLabel}</span></button></div><p>${escapeHtml(comment.body)}</p>`;
                    const button = node.querySelector<HTMLButtonElement>(".copy-location-button");
                    button?.addEventListener("click", () => {
                        void copyLocation(button, location);
                    });
                    return node;
                },
            });
            diffs.push(diff);

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

function isThemeType(value: unknown): value is ThemeTypes {
    return value === "light" || value === "dark";
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
    return escapeHtml(value).replaceAll('"', "&quot;");
}

async function copyLocation(button: HTMLButtonElement, location: string): Promise<void> {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(location);
        } else if (!copyLocationFallback(location)) {
            throw new Error("Clipboard unavailable");
        }
        setCopyButtonState(button, "Copied!");
    } catch {
        if (copyLocationFallback(location)) {
            setCopyButtonState(button, "Copied!");
        } else {
            setCopyButtonState(button, "Copy failed");
        }
    }
}

function copyLocationFallback(location: string): boolean {
    const field = document.createElement("textarea");
    field.value = location;
    field.setAttribute("readonly", "");
    field.style.opacity = "0";
    field.style.position = "fixed";
    field.style.top = "-1px";
    field.style.left = "-1px";
    document.body.append(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);

    try {
        const copyCommand = (document as unknown as { execCommand(commandId: string): boolean }).execCommand;
        return copyCommand.call(document, "copy");
    } finally {
        field.remove();
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
    fileDiff,
    lineAnnotations,
}: {
    container: HTMLElement;
    diff: FileDiff<ReviewAnnotation>;
    fileDiff: FileDiffMetadata;
    lineAnnotations: DiffLineAnnotation<ReviewAnnotation>[];
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
        diff.render({
            fileDiff,
            fileContainer: container,
            forceRender: true,
            lineAnnotations,
        });
    });

    return button;
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
