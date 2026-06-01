import {createApp} from "vue";
import Desktop from "../Desktop.vue";

export const CLIENT_VERSION = "2.6.1-beta@1AjD1"
const VERSION_URL = "https://raw.githubusercontent.com/BKunzite/DokiModManager/refs/heads/main/current_ver_beta.txt"

// Gets The Current Client Version From GitHub

export async function getLatest() {
    try {
        const response = await fetch(VERSION_URL)

        if (!response.ok) {
            console.warn(`Client Version Check Failed! Returned Status ${response.status}`)
            return CLIENT_VERSION;
        }

        const version = await response.text();
        return version.trim()
    } catch (error) {
        console.warn(`Client Version Check Failed! Error with: ${error}`)
    }
    return CLIENT_VERSION;
}

export async function shouldUpdate() {
    let newest_version = await getLatest();

    return newest_version.split("\n")[0] !== CLIENT_VERSION;
}