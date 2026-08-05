import {STRINGS} from "./TextUtil";

class HTMLHelperObject {
    // Loading Bar
    #goal_slow_bar = -1
    #current_bar = 0

    CONDITIONALS = {
        OR: "#htmlhelper:modifier:or",
        AND: "#htmlhelper:modifier:and",
    }

    /**
     * Adds 'Hide' From ClassList
     * @param {string} elementId
     */
    hide(elementId) {
        document.getElementById(elementId).classList.add("hide")
    }

    setPinned(pinned) {
        this.toggle("pin-pinned", !pinned)
        this.toggle("pin-unpinned", pinned)
        document.getElementById("pin-holder").classList.toggle("pin-active", !pinned)
        document.getElementById("pin-unpinned").classList.toggle("pin-unpinned-heart", !pinned)
    }

    /**
     * vals can include a modifier
     *
     * by default it is ```HTMLHelper.conditionals.OR```
     *
     * OR condition returns true if any value is null/undefined
     *
     * AND condition returns true only if they are all null/undefined
     * @param vals
     * @returns {boolean}
     */
    isVoid(...vals) {
        let modifier = this.CONDITIONALS.OR;
        const flags = []
        for (const val of vals) {
            switch (val) {
                case null:
                    flags.push(true)
                    break;
                case undefined:
                    flags.push(true)
                    break;
                case STRINGS.EMPTY:
                    flags.push(true)
                    break;
                case this.CONDITIONALS.OR:
                    modifier = val
                    break;
                case this.CONDITIONALS.AND:
                    modifier = val
                    break;
                default:
                    flags.push(false)
                    break;
            }
        }
        if (modifier === this.CONDITIONALS.OR) {
            return flags.includes(true)
        } else {
            return !flags.includes(false)
        }
    }

    /**
     * Removes 'Hide' From ClassList
     * @param {string} elementId
     */
    show(elementId) {
        document.getElementById(elementId).classList.remove("hide")
    }

    /**
     * Adds 'Hide' From ClassList
     * @param {HTMLElement} elementId
     */
    hideElement(element) {
        element.classList.add("hide")
    }

    /**
     * Removes 'Hide' From ClassList
     * @param {string} elementId
     */
    showElement(element) {
        element.classList.remove("hide")
    }

    /**
     * Adds 'Hide' From ClassList
     * @param {String} elementId
     * @returns {boolean}
     */
    isHidden(elementId) {
        return document.getElementById(elementId).classList.contains("hide")
    }

    /**
     * Toggle Whether A Element Is Visible
     * @param {string} elementId
     */
    toggle(elementId, visible= undefined) {
        if ((document.getElementById(elementId).classList.contains("hide") && visible === undefined) || visible === false) {
            this.show(elementId)
        } else {
            this.hide(elementId)
        }
    }

    /**
     * Sets Current Loading Bar Percent
     * @param {number} percent Percent Of The Bar From 0 to 100
     * @param {boolean} isSlowMode Should Slowly Lerp To Value
     */

    setLoadingBar(percent = 0, isSlowMode = false) {
        percent = Math.min(Math.max(percent, 0), 100)

        if (isSlowMode && percent !== 0) {
            this.#goal_slow_bar = percent
        }

        if (isSlowMode && this.#goal_slow_bar > 0) {
            this.#current_bar += (this.#goal_slow_bar - this.#current_bar) * 0.1
            percent = this.#current_bar;
        } else {
            this.#current_bar = percent
            this.#goal_slow_bar = -1
        }

        const width = 125 * (percent / 100)
        document.getElementById("loading-bar-fill").style.width = width + "vh";
    }

    tick() {
        if (this.#goal_slow_bar > 0) {
            this.setLoadingBar(0, true)
        }
    }

}
export default new HTMLHelperObject()