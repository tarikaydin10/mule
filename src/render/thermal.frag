#pragma phaserTemplate(shaderName)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// The scene is drawn in grey levels that equal temperature (see src/systems/thermal.ts).
// This pass turns that heat map into the thermal camera image.
uniform sampler2D uMainSampler;
uniform vec2 resolution;
uniform float time;
uniform float blackHot;
uniform float noiseAmount;
uniform float bloomStrength;
varying vec2 outTexCoord;

const float BLOOM_THRESHOLD = 0.45;

float heatAt(vec2 uv)
{
    return dot(texture2D(uMainSampler, uv).rgb, vec3(0.299, 0.587, 0.114));
}

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main ()
{
    vec2 texel = 1.0 / resolution;
    float heat = heatAt(outTexCoord);

    // Light bloom: only hot surroundings bleed into a pixel, on two rings of eight samples.
    float glow = 0.0;
    for (int i = 0; i < 8; i++)
    {
        float angle = float(i) * 0.7853982;
        vec2 dir = vec2(cos(angle), sin(angle)) * texel;
        glow += max(heatAt(outTexCoord + dir * 4.0) - BLOOM_THRESHOLD, 0.0);
        glow += 0.6 * max(heatAt(outTexCoord + dir * 10.0) - BLOOM_THRESHOLD, 0.0);
    }
    heat += bloomStrength * glow / 8.0;

    heat = mix(heat, 1.0 - heat, blackHot);

    // Sensor noise, new every frame.
    heat += (hash(outTexCoord * resolution + mod(time, 97.0)) - 0.5) * noiseAmount;

    gl_FragColor = vec4(vec3(clamp(heat, 0.0, 1.0)), 1.0);
}
