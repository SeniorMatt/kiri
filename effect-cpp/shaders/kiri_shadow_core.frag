#version 140

// Kiri's window shadow: niri's shadow.frag (src/render_helpers/shaders/shadow.frag, GPL-3.0-or-later), which is based on
// https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/ (CC0). Positions are global logical pixels.

in vec2 pos;
out vec4 fragColor;

uniform vec4 box;          // x, y, width, height of the box that casts the shadow (the window grown by the spread, moved by the offset)
uniform float boxRadius;   // corner radius of the box
uniform float sigma;       // blur: half the softness
uniform vec4 window;       // the window frame, cut out of the shadow unless it is drawn behind the window
uniform vec4 windowRadii;  // its corner radii: top-left, top-right, bottom-right, bottom-left
uniform float cutout;      // 1: cut the window out
uniform vec4 color;        // shadow colour, premultiplied, already times the opacity
uniform float pixel;       // size of one device pixel in logical pixels

// A standard gaussian function, used for weighting samples
float gaussian(float x, float sigma) {
  const float pi = 3.141592653589793;
  return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * pi) * sigma);
}

// This approximates the error function, needed for the gaussian integral
vec2 erf(vec2 x) {
  vec2 s = sign(x), a = abs(x);
  x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  x *= x;
  return s - s / (x * x);
}

// Return the blurred mask along the x dimension
float roundedBoxShadowX(float x, float y, float sigma, float corner, vec2 halfSize) {
  float delta = min(halfSize.y - corner - abs(y), 0.0);
  float curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  vec2 integral = 0.5 + 0.5 * erf((x + vec2(-curved, curved)) * (sqrt(0.5) / sigma));
  return integral.y - integral.x;
}

// Return the mask for the shadow of a box from lower to upper
float roundedBoxShadow(vec2 lower, vec2 upper, vec2 point, float sigma, float corner) {
  // Center everything to make the math easier
  vec2 center = (lower + upper) * 0.5;
  vec2 halfSize = (upper - lower) * 0.5;
  point -= center;

  // The signal is only non-zero in a limited range, so don't waste samples
  float low = point.y - halfSize.y;
  float high = point.y + halfSize.y;
  float start = clamp(-3.0 * sigma, low, high);
  float end = clamp(3.0 * sigma, low, high);

  // Accumulate samples (we can get away with surprisingly few samples)
  float step = (end - start) / 4.0;
  float y = start + step * 0.5;
  float value = 0.0;
  for (int i = 0; i < 4; i++) {
    value += roundedBoxShadowX(point.x, point.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * step;
    y += step;
  }

  return value;
}

// niri's niri_rounding_alpha(), with niri_scale = 1 / pixel
float rounding_alpha(vec2 coords, vec2 size, vec4 corner_radius) {
    vec2 center;
    float radius;

    if (coords.x < corner_radius.x && coords.y < corner_radius.x) {
        radius = corner_radius.x;
        center = vec2(radius, radius);
    } else if (size.x - corner_radius.y < coords.x && coords.y < corner_radius.y) {
        radius = corner_radius.y;
        center = vec2(size.x - radius, radius);
    } else if (size.x - corner_radius.z < coords.x && size.y - corner_radius.z < coords.y) {
        radius = corner_radius.z;
        center = vec2(size.x - radius, size.y - radius);
    } else if (coords.x < corner_radius.w && size.y - corner_radius.w < coords.y) {
        radius = corner_radius.w;
        center = vec2(radius, size.y - radius);
    } else {
        return 1.0;
    }

    float dist = distance(coords, center);
    float t = clamp((dist - radius) / pixel + 0.5, 0.0, 1.0);
    return 1.0 - t * t * (3.0 - 2.0 * t);
}

void main() {
    vec2 coords_geo = pos - box.xy;
    vec2 coords_window_geo = pos - window.xy;

    float shadow_value;
    if (sigma < 0.1) {
        // With low enough sigma just draw a rounded rectangle.
        // The coordinates are inside the box; outside of it there is no shadow (niri's quad ends at the box then too).
        if (coords_geo.x < 0.0 || coords_geo.y < 0.0 || coords_geo.x > box.z || coords_geo.y > box.w)
            discard;
        shadow_value = rounding_alpha(coords_geo, box.zw, vec4(boxRadius));
    } else {
        shadow_value = roundedBoxShadow(vec2(0.0, 0.0), box.zw, coords_geo, sigma, boxRadius);
    }
    vec4 c = color * shadow_value;

    // Cut out the inside of the window geometry if requested.
    if (cutout > 0.5) {
        if (0.0 <= coords_window_geo.x && coords_window_geo.x <= window.z
                && 0.0 <= coords_window_geo.y && coords_window_geo.y <= window.w) {
            float a = rounding_alpha(coords_window_geo, window.zw, windowRadii);
            c = c * (1.0 - a);
        }
    }

    fragColor = c;
}
