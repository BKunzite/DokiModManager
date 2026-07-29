import {invoke} from '@tauri-apps/api/core';

export function openWebview(name, url) {
    invoke("open_webview", {url: url, name: name.replaceAll(/ /g, '_').toLowerCase()}).then(r => {});
}