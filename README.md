# LUXORA — 3D Scroll Frame Animation & Luxury Store

An Apple-grade, high-performance scroll-driven 3D frame animation paired with a curated luxury eyewear e-commerce showcase. Handcrafted with HTML5 Canvas, modern ES6, and responsive styling.

Live on GitHub: [my-portfolio-web](https://github.com/mhdimran124-lang/my-portfolio-web)

---

## 🌟 Key Features

1. **3D Scroll Frame Animation**:
   - 240 high-definition frames scrubbing smoothly at 60fps+ via HTML5 Canvas.
   - Throttled `requestAnimationFrame` render loop avoiding duplicate draws.
   - Full aspect-ratio preservation (`Cover` and `Contain` modes).
   - Zero flicker, zero jump cuts, and zero black screens.

2. **Full-Featured Luxury Eyewear Store**:
   - Flagship Specification configurator with live thumbnail switcher, color tone selectors, lens tint toggles, and size scale selectors.
   - Interactive Shopping Bag slide-over drawer with live quantity adjustments and subtotal calculation.
   - Express Checkout modal with encrypted purchase simulation and order confirmation.
   - Interactive LUXORA Fit Guide modal.
   - Customer Review impressions and Newsletter subscription with instant confirmation.
   - Editorial showcase, product catalogue cards, and brand philosophy feature.

3. **Vercel-Ready Architecture**:
   - Zero hardcoded local paths.
   - Self-contained static asset pipeline (`frames.json` + `frames/` directory).
   - Instant deployment on Vercel with immutable edge caching headers configured in `vercel.json`.

---

## 🚀 Local Development

### Option 1: Python Built-in Server
```bash
# Clone the repository
git clone https://github.com/mhdimran124-lang/my-portfolio-web.git
cd my-portfolio-web

# Run the local server
python server.py
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

### Option 2: Any Static Web Server
```bash
# Python simple server
python -m http.server 8080

# Or npx serve
npx serve .
```

---

## ☁️ Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository in your [Vercel Dashboard](https://vercel.com/new).
3. Select **Other** as the Framework Preset (Root Directory: `./`).
4. Click **Deploy**. Vercel will serve the entire website and high-DPI animation frames from its edge CDN with zero configuration required.

---

## 📄 License
MIT © 2026 LUXORA Atelier.
