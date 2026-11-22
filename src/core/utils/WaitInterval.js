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

    /**
     * Self-Clearing waitFor interval
     * @param {(resolve: () => {}) => {}} func
     * @param {number} interval interval in milliseconds
     */

    async waitForPromise(func, interval = 1_000) {
	await new Promise((pResolve) => {
	    let intervalId;
	    let resolve = () => {
		clearInterval(intervalId);
		intervalId = null;
		resolve = null;
		pResolve();
	    }

	    if (HTMLHelper.isFunctionAsync(func)) {
		intervalId = setInterval(async () => await func.call(this, resolve), interval);
	    } else {
		intervalId = setInterval(() => func.call(this, resolve), interval);
	    }
	})
    }

    wait(units, multiplier = 1) {
	return new Promise((resolve) => setTimeout(resolve, units * multiplier));
    }
}

export default new WaitInterval();