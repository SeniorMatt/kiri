// Replays a `libinput record` yml through a uinput device into a real libinput and prints the gesture events.
// usage (needs /dev/uinput): li_replay swipes.yml > gestures.txt
#include <fcntl.h>
#include <linux/uinput.h>
#include <sys/ioctl.h>
#include <libinput.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>

struct ev { long long t; int type, code, value; };
static struct ev *evs; static int nev, cap;
static int bits[8][1024]; static int absinfo[64][5]; static int absset[64];
static int props[32], nprops; static char name[256]; static int id[4];

static void add(long long t, int ty, int c, int v) { if (nev == cap) { cap = cap ? cap * 2 : 4096; evs = realloc(evs, cap * sizeof *evs); } evs[nev++] = (struct ev){t, ty, c, v}; }

static void parse(const char *p)
{
    FILE *f = fopen(p, "r"); char line[512]; int sect = 0, curtype = -1; int in_events = 0;
    while (fgets(line, sizeof line, f)) {
        int a, b, c, d, e; long long s, us; int ty, co, va;
        if (!in_events) {
            if (sscanf(line, " name: \"%255[^\"]\"", name) == 1) continue;
            if (sscanf(line, " id: [%d, %d, %d, %d]", &id[0], &id[1], &id[2], &id[3]) == 4) continue;
            if (strstr(line, "codes:")) { sect = 1; continue; }
            if (strstr(line, "absinfo:")) { sect = 2; continue; }
            if (strstr(line, "properties:") && !strstr(line, "udev")) { char *q = strchr(line, '['); if (q) { q++; while (*q && *q != ']') { props[nprops++] = strtol(q, &q, 10); while (*q == ',' || *q == ' ') q++; } } sect = 0; continue; }
            if (strstr(line, "  events:")) { in_events = 1; continue; }
            if (sect == 1 && sscanf(line, " %d: [", &curtype) == 1) { char *q = strchr(line, '['); q++; while (*q && *q != ']') { int v = strtol(q, &q, 10); if (curtype < 8 && v < 1024) bits[curtype][v] = 1; while (*q == ',' || *q == ' ') q++; } continue; }
            if (sect == 2 && sscanf(line, " %d: [%d, %d, %d, %d, %d]", &a, &b, &c, &d, &e, &va) >= 5 && a < 64) { absinfo[a][0] = b; absinfo[a][1] = c; absinfo[a][2] = d; absinfo[a][3] = e; sscanf(line, " %*d: [%*d, %*d, %*d, %*d, %d]", &absinfo[a][4]); absset[a] = 1; continue; }
        } else if (sscanf(line, " - [ %lld, %lld, %d, %d, %d]", &s, &us, &ty, &co, &va) == 5) {
            add(s * 1000000LL + us, ty, co, va);
        }
    }
    fclose(f);
}
static int open_r(const char *path, int flags, void *u) { int fd = open(path, flags); return fd < 0 ? -errno : fd; }
static void close_r(int fd, void *u) { close(fd); }
static const struct libinput_interface iface = { open_r, close_r };
static long long mono_us(void) { struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return ts.tv_sec * 1000000LL + ts.tv_nsec / 1000; }

static void drain(struct libinput *li)
{
    libinput_dispatch(li);
    struct libinput_event *e;
    while ((e = libinput_get_event(li))) {
        enum libinput_event_type t = libinput_event_get_type(e);
        if (t == LIBINPUT_EVENT_GESTURE_SWIPE_BEGIN) { struct libinput_event_gesture *g = libinput_event_get_gesture_event(e); printf("B %llu %d\n", (unsigned long long)libinput_event_gesture_get_time_usec(g), libinput_event_gesture_get_finger_count(g)); }
        else if (t == LIBINPUT_EVENT_GESTURE_SWIPE_UPDATE) { struct libinput_event_gesture *g = libinput_event_get_gesture_event(e); printf("U %llu %d %.5f %.5f %.5f %.5f\n", (unsigned long long)libinput_event_gesture_get_time_usec(g), libinput_event_gesture_get_finger_count(g), libinput_event_gesture_get_dx(g), libinput_event_gesture_get_dy(g), libinput_event_gesture_get_dx_unaccelerated(g), libinput_event_gesture_get_dy_unaccelerated(g)); }
        else if (t == LIBINPUT_EVENT_GESTURE_SWIPE_END) { struct libinput_event_gesture *g = libinput_event_get_gesture_event(e); printf("E %llu %d\n", (unsigned long long)libinput_event_gesture_get_time_usec(g), libinput_event_gesture_get_cancelled(g)); }
        libinput_event_destroy(e);
    }
}

int main(int argc, char **argv)
{
    parse(argv[1]);
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK); if (fd < 0) { perror("uinput"); return 1; }
    for (int ty = 0; ty < 8; ty++) for (int c = 0; c < 1024; c++) if (bits[ty][c]) {
        if (ty == 1) ioctl(fd, UI_SET_KEYBIT, c); else if (ty == 3) ioctl(fd, UI_SET_ABSBIT, c);
    }
    ioctl(fd, UI_SET_EVBIT, EV_KEY); ioctl(fd, UI_SET_EVBIT, EV_ABS); ioctl(fd, UI_SET_EVBIT, EV_SYN);
    for (int i = 0; i < nprops; i++) ioctl(fd, UI_SET_PROPBIT, props[i]);
    for (int a = 0; a < 64; a++) if (absset[a]) {
        struct uinput_abs_setup s = {0}; s.code = a; s.absinfo.minimum = absinfo[a][0]; s.absinfo.maximum = absinfo[a][1]; s.absinfo.fuzz = absinfo[a][2]; s.absinfo.flat = absinfo[a][3]; s.absinfo.resolution = absinfo[a][4];
        ioctl(fd, UI_ABS_SETUP, &s);
    }
    struct uinput_setup us = {0}; snprintf(us.name, sizeof us.name, "%s", name); us.id.bustype = id[0]; us.id.vendor = id[1]; us.id.product = id[2]; us.id.version = id[3];
    ioctl(fd, UI_DEV_SETUP, &us); ioctl(fd, UI_DEV_CREATE);
    char sys[64]; ioctl(fd, UI_GET_SYSNAME(sizeof sys), sys);
    sleep(2);
    char dir[256], node[256] = ""; snprintf(dir, sizeof dir, "/sys/devices/virtual/input/%s", sys);
    DIR *d = opendir(dir); struct dirent *de; while (d && (de = readdir(d))) if (!strncmp(de->d_name, "event", 5)) snprintf(node, sizeof node, "/dev/input/%s", de->d_name);
    if (d) closedir(d);
    if (!*node) { fprintf(stderr, "no event node in %s\n", dir); return 1; }
    struct libinput *li = libinput_path_create_context(&iface, NULL);
    struct libinput_device *dev = libinput_path_add_device(li, node);
    if (!dev) { fprintf(stderr, "libinput refused %s\n", node); return 1; }
    drain(li);
    long long base = mono_us() + 500000, t0 = evs[0].t;
    int i = 0; struct pollfd pfd = { libinput_get_fd(li), POLLIN, 0 };
    while (i < nev) {
        long long due = base + (evs[i].t - t0);
        long long now = mono_us();
        if (now < due) { int ms = (due - now) > 2000 ? (int)((due - now) / 1000) - 1 : 0; if (ms > 0) poll(&pfd, 1, ms); drain(li); continue; }
        // one frame: all events up to and including the SYN_REPORT
        for (;; i++) { struct input_event ie = {0}; ie.type = evs[i].type; ie.code = evs[i].code; ie.value = evs[i].value; write(fd, &ie, sizeof ie); if (evs[i].type == 0 && evs[i].code == 0) { i++; break; } }
        drain(li);
    }
    for (int k = 0; k < 40; k++) { usleep(50000); drain(li); }
    ioctl(fd, UI_DEV_DESTROY); close(fd);
    return 0;
}
