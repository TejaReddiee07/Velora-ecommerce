# 3D Showroom

An interactive gallery at **`/showroom`**:
- Garments hang on thin black rails in a white room, under a soft spotlight with soft shadows.
- Pill tabs at the bottom glide the camera between rails, and each rail's pieces slide in one by one.
- Selecting a piece zooms in, fades the others and opens a product card with sizes and **Add to bag**. Add to bag uses the store's existing cart, so stock checks, the fly-to-bag animation and the bag drawer behave exactly as on product pages.

## Entry points

| Where | What |
| --- | --- |
| Homepage | "Step onto the rail" teaser (no WebGL, so the homepage stays light) → `/showroom` |
| Category listing | **Explore in 3D** appears when a showroom category is selected, e.g. `/clothing?category=shirts` → `/showroom?category=shirts` |
| Product page | **View in 3D** next to the price on showroom pieces → `/showroom?product=<slug>`, which opens with that piece in focus |
| Owner portal | Products → edit → Merchandising → **3D showroom** switch |

Deep links: `/showroom?category=outerwear` opens a rail and `/showroom?product=camel-wool-overcoat` opens a piece in focus. The URL updates as you browse, so any view can be shared.

## Which products are on the rails

Only products with `showroom: true`. The garments that naturally hang on a rail are switched on (`npm --prefix backend run showroom:enable` re-applies this list):

| Rail | Products |
| --- | --- |
| Shirts | oxford-button-down-shirt, relaxed-chambray-shirt, pique-polo-shirt |
| Tees | essential-organic-cotton-tee, heavyweight-boxy-tee, graphic-print-street-tee |
| Outerwear | leather-biker-jacket, denim-trucker-jacket, camel-wool-overcoat, quilted-puffer-jacket |
| Dresses | satin-slip-dress, floral-midi-dress, amethyst-lace-gown |
| Tailoring | navy-tailored-suit, sculpted-blazer |
| Knit & Hoodies | merino-crew-sweater, cloud-fleece-hoodie, oversized-street-hoodie |

Footwear, accessories, trousers and activewear keep their normal pages only. Rails are grouped by category in `frontend/src/components/showroom/groups.ts`.

## Cut-out images to add

Until a transparent cut-out exists, each piece hangs as a **placeholder**: its product photo on a white lookbook card clipped to the hanger. To show the garment itself hanging, add a PNG to:

```
frontend/public/showroom/<product-slug>.png
```

It's picked up on the next page load. No code or database change is needed.

Needed files:

```
oxford-button-down-shirt.png      relaxed-chambray-shirt.png        pique-polo-shirt.png
essential-organic-cotton-tee.png  heavyweight-boxy-tee.png          graphic-print-street-tee.png
leather-biker-jacket.png          denim-trucker-jacket.png          camel-wool-overcoat.png
quilted-puffer-jacket.png         satin-slip-dress.png              floral-midi-dress.png
amethyst-lace-gown.png            navy-tailored-suit.png            sculpted-blazer.png
merino-crew-sweater.png           cloud-fleece-hoodie.png           oversized-street-hoodie.png
```

Image guidelines:
- **Transparent background** (PNG with alpha), with the garment seen **from the front**, flat or on an invisible mannequin.
- **No hanger in the image.** The showroom draws the hanger, so the collar or neckline should touch the **top edge** of the image.
- Trim empty space at the sides and bottom. About 1200 px tall is plenty; keep each file under ~600 KB (use Squoosh or TinyPNG).
- The file name must equal the product's URL slug.

## Behaviour and performance

- **Lazy-loaded.** The 3D code (three.js, React Three Fiber, drei) downloads only on `/showroom`. A loading screen shows texture progress.
- **Mobile.** Swipe sideways along a rail; the product card becomes a bottom sheet, and the pixel ratio and shadow quality are reduced.
- **Reduced motion.** With `prefers-reduced-motion`, there's no sway or slide-in and camera moves are instant.
- **No WebGL.** `/showroom?product=…` redirects to the normal product page; `/showroom` shows the same pieces as a normal product grid, and the "View/Explore in 3D" buttons are hidden.
- **Accessibility.** A text index of the rail (desktop) gives keyboard and screen-reader access to every piece. ← → cycle pieces in focus and Esc returns to the rail.
- **Live data.** Prices, stock and showroom membership come from the API and update in real time like the rest of the store.
