#version 440
// The tile shader: corner mask and blurred wallpaper behind the window (one pass per tile).
// tile.frag.qsb is built from it, so building Kiri needs no Qt ShaderTools:
//   qsb --qt6 --qsbversion 64 -o tile.frag.qsb tile.frag

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    // the tile's size and corner radius in px
    vec2 tileSize;
    float radius;
    // 1 when the blurred copy of the wallpaper shows behind the window; its rect is where this tile is in that texture (0..1)
    float blurMix;
    vec4 blurRect;
    // where the window's frame is in the source texture, which also holds its shadow (0..1)
    vec4 crop;
};

layout(binding = 1) uniform sampler2D source;
layout(binding = 2) uniform sampler2D blurred;

void main()
{
    // distance to the rounded rectangle, 0.5 px wide edge
    vec2 half_ = tileSize * 0.5;
    vec2 q = abs((qt_TexCoord0 - 0.5) * tileSize) - (half_ - vec2(radius));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float cover = clamp(0.5 - d, 0.0, 1.0);

    vec4 c = texture(source, crop.xy + qt_TexCoord0 * crop.zw);
    if (blurMix > 0.0) {
        vec2 uv = clamp(blurRect.xy + qt_TexCoord0 * blurRect.zw, vec2(0.0), vec2(1.0));
        c = c + texture(blurred, uv) * (1.0 - c.a);
    }
    fragColor = c * (cover * qt_Opacity);
}
