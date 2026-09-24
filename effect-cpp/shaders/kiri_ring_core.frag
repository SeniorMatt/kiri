#version 140

// Kiri's border and focus ring: two bands around a rounded rectangle, outside of it.
// Positions are in logical pixels, the rectangle is the window frame as it is painted right now.

in vec2 pos;
out vec4 fragColor;

uniform vec4 rect;        // x, y, width, height of the window frame
uniform float radius;     // corner radius of the window frame
uniform float borderWidth;
uniform float ringWidth;  // the ring starts where the border ends
uniform vec4 borderColor; // straight (not premultiplied) alpha
uniform vec4 ringColor;
uniform vec4 fillColor;   // fills the inside of the rounded rectangle too (niri's insert hint), alpha 0 = off
uniform float pixel;      // size of one device pixel in logical pixels, the antialiasing width

float roundedRectDistance(vec2 p, vec4 r, float rad)
{
    vec2 half_size = r.zw * 0.5;
    vec2 d = abs(p - (r.xy + half_size)) - (half_size - vec2(rad));
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rad;
}

float band(float d, float from, float to)
{
    return clamp((to - d) / pixel + 0.5, 0.0, 1.0) * clamp((d - from) / pixel + 0.5, 0.0, 1.0);
}

void main()
{
    float d = roundedRectDistance(pos, rect, radius);
    float b = borderWidth > 0.0 ? band(d, 0.0, borderWidth) * borderColor.a : 0.0;
    float r = ringWidth > 0.0 ? band(d, borderWidth, borderWidth + ringWidth) * ringColor.a : 0.0;
    float f = fillColor.a > 0.0 ? clamp(0.5 - d / pixel, 0.0, 1.0) * fillColor.a : 0.0;
    fragColor = vec4(borderColor.rgb * b + ringColor.rgb * r + fillColor.rgb * f, b + r + f);
}
