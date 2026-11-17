# Browsers and devices

VELORA is built to run on every current phone, tablet, laptop and desktop, with touch, mouse or keyboard.

## Supported

| Platform | Browsers | From |
| --- | --- | --- |
| iPhone and iPad | Safari, Chrome, Edge, Firefox (all of them use Apple's WebKit) | iOS / iPadOS **16.4** |
| Mac | Safari, Chrome, Edge, Firefox | Safari **16.4**, Chrome / Edge **111**, Firefox **128** |
| Android phones and tablets | Chrome, Samsung Internet, Edge, Firefox | Chrome / Edge **111**, Samsung Internet **22**, Firefox **128** |
| Windows, Linux, ChromeOS | Chrome, Edge, Firefox | Chrome / Edge **111**, Firefox **128** |

The floor comes from the frameworks the storefront is built on (Next.js 16 and Tailwind CSS 4, see the [Tailwind compatibility notes](https://tailwindcss.com/docs/compatibility)). Anything older (iOS 15 and earlier, Internet Explorer) is not supported. Screens from 320 px wide (small phones) to 2560 px (large monitors), portrait and landscape.

## What is checked

`npm run test:devices` browses the storefront in every row above, on real engines (Chromium, Edge, WebKit, Firefox) with the screen size, pixel density and touch behaviour of the device:

| Project | Device |
| --- | --- |
| `edge`, `safari-mac`, `firefox` | Desktop and laptop browsers |
| `iphone`, `iphone-small` | iPhone 13 (390 px), iPhone SE (320 px) |
| `ipad`, `ipad-landscape` | iPad portrait and landscape |
| `android`, `android-small`, `android-tablet` | Pixel 7, Galaxy S9+ (320 px), Galaxy Tab S4 |

Each project opens every public page and checks that it loads, is not wider than the screen, has a heading, shows its images and raises no script errors. It also checks the header logo is centred, the phone menu opens and closes, the product page's Add to bag row fits, Quick add can be reached, the cart and checkout pages fit the screen with an item in the bag, a shopper who chose US dollars gets no script errors, and the 3D footwear carousel appears wherever WebGL works. The tests only browse (the bag in the cart test is a stand-in response, so nothing is created), so they are safe to run against any stack:

```bash
npx playwright install chromium webkit firefox      # once (Edge must be installed for the `edge` project)
E2E_BASE_URL=https://your-store.example npm --prefix frontend run test:devices
```

Run one device with `npx playwright test devices.spec.ts --project=iphone`.

## Why some code is device-specific

- **Sign-in on iPhone, Safari and Brave.** These browsers drop cookies set by another website, so a storefront on `*.vercel.app` talking to an API on `*.onrender.com` cannot stay signed in. The storefront therefore calls its own `/api` and forwards it to the API (on by default on Vercel; see [DEPLOYMENT.md](DEPLOYMENT.md)).
- **Touch versus hover.** Controls that appear on hover (such as *Quick add* on a product card) are only hidden on devices that can hover; touch laptops and tablets always see them. The 3D footwear carousel follows the finger on touch screens and the mouse otherwise.
- **iPhone zoom.** iPhone Safari zooms the page when a text field smaller than 16 px is tapped, so small fields are raised to 16 px on iPhone-sized screens only (`globals.css`).
- **3D and motion.** If a browser has no WebGL, or the visitor asked for reduced motion, the 3D carousel and silk hero are replaced by flat versions with the same content.
