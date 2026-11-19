// Added for the local macOS fixes, 2026-11-19.
const imageTypes = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff"
};

export function imageMimeType(path) {
    return imageTypes[path.split(".").pop().toLowerCase()];
}

export async function decodeImage(bytes, path) {
    const type = imageMimeType(path);
    if (!type) throw new Error("Unsupported image format");
    const url = URL.createObjectURL(new Blob([bytes], {type}));
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty image");
    } finally {
        URL.revokeObjectURL(url);
    }
}
