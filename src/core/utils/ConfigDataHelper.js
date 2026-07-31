import {invoke} from "@tauri-apps/api/core";
import {CLIENT_THEME_ENUM} from "../Constants"
import {type} from "@tauri-apps/plugin-os";

export class ProgramData {
    #unmappedData = {}

    constructor() {
        this.#unmappedData = {
            coverId: 0,
            totalTime: 0,
            tutorial: false,
            theme: CLIENT_THEME_ENUM[0],
            language: "",
            version: "0.0.0-release",
            bg_offset: 0,
            user_name: ""
        }
    }

    /**
     *
     * @param {"coverId", "totalTime", "tutorial", "theme", "language", "version", "bg_offset", "user_name"} id
     * @returns {*}
     */
    get(id) {
        return this.#unmappedData[id]
    }

    /**
     * @param {"coverId", "totalTime", "tutorial", "theme", "language", "version", "bg_offset", "user_name"} id
     * @param val
     * @returns {ProgramData}
     */
    set(id, val) {
        this.#unmappedData[id] = val
        return this
    }
    /**
     * @param {{coverId: number, totalTime: number, version: string, tutorial: boolean, language: string, bg_offset: number, user_name: string}} map
     * @returns {ProgramData}
     */
    map(map) {
        for (const key in map) {
            this.#unmappedData[key] = map[key]
        }
        return this
    }

    /**
     * @param {"coverId", "totalTime", "tutorial", "theme", "language", "version", "bg_offset", "user_name"} id
     * @param val
     * @returns {ProgramData}
     */
    default(id, val) {
        const data = this.#unmappedData[id]
        if (data === null || data === undefined) {
            this.#unmappedData[id] = val
        }
        return this
    }

    setJSON(jsonData) {
        this.#unmappedData = JSON.parse(jsonData)
    }

    post() {
        return this.#unmappedData
    }

    getJSON() {
        return JSON.stringify(this.#unmappedData, null, "\t")
    }
}