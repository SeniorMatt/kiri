// niri's per-workspace and per-output `layout {}`: global layout, then the output's, then the desktop's; the later one
// wins field by field
// the settings are JSON objects of Kiri's own config keys: desktopLayouts by desktop name, outputOverrides by output
// (connector or "Make Model Serial"); only the keys of niri's LayoutPart count
interface LayoutProfile {
    desktop: Desktop.Config;
    layout: LayoutConfig;
    presetWidths: { cycle: (column: Column, forwards: boolean) => void, getWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number[] };
    presetHeights: { getOrdered: (tilingAreaHeight: number) => number[] };
    columnResizer: Actions.ColumnResizer;
    defaultColumnWidth: ((tilingAreaWidth: number) => number) | null;
    look: WindowDecorationRule | null;
    fullscreenBackdropColor: string | undefined;
    backgroundColor: string | undefined;
}

class LayoutProfiles {
    public static readonly KEYS = /^(gapsInnerHorizontal|gapsInnerVertical|gapsOuter(Top|Bottom|Left|Right)|presetWidths|presetHeights|defaultColumnWidth|scrolling(Lazy|Centered|Grouped|OnOverflow)|alwaysCenterSingleColumn|maximizeSingleColumn|tabbedColumnsByDefault|tabIndicator.*|focusRing.*|border.*|shadow.*|backgroundColor|fullscreenBackdropColor)$/;
    private static readonly LOOK_BANDS = ["focusRing", "border"] as const;

    private readonly base: LayoutProfile;
    private readonly desktops = new Map<string, Record<string, any>>();
    private readonly outputs: { id: string, layout: Record<string, any> }[] = [];
    private readonly cache = new Map<string, LayoutProfile>();

    constructor(private readonly config: Config, private readonly build: (config: Config) => LayoutProfile) {
        this.base = build(config);
        const desktopLayouts = LayoutProfiles.parseObject(config.desktopLayouts);
        for (const name of Object.keys(desktopLayouts)) {
            this.desktops.set(name.toLowerCase(), LayoutProfiles.pick(desktopLayouts[name]));
        }
        const outputOverrides = LayoutProfiles.parseObject(config.outputOverrides);
        for (const id of Object.keys(outputOverrides)) {
            const entry = outputOverrides[id];
            if (entry !== null && typeof entry === "object") {
                this.outputs.push({ id: id.toLowerCase(), layout: LayoutProfiles.pick(entry.layout) });
            }
        }
    }

    public static parseObject(text: string): Record<string, any> {
        if (text.trim() === "") {
            return {};
        }
        try {
            const parsed = JSON.parse(text);
            return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (error: any) {
            log("failed to parse a layout override:", error);
            return {};
        }
    }

    private static pick(layout: any): Record<string, any> {
        const result: Record<string, any> = {};
        if (layout !== null && typeof layout === "object") {
            for (const key of Object.keys(layout)) {
                if (LayoutProfiles.KEYS.test(key)) {
                    result[key] = layout[key];
                }
            }
        }
        return result;
    }

    public isEmpty() {
        return this.desktops.size === 0 && this.outputs.length === 0;
    }

    public getBase() {
        return this.base;
    }

    public resolve(desktopName: string, outputIds: string[]): LayoutProfile {
        if (this.isEmpty()) {
            return this.base;
        }
        const ids = outputIds.map(id => id.toLowerCase());
        const key = desktopName.toLowerCase() + "|" + ids.join("|");
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        let merged: Record<string, any> = {};
        for (const output of this.outputs) {
            if (ids.includes(output.id)) {
                merged = Object.assign(merged, output.layout);
                break;
            }
        }
        merged = Object.assign(merged, this.desktops.get(desktopName.toLowerCase()) ?? {});
        let profile = this.base;
        if (Object.keys(merged).length > 0) {
            profile = this.build(Object.assign({}, this.config, merged));
            profile.look = LayoutProfiles.lookOf(merged);
            profile.fullscreenBackdropColor = merged["fullscreenBackdropColor"];
            profile.backgroundColor = merged["backgroundColor"];
        }
        this.cache.set(key, profile);
        return profile;
    }

    public hasLooks() {
        const sets = [...this.desktops.values(), ...this.outputs.map(output => output.layout)];
        return sets.some(set => Object.keys(set).some(key => /^(focusRing|border|shadow|tabIndicator(Active|Inactive|Urgent)|fullscreenBackdrop)/.test(key)));
    }

    private static lookOf(set: Record<string, any>): WindowDecorationRule | null {
        const rule: Record<string, any> = {};
        const take = (group: string, prefix: string, fields: string[]) => {
            const out: Record<string, any> = {};
            for (const field of fields) {
                const value = set[prefix + field.charAt(0).toUpperCase() + field.slice(1)];
                if (value !== undefined) {
                    out[field] = value;
                }
            }
            if (Object.keys(out).length > 0) {
                rule[group] = out;
            }
        };
        const bandFields = ["enabled", "width", "useAccent", "activeColor", "inactiveColor", "urgentColor", "activeGradient", "inactiveGradient", "urgentGradient"];
        for (const band of LayoutProfiles.LOOK_BANDS) {
            take(band, band, bandFields);
        }
        take("shadow", "shadow", ["enabled", "offsetX", "offsetY", "softness", "spread", "drawBehindWindow", "color", "inactiveColor"]);
        take("tabIndicator", "tabIndicator", ["activeColor", "inactiveColor", "urgentColor", "activeGradient", "inactiveGradient", "urgentGradient"]);
        if (set["fullscreenBackdropColor"] !== undefined) {
            rule["fullscreenBackdropColor"] = set["fullscreenBackdropColor"];
        }
        return Object.keys(rule).length === 0 ? null : rule as WindowDecorationRule;
    }

    public static outputIds(screen: Output | undefined, name: string): string[] {
        const ids = [name];
        const s = screen as any;
        if (s !== undefined && s !== null && (s.manufacturer || s.model || s.serialNumber)) {
            ids.push([s.manufacturer, s.model, s.serialNumber].map(part => part ? String(part) : "Unknown").join(" "));
        }
        return ids;
    }
}
