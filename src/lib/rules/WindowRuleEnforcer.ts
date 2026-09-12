class WindowRuleEnforcer {
    private readonly preferFloating: ClientMatcher;
    private readonly preferTiling: ClientMatcher;
    private readonly followCaption: RegExp;

    private readonly widthRules: { matcher: ClientMatcher, width: (tilingAreaWidth: number) => number }[];
    private readonly defaultWidth: ((tilingAreaWidth: number) => number) | null;

    constructor(
        windowRules: WindowRule[],
        private readonly tileFullScreen: boolean,
        defaultColumnWidth = "",
        gapsInnerHorizontal = 0,
    ) {
        this.widthRules = [];
        for (const rule of windowRules) {
            if (rule.width === undefined) {
                continue;
            }
            try {
                this.widthRules.push({
                    matcher: new ClientMatcher(WindowRuleEnforcer.joinRegexes([WindowRuleEnforcer.getRuleString(rule)])),
                    width: PresetWidths.parseWidth(rule.width, gapsInnerHorizontal),
                });
            } catch (error: any) {
                log("invalid width in window rule:", rule.width, error);
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

        const [floatRegex, tileRegex, followCaptionRegex] = WindowRuleEnforcer.createWindowRuleRegexes(windowRules);
        this.preferFloating = new ClientMatcher(floatRegex);
        this.preferTiling = new ClientMatcher(tileRegex);
        this.followCaption = followCaptionRegex;
    }

    // returns the width a new window's column should get, or null to keep the window's own width
    public getColumnWidth(kwinClient: KwinClient, tilingAreaWidth: number): number | null {
        for (const rule of this.widthRules) {
            if (rule.matcher.matches(kwinClient)) {
                return rule.width(tilingAreaWidth);
            }
        }
        return this.defaultWidth === null ? null : this.defaultWidth(tilingAreaWidth);
    }

    public shouldTile(kwinClient: KwinClient) {
        return this.preferTiling.matches(kwinClient) || (
            kwinClient.normalWindow &&
            !kwinClient.transient &&
            !kwinClient.modal &&
            kwinClient.managed &&
            kwinClient.pid > -1 &&
            (!kwinClient.fullScreen || this.tileFullScreen) &&
            !this.preferFloating.matches(kwinClient)
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
        if (this.preferTiling.matches(kwinClient)) {
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
        if (this.preferFloating.matches(kwinClient)) {
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

    private static createWindowRuleRegexes(windowRules: WindowRule[]) {
        const floatRegexes: string[] = [];
        const tileRegexes: string[] = [];
        const followCaptionRegexes: string[] = [];
        for (const windowRule of windowRules) {
            const ruleClass = WindowRuleEnforcer.parseRegex(windowRule.class);
            const ruleCaption = WindowRuleEnforcer.parseRegex(windowRule.caption);
            const ruleString = ClientMatcher.getRuleString(
                WindowRuleEnforcer.wrapParens(ruleClass),
                WindowRuleEnforcer.wrapParens(ruleCaption),
            );

            if (windowRule.tile === undefined) {
                continue;
            }
            (windowRule.tile ? tileRegexes : floatRegexes).push(ruleString);
            if (ruleCaption !== ".*") {
                followCaptionRegexes.push(ruleClass);
            }
        }

        return [
            WindowRuleEnforcer.joinRegexes(floatRegexes),
            WindowRuleEnforcer.joinRegexes(tileRegexes),
            WindowRuleEnforcer.joinRegexes(followCaptionRegexes),
        ];
    }

    private static getRuleString(windowRule: WindowRule) {
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

    private static joinRegexes(regexes: string[]) {
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
