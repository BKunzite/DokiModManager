import {fileTerminator} from "./utils/FileSystem";
import {readDir} from "@tauri-apps/plugin-fs";
import {covers, getImage, lazyDeref, preloadCovers} from "./utils/ImageUtils";
import Hud from "./utils/HTMLHelper";
import dart_sfx from "../assets/dart_sfx.mp3";
import sound_beep from "../assets/select.ogg";
import {getOSType, OS} from "./utils/OSUtil";
import {invoke} from "@tauri-apps/api/core";
import {TranslationUtil} from "./utils/TranslationUtil";
import {HEART_EMPTY, HEART_FULL} from "./Constants";
import {metadata} from "tauri-plugin-fs-pro-api";
import sound_click from "../assets/pageflip.ogg";
import {htmlEscape, STRINGS} from "./utils/TextUtil";
import sound_boop from "../assets/hover.ogg";
import Units from "./utils/Units";
import Logger from "./utils/Logger";

let launchers_list = {}

export class LauncherAbstract {
    list = {}

    constructor(list) {
	this.list = list;
    }

    /**
     * Launcher Abstract Class
     * @returns {{item: HTMLElement, location: String, absolute_location: String, preload: {String: HTMLElement}, isFavorite: Boolean, nameId: String, getOrder: () => Number, preloadImages: () => Promise<void>, getData: () => {}, setAuthor: (author: String) => Promise<void>, getPath: () => Promise<String>,
     *     getName: () => Promise<String>, resetOrder: () => void, setPinned: () => Promise<void>, open: () => Promise<void>,
     *     get_time: () => Promise<Number>, path: () => Promise<void>, setCover: (coverId: String) => Promise<void>, onFavorite: () => Promise<void>, close: () => Promise<void>, leftClick: () => Promise<void>}}
     */
    getFunctions() {
	return this.list;
    }
}

export function addLauncher(name, launcher) {
    launchers_list[name] = launcher;
}

export function getLaunchers() {
    return launchers_list;
}

/**
 *
 * @param name
 * @return {LauncherAbstract | undefined}
 */

export function getLauncher(name) {
    return launchers_list[name]
}

export function clearLaunchers() {
    launchers_list = {}
}