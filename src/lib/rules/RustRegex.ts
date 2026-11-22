// niri's title and app-id are Rust `regex` crate patterns that match anywhere in the string. RustRegex turns one into a
// JavaScript RegExp (with the u flag) so that a pattern written for niri means the same here: inline flags like (?i),
// \A and \z, (?P<name>...), \x{...}, POSIX classes like [[:alpha:]], \pL, and the punctuation escapes Rust allows.
// What JavaScript cannot express (class intersection, \b{start}, flags that apply to a part of the pattern only) throws
// or, for flags, applies to the whole pattern.
namespace RustRegex {
    const jsSyntax = "^$\\.*+?()[]{}|/";

    const posixClasses: Record<string, string> = {
        alnum: "0-9A-Za-z", alpha: "A-Za-z", ascii: "\\x00-\\x7F", blank: " \\t", cntrl: "\\x00-\\x1F\\x7F",
        digit: "0-9", graph: "!-~", lower: "a-z", print: " -~", punct: "!-\\/:-@\\[-`{-~", space: " \\t\\r\\n\\v\\f",
        upper: "A-Z", word: "0-9A-Za-z_", xdigit: "0-9A-Fa-f",
    };

    const generalCategories = new Set([
        "L", "Lu", "Ll", "Lt", "Lm", "Lo", "LC", "M", "Mn", "Mc", "Me", "N", "Nd", "Nl", "No", "P", "Pc", "Pd", "Ps", "Pe",
        "Pi", "Pf", "Po", "S", "Sm", "Sc", "Sk", "So", "Z", "Zs", "Zl", "Zp", "C", "Cc", "Cf", "Cs", "Co", "Cn",
        "Letter", "Lowercase_Letter", "Uppercase_Letter", "Number", "Decimal_Number", "Punctuation", "Symbol", "Separator",
        "Mark", "Other", "Alphabetic", "White_Space", "Emoji", "Lowercase", "Uppercase", "ASCII", "Any",
    ]);

    function unicodeProperty(name: string, negated: boolean) {
        let property = name;
        if (property.startsWith("^")) {
            negated = !negated;
            property = property.substring(1);
        }
        const eq = property.indexOf("=");
        if (eq < 0 && !generalCategories.has(property)) {
            property = "Script=" + property;
        }
        return (negated ? "\\P{" : "\\p{") + property + "}";
    }

    function hex(code: number) {
        return "\\u{" + code.toString(16) + "}";
    }

    // One escape at `i` (pointing at the backslash). Returns the JavaScript text and the index after it.
    function escape(pattern: string, i: number, inClass: boolean): [string, number] {
        const c = pattern[i + 1];
        if (c === undefined) {
            throw new Error("trailing backslash");
        }
        switch (c) {
        case "A":
            return ["^", i + 2];
        case "z":
            return ["$", i + 2];
        case "a":
            return ["\\x07", i + 2];
        case "x": {
            if (pattern[i + 2] === "{") {
                const end = pattern.indexOf("}", i);
                if (end < 0) {
                    throw new Error("unclosed \\x{");
                }
                return [hex(parseInt(pattern.substring(i + 3, end), 16)), end + 1];
            }
            return ["\\x" + pattern.substr(i + 2, 2), i + 4];
        }
        case "u":
        case "U": {
            const length = c === "u" ? 4 : 8;
            if (pattern[i + 2] === "{") {
                const end = pattern.indexOf("}", i);
                if (end < 0) {
                    throw new Error("unclosed \\u{");
                }
                return [hex(parseInt(pattern.substring(i + 3, end), 16)), end + 1];
            }
            return [hex(parseInt(pattern.substr(i + 2, length), 16)), i + 2 + length];
        }
        case "p":
        case "P": {
            if (pattern[i + 2] === "{") {
                const end = pattern.indexOf("}", i);
                if (end < 0) {
                    throw new Error("unclosed \\p{");
                }
                return [unicodeProperty(pattern.substring(i + 3, end), c === "P"), end + 1];
            }
            return [unicodeProperty(pattern[i + 2], c === "P"), i + 3];
        }
        case "d": case "D": case "w": case "W": case "s": case "S":
        case "n": case "r": case "t": case "f": case "v":
            return ["\\" + c, i + 2];
        case "b": case "B":
            if (inClass) {
                throw new Error("\\b in a class");
            }
            if (pattern[i + 2] === "{") {
                throw new Error("\\b{...} is not supported");
            }
            return ["\\" + c, i + 2];
        case "<":
            return ["\\b(?=\\w)", i + 2];
        case ">":
            return ["\\b(?<=\\w)", i + 2];
        default:
            if (jsSyntax.includes(c) || (inClass && c === "-")) {
                return ["\\" + c, i + 2];
            }
            if (/[0-9A-Za-z]/.test(c)) {
                throw new Error("unsupported escape \\" + c);
            }
            return [c, i + 2]; // an escaped punctuation character is just that character
        }
    }

    // Reads the flags of a group opening at `i` ("(?" already seen at i, i+1). Returns null when it is not a flag group.
    function readFlags(pattern: string, i: number) {
        const match = /^\(\?([imsUuxR]*)(?:-([imsUuxR]*))?([:)])/.exec(pattern.substring(i));
        return match === null ? null : { on: match[1], off: match[2] ?? "", end: match[3], length: match[0].length };
    }

    export function translate(pattern: string): { source: string, flags: string } {
        let flags = "u";
        let verbose = false;
        let out = "";
        let i = 0;
        const n = pattern.length;
        let inClass = false;
        while (i < n) {
            const c = pattern[i];
            if (c === "\\") {
                const [text, next] = escape(pattern, i, inClass);
                out += text;
                i = next;
            } else if (inClass) {
                if (c === "[") {
                    const posix = /^\[:(\^?)([a-z]+):\]/.exec(pattern.substring(i));
                    if (posix === null || posixClasses[posix[2]] === undefined) {
                        throw new Error("nested classes are not supported");
                    }
                    if (posix[1] === "^") {
                        throw new Error("negated POSIX classes are not supported");
                    }
                    out += posixClasses[posix[2]];
                    i += posix[0].length;
                } else if (c === "]") {
                    inClass = false;
                    out += c;
                    i++;
                } else if (c === "&" && pattern[i + 1] === "&" || c === "~" && pattern[i + 1] === "~" || c === "-" && pattern[i + 1] === "-") {
                    throw new Error("class set operations are not supported");
                } else {
                    out += c;
                    i++;
                }
            } else if (c === "[") {
                inClass = true;
                out += c;
                i++;
                if (pattern[i] === "^") {
                    out += "^";
                    i++;
                }
                if (pattern[i] === "]") {
                    out += "\\]"; // a ] right after the opening bracket is a literal
                    i++;
                }
            } else if (c === "(" && pattern[i + 1] === "?") {
                const flagGroup = readFlags(pattern, i);
                if (flagGroup !== null) {
                    for (const flag of flagGroup.on) {
                        if (flag === "i" || flag === "m" || flag === "s") {
                            if (!flags.includes(flag)) {
                                flags += flag;
                            }
                        } else if (flag === "x") {
                            verbose = true;
                        }
                    }
                    out += flagGroup.end === ":" ? "(?:" : "";
                    i += flagGroup.length;
                } else if (pattern.startsWith("(?P<", i) || (pattern.startsWith("(?<", i) && pattern[i + 3] !== "=" && pattern[i + 3] !== "!")) {
                    const nameEnd = pattern.indexOf(">", i);
                    if (nameEnd < 0) {
                        throw new Error("unclosed group name");
                    }
                    out += "("; // names are only for lookups, which a match test never does
                    i = nameEnd + 1;
                } else if (pattern.startsWith("(?:", i)) {
                    out += "(?:";
                    i += 3;
                } else {
                    throw new Error("unsupported group " + pattern.substr(i, 4));
                }
            } else if (verbose && /\s/.test(c)) {
                i++;
            } else if (verbose && c === "#") {
                const end = pattern.indexOf("\n", i);
                i = end < 0 ? n : end + 1;
            } else {
                out += c;
                i++;
            }
        }
        if (inClass) {
            throw new Error("unclosed class");
        }
        return { source: out, flags: flags };
    }

    // The pattern as a RegExp for a search anywhere in a string (never global, so `test` keeps no state)
    export function compile(pattern: string): RegExp {
        const { source, flags } = translate(pattern);
        return new RegExp(source, flags);
    }
}
