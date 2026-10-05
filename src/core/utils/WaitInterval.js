import HTMLHelper from "./HTMLHelper";

class WaitInterval {
    /**
     * Self-Clearing waitFor interval
     * @param {(resolve: () => {}) => {}} func
     * @param {number} interval interval in milliseconds
     */

    waitFor(func, interval = 1_000) {
	let intervalId;
	let resolve = () => {
	    clearInterval(intervalId);
	    intervalId = null;
	    resolve = null;
	}

	if (HTMLHelper.isFunctionAsync(func)) {
	    intervalId = setInterval(async () => await func.call(this, resolve), interval);
	} else {
	    intervalId = setInterval(() => func.call(this, resolve), interval);
	}
    }
}

export default new WaitInterval();