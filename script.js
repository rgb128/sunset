'use strict';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

// System
const CANVAS_ID = 'main-canvas';
const CTX_TYPE = '2d';

// Noise & Mathematics
const TABLE_SIZE = 256;
const TABLE_MASK = 255;
const NOISE_OCTAVES = 5;
const NOISE_PERSISTENCE = 0.5;
const NOISE_LACUNARITY = 2.0;

// Cloud Shape / Warping Configuration
// The X scale is much smaller to stretch the clouds horizontally (wispy look)
const SCALE_X = 0.0015;
const SCALE_Y = 0.005;
const WARP_STRENGTH_X = 2.0;
const WARP_STRENGTH_Y = 1.0;
const WARP_OFFSET = 5.2; // Arbitrary offset to prevent mirroring

// Palette (Based on the reference photo: Dark Purples to Fiery Reds/Oranges)
const PALETTE = [
    { r: 40,  g: 30,  b: 60  }, // Deep Purplish Cloud
    { r: 120, g: 25,  b: 35  }, // Dark Crimson
    { r: 230, g: 45,  b: 20  }, // Vibrant Red
    { r: 255, g: 110, b: 0   }, // Intense Orange
    { r: 255, g: 180, b: 30  }, // Yellow-Orange Horizon
    { r: 255, g: 240, b: 150 }  // Pale Yellow/White Core
];
const PALETTE_OFFSET = 1;
const RGB_ALPHA_OPAQUE = 255;
const PIXEL_DATA_STEP = 4; // RGBA

// Mountain / Silhouette
const SILHOUETTE_COLOR = '#080510';
const SILHOUETTE_HEIGHT_RATIO = 0.08;
const SILHOUETTE_OCTAVES = 4;

// ==========================================
// NOISE GENERATOR (Value Noise)
// ==========================================

// Create a randomized table for the noise generation
const randomTable = new Float32Array(TABLE_SIZE * 2);
for (let i = 0; i < TABLE_SIZE * 2; i++) {
    randomTable[i] = Math.random();
}

// Smoothstep function for smooth interpolation
const smoothstep = (t) => {
    return t * t * (3 - 2 * t);
};

// Linear interpolation
const lerp = (a, b, t) => {
    return a + (b - a) * t;
};

// Basic 2D Value Noise
const noise2D = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    
    const xf = x - xi;
    const yf = y - yi;
    
    const rx0 = xi & TABLE_MASK;
    const rx1 = (rx0 + 1) & TABLE_MASK;
    const ry0 = yi & TABLE_MASK;
    const ry1 = (ry0 + 1) & TABLE_MASK;
    
    // Hash coordinates to fetch random values from the table
    const c00 = randomTable[rx0 + ry0];
    const c10 = randomTable[rx1 + ry0];
    const c01 = randomTable[rx0 + ry1];
    const c11 = randomTable[rx1 + ry1];
    
    const sx = smoothstep(xf);
    const sy = smoothstep(yf);
    
    const nx0 = lerp(c00, c10, sx);
    const nx1 = lerp(c01, c11, sx);
    
    return lerp(nx0, nx1, sy);
};

// Fractional Brownian Motion (Stacks noise octaves for detail)
const fbm = (x, y, octaves) => {
    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * frequency, y * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= NOISE_PERSISTENCE;
        frequency *= NOISE_LACUNARITY;
    }
    
    return total / maxValue;
};

// ==========================================
// COLOR MAPPING
// ==========================================

const getColorForValue = (value) => {
    // Clamp value between 0.0 and 1.0
    const clamped = Math.max(0, Math.min(1, value));
    
    const maxIndex = PALETTE.length - PALETTE_OFFSET;
    const scaledValue = clamped * maxIndex;
    
    const index1 = Math.floor(scaledValue);
    const index2 = Math.min(index1 + PALETTE_OFFSET, maxIndex);
    
    const blend = scaledValue - index1;
    
    const c1 = PALETTE[index1];
    const c2 = PALETTE[index2];
    
    return {
        r: lerp(c1.r, c2.r, blend),
        g: lerp(c1.g, c2.g, blend),
        b: lerp(c1.b, c2.b, blend)
    };
};

// ==========================================
// DRAWING LOGIC
// ==========================================

const drawSky = (ctx, width, height) => {
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    // Random offsets so the sky is completely unique every refresh
    const offsetX = Math.random() * 1000;
    const offsetY = Math.random() * 1000;
    
    for (let y = 0; y < height; y++) {
        const normalizedY = y / height;
        
        for (let x = 0; x < width; x++) {
            const nx = (x + offsetX) * SCALE_X;
            const ny = (y + offsetY) * SCALE_Y;
            
            // Domain Warping: Distort the coordinates using noise to create 
            // the stretching, swirling, natural cloud look.
            const warp1 = fbm(nx, ny, NOISE_OCTAVES);
            const warp2 = fbm(nx + WARP_OFFSET, ny + WARP_OFFSET, NOISE_OCTAVES);
            
            const distortedX = nx + (warp1 * WARP_STRENGTH_X);
            const distortedY = ny + (warp2 * WARP_STRENGTH_Y);
            
            const noiseVal = fbm(distortedX, distortedY, NOISE_OCTAVES);
            
            // Mix the noise with the Y-axis so it gets brighter towards the bottom
            // We use Math.pow on normalizedY to push the brightness further down
            const elevationFactor = Math.pow(normalizedY, 1.5);
            const finalValue = (noiseVal * 0.6) + (elevationFactor * 0.5);
            
            const color = getColorForValue(finalValue);
            
            const pixelIndex = (y * width + x) * PIXEL_DATA_STEP;
            data[pixelIndex] = color.r;
            data[pixelIndex + 1] = color.g;
            data[pixelIndex + 2] = color.b;
            data[pixelIndex + 3] = RGB_ALPHA_OPAQUE;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
};

const drawSilhouette = (ctx, width, height) => {
    const maxMountainHeight = height * SILHOUETTE_HEIGHT_RATIO;
    const mountainSeed = Math.random() * 1000;
    
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    for (let x = 0; x <= width; x += 2) {
        // Use a 1D slice of FBM noise for jagged mountain ridges
        const nx = x * 0.005;
        const noiseVal = fbm(nx + mountainSeed, mountainSeed, SILHOUETTE_OCTAVES);
        
        const yOffset = noiseVal * maxMountainHeight;
        const yPos = height - yOffset;
        
        ctx.lineTo(x, yPos);
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();
    
    ctx.fillStyle = SILHOUETTE_COLOR;
    ctx.fill();
};

const generateRealisticSunset = () => {
    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext(CTX_TYPE);
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;
    
    drawSky(ctx, width, height);
    drawSilhouette(ctx, width, height);
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = () => {
    generateRealisticSunset();
};
