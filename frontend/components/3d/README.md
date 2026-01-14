# F1 3D Components

Interactive 3D F1 car visualizations using React Three Fiber (R3F) and Three.js.

## Components

### 1. F1HeroScene
**Hero section with rotating 3D F1 car**

- Auto-rotating car with floating animation
- Environment lighting for realistic reflections
- Gradient overlay blending into page
- Falls back to wireframe if model not found

**Usage:**
```tsx
import { F1HeroScene } from '@/components/3d';

<F1HeroScene teamColor="#dc2626" />
```

### 2. F1LoadingAnimation
**Loading state with animated 3D car built from primitives**

- No external model required
- Spinning wheels and hover effect
- Customizable message

**Usage:**
```tsx
import { F1LoadingAnimation } from '@/components/3d';

<F1LoadingAnimation message="Loading race data..." />
```

### 3. F1CarShowcase
**Interactive team livery showcase**

- Drag to rotate car
- 10 F1 team color options
- Reflective ground plane
- Dramatic warehouse lighting

**Usage:**
```tsx
// Create a showcase page
import { F1CarShowcase } from '@/components/3d';

export default function ShowcasePage() {
  return <F1CarShowcase />;
}
```

## 3D Model Credits

**F1 2026 Release Car**  
"F1 2026 Release Car" (https://skfb.ly/oWL8J) by Nimaxo is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

---

## Setup

### 1. Install Dependencies
```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

### 2. Download 3D Model
1. Go to https://sketchfab.com/3d-models/f1-2026-release-car-b5c4f3ef041345c68b8e918190d32a9c
2. Download as glTF (.glb format)
3. Place in `public/models/f1-car.glb`

**Alternative models:**
- Search "F1 car low poly" on Sketchfab for faster loading
- Red Bull RB19 for higher detail

### 3. Optional: Compress Model
Use https://gltf.report/ to reduce file size by 50-70%

## Features

- ✅ Server-side rendering disabled with `dynamic` import
- ✅ Graceful fallback if model missing
- ✅ Loading states and suspense boundaries
- ✅ Optimized for performance
- ✅ TypeScript support
- ✅ Mobile responsive

## Performance Tips

- Model is preloaded using `useGLTF.preload()`
- Use compressed GLB files (< 5MB recommended)
- Shadows disabled on mobile for better performance
- Lower polygon count for faster loading

## Team Colors

All 10 F1 teams supported:
- Red Bull: `#1e41ff`
- Ferrari: `#dc0000`
- Mercedes: `#00d2be`
- McLaren: `#ff8700`
- Aston Martin: `#006f62`
- Alpine: `#0090ff`
- Williams: `#005aff`
- Haas: `#ffffff`
- Sauber: `#52e252`
- RB: `#2b4562`

## Troubleshooting

**Black screen:**
- Check lights are added to scene
- Verify camera position

**Model not loading:**
- Ensure file at `public/models/f1-car.glb`
- Check browser console for errors
- Verify file isn't corrupted

**Performance issues:**
- Use lower poly model
- Disable shadows
- Reduce canvas size on mobile
