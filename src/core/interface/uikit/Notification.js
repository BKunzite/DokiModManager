import {UIKitInterface} from "./UIKit";
import InterfaceUtil from "../InterfaceUtil";
import {TranslationUtil} from "../../utils/TranslationUtil";
import AssetsManager from "../../manager/AssetsManager";

export class Notification {
    /** @type {UIKitInterface} **/
    kiterface = null;

    constructor(header, text) {
	this.kiterface = new UIKitInterface("notification")
	    .addHeader(header)
	    .addParagraph(text)
	    .createDefaultButtons()
	    .onButton(TranslationUtil.of("close"), () => this.kiterface.close())

	AssetsManager.Sound.play(AssetsManager.Sound.BEEP_SOUND);

	InterfaceUtil.registerInterface(this.kiterface);
    }
}