tests.register("DndEdgeScroll zone", 1, () => {
    // niri dnd_scroll_gesture_scroll: a 30 px zone on each side of a 1000 px working area
    Assert.equal(DndEdgeScroll.normalizedDelta(500, 0, 1000, 30), 0);
    Assert.equal(DndEdgeScroll.normalizedDelta(0, 0, 1000, 30), -1);
    Assert.equal(DndEdgeScroll.normalizedDelta(15, 0, 1000, 30), -0.5);
    Assert.equal(DndEdgeScroll.normalizedDelta(30, 0, 1000, 30), 0);
    Assert.equal(DndEdgeScroll.normalizedDelta(1000, 0, 1000, 30), 1);
    Assert.equal(DndEdgeScroll.normalizedDelta(985, 0, 1000, 30), 0.5);
    Assert.equal(DndEdgeScroll.normalizedDelta(1200, 0, 1000, 30), 1); // outside: clamped
    Assert.equal(DndEdgeScroll.normalizedDelta(115, 100, 1000, 30), -0.5); // offset working area
    Assert.equal(DndEdgeScroll.normalizedDelta(0, 0, 1000, 0), 0); // trigger-width 0: off
    Assert.equal(DndEdgeScroll.normalizedDelta(100, 0, 200, 500), 0); // zone clamped to half: the very middle
});
