interface WindowRule {
    class: string | undefined;
    caption: string | undefined;
    tile?: boolean; // omit to leave the tiling decision to Kiri (useful for rules that only set a width)
    width?: string; // column width for new windows, like "50%" or "800px"
}
