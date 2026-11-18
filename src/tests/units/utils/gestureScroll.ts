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

// niri's animations block for the view: the release settles with horizontal-view-movement, whatever it is configured to
tests.register("niriAnimation: springs, easings, off and slowdown (niri's animations block)", 1, () => {
    const close = (a: number, b: number, message: string) => Assert.assert(Math.abs(a - b) < 1e-6, { message: `${message}: ${a} vs ${b}` });
    // the default is the spring that used to be hard-coded
    const spring = new NiriSpring(0, 100, 50, 1, 800, 0.0001);
    const def = niriAnimation("spring 1 800 0.0001", "off", 0, 100, 50);
    Assert.equal(def.duration, spring.duration);
    close(def.value(0.1), spring.value(0.1), "default spring");
    // slowdown 2: twice as long
    close(niriAnimation("spring 1 800 0.0001", "off", 0, 100, 0, 2).duration, 2 * new NiriSpring(0, 100, 0, 1, 800, 0.0001).duration, "slowed spring");
    // easings
    const expo = niriAnimation("ease-out-expo 150", "off", 0, 100, 0);
    close(expo.duration, 0.15, "duration");
    close(expo.value(0.075), 100 * (1 - Math.pow(2, -5)), "ease-out-expo at half time");
    Assert.equal(expo.value(0.15), 100, { message: "at the end it is at the target, whatever the curve gives at 1" });
    close(niriAnimation("linear 200", "off", 0, 100, 0).value(0.05), 25, "linear");
    close(niriAnimation("ease-out-quad 100", "off", 0, 1, 0).value(0.05), 0.75, "ease-out-quad");
    close(niriAnimation("ease-out-cubic 100", "off", 0, 1, 0).value(0.05), 0.875, "ease-out-cubic");
    Assert.assert(Math.abs(niriAnimation("cubic-bezier 100 0.25 0.1 0.25 1", "off", 0, 1, 0).value(0.05) - 0.8024) < 1e-4, { message: "CSS ease at half time" });
    Assert.equal(niriAnimation("ease-out-expo 150", "off", 0, 100, 0, 3).duration, 0.45, { message: "an easing lasts slowdown times as long" });
    // off, and text that is not understood
    const off = niriAnimation("off", "spring 1 800 0.0001", 0, 100, 0);
    Assert.equal(off.duration, 0);
    Assert.equal(off.value(0.001), 100);
    Assert.equal(niriAnimation("garbage", "linear 80", 0, 100, 0).duration, 0.08, { message: "the fallback" });
    Assert.equal(niriViewAnimation({ animHorizontalViewMovement: "linear 80", animationsOff: true, animationsSlowdown: 1 }, 0, 100, 0).duration, 0, { message: "off turns all of them off" });
});
