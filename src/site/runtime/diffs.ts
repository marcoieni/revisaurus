import { FileDiff, parsePatchFiles } from "@pierre/diffs";

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
            const element = document.createElement("div");
            const diff = new FileDiff<ReviewAnnotation>({
                diffStyle: "split",
                renderAnnotation(annotation) {
                    const comment = annotation.metadata;
                    const node = document.createElement("div");
                    node.className = `review-comment ${comment.severity}`;
                    node.innerHTML = `<strong>${comment.severity}</strong><p>${escapeHtml(comment.body)}</p>`;
                    return node;
                },
            });

            diff.render({
                fileDiff,
                fileContainer: element,
                lineAnnotations: comments
                    .filter((comment) => comment.path === fileDiff.name || comment.path === fileDiff.prevName)
                    .map((comment) => ({
                        lineNumber: comment.line,
                        side: comment.side === "right" ? "additions" : "deletions",
                        metadata: {
                            severity: comment.severity,
                            body: comment.body,
                        },
                    })),
            });
            fragment.append(element);
        }
    }

    container.replaceChildren(fragment);
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

interface ReviewAnnotation {
    severity: string;
    body: string;
}
