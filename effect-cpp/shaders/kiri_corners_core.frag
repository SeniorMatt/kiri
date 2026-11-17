#version 140

// Rounds the corners of a window by making the pixels outside the rounded frame transparent.
// The offscreen texture setup (position0, y inversion) follows the Rounded Corners effect by
// Robert Metsaranta and Matin Lotfaliei (https://github.com/matinlotfali/KDE-Rounded-Corners, GPL).

in vec2 texcoord0;
out vec4 fragColor;

#ifdef TRAIT_ROUNDED_CORNERS
#if TRAIT_ROUNDED_CORNERS && (__VERSION__ >= 300 || defined(GL_OES_standard_derivatives))
in vec2 position0; // vertex position relative to the window's top-left, growing downward
#define HAS_POSITION0
#endif
#endif

#include "colormanagement.glsl"
#include "saturation.glsl"

uniform sampler2D sampler;
uniform vec4 modulation;
uniform float radius;
uniform vec2 windowSize;         // frame geometry size
uniform vec2 windowExpandedSize; // expanded geometry size (frame plus shadow)
uniform vec2 windowTopLeft;      // offset of the frame inside the expanded geometry
uniform float outlineWidth;      // device pixels of the decoration's outline, just outside the frame

#ifdef HAS_POSITION0
bool yInverted = true;
bool detect_y_inverted()
{
    return dFdx(texcoord0.y) * dFdx(position0.y) + dFdy(texcoord0.y) * dFdy(position0.y) > 0.0;
}
#else
const bool yInverted = false;
#endif

void main(void)
{
#ifdef HAS_POSITION0
    yInverted = detect_y_inverted();
#endif
    vec4 tex = texture(sampler, texcoord0);

    // pixel position relative to the top-left of the window frame
    float y = yInverted ? texcoord0.y : 1.0 - texcoord0.y;
    vec2 p = vec2(texcoord0.x * windowExpandedSize.x - windowTopLeft.x, y * windowExpandedSize.y - windowTopLeft.y);

    // distance to the rounded frame, negative inside
    vec2 half_size = windowSize * 0.5;
    vec2 d = abs(p - half_size) - (half_size - vec2(radius));
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
    bool inFrame = p.x >= 0.0 && p.y >= 0.0 && p.x < windowSize.x && p.y < windowSize.y;

    if (dist > -0.5) {
        // Outside the rounded shape (the cut corners of the frame, and everything around it: the decoration's shadow
        // and its 1px outline, both drawn for the decoration's own small radius). niri has no outline, and its shadow
        // follows the corner radius. Paint what lies outside the shape as the shadow's profile a straight edge has at that
        // distance, taken past the outline, so the shadow wraps the rounded corner and the outline is gone.
        vec2 c = clamp(p, vec2(radius), max(windowSize - vec2(radius), vec2(radius)));
        vec2 n = p - c;
        float len = length(n);
        n = len > 0.0001 ? n / len : vec2(0.0, -1.0);
        float want = max(dist, 0.0) + outlineWidth;
        float t = 1e9;
        for (int a = 0; a < 2; ++a) {
            float na = a == 0 ? n.x : n.y;
            float ca = a == 0 ? c.x : c.y;
            float sa = a == 0 ? windowSize.x : windowSize.y;
            if (na < -0.0001) {
                t = min(t, (want + ca) / -na);
            } else if (na > 0.0001) {
                t = min(t, (want + sa - ca) / na);
            }
        }
        vec2 ps = c + n * min(t, 1e5);
        vec2 uv = (ps + windowTopLeft) / windowExpandedSize;
        uv = clamp(uv, vec2(0.0), vec2(1.0));
        vec4 behind = texture(sampler, vec2(uv.x, yInverted ? uv.y : 1.0 - uv.y));
        float cover = inFrame ? clamp(0.5 - dist, 0.0, 1.0) : 0.0;
        tex = tex * cover + behind * (1.0 - cover);
    }

    tex = sourceEncodingToNitsInDestinationColorspace(tex);
    tex = adjustSaturation(tex);
    tex *= modulation;
    fragColor = nitsToDestinationEncoding(tex);
}
