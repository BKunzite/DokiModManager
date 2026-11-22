import {UIKitInterface} from "./UIKit";
import InterfaceUtil from "../InterfaceUtil";
import {TranslationUtil} from "../../utils/TranslationUtil";
import AssetsManager from "../../manager/AssetsManager";

export class Notification {
    /** @type {UIKitInterface} **/
    kiterface = null;
    #interactListener = []

    constructor(header, text, confirmation = false) {
	this.kiterface = new UIKitInterface("notification")
	    .addHeader(header)
	    .addParagraph(text)

	if (confirmation) {
	    this.kiterface
		.createButton(TranslationUtil.of("no"))
		.createButton(TranslationUtil.of("yes"), true)
		.onButton(TranslationUtil.of("yes"), () => {
		    for (const listener of Object.values(this.#interactListener)) {
			listener(true);
		    }
		    this.kiterface.close()
		})
		.onButton(TranslationUtil.of("no"), () => {
		    for (const listener of Object.values(this.#interactListener)) {
			listener(false);
		    }
		    this.kiterface.close()
		})
	} else {
	    this.kiterface
		.createButton(TranslationUtil.of("close"))
		.onButton(TranslationUtil.of("close"), () => {
		    for (const listener of Object.values(this.#interactListener)) {
			listener(false);
		    }
		    this.kiterface.close()
		})
	}



	AssetsManager.Sound.play(AssetsManager.Sound.BEEP_SOUND);

	InterfaceUtil.registerInterface(this.kiterface);
    }

    listen(listener) {
	this.#interactListener.push(listener);
    }
}