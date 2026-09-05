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

    // distance to the rounded frame, negative inside; only the corner squares can be outside it
    vec2 half_size = windowSize * 0.5;
    vec2 d = abs(p - half_size) - (half_size - vec2(radius));
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
    bool inFrame = p.x >= 0.0 && p.y >= 0.0 && p.x < windowSize.x && p.y < windowSize.y;
    if (inFrame && d.x > 0.0 && d.y > 0.0) {
        tex *= clamp(0.5 - dist, 0.0, 1.0);
    }

    tex = sourceEncodingToNitsInDestinationColorspace(tex);
    tex = adjustSaturation(tex);
    tex *= modulation;
    fragColor = nitsToDestinationEncoding(tex);
}
