// niri's SizeChange (set-column-width, set-window-width, set-window-height): "50%" and "800" set a size,
// "+10%" and "-100" change it. Percentages are shares of the working area, pixels are logical pixels.
class SizeChange {
    private constructor(
        public readonly percent: boolean,
        public readonly relative: boolean,
        public readonly value: number,
    ) {}

    // `px` suffixes ("800px") are accepted too; undefined if the text is not a size change
    public static parse(text: string): SizeChange|undefined {
        let str = text.trim();
        const percent = str.endsWith("%");
        if (percent) {
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith("px")) {
            str = str.substring(0, str.length - 2);
        }
        str = str.trim();
        if (!/^[+-]?\d+(\.\d+)?$/.test(str) || (!percent && str.includes("."))) {
            return undefined;
        }
        return new SizeChange(percent, str.startsWith("+") || str.startsWith("-"), parseFloat(str));
    }

    // a comma-separated list; an entry that does not parse stays in its place as undefined, so the numbering of the
    // slots holds
    public static parseList(text: string): (SizeChange|undefined)[] {
        return text.trim() === "" ? [] : text.split(",").map(entry => SizeChange.parse(entry));
    }

    // the size after the change, where `current` is the size now and `full` the size of 100 % (the area plus one gap,
    // so that proportions leave the gaps out like niri's); `gap` is taken off a proportion that is set
    public resolve(current: number, full: number, gap: number) {
        if (this.percent) {
            return this.relative ? current + Math.round(full * this.value / 100) : Math.floor(full * this.value / 100 - gap);
        }
        return this.relative ? current + this.value : this.value;
    }
}
