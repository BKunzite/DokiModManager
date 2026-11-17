import {UIKitInterface} from "./uikit/UIKit";

let interfaces = {}

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
    }

    isExist(id) {
	return interfaces[id] !== undefined;
    }
}

export default new InterfaceUtil();