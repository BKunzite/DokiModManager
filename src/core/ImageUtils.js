import { Base64 } from 'js-base64';
import {
    readFile
} from '@tauri-apps/plugin-fs';
export async function getImage(id, covers) {
    const cover = covers[id];

    if (cover !== undefined && cover.includes(":")) {
        const contents = await readFile(cover);
        const base64String = Base64.fromUint8Array(contents);

        return `data:image/png;base64,${base64String}`
    } else if (typeof(id) === "object") {
        const base64String = Base64.fromUint8Array(id);

        return `data:image/png;base64,${base64String}`
    } else if (typeof(id) === "string" && id.includes(":")) {
        const contents = await readFile(id);
        const base64String = Base64.fromUint8Array(contents);

        return `data:image/png;base64,${base64String}`
    } else {
        const images = import.meta.glob('../assets/*.{png,jpg,jpeg,svg,json,webp}', { eager: true, as: 'url' });
        if (cover !== undefined) { return images["../assets/" + cover] } else { return images["../assets/" + id] }
    }
}
