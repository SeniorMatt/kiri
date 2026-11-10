#version 140

// Kiri's border, focus ring, insert hint and tab indicator: up to three layers around or inside a rounded rectangle,
// each filled with a gradient. The gradient math (colour spaces, hue interpolation, the gradient vector) is niri's
// border.frag (src/render_helpers/shaders/border.frag, GPL-3.0-or-later), ported to GLSL 140 with global positions.
// Positions are in logical pixels, the rectangle is the window frame as it is painted right now.

in vec2 pos;
out vec4 fragColor;

uniform vec4 rect;        // x, y, width, height of the rectangle (the window frame, a tab, the insert hint)
uniform vec4 radii;       // corner radii: top-left, top-right, bottom-right, bottom-left
uniform vec2 bands;       // border width, ring width: the border starts at the rectangle, the ring where the border ends
uniform vec3 layers;      // 1 = draw: border, ring, fill (the inside of the rectangle)
uniform float pixel;      // size of one device pixel in logical pixels, the antialiasing width
uniform float alpha;      // opacity of everything
uniform vec4 gFrom[3];    // gradient colours, straight (not premultiplied) alpha, per layer
uniform vec4 gTo[3];
uniform vec4 gArea[3];    // gradient area: x, y, width, height (niri's gradient_area: the tile or the workspace view)
uniform vec4 gMisc[3];    // gradient vector x, y (niri's grad_vec), colour space, hue interpolation

vec4 premul_rect(vec4 color) {
    color.rgb *= color.a;
    return color;
}

vec4 premul_lch(vec4 color) {
    color.xy *= color.a;
    return color;
}

vec4 unpremul_rect(vec4 color) {
    if (color.a == 0.0)
        return color;
    color.rgb /= color.a;
    return color;
}

vec4 unpremul_lch(vec4 color) {
    if (color.a == 0.0)
        return color;
    color.xy /= color.a;
    return color;
}

vec4 premul_mix_unpremul_rect(vec4 color1, vec4 color2, float ratio) {
    vec4 mixed = mix(premul_rect(color1), premul_rect(color2), ratio);
    return unpremul_rect(mixed);
}

vec4 premul_mix_unpremul_lch(vec4 color1, vec4 color2, float ratio) {
    vec4 mixed = mix(premul_lch(color1), premul_lch(color2), ratio);
    return unpremul_lch(mixed);
}

vec3 srgb_to_linear(vec3 color) {
    return pow(color, vec3(2.2));
}

vec3 linear_to_srgb(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

vec3 lab_to_lch(vec3 color) {
    float c = sqrt(pow(color.y, 2.0) + pow(color.z, 2.0));
    float h = degrees(atan(color.z, color.y));
    h += h <= 0.0 ? 360.0 : 0.0;
    return vec3(color.x, c, h);
}

vec3 lch_to_lab(vec3 color) {
    float a = color.y * clamp(cos(radians(color.z)), -1.0, 1.0);
    float b = color.y * clamp(sin(radians(color.z)), -1.0, 1.0);
    return vec3(color.x, a, b);
}

vec3 linear_to_oklab(vec3 color) {
    mat3 rgb_to_lms = mat3(
        vec3(0.4122214708, 0.5363325363, 0.0514459929),
        vec3(0.2119034982, 0.6806995451, 0.1073969566),
        vec3(0.0883024619, 0.2817188376, 0.6299787005)
    );
    mat3 lms_to_oklab = mat3(
        vec3(0.2104542553, 0.7936177850, -0.0040720468),
        vec3(1.9779984951, -2.4285922050, 0.4505937099),
        vec3(0.0259040371, 0.7827717662, -0.8086757660)
    );
    vec3 lms = color * rgb_to_lms;
    lms = pow(lms, vec3(1.0 / 3.0));
    return lms * lms_to_oklab;
}

vec3 oklab_to_linear(vec3 color) {
    mat3 oklab_to_lms = mat3(
        vec3(1.0, 0.3963377774, 0.2158037573),
        vec3(1.0, -0.1055613458, -0.0638541728),
        vec3(1.0, -0.0894841775, -1.2914855480)
    );
    mat3 lms_to_rgb = mat3(
        vec3(4.0767416621, -3.3077115913, 0.2309699292),
        vec3(-1.2684380046, 2.6097574011, -0.3413193965),
        vec3(-0.0041960863, -0.7034186147, 1.7076147010)
    );
    vec3 lms = color * oklab_to_lms;
    lms = pow(lms, vec3(3.0));
    return lms * lms_to_rgb;
}

// premultiplied result
vec4 color_mix(vec4 color1, vec4 color2, float color_ratio, float colorspace, float hue_interpolation) {
    vec4 color_out;

    // srgb
    if (colorspace == 0.0) {
        return mix(premul_rect(color1), premul_rect(color2), color_ratio);
    }

    color1.rgb = srgb_to_linear(color1.rgb);
    color2.rgb = srgb_to_linear(color2.rgb);

    // srgb-linear
    if (colorspace == 1.0) {
        color_out = premul_mix_unpremul_rect(color1, color2, color_ratio);
    // oklab
    } else if (colorspace == 2.0) {
        color1.xyz = linear_to_oklab(color1.rgb);
        color2.xyz = linear_to_oklab(color2.rgb);
        color_out = premul_mix_unpremul_rect(color1, color2, color_ratio);
        color_out.rgb = oklab_to_linear(color_out.xyz);
    // oklch
    } else {
        color1.xyz = lab_to_lch(linear_to_oklab(color1.rgb));
        color2.xyz = lab_to_lch(linear_to_oklab(color2.rgb));
        color_out = premul_mix_unpremul_lch(color1, color2, color_ratio);

        float min_hue = min(color1.z, color2.z);
        float max_hue = max(color1.z, color2.z);
        float path_direct_distance = (max_hue - min_hue) * color_ratio;
        float path_mod_distance = (360.0 - max_hue + min_hue) * color_ratio;

        float path_mod =
            color1.z == min_hue ?
                mod(color1.z - path_mod_distance, 360.0) :
                mod(color1.z + path_mod_distance, 360.0);
        float path_direct =
            color1.z == min_hue ?
                color1.z + path_direct_distance :
                color1.z - path_direct_distance;

        // shorter
        if (hue_interpolation == 0.0) {
            color_out.z = max_hue - min_hue > 360.0 - max_hue + min_hue ? path_mod : path_direct;
        // longer
        } else if (hue_interpolation == 1.0) {
            color_out.z = max_hue - min_hue <= 360.0 - max_hue + min_hue ? path_mod : path_direct;
        // increasing
        } else if (hue_interpolation == 2.0) {
            color_out.z = color1.z > color2.z ? path_mod : path_direct;
        // decreasing
        } else {
            color_out.z = color1.z <= color2.z ? path_mod : path_direct;
        }
        color_out.rgb = clamp(oklab_to_linear(lch_to_lab(color_out.xyz)), 0.0, 1.0);
    }

    return premul_rect(vec4(linear_to_srgb(color_out.rgb), color_out.a));
}

// niri's gradient_color(): coords are relative to the gradient area's top-left corner
vec4 gradient_color(int layer, vec2 position) {
    vec2 coords = position - gArea[layer].xy;
    vec2 grad_vec = gMisc[layer].xy;

    if ((grad_vec.x < 0.0 && 0.0 <= grad_vec.y) || (0.0 <= grad_vec.x && grad_vec.y < 0.0))
        coords.x -= gArea[layer].z;

    float frac = dot(coords, grad_vec) / max(dot(grad_vec, grad_vec), 1e-6);

    if (grad_vec.y < 0.0)
        frac += 1.0;

    frac = clamp(frac, 0.0, 1.0);
    return color_mix(gFrom[layer], gTo[layer], frac, gMisc[layer].z, gMisc[layer].w);
}

// signed distance to the rounded rectangle, negative inside; every corner has its own radius
float roundedRectDistance(vec2 p, vec4 r, vec4 rad)
{
    vec2 half_size = r.zw * 0.5;
    vec2 c = r.xy + half_size;
    float rr = p.x < c.x ? (p.y < c.y ? rad.x : rad.w) : (p.y < c.y ? rad.y : rad.z);
    vec2 d = abs(p - c) - (half_size - vec2(rr));
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rr;
}

float band(float d, float from, float to)
{
    return clamp((to - d) / pixel + 0.5, 0.0, 1.0) * clamp((d - from) / pixel + 0.5, 0.0, 1.0);
}

void main()
{
    float d = roundedRectDistance(pos, rect, radii);
    vec4 color = vec4(0.0);
    if (layers.x > 0.0 && bands.x > 0.0) {
        float b = band(d, 0.0, bands.x);
        if (b > 0.0)
            color += gradient_color(0, pos) * b;
    }
    if (layers.y > 0.0 && bands.y > 0.0) {
        float r = band(d, bands.x, bands.x + bands.y);
        if (r > 0.0)
            color += gradient_color(1, pos) * r;
    }
    if (layers.z > 0.0) {
        float f = clamp(0.5 - d / pixel, 0.0, 1.0);
        if (f > 0.0)
            color += gradient_color(2, pos) * f;
    }
    fragColor = color * alpha;
}
