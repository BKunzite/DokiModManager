import {UIKitInterface} from "./UIKit";
import InterfaceUtil from "../InterfaceUtil";
import {TranslationUtil} from "../../utils/TranslationUtil";
import AssetsManager from "../../manager/AssetsManager";
import programData from "../../utils/ConfigDataHelper";
import SeasonsManager from "../../seasonal/SeasonsManager";
import {CURRENT} from "../../Constants";
import {CURRENT_BRANCH} from "../../VersionHandler";
import BRANCHES from "../../enum/BRANCHES";
import TestSuite from "../../manager/TestSuite";

export class OptionsPanel {
    /** @type {UIKitInterface} **/
    kiterface = null;

    constructor() {
	let shouldReload = false
	this.kiterface = new UIKitInterface("options")
	    .addHeader("Options")
	    .createDefaultButtons()
	    .addToggle("Sound", programData.getOr("sound", true), async (val) => {
		await programData.set("sound", val.target.checked).save();
		if (SeasonsManager.SEASON.CHRISTMAS === CURRENT.SEASON) {
		    if (programData.getOr("sound", true) && programData.getOr("seasons", true)) {
			SeasonsManager.focus(CURRENT.SEASON);
		    } else {
			SeasonsManager.unfocus(CURRENT.SEASON);
		    }
		}
	    })
	    .addToggle("Seasons", programData.getOr("seasons", true), async (val) => {
		await programData
		    .set("seasons", val.target.checked)
		    .save();
		shouldReload = true
	    })
	    .addToggle("Performance Mode", programData.getOr("performant", false), async (val) => {
		await programData
		    .set("performant", val.target.checked)
		    .save();
		shouldReload = true
	    })
	    .onButton(TranslationUtil.of("close"), () => this.kiterface.close())
	    .onClose(() => {
		if (shouldReload) {
		    document.location.reload();
		}
	    })

	if (CURRENT_BRANCH === BRANCHES.DEV.PUBLIC) {
	    this.kiterface.createButton("Run Test Suite", true)
		.onButton("Run Test Suite", () => {
		    TestSuite.setActive(true)
		    this.kiterface.close()
		})
	}

	AssetsManager.Sound.play(AssetsManager.Sound.BOOP_SOUND);

	InterfaceUtil.registerInterface(this.kiterface);
    }
}