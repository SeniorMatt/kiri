class PresetWidths {
    private readonly presets: ((tilingAreaWidth: number) => number)[];

    constructor(presetWidths: string, spacing: number) {
        this.presets = PresetWidths.parsePresetWidths(presetWidths, spacing);
    }

    // like niri's toggle_width: after a preset was applied, the next press goes by index, however the client rounded
    // the size; otherwise the first preset that is more than 1 px (fractional scaling allowance) past the current width
    public cycle(column: Column, forwards: boolean) {
        const widths = this.getWidths(column.getMinWidth(), column.getMaxWidth(), column.grid.desktop.tilingArea.width);
        const len = widths.length;
        if (len === 0) {
            return;
        }
        const current = column.getWidth();
        let index = column.getPresetIndex();
        if (index !== undefined && index < len) {
            index = (index + (forwards ? 1 : len - 1)) % len;
        } else if (forwards) {
            index = widths.findIndex(width => current + 1 < width);
            if (index < 0) {
                index = 0;
            }
        } else {
            index = len - 1;
            while (index >= 0 && !(widths[index] + 1 < current)) {
                index--;
            }
            if (index < 0) {
                index = len - 1;
            }
        }
        column.setWidth(widths[index], true);
        column.setPresetIndex(index, widths);
    }

    public next(currentWidth: number, minWidth: number, maxWidth: number, tilingAreaWidth: number) {
        const widths = this.getWidths(minWidth, maxWidth, tilingAreaWidth);
        const nextIndex = widths.findIndex(width => width > currentWidth);
        return nextIndex >= 0 ? widths[nextIndex] : widths[0];
    }

    public prev(currentWidth: number, minWidth: number, maxWidth: number, tilingAreaWidth: number) {
        const widths = this.getWidths(minWidth, maxWidth, tilingAreaWidth).reverse();
        const nextIndex = widths.findIndex(width => width < currentWidth);
        return nextIndex >= 0 ? widths[nextIndex] : widths[0];
    }

    // the presets in the order they were configured, not sorted and not clamped (niri cycles through them by index)
    public getOrdered(tilingAreaWidth: number) {
        return this.presets.map(f => f(tilingAreaWidth));
    }

    public getWidths(minWidth: number, maxWidth: number, tilingAreaWidth: number) {
        const widths = this.presets.map(f => clamp(f(tilingAreaWidth), minWidth, maxWidth));
        widths.sort((a, b) => a - b);
        return uniq(widths);
    }

    private static parsePresetWidths(presetWidths: string, spacing: number): ((tilingAreaWidth: number) => number)[] {
        return presetWidths.split(",").map(widthStr => PresetWidths.parseWidth(widthStr, spacing));
    }

    // parses a single size like "50%", "800px" or "0.5" into a function of the available space; throws if invalid
    public static parseWidth(widthStr: string, spacing: number): (tilingAreaWidth: number) => number {
        function getRatioFunction(ratio: number) {
            return (tilingAreaWidth: number) => Math.floor((tilingAreaWidth + spacing) * ratio - spacing);
        }

        widthStr = widthStr.trim();

        const widthPx = PresetWidths.parseNumberWithSuffix(widthStr, "px");
        if (widthPx !== undefined) {
            return () => widthPx;
        }

        const widthPct = PresetWidths.parseNumberWithSuffix(widthStr, "%");
        if (widthPct !== undefined) {
            return getRatioFunction(widthPct / 100.0);
        }

        return getRatioFunction(PresetWidths.parseNumberSafe(widthStr));
    }

    private static parseNumberSafe(str: string) {
        const num = Number(str);
        if (isNaN(num) || num <= 0) {
            throw new Error("Invalid number: " + str);
        }
        return num;
    }

    private static parseNumberWithSuffix(str: string, suffix: string) {
        if (!str.endsWith(suffix)) {
            return undefined;
        }
        return PresetWidths.parseNumberSafe(str.substring(0, str.length-suffix.length).trim());
    }
}
