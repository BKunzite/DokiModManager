import Hud from "../../utils/HTMLHelper";
import DOMBatch from "../../fragment/DOMBatch";
import {TranslationUtil} from "../../utils/TranslationUtil";

export class UIKitInterface {
    #id = ""
    /**
     * @type {HTMLDivElement}
     */
    #panel = null
    /**
     * @type {HTMLDivElement}
     */
    #scrollarea = null
    /**
     * @type {HTMLDivElement}
     */
    #buttons = null

    #buttonList = {}
    #buttonListeners = {}
    #pendingForRemoval = false
    #closeListeners = []
    #toggleList = {}
    #toggleListeners = {}

    get pendingForRemoval() {
        return this.#pendingForRemoval;
    }

    constructor(id) {
        this.#id = id;
        DOMBatch.batchRender(Hud.ofId("uikit"), (frag) => {
            this.#panel = document.createElement("div");
            this.#scrollarea = document.createElement("div");
            this.#buttons = document.createElement("div");

            this.#panel.classList.add("uikit-panel", "hide", "smooth-hide");
            this.#scrollarea.classList.add("uikit-scroll");
            this.#buttons.classList.add("uikit-buttons");

            setTimeout(() => {
                this.#panel.classList.remove("hide");
            }, 10)

            frag.appendChild(this.#panel);
            this.#panel.appendChild(this.#scrollarea);
            this.#panel.appendChild(this.#buttons);
        })
    }

    createDefaultButtons() {
        this.createButton(TranslationUtil.of("close"));
        return this;
    }

    addHeader(text) {
        let p = document.createElement("header");
        p.classList.add("uikit-headerwidget");
        p.textContent = text;
        this.#scrollarea.appendChild(p);
        return this;
    }

    addParagraph(text) {
        let p = document.createElement("header");
        p.classList.add("uikit-textwidget");
        p.textContent = text;
        this.#scrollarea.appendChild(p);
        return this;
    }

    /**
     * @param {string} text
     * @param {boolean} enabled
     * @param {(value: Event) => void | Promise<Event>} funct
     * @return {UIKitInterface}
     */

    addToggle(text, enabled = true, funct) {
       DOMBatch.batchRender(this.#scrollarea, (frag) => {
           let bg = document.createElement("div")
           let toggle = document.createElement("input")

           toggle.type = "checkbox"
           toggle.checked = enabled
           toggle.classList.add("uikit-toggle")
           toggle.addEventListener("change", funct)

           this.#toggleList[text.toLowerCase()] = toggle
           this.#toggleListeners[text.toLowerCase()] = funct

           bg.classList.add("uikit-toggle-bg")

           let label = document.createElement("label")
           label.classList.add("uikit-toggle-label")
           label.textContent = text

           bg.appendChild(label)
           bg.appendChild(toggle)
           frag.appendChild(bg)
       })
        return this;
    }

    /**
     * Add Listener to Close Event
     * @param {() => {}} listener
     */

    onClose(listener) {
        this.#closeListeners.push(listener);
        return this;
    }

    /**
     * Create Button (elementId = text)
     * @param {string} text
     * @param isHighlight
     * @returns UIKitInterface
     */

    createButton(text, isHighlight = false) {
        let button = document.createElement("button");
        button.classList.add("uikit-button");

        if (isHighlight) {
            button.classList.add("uikit-makeup-button-highlight");
        }

        button.textContent = text;
        this.#buttons.appendChild(button);
        this.#buttonList[text.toLowerCase()] = button;
        return this;
    }

    /**
     * Listen to Button Click
     * @param {String} id
     * @param {() => {}} event
     * @returns UIKitInterface
     */

    onButton(id, event) {
        id = id.toLowerCase()
        let button = this.#buttonList[id];
        this.#buttonListeners[id] = button;
        button.addEventListener("click", event);
        return this;
    }

    close() {
        if (this.#pendingForRemoval) return;
        for (const listener of this.#closeListeners) {
            try {
                listener();
            } catch (e) {
                console.error("Error in UIKit Close Listener: ", e);
            };
        }

        this.#pendingForRemoval = true;

        for (const id in this.#buttonListeners) {
            this.#buttonList[id].removeEventListener("click", this.#buttonListeners[id]);
        }

        for (const id in this.#toggleListeners) {
            this.#toggleList[id].removeEventListener("click", this.#toggleListeners[id]);
        }

        this.#panel.classList.add("hide");
        setTimeout(() => {
            this.#panel.remove();
        }, 1000)
    }

    get id() {
        return this.#id;
    }
}