import HTMLHelper from "../utils/HTMLHelper";
import Logger from "../utils/Logger";

export const MOD_DOWNLOAD_LIST = import.meta.glob('../../assets/TestSuite/*.json', {eager: true})["../../assets/TestSuite/ModDownloadList.json"].default;

let isActive = false

class TestSuite {
    isActive() {
	return isActive
    }

    setActive(active) {
	isActive = active
    }

    /**
     *
     * @return {{modname: string}}
     */
    getModDownloadList() {
	return MOD_DOWNLOAD_LIST["links"]
    }

    async timeFunction(tag, func) {
	const start = performance.now()
	let value = await func();
	const end = performance.now()

	Logger.info("Function " + tag + " took " + (end - start) + " ms.")

	return value
    }
}

export default new TestSuite()