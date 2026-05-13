import { parsePatchFiles } from "@pierre/diffs";

interface ReviewAnnotation {
    path: string;
    line: number;
    side: "left" | "right";
    severity: string;
    body: string;
}

interface RenderedLine {
    type: "context" | "addition" | "deletion" | "hunk";
    oldLine?: number;
    newLine?: number;
    content: string;
    comments: ReviewAnnotation[];
}

for (const container of document.querySelectorAll<HTMLElement>(".diff-view")) {
    const patch = decodeURIComponent(container.dataset.patch ?? "");
    const comments = JSON.parse(decodeURIComponent(container.dataset.comments ?? "[]")) as ReviewAnnotation[];
    const parsed = parsePatchFiles(patch);
    const fragment = document.createDocumentFragment();

    for (const patchSet of parsed) {
        for (const fileDiff of patchSet.files) {
            const fileComments = comments.filter(
                (comment) => comment.path === fileDiff.name || comment.path === fileDiff.prevName,
            );
            const file = document.createElement("section");
            file.className = "diff-file";
            file.innerHTML = `<header class="diff-file-header"><span>${escapeHtml(fileDiff.name)}</span><small>${fileDiff.prevObjectId ?? ""}${fileDiff.newObjectId ? ` -> ${fileDiff.newObjectId}` : ""}</small></header>`;

            const table = document.createElement("table");
            table.className = "diff-table";
            table.append(...renderFileLines(fileDiff, fileComments).flatMap(renderLine));
            file.append(table);
            fragment.append(file);
        }
    }

    container.replaceChildren(fragment);
}

function renderFileLines(
    fileDiff: ReturnType<typeof parsePatchFiles>[number]["files"][number],
    comments: ReviewAnnotation[],
): RenderedLine[] {
    const lines: RenderedLine[] = [];

    for (const hunk of fileDiff.hunks) {
        let oldLine = hunk.deletionStart;
        let newLine = hunk.additionStart;

        lines.push({
            type: "hunk",
            content: hunk.hunkSpecs?.trim() ?? "",
            comments: [],
        });

        for (const part of hunk.hunkContent) {
            if (part.type === "context") {
                for (let index = 0; index < part.lines; index += 1) {
                    const content = fileDiff.additionLines[part.additionLineIndex + index] ?? "";
                    lines.push({
                        type: "context",
                        oldLine,
                        newLine,
                        content,
                        comments: [
                            ...commentsFor(comments, "left", oldLine),
                            ...commentsFor(comments, "right", newLine),
                        ],
                    });
                    oldLine += 1;
                    newLine += 1;
                }
                continue;
            }

            for (let index = 0; index < part.deletions; index += 1) {
                const content = fileDiff.deletionLines[part.deletionLineIndex + index] ?? "";
                lines.push({
                    type: "deletion",
                    oldLine,
                    content,
                    comments: commentsFor(comments, "left", oldLine),
                });
                oldLine += 1;
            }

            for (let index = 0; index < part.additions; index += 1) {
                const content = fileDiff.additionLines[part.additionLineIndex + index] ?? "";
                lines.push({
                    type: "addition",
                    newLine,
                    content,
                    comments: commentsFor(comments, "right", newLine),
                });
                newLine += 1;
            }
        }
    }

    return lines;
}

function renderLine(line: RenderedLine): HTMLTableRowElement[] {
    const row = document.createElement("tr");
    row.className = `diff-line ${line.type}`;

    if (line.type === "hunk") {
        row.innerHTML = `<td class="line-number"></td><td class="line-number"></td><td class="marker"></td><td class="code">${escapeHtml(line.content)}</td>`;
        return [row];
    }

    row.innerHTML = `
        <td class="line-number">${line.oldLine ?? ""}</td>
        <td class="line-number">${line.newLine ?? ""}</td>
        <td class="marker">${line.type === "addition" ? "+" : line.type === "deletion" ? "-" : ""}</td>
        <td class="code">${escapeHtml(line.content.replace(/\n$/, ""))}</td>
    `;

    const commentRows = line.comments.map((comment) => {
        const commentRow = document.createElement("tr");
        commentRow.className = "diff-annotation-row";
        commentRow.innerHTML = `<td></td><td></td><td></td><td>${renderComment(comment)}</td>`;
        return commentRow;
    });

    return [row, ...commentRows];
}

function commentsFor(comments: ReviewAnnotation[], side: ReviewAnnotation["side"], line: number): ReviewAnnotation[] {
    return comments.filter((comment) => comment.side === side && comment.line === line);
}

function renderComment(comment: ReviewAnnotation): string {
    return `<div class="review-comment ${escapeHtml(comment.severity)}"><strong>${escapeHtml(comment.severity)}</strong><p>${escapeHtml(comment.body)}</p></div>`;
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
