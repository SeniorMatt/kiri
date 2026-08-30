tests.register("gestureScroll", 1, () => {
    // snapping
    const columns = [0, 400, 800, 1200];
    Assert.equal(pickSnapTarget(columns, 130, 0, 150), 0);
    Assert.equal(pickSnapTarget(columns, 230, 0, 150), 400);
    // a fast swipe to the right goes on to the next column, a fast swipe back goes to the previous one
    Assert.equal(pickSnapTarget(columns, 130, 2, 150), 400);
    Assert.equal(pickSnapTarget(columns, 650, 2, 150), 800);
    Assert.equal(pickSnapTarget(columns, 390, -2, 150), 0);
    Assert.equal(pickSnapTarget([], 55, 1, 150), 55);

    // easing
    Assert.equal(easeOutCubic(0), 0);
    Assert.equal(easeOutCubic(1), 1);
    Assert.equal(easeOutCubic(2), 1);
    Assert.assert(easeOutCubic(0.5) > 0.5);

    // velocity
    const tracker = new VelocityTracker(100, 120);
    Assert.equal(tracker.getVelocity(0), 0);
    tracker.add(0, 0);
    tracker.add(50, 100);
    tracker.add(100, 300);
    Assert.equal(tracker.getVelocity(110), 3);
    Assert.equal(tracker.getVelocity(500), 0); // fingers rested
    tracker.add(150, 400); // the oldest sample is dropped
    Assert.equal(tracker.getVelocity(150), 3);
    tracker.reset();
    Assert.equal(tracker.getVelocity(150), 0);
});
