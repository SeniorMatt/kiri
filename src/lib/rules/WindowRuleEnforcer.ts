// What the dynamic matchers (is-floating, is-active, is-focused) ask about a window
interface WindowRuleContext {
    isFloating(kwinClient: KwinClient): boolean;
    isActive(kwinClient: KwinClient): boolean;
    isFocused(kwinClient: KwinClient): boolean;
}

// One match line of a rule, with the rule's exclude lines
class RuleMatcher {
    private readonly matcher: ClientMatcher;
    private readonly excludes: RuleMatcher[];

    constructor(
        private readonly match: WindowMatch,
        excludes: WindowMatch[],
        private readonly context: WindowRuleContext,
    ) {
        this.matcher = new ClientMatcher(WindowRuleEnforcer.joinRegexes([WindowRuleEnforcer.getRuleString(match)]));
        this.excludes = excludes.map(exclude => new RuleMatcher(exclude, [], context));
    }

    public matches(kwinClient: KwinClient): boolean {
        const match = this.match;
        return this.matcher.matches(kwinClient) &&
            (match.isFloating === undefined || match.isFloating === this.context.isFloating(kwinClient)) &&
            (match.isActive === undefined || match.isActive === this.context.isActive(kwinClient)) &&
            (match.isFocused === undefined || match.isFocused === this.context.isFocused(kwinClient)) &&
            !this.excludes.some(exclude => exclude.matches(kwinClient));
    }
}

interface RuleEntry {
    matcher: RuleMatcher;
    rule: WindowRule;
}

const noWindowRuleContext: WindowRuleContext = {
    isFloating: () => false,
    isActive: () => false,
    isFocused: () => false,
};

class WindowRuleEnforcer {
    private readonly entries: RuleEntry[];
    private readonly followCaption: RegExp;

    private readonly widthRules: { entry: RuleEntry, width: (tilingAreaWidth: number) => number }[];
    private readonly defaultWidth: ((tilingAreaWidth: number) => number) | null;

    constructor(
        windowRules: WindowRule[],
        private readonly tileFullScreen: boolean,
        defaultColumnWidth = "",
        gapsInnerHorizontal = 0,
        context: WindowRuleContext = noWindowRuleContext,
        private readonly gapsInnerVertical = 0,
    ) {
        this.entries = windowRules.map(rule => ({ matcher: new RuleMatcher(rule, rule.exclude ?? [], context), rule }));
        this.widthRules = [];
        for (const entry of this.entries) {
            if (entry.rule.width === undefined) {
                continue;
            }
            try {
                this.widthRules.push({ entry, width: PresetWidths.parseWidth(entry.rule.width, gapsInnerHorizontal) });
            } catch (error: any) {
                log("invalid width in window rule:", entry.rule.width, error);
            }
        }
        this.defaultWidth = null;
        if (defaultColumnWidth.trim() !== "") {
            try {
                this.defaultWidth = PresetWidths.parseWidth(defaultColumnWidth, gapsInnerHorizontal);
            } catch (error: any) {
                log("invalid defaultColumnWidth:", defaultColumnWidth, error);
            }
        }
        this.followCaption = WindowRuleEnforcer.createFollowCaptionRegex(windowRules);
    }

    private preferTiling(kwinClient: KwinClient) {
        return this.entries.some(entry => entry.rule.tile === true && entry.matcher.matches(kwinClient));
    }

    private preferFloating(kwinClient: KwinClient) {
        return this.entries.some(entry => entry.rule.tile === false && entry.matcher.matches(kwinClient));
    }

    // returns the width a new window's column should get, or null to keep the window's own width
    public getColumnWidth(kwinClient: KwinClient, tilingAreaWidth: number): number | null {
        for (const rule of this.widthRules) {
            if (rule.entry.matcher.matches(kwinClient)) {
                return rule.width(tilingAreaWidth);
            }
        }
        return this.defaultWidth === null ? null : this.defaultWidth(tilingAreaWidth);
    }

    // niri's default-window-height: the first matching rule's height for a new tiled window, null when none sets one
    public getWindowHeight(kwinClient: KwinClient, tilingAreaHeight: number): number | null {
        const size = this.getSizeString(kwinClient, "height");
        return size === null ? null : WindowRuleEnforcer.resolveSize(size, tilingAreaHeight, this.gapsInnerVertical);
    }

    // Size of a new window that a float rule (niri's open-floating) matches, in pixels of the work area; a side that no
    // rule sets is undefined. Null when no float rule matches, so the window is left alone.
    public getFloatingSize(kwinClient: KwinClient, area: QmlRect): { width?: number, height?: number } | null {
        if (!this.preferFloating(kwinClient)) {
            return null;
        }
        const width = this.getSizeString(kwinClient, "width");
        const height = this.getSizeString(kwinClient, "height");
        return {
            width: width === null ? undefined : WindowRuleEnforcer.resolveSize(width, area.width, 0) ?? undefined,
            height: height === null ? undefined : WindowRuleEnforcer.resolveSize(height, area.height, 0) ?? undefined,
        };
    }

    // niri's open-fullscreen; the last matching rule that has the property wins
    public shouldOpenFullScreen(kwinClient: KwinClient): boolean {
        let result = false;
        for (const entry of this.entries) {
            if (entry.rule.fullscreen !== undefined && entry.matcher.matches(kwinClient)) {
                result = entry.rule.fullscreen;
            }
        }
        return result;
    }

    private getSizeString(kwinClient: KwinClient, side: "width" | "height"): string | null {
        for (const entry of this.entries) {
            const size = entry.rule[side];
            if (size !== undefined && entry.matcher.matches(kwinClient)) {
                return size;
            }
        }
        return null;
    }

    private static resolveSize(size: string, available: number, spacing: number): number | null {
        try {
            return PresetWidths.parseWidth(size, spacing)(available);
        } catch (error: any) {
            log("invalid size in window rule:", size, error);
            return null;
        }
    }

    public shouldTile(kwinClient: KwinClient) {
        return this.preferTiling(kwinClient) || (
            kwinClient.normalWindow &&
            !kwinClient.transient &&
            !kwinClient.modal &&
            kwinClient.managed &&
            kwinClient.pid > -1 &&
            (!kwinClient.fullScreen || this.tileFullScreen) &&
            !this.preferFloating(kwinClient)
        );
    }

    // Why `shouldTile` / `canTileEver` refuse a window, for the log (empty when nothing does)
    public whyNotTiled(kwinClient: KwinClient) {
        const reasons: string[] = [];
        if (!(kwinClient.moveable && kwinClient.resizeable) && !kwinClient.fullScreen) {
            reasons.push(`moveable=${kwinClient.moveable} resizeable=${kwinClient.resizeable}`);
        }
        if (kwinClient.popupWindow) {
            reasons.push("popup window");
        }
        if (Clients.isProhibitedClass(kwinClient)) {
            reasons.push("prohibited class");
        }
        if (this.preferTiling(kwinClient)) {
            return reasons.join(", ");
        }
        if (!kwinClient.normalWindow) {
            reasons.push("not a normal window");
        }
        if (kwinClient.transient) {
            reasons.push("transient");
        }
        if (kwinClient.modal) {
            reasons.push("modal");
        }
        if (!kwinClient.managed) {
            reasons.push("not managed");
        }
        if (kwinClient.pid <= -1) {
            reasons.push("no pid");
        }
        if (kwinClient.fullScreen && !this.tileFullScreen) {
            reasons.push("full-screen and tileFullScreen is off");
        }
        if (this.preferFloating(kwinClient)) {
            reasons.push("a float rule matches");
        }
        return reasons.join(", ");
    }

    public initClientSignalManager(world: World, kwinClient: KwinClient) {
        if (!this.followCaption.test(kwinClient.resourceClass)) {
            return null;
        }

        const enforcer = this;
        const manager = new SignalManager();
        manager.connect(kwinClient.captionChanged, () => {
            const shouldTile = Clients.canTileNow(kwinClient) && enforcer.shouldTile(kwinClient);
            world.do((clientManager, desktopManager) => {
                const desktop = desktopManager.getDesktopForClient(kwinClient);
                if (shouldTile && desktop !== undefined) {
                    clientManager.tileKwinClient(kwinClient, desktop.grid);
                } else {
                    clientManager.floatKwinClient(kwinClient);
                }
            });
        });
        return manager;
    }

    private static createFollowCaptionRegex(windowRules: WindowRule[]) {
        const followCaptionRegexes: string[] = [];
        for (const windowRule of windowRules) {
            if (windowRule.tile === undefined) {
                continue;
            }
            const ruleClass = WindowRuleEnforcer.parseRegex(windowRule.class);
            if (WindowRuleEnforcer.parseRegex(windowRule.caption) !== ".*") {
                followCaptionRegexes.push(ruleClass);
            }
        }
        return WindowRuleEnforcer.joinRegexes(followCaptionRegexes);
    }

    public static getRuleString(windowRule: WindowMatch) {
        return ClientMatcher.getRuleString(
            WindowRuleEnforcer.wrapParens(WindowRuleEnforcer.parseRegex(windowRule.class)),
            WindowRuleEnforcer.wrapParens(WindowRuleEnforcer.parseRegex(windowRule.caption)),
        );
    }

    private static parseRegex(rawRule: string | undefined) {
        if (rawRule === undefined || rawRule === "" || rawRule === ".*") {
            return ".*";
        } else {
            return rawRule;
        }
    }

    public static joinRegexes(regexes: string[]) {
        if (regexes.length === 0) {
            return new RegExp("a^"); // match nothing
        }

        if (regexes.length === 1) {
            return new RegExp("^(" + regexes[0] + ")$");
        }

        const joinedRegexes = regexes.map(WindowRuleEnforcer.wrapParens).join("|");
        return new RegExp("^(" + joinedRegexes + ")$");
    }

    private static wrapParens(str: string) {
        return "(" + str + ")";
    }
}
