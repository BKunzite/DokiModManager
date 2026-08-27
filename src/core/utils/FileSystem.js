import { getOSType, OS } from "./OSUtil";

export let fileTerminator = getOSType() === OS.TYPE.WINDOWS ? "\\" : "/";
const archiveRegex = /\.(zip|rar|tar|7z|gz)$/i;

/**
 * Replaces \\\\ with operating-system-specific terminator.
 * @param {string} path
 * @returns {string}
 */

export function terminatePath(path) {
  return path.replace(/\\/g, fileTerminator);
}

export function supportedModPackage(selectedPath) {
  return archiveRegex.test(selectedPath) ||
    selectedPath.endsWith("scripts.rpa");
}
