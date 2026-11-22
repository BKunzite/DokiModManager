import {UIKitInterface} from "./uikit/UIKit";
import HTMLHelper from "../utils/HTMLHelper";

let interfaces = {}
let blur = null

/**
 *
 * @param {UIKitInterface} oInterface
 */

class InterfaceUtil {
    registerInterface(oInterface) {
	if (interfaces[oInterface.id] !== undefined) {
	    interfaces[oInterface.id].close()
	}

	interfaces[oInterface.id] = oInterface;
	activateBlur()
    }

    unregisterInterface(oInterface) {
	if (HTMLHelper.isVoid(interfaces[oInterface.id])) return;
	delete interfaces[oInterface.id];
	deactivateBlur()
    }

    isExist(id) {
	return interfaces[id] !== undefined;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    blur = HTMLHelper.ofId("uikit_blur")
})

function activateBlur() {
    HTMLHelper.showElement(blur)
}

function deactivateBlur() {
    if (Object.keys(interfaces).length === 0) HTMLHelper.hideElement(blur)
}

export default new InterfaceUtil();