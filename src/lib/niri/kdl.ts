// Minimal KDL reader, enough for niri's config.kdl: comments, /- slashdash, quoted and raw strings, properties.
namespace Kdl {
    export interface Node {
        name: string;
        args: string[];
        props: Record<string, string>;
        children: Node[];
    }

    interface Token {
        kind: string; // "s" word, "q" quoted string, "/-", "\n", or one of { } ; =
        value: string;
    }

    const rawStringStart = /r(#*)"/y;
    const wordRegex = /[^\s{};="/\\]+(?:\/(?!\*|\/)[^\s{};="/\\]*)*/y;

    function tokenize(text: string): Token[] {
        const tokens: Token[] = [];
        let i = 0;
        const n = text.length;
        while (i < n) {
            const c = text[i];
            if (text.startsWith("//", i)) {
                const end = text.indexOf("\n", i);
                i = end < 0 ? n : end;
            } else if (text.startsWith("/*", i)) {
                let depth = 1;
                i += 2;
                while (i < n && depth > 0) {
                    if (text.startsWith("/*", i)) {
                        depth++;
                        i += 2;
                    } else if (text.startsWith("*/", i)) {
                        depth--;
                        i += 2;
                    } else {
                        i++;
                    }
                }
            } else if (text.startsWith("/-", i)) {
                tokens.push({ kind: "/-", value: "" });
                i += 2;
            } else if (c === "\n") {
                tokens.push({ kind: "\n", value: "" });
                i++;
            } else if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === "﻿") {
                i++;
            } else if (c === "\\" && (text[i + 1] === "\n" || text[i + 1] === "\r")) {
                const end = text.indexOf("\n", i);
                i = end < 0 ? n : end + 1; // line continuation
            } else if (c === "{" || c === "}" || c === ";" || c === "=") {
                tokens.push({ kind: c, value: "" });
                i++;
            } else if (c === "(") { // type annotation like (u8)
                const end = text.indexOf(")", i);
                i = end < 0 ? n : end + 1;
            } else {
                rawStringStart.lastIndex = i;
                const raw = rawStringStart.exec(text);
                if (raw !== null) {
                    const bodyStart = i + raw[0].length;
                    const closing = '"' + raw[1];
                    let end = text.indexOf(closing, bodyStart);
                    if (end < 0) {
                        end = n;
                    }
                    tokens.push({ kind: "q", value: text.substring(bodyStart, end) });
                    i = end + closing.length;
                } else if (c === '"') {
                    let j = i + 1;
                    let out = "";
                    while (j < n && text[j] !== '"') {
                        if (text[j] === "\\") {
                            j++;
                            const escaped = text[j];
                            out += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped ?? "";
                        } else {
                            out += text[j];
                        }
                        j++;
                    }
                    tokens.push({ kind: "q", value: out });
                    i = j + 1;
                } else {
                    wordRegex.lastIndex = i;
                    const word = wordRegex.exec(text);
                    if (word === null) {
                        i++;
                        continue;
                    }
                    tokens.push({ kind: "s", value: word[0] });
                    i += word[0].length;
                }
            }
        }
        return tokens;
    }

    function parseNodes(tokens: Token[], start: number): { nodes: Node[], pos: number } {
        const nodes: Node[] = [];
        let pos = start;
        while (pos < tokens.length && tokens[pos].kind !== "}") {
            let kind = tokens[pos].kind;
            if (kind === "\n" || kind === ";") {
                pos++;
                continue;
            }
            const skip = kind === "/-";
            if (skip) {
                pos++;
            }
            if (pos >= tokens.length) {
                break;
            }
            const node: Node = { name: tokens[pos].value, args: [], props: {}, children: [] };
            pos++;
            while (pos < tokens.length && tokens[pos].kind !== "\n" && tokens[pos].kind !== ";" && tokens[pos].kind !== "}") {
                kind = tokens[pos].kind;
                if (kind === "/-") {
                    pos++;
                    if (pos >= tokens.length) {
                        break;
                    }
                    if (tokens[pos].kind === "{") {
                        pos = parseNodes(tokens, pos + 1).pos + 1;
                    } else if (pos + 1 < tokens.length && tokens[pos + 1].kind === "=") {
                        pos += 3;
                    } else {
                        pos++;
                    }
                } else if (kind === "{") {
                    const inner = parseNodes(tokens, pos + 1);
                    node.children = inner.nodes;
                    pos = inner.pos + 1;
                    break; // the node ends with its children
                } else if (pos + 2 < tokens.length && tokens[pos + 1].kind === "=") {
                    node.props[tokens[pos].value] = tokens[pos + 2].value;
                    pos += 3;
                } else {
                    node.args.push(tokens[pos].value);
                    pos++;
                }
            }
            if (!skip) {
                nodes.push(node);
            }
        }
        return { nodes, pos };
    }

    export function parse(text: string): Node[] {
        return parseNodes(tokenize(text), 0).nodes;
    }

    export function find(nodes: Node[], name: string): Node[] {
        return nodes.filter(node => node.name === name);
    }

    // the last node with that name (later ones win in niri)
    export function child(node: Node|undefined, name: string): Node|undefined {
        const found = node === undefined ? [] : find(node.children, name);
        return found.length > 0 ? found[found.length - 1] : undefined;
    }
}
