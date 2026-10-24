# rgb128 - sunset

a generative, time-synchronized cubist sunset experience.

### what is going on here?

1. **deterministic universe (universal sync):** 
   - the website fetches a high-precision epoch timestamp from a time API on load and periodically in the background. 
   - using this universal master clock, **every visitor around the world sees the exact same rectangles at the exact same position, scale, and direction** at any given millisecond. 
   - the rectangles drift, morph their aspect ratios, and flow infinitely without hard jumps or desyncs.

2. **daily procedural art:** 
   - the underlying background sunset image and silhouette mountains are generated deterministically based on the current calendar date (`YYYYMMDD`). 
   - this means the landscape changes into a brand new unique sunset every single day, matching globally for everyone, while the cubist mosaic blocks dance on top of it.

3. **interactive exploration:**
   - **click** anywhere on the canvas at any time to instantly break out of the daily synchronized mode and generate a fresh, randomized local sunset just for you.
   - use the **export buttons** (copy/download front & back) to capture precisely what is visible on your screen at that exact moment as a PNG.
