import {
    DIFFS_TAG_NAME,
    FileDiff,
    parsePatchFiles,
    type DiffLineAnnotation,
    type FileDiffMetadata,
} from "@pierre/diffs";

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
                    const node = document.createElement("div");
                    node.className = `review-comment ${comment.severity}`;
                    node.style.color = "#171717";
                    node.innerHTML = `<strong>${comment.severity}</strong><p>${escapeHtml(comment.body)}</p>`;
                    return node;
                },
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

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
    button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"/></svg>`;

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
    severity: string;
    body: string;
}
