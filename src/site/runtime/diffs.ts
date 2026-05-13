import { FileDiff, parsePatchFiles, type FileDiffMetadata, type FileDiffOptions } from "@pierre/diffs";

type DiffStyle = "split" | "unified";

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
    const patchFiles = parsed.flatMap((patchSet) => patchSet.files);
    let diffStyle: DiffStyle = "split";

    const toolbar = createDiffToolbar(diffStyle, (nextStyle) => {
        diffStyle = nextStyle;
        renderFiles();
        updateToolbar(toolbar, diffStyle);
    });
    const filesContainer = document.createElement("div");
    filesContainer.className = "diff-files";

    container.replaceChildren(toolbar, filesContainer);
    renderFiles();

    function renderFiles(): void {
        const fragment = document.createDocumentFragment();

        for (const fileDiff of patchFiles) {
            const element = document.createElement("section");
            element.className = "diff-file";
            const diff = new FileDiff<ReviewAnnotation>(createDiffOptions(diffStyle));

            diff.render({
                fileDiff,
                fileContainer: element,
                lineAnnotations: annotationsForFile(fileDiff),
            });
            fragment.append(element);
        }

        filesContainer.replaceChildren(fragment);
    }

    function annotationsForFile(fileDiff: FileDiffMetadata): Array<{
        lineNumber: number;
        side: "additions" | "deletions";
        metadata: ReviewAnnotation;
    }> {
        return comments
            .filter((comment) => comment.path === fileDiff.name || comment.path === fileDiff.prevName)
            .map((comment) => ({
                lineNumber: comment.line,
                side: comment.side === "right" ? "additions" : "deletions",
                metadata: {
                    severity: comment.severity,
                    body: comment.body,
                },
            }));
    }
}

function createDiffOptions(diffStyle: DiffStyle): FileDiffOptions<ReviewAnnotation> {
    return {
        diffStyle,
        theme: "pierre-dark",
        themeType: "dark",
        diffIndicators: "bars",
        hunkSeparators: "line-info",
        lineDiffType: "word-alt",
        overflow: "scroll",
        collapsedContextThreshold: 18,
        expansionLineCount: 20,
        renderAnnotation(annotation) {
            const comment = annotation.metadata;
            const node = document.createElement("div");
            node.className = `review-comment ${comment.severity}`;
            node.innerHTML = `<strong>${comment.severity}</strong><p>${escapeHtml(comment.body)}</p>`;
            return node;
        },
    };
}

function createDiffToolbar(diffStyle: DiffStyle, onChange: (diffStyle: DiffStyle) => void): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "diff-toolbar";
    toolbar.setAttribute("role", "radiogroup");
    toolbar.setAttribute("aria-label", "Diff layout");

    for (const option of [
        { style: "split" as const, label: "Split", icon: "split" },
        { style: "unified" as const, label: "Stacked", icon: "stacked" },
    ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "diff-layout-button";
        button.dataset.diffStyle = option.style;
        button.setAttribute("role", "radio");
        button.innerHTML = `<span class="diff-layout-icon ${option.icon}" aria-hidden="true"></span><span>${option.label}</span>`;
        button.addEventListener("click", () => onChange(option.style));
        toolbar.append(button);
    }

    updateToolbar(toolbar, diffStyle);
    return toolbar;
}

function updateToolbar(toolbar: HTMLElement, diffStyle: DiffStyle): void {
    for (const button of toolbar.querySelectorAll<HTMLButtonElement>(".diff-layout-button")) {
        const active = button.dataset.diffStyle === diffStyle;
        button.classList.toggle("active", active);
        button.setAttribute("aria-checked", String(active));
    }
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

interface ReviewAnnotation {
    severity: string;
    body: string;
}
