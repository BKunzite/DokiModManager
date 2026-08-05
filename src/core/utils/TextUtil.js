/**
 * REGEX pattern to check for HTML elements
 * @type {RegExp}
 */
const SHOULD_ESCAPE_HTML_PATTERN = /["&'<>]/;
const replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
const replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
const replacePattern3 = /(([a-zA-Z0-9\-\_\.])+@[a-zA-Z\_]+?(\.[a-zA-Z]{2,6})+)/gim;
export const STRINGS = {
    SPACE: " ",
    EMPTY: "",
    isEmpty: (str) => str === STRINGS.EMPTY
}

/**
 * Escapes HTML To Prevent Potential XSS Attacks
 * @param {string} text HTML To Escape
 * @returns {string} Escaped HTML Text
 */
export function htmlEscape(text) {
    let match_case = SHOULD_ESCAPE_HTML_PATTERN.exec(text)
    if (match_case === null) {
        return text;
    }

    const startScan = match_case.index
    const length = text.length
    let string = ""
    let lastIndex = 0;

    for (let i = startScan; i < length; i++) {
        let char = undefined;
        switch (text.charCodeAt(i)) {
            case 34: // Char: "
                char = "&quot;";
                break;
            case 60: // Char: <
                char = "&lt;";
                break;
            case 39: // Char: '
                char = "&#039;";
                break;
            case 62: // Char: >
                char = "&gt;";
                break;
            case 38: // Char: &
                char = "&amp;";
                break;
            default:
                break;
        }

        if (char !== undefined) {
            const slice = text.slice(lastIndex, i);
            string += slice + char;
            lastIndex = i + 1;
        }
    }

    if (lastIndex !== length - 1) {
        string += text.slice(lastIndex, length - 1)
    }

    return string;
}

export function getFormattedDate() {
    const now = new Date();

    return now.getFullYear() + "y_" +
        String(now.getMonth() + 1).padStart(2, '0') + "m_" +
        String(now.getDate()).padStart(2, '0') + "d_" +
        String(now.getHours()).padStart(2, '0') + "h_" +
        String(now.getMinutes()).padStart(2, '0') + "min_" +
        String(now.getSeconds()).padStart(2, '0') + "s";
}

/**
 * Get Text Width
 * @param {string} text Text To Get Width Of
 * @param {string} font Font Name
 * @returns {number} Width Of Text
 */

export function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

export function formatModName(text) {
    return text.replace(/\b(ddlc|renpy7mod|renpy8mod)\b/gi, "").replace(/-/g, " ").replace(/_/g, " ").trim()
}

export function linkify(inputText) {
    let replacedText = inputText.replace(replacePattern1, '<a href="$1" target="_blank" style="cursor: grab;">$1</a>');
    replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2" target="_blank" style="cursor: grab;">$2</a>');
    replacedText = replacedText.replace(replacePattern3, '<a href="mailto:$1" style="cursor: grab;">$1</a>');

    return replacedText;
}

// New HTML Escape Test - Thrown Out For Production
// (function() {
//     const test_case = "<span style=\"font-family: Icon,serif;\">&#62038;</span> Kunzite <span style=\"font-family: Icon,serif; padding-left: 20px;\">&#61966;</span> 60h 60m"
//     const escaped_case = htmlEscape(test_case)
//
//     const false_positive = "hello world!"
//     const false_case = htmlEscape(false_positive)
//
//     console.log(test_case, " | ", escaped_case, " | ", false_positive, " | ", false_case)
//
//     if (escaped_case === test_case) {
// 	throw new Error("Test Case For HTML Escaping Failed - Expected Not " + test_case + "; Got " + escaped_case)
//     } else if (false_positive !== false_case) {
// 	throw new Error("Test Case For HTML Escaping Failed - Expected " + false_positive + "; Got " + false_case)
//     }
//
//     if (SHOULD_ESCAPE_HTML_PATTERN.exec("hello world!") !== null) {
// 	throw new Error("Should Escape HTML Pattern Is Invalid {expect = false, got true}")
//     } else if (SHOULD_ESCAPE_HTML_PATTERN.exec(test_case) === null) {
// 	throw new Error("Should Escape HTML Pattern Is Invalid {expect = true, got false}")
//     }
// })();