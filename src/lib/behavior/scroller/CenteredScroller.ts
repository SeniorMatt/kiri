// niri's center-focused-column "always": every newly focused column is centered, also when it is already visible
class CenteredScroller {
    public readonly alwaysScroll = true;

    public scrollToColumn(desktop: Desktop, column: Column, previous: Column|null) {
        desktop.scrollCenterRange(column);
    }
}
