declare const process: {
    exit(code?: number): void,
    argv: string[];
    env: Record<string, string | undefined>;
    hrtime(): [number, number];
};
