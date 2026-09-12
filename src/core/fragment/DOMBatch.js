import Hud from "../utils/HTMLHelper";
import Logger from "../utils/Logger";

class BatchObj {
    #frag = document.createDocumentFragment();
    #element = null;

    /**
     * @param {HTMLElement} element
     */
    constructor(element) {
        this.#element = element;
    }

    /**
     * @param {HTMLElement} element
     * @returns {BatchObj}
     */
    append(element) {
        this.#frag.appendChild(element);
        return this;
    }

    finalize() {
        this.#element.appendChild(this.#frag);
        this.#frag = null;
        this.#element = null;
    }
}

class DOMBatchObj {
    /**
     * @param {HTMLElement | string} elementObj
     * @param {(frag: DocumentFragment) => void | Promise<void>} func
     */
    batchRender(elementId, func) {
        const elementObj = typeof elementId === "string"
            ? Hud.ofId(elementId)
            : elementId;
        const frag = document.createDocumentFragment();

        if (elementObj === null) {
            Logger.error("DOMBatch: Element not found!");
            return;
        }

        if (func.constructor.name === "AsyncFunction") {
            func(frag).then(() => elementObj.appendChild(frag));
        } else {
            func.call(this, frag);
            elementObj.appendChild(frag);
        }
    }

    /**
     * @param {HTMLElement | string} elementObj
     * @returns {BatchObj | null} batch
     */
    inline(element) {
        const elementObj = typeof element === "string"
            ? Hud.ofId(element)
            : element;
        if (elementObj === null) {
            Logger.error("DOMBatch: Element '" + element + "' not found!");
            return null;
        }
        return new BatchObj(elementObj);
    }
}

const DOMBatch = new DOMBatchObj();
export default DOMBatch;
