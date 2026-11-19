// Added for the local macOS fixes, 2026-11-19.
import {mkdir, readFile, writeFile} from "@tauri-apps/plugin-fs";
import {decodeImage, imageMimeType} from "./ImageFormat.js";

// Copy into the image library; never move or overwrite the selected originals.
export async function importImages(paths, directory) {
    const imported = [];
    const errors = [];
    for (const path of paths) {
        try {
            if (!imageMimeType(path)) throw new Error("Unsupported image format");
            const bytes = await readFile(path);
            await decodeImage(bytes, path);
            await mkdir(directory, {recursive: true});
            const name = `image-${crypto.randomUUID()}.${path.split(".").pop().toLowerCase()}`;
            const destination = `${directory}/${name}`;
            await writeFile(destination, bytes, {createNew: true});
            imported.push(destination);
        } catch (error) {
            errors.push(`${path}: ${error}`);
        }
    }
    return {imported, errors};
}
