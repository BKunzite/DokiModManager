import { getOSType, OS } from "./OSUtil";

export let pathSeparator = getOSType() === OS.TYPE.WINDOWS ? "\\" : "/";
export const INVALID_FOLDER_CHARACTERS = {
  windows: /[<>:"/\\|?*\u0000-\u001F]|[. ]$/,
  linux: /[/\u0000]/,
  macos: /[/:\u0000]/
}
export const INVALID_FOLDER_NAMES = {
  windows: /^(con|prn|aux|nul|com\d|lpt\d)$/i,
  linux: /^(?:\.{1,2})?$/,
  macos: /^(?:\.{1,2})?$/
}
const archiveRegex = /\.(zip|rar|tar|7z|gz)$/i;
const PATH_TEST = {
  unix: /\//g,
  windows: /\\/
}
const encoder = new TextEncoder()

/**
 * Checks if a file name is valid on the current os.
 * @param {string} name Name of the file
 * @returns {boolean} true - valid; false - invalid
 */

export function validateName(name) {
  if (encoder.encode(name).length >= 255) return false
  switch (getOSType()) {
    case OS.TYPE.WINDOWS:
      return !(INVALID_FOLDER_NAMES.windows.test(name) || INVALID_FOLDER_CHARACTERS.windows.test(name))
    case OS.TYPE.LINUX:
      return !(INVALID_FOLDER_NAMES.linux.test(name) || INVALID_FOLDER_CHARACTERS.linux.test(name))
    case OS.TYPE.MAC:
      return !(INVALID_FOLDER_NAMES.macos.test(name) || INVALID_FOLDER_CHARACTERS.macos.test(name))
  }
}

/**
 * Replaces \\\\ with operating-system-specific terminator.
 * @param {string} path
 * @returns {string}
 */

export function terminatePath(path) {
  if (PATH_TEST.windows.test(path)) {
    return path.replace(/\\/g, pathSeparator)
  } else {
    return path.replace(PATH_TEST.unix, pathSeparator)
  }
}

export function supportedModPackage(selectedPath) {
  return archiveRegex.test(selectedPath) ||
    selectedPath.endsWith("scripts.rpa");
}
