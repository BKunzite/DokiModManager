import {isDir} from "tauri-plugin-fs-pro-api";
import {readDir} from "@tauri-apps/plugin-fs";

class Option {
    #content = null;
    #result = null;

    /**
     * @param content
     * @param {function} validify
     */

    constructor(content, validify = () => true) {
	if (content === null) {
	    return;
	}

	const validResult = validify.call(this);
	if (validResult !== null && validResult !== undefined) {
	    this.#content = content;
	    this.#result = validResult;
	}
    }

    /**
     * @return {boolean}
     */
    isSome() {
	return this.#content !== null && this.#result !== null;
    }

    getInput() {
	if (this.isNone()) {
	    throw new Error("Cannot get value of None");
	}

	return this.#content
    }

    getResult() {
	if (this.isNone()) {
	    throw new Error("Cannot get value of None");
	}

	return this.#result
    }

    isNone() {
	return !this.isSome();
    }
}

class ReadDirOption extends Option {
    #readDirPromise;

    constructor(content) {
        super(content);
	if (super.isSome()) {
	    this.#readDirPromise = new Promise(async (resolve) => {
		const data = readDir(super.getInput());
		resolve(data);
	    });
	}
    }

    /**
     * @return {DirEntry[]}
     */

    async getResult() {
	if (super.isNone()) {
	    throw new Error("Cannot get value of None");
	}

	return await this.#readDirPromise;
    }
}

export default class Optional {
    /**
     * @param {string} path
     * @returns {Promise<ReadDirOption>}
     */
    static async readDir(path) {
	const isPathValid = await isDir(path);
	if (isPathValid) {
	    return new ReadDirOption(path);
	} else {
	    return new ReadDirOption(null);
	}
    }

    static of(content) {
	return new Option(content);
    }

    /**
     * WILL NOT WORK WITH ASYNC FUNCTIONS!
     * @param content
     * @param {() => *} isValid
     * @return {Option}
     */

    static validOf(content, isValid = () => true) {
	return new Option(content, isValid);
    }

    /**
     * @param content
     * @param {() => Promise<*>} isValid
     * @return {Option}
     */

    static async asyncValidOf(content, isValid = async () => true) {
	if (content !== null && content !== undefined) {
	    const contentResult = await isValid.call(this)
	    return new Option(content, () => contentResult);
	} else {
	    return new Option(null);
	}
    }

    static none() {
	return new Option(null);
    }
}