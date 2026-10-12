gestures.txt: the 3-finger swipe events libinput 1.25 made of a recording of a ThinkPad T14s Gen 2i touchpad
(ELAN0676:00 04F3:3195, `libinput record`, about 23 s: slow drags, flicks and long flings, 20 swipes), made with
`li_replay swipes.yml > gestures.txt` (li_replay.c replays the recording through a uinput device; needs root).
Lines: `B time_us fingers`, `U time_us fingers dx dy dx_unaccel dy_unaccel`, `E time_us cancelled`.
`tools/swipe/real_traces.py gestures.txt ACC UN` turns it into traces (ACC: accelerated, what KWin gives the effect;
UN: unaccelerated, what niri reads). `cpp_swipe --check-real gestures.txt` checks the effect's Unaccelerate against it.
`src/tests/fixtures/swipe_real.json` holds the traces after Unaccelerate with what niri's own gesture code does with
the unaccelerated ones (tools/swipe/ref), for four column layouts (E5 is left out: its swipe 15 lands on the knife-edge between two columns, 0.6% of velocity decides).
