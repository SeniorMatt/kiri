class ClientMatcher {
    private readonly regex: RegExp;

    constructor(regex: RegExp) {
        this.regex = regex;
    }

    public matches(kwinClient: KwinClient) {
        // a rule's class matches the window's resourceClass or its resourceName
        return this.regex.test(ClientMatcher.getClientString(kwinClient)) ||
            this.regex.test(ClientMatcher.getRuleString(kwinClient.resourceName, kwinClient.caption));
    }

    public static getClientString(kwinClient: KwinClient) {
        return ClientMatcher.getRuleString(kwinClient.resourceClass, kwinClient.caption);
    }

    public static getRuleString(ruleClass: string, ruleCaption: string) {
        return ruleClass + "\0" + ruleCaption;
    }
}
