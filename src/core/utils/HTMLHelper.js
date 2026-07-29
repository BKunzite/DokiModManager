
class HTMLHelperObject {
    // Loading Bar
    #goal_slow_bar = -1
    #current_bar = 0

    /**
     * Adds 'Hide' From ClassList
     * @param {string} elementId
     */
    hide(elementId) {
        document.getElementById(elementId).classList.add("hide")
    }

    /**
     * Removes 'Hide' From ClassList
     * @param {string} elementId
     */
    show(elementId) {
        document.getElementById(elementId).classList.remove("hide")
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