# 3D Model Setup Guide

## Why Use the Real GLB Model?

The current implementation uses **primitive shapes** (boxes, cylinders, cones) to create an F1 car. This works but looks basic. 

With the **real 3D GLB model**, you'll get:
- ✅ Photorealistic F1 car with proper geometry
- ✅ High-quality materials and textures
- ✅ Professional-looking visuals
- ✅ Detailed wheels, wings, and bodywork

## How to Add the 3D Model

### Step 1: Download the Model

1. **Go to Sketchfab**:
   https://sketchfab.com/3d-models/f1-2026-release-car-b5c4f3ef041345c68b8e918190d32a9c

2. **Click "Download 3D Model"** (you may need to create a free account)

3. **Select Format**: Choose **"glTF"** (this will give you a `.glb` file)

4. **Download** the file

### Step 2: Place the File

1. Navigate to your project folder:
   ```
   frontend/public/models/
   ```

2. Place the downloaded file there and **rename it to**:
   ```
   f1-car.glb
   ```

3. Final path should be:
   ```
   frontend/public/models/f1-car.glb
   ```

### Step 3: Refresh Your Browser

Once the file is in place:
1. Go to `http://localhost:3000`
2. **Hard refresh** the page: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. The real 3D model should now load automatically! 🎉

## How It Works

The app **automatically detects** if the GLB file exists:
- ✅ **If found**: Loads the high-quality 3D model
- ⚠️ **If not found**: Falls back to the primitive shapes (what you see now)

No code changes needed - just drop the file in!

## Model Credits

**"F1 2026 Release Car"** by Nimaxo  
Licensed under Creative Commons Attribution  
https://sketchfab.com/3d-models/f1-2026-release-car-b5c4f3ef041345c68b8e918190d32a9c

## Troubleshooting

### Model not loading?
1. Check the file path is exactly: `frontend/public/models/f1-car.glb`
2. Check the filename is exactly `f1-car.glb` (lowercase, no spaces)
3. Hard refresh your browser (Ctrl+Shift+R)
4. Check the browser console (F12) for any errors

### Model looks weird?
- Try different team colors in the showcase page (`/showcase`)
- The model colors are automatically applied to materials named "body" or "paint"

### Performance issues?
The GLB model is larger than primitive shapes. If it's slow:
- Close other browser tabs
- Reduce the model file size using: https://gltf.report/
- The app already uses optimizations (LOD, DPR settings)

## File Size

The F1 2026 model is approximately:
- **Original**: ~50-100 MB
- **Optimized**: Can be reduced to ~20-30 MB using gltf.report

The app will load it efficiently using Three.js caching.
