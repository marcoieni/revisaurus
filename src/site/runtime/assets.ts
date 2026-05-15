export function publicAssetPath(assetPath: string): string {
    const base = import.meta.env.BASE_URL || "/";
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const normalizedAssetPath = assetPath.replace(/^\/+/, "");

    return `${normalizedBase}${normalizedAssetPath}`;
}

export function publicAssetCssUrl(assetPath: string): string {
    return `url("${publicAssetPath(assetPath).replaceAll('"', '\\"')}")`;
}
