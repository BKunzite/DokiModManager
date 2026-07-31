import {getOSType, OS} from "./OSUtil";

export let fileTerminator = getOSType() === OS.TYPE.WINDOWS ? "\\" : "/"

/**
 * Replaces \\\\ with operating-system-specific terminator.
 * @param {string} path
 * @returns {string}
 */

export function terminatePath(path) {
    return path.replace(/\\/g, fileTerminator);
}

