import {Base64} from 'js-base64';
import {
    readFile
} from '@tauri-apps/plugin-fs';

let cache = {}

function createURL(contents, fileName) {
    let blob = new Blob([contents], {type: 'image/' + fileName.split('.').pop()});
    const url = URL.createObjectURL(blob);
    blob = null
    return url;
}

/**
 * Get An Image Based On A List Of Covers
 *
 * @example ```javascript
 * let covers = ["cover.png", "cover2.png"];
 * let image = document.createElement("img");
 * let src_url = await getImage(0, covers); // blob url for "cover.png"
 *
 * image.src = src_url; // Sets Image
 * ```
 *
 * @param id
 * @param covers
 * @returns {Promise<string>}
 */

export async function getImage(id, covers = []) {
    const cover = covers[id];
    if (cover !== undefined && cover.includes(":")) {
        const contents = await readFile(cover);
        return createURL(contents, cover)
    } else if (typeof (id) === "object") {
        const base64String = Base64.fromUint8Array(id);
        return `data:image/png;base64,${base64String}`
    } else if (typeof (id) === "string" && id.includes(":")) {
        const contents = await readFile(id);
        return createURL(contents, id)
    } else {
        const images = import.meta.glob('../assets/**/*.{png,jpg,jpeg,svg,json,webp}', {eager: true, as: 'url'});
        if (cover !== undefined) {
            return images["../assets/" + cover]
        } else {
            return images["../assets/" + id]
        }
    }
}

// CACHE
// export async function getImage(id, covers = []) {
//     const cover = covers[id];
//     if (cache[id]) {
//         return cache[id]
//     }
//     if (cover !== undefined && cover.includes(":")) {
//         const contents = await readFile(cover);
//         cache[id] = createURL(contents, cover)
//         return cache[id]
//     } else if (typeof (id) === "object") {
//         if (cache[id] === undefined) {
//             const base64String = Base64.fromUint8Array(id);
//             cache[id] = `data:image/png;base64,${base64String}`
//         }
//
//         return cache[id]
//     } else if (typeof (id) === "string" && id.includes(":")) {
//         if (cache[id] === undefined) {
//             const contents = await readFile(id);
//             cache[id] = createURL(contents, id)
//         }
//
//         return cache[id]
//     } else {
//         if (cache[id] === undefined) {
//             const images = import.meta.glob('../assets/**/*.{png,jpg,jpeg,svg,json,webp}', {eager: true, as: 'url'});
//             cache[id] = cover === undefined ? cache[id] = images["../assets/" + id] : cache[id] = images["../assets/" + cover]
//         }
//
//         return cache[id]
//     }
// }