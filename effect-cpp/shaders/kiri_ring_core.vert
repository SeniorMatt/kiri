#version 140

uniform mat4 modelViewProjectionMatrix;
in vec4 vertex;
out vec2 pos; // position in global logical coordinates

void main()
{
    pos = vertex.xy;
    gl_Position = modelViewProjectionMatrix * vec4(vertex.xy, 0.0, 1.0);
}
