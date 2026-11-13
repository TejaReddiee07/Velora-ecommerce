import type { Department, Gender, Style } from '../models/common.js';

export const SEED_BRANDS = [
  { name: 'VELORA Atelier', slug: 'velora-atelier', description: 'Tailoring and occasionwear cut in our London studio.' },
  { name: 'VELORA Studio', slug: 'velora-studio', description: 'Elevated everyday essentials.' },
  { name: 'Maison Ardent', slug: 'maison-ardent', description: 'Fluid womenswear with a Parisian sensibility.' },
  { name: 'Nordvale', slug: 'nordvale', description: 'Outerwear engineered for northern weather.' },
  { name: 'Kinetic Lab', slug: 'kinetic-lab', description: 'Performance apparel and footwear.' },
  { name: 'Rue Lumière', slug: 'rue-lumiere', description: 'Footwear and leather goods with quiet craftsmanship.' },
  { name: 'Oxford & Vale', slug: 'oxford-and-vale', description: 'Goodyear-welted shoes and fine leather.' },
] as const;

export const SEED_CATEGORIES: { name: string; slug: string; department: Department; description: string }[] = [
  { name: 'T-Shirts', slug: 't-shirts', department: 'clothing', description: 'Heavyweight cottons and refined basics.' },
  { name: 'Shirts & Polos', slug: 'shirts', department: 'clothing', description: 'Oxford, chambray and piqué.' },
  { name: 'Jeans', slug: 'jeans', department: 'clothing', description: 'Raw, washed and everything between.' },
  { name: 'Trousers', slug: 'trousers', department: 'clothing', description: 'Tailored and utility trousers.' },
  { name: 'Dresses', slug: 'dresses', department: 'clothing', description: 'Day dresses to evening gowns.' },
  { name: 'Jackets & Coats', slug: 'jackets', department: 'clothing', description: 'Leather, denim, wool and down.' },
  { name: 'Hoodies & Sweats', slug: 'hoodies', department: 'clothing', description: 'Brushed fleece and loopback jersey.' },
  { name: 'Knitwear', slug: 'knitwear', department: 'clothing', description: 'Merino, cashmere and cotton knits.' },
  { name: 'Suits & Tailoring', slug: 'suits', department: 'clothing', description: 'Formal wear for every occasion.' },
  { name: 'Activewear', slug: 'activewear', department: 'clothing', description: 'Sportswear built to move.' },
  { name: 'Sneakers', slug: 'sneakers', department: 'footwear', description: 'Court classics and retro runners.' },
  { name: 'Sports Shoes', slug: 'sports-shoes', department: 'footwear', description: 'Running and training footwear.' },
  { name: 'Casual Shoes', slug: 'casual-shoes', department: 'footwear', description: 'Loafers and easy everyday shoes.' },
  { name: 'Formal Shoes', slug: 'formal-shoes', department: 'footwear', description: 'Derbies, brogues and heels.' },
  { name: 'Boots', slug: 'boots', department: 'footwear', description: 'Ankle, combat and hiking boots.' },
  { name: 'Sandals', slug: 'sandals', department: 'footwear', description: 'Slides and heeled sandals.' },
  { name: 'Bags', slug: 'bags', department: 'accessories', description: 'Totes and leather bags.' },
  { name: 'Watches', slug: 'watches', department: 'accessories', description: 'Minimal timepieces.' },
  { name: 'Scarves', slug: 'scarves', department: 'accessories', description: 'Wool and cashmere scarves.' },
  { name: 'Belts', slug: 'belts', department: 'accessories', description: 'Full-grain leather belts.' },
  { name: 'Eyewear', slug: 'eyewear', department: 'accessories', description: 'Acetate sunglasses.' },
  { name: 'Hats', slug: 'hats', department: 'accessories', description: 'Caps and beanies.' },
];

export interface SeedProduct {
  key: string; // manifest key for images
  slug: string;
  name: string;
  department: Department;
  gender: Gender;
  category: string;
  brand: string;
  styles: Style[];
  price: number; // GBP pence
  sale?: number;
  cost: number;
  sizes: string[];
  sizeGuide: 'tops' | 'bottoms' | 'dresses' | 'footwear' | 'none';
  short: string;
  description: string;
  specs: [string, string][];
  tags: string[];
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
}

const TOPS = ['XS', 'S', 'M', 'L', 'XL'];
const MENS_TOPS = ['S', 'M', 'L', 'XL', 'XXL'];
const WOMENS = ['6', '8', '10', '12', '14'];
const WAIST = ['28', '30', '32', '34', '36'];
const MENS_SHOES = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
const WOMENS_SHOES = ['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8'];
const UNISEX_SHOES = ['UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'];
const ONE = ['One Size'];

export const SEED_PRODUCTS: SeedProduct[] = [
  // ── Clothing ───────────────────────────────────────────────────────────
  {
    key: 'essential-cotton-tee', slug: 'essential-organic-cotton-tee', name: 'Essential Organic Cotton Tee',
    department: 'clothing', gender: 'unisex', category: 't-shirts', brand: 'VELORA Studio', styles: ['casual'],
    price: 3500, cost: 1100, sizes: TOPS, sizeGuide: 'tops', bestSeller: true,
    short: 'A 220gsm organic cotton tee with a clean crew neck.',
    description: 'The foundation of a considered wardrobe. Cut from dense 220gsm organic cotton jersey that softens with every wash, finished with a narrow ribbed collar that keeps its shape and a slightly dropped shoulder for an easy drape.',
    specs: [['Composition', '100% organic cotton, 220gsm'], ['Fit', 'Regular, true to size'], ['Neckline', 'Ribbed crew'], ['Care', 'Machine wash 30°C, dry flat']],
    tags: ['tee', 't-shirt', 'basics', 'white', 'organic'],
  },
  {
    key: 'heavyweight-boxy-tee', slug: 'heavyweight-boxy-tee', name: 'Heavyweight Boxy Tee',
    department: 'clothing', gender: 'men', category: 't-shirts', brand: 'VELORA Studio', styles: ['streetwear', 'casual'],
    price: 4500, cost: 1400, sizes: MENS_TOPS, sizeGuide: 'tops', newArrival: true,
    short: 'Boxy 280gsm cotton with a cropped, structured body.',
    description: 'A structured streetwear staple in 280gsm combed cotton. The boxy body sits slightly cropped at the hip, while the thick collar band and double-needle seams give it the weight and longevity of a vintage tee.',
    specs: [['Composition', '100% combed cotton, 280gsm'], ['Fit', 'Boxy, slightly cropped'], ['Details', 'Double-needle hems'], ['Care', 'Machine wash 30°C inside out']],
    tags: ['tee', 'streetwear', 'black', 'oversized'],
  },
  {
    key: 'graphic-street-tee', slug: 'graphic-print-street-tee', name: 'Graphic Print Street Tee',
    department: 'clothing', gender: 'unisex', category: 't-shirts', brand: 'VELORA Studio', styles: ['streetwear'],
    price: 4200, sale: 3200, cost: 1300, sizes: TOPS, sizeGuide: 'tops',
    short: 'Soft-hand screen-printed graphic on garment-dyed cotton.',
    description: 'Garment-dyed cotton jersey printed with a soft-hand water-based ink that sinks into the fabric rather than sitting on top. Relaxed through the body with a slightly longer sleeve — made to be worn hard.',
    specs: [['Composition', '100% cotton, 240gsm'], ['Print', 'Water-based screen print'], ['Fit', 'Relaxed'], ['Care', 'Wash inside out, do not tumble dry']],
    tags: ['graphic', 'print', 'streetwear', 'tee'],
  },
  {
    key: 'oxford-button-down-shirt', slug: 'oxford-button-down-shirt', name: 'Oxford Button-Down Shirt',
    department: 'clothing', gender: 'men', category: 'shirts', brand: 'VELORA Atelier', styles: ['formal', 'casual'],
    price: 8900, cost: 2900, sizes: MENS_TOPS, sizeGuide: 'tops', featured: true, bestSeller: true,
    short: 'Two-ply Oxford cloth with a soft-roll button-down collar.',
    description: 'Woven from two-ply Oxford cotton with a gentle sheen, this shirt moves effortlessly from boardroom to weekend. The unlined button-down collar rolls naturally, and mother-of-pearl buttons add a quiet note of luxury.',
    specs: [['Composition', '100% cotton Oxford, two-ply'], ['Collar', 'Unlined button-down'], ['Buttons', 'Mother-of-pearl'], ['Care', 'Machine wash 40°C, iron while damp']],
    tags: ['shirt', 'oxford', 'formal', 'office'],
  },
  {
    key: 'relaxed-linen-shirt', slug: 'relaxed-chambray-shirt', name: 'Relaxed Chambray Shirt',
    department: 'clothing', gender: 'unisex', category: 'shirts', brand: 'Maison Ardent', styles: ['casual'],
    price: 7900, cost: 2500, sizes: TOPS, sizeGuide: 'tops', newArrival: true,
    short: 'Lightweight chambray with a relaxed, airy cut.',
    description: 'A lightweight chambray cut for warmth and ease. The relaxed body, dropped shoulders and curved hem make it as natural tucked into tailoring as it is worn open over a tee.',
    specs: [['Composition', '100% cotton chambray'], ['Fit', 'Relaxed'], ['Hem', 'Curved shirttail'], ['Care', 'Machine wash 30°C']],
    tags: ['shirt', 'chambray', 'summer', 'casual'],
  },
  {
    key: 'pique-polo-shirt', slug: 'pique-polo-shirt', name: 'Piqué Polo Shirt',
    department: 'clothing', gender: 'men', category: 'shirts', brand: 'VELORA Studio', styles: ['casual'],
    price: 6500, sale: 4900, cost: 1900, sizes: MENS_TOPS, sizeGuide: 'tops',
    short: 'Breathable cotton piqué with a two-button placket.',
    description: 'A refined take on the classic polo in breathable cotton piqué. A two-button placket, ribbed collar and split side hem keep it sharp enough to wear with tailored trousers.',
    specs: [['Composition', '100% cotton piqué'], ['Placket', 'Two-button'], ['Fit', 'Regular'], ['Care', 'Machine wash 30°C']],
    tags: ['polo', 'summer', 'coral'],
  },
  {
    key: 'selvedge-slim-jeans', slug: 'slim-raw-denim-jeans', name: 'Slim Raw Denim Jeans',
    department: 'clothing', gender: 'men', category: 'jeans', brand: 'VELORA Studio', styles: ['casual', 'streetwear'],
    price: 12500, cost: 4200, sizes: WAIST, sizeGuide: 'bottoms', bestSeller: true,
    short: '13.5oz raw denim in a tapered slim fit.',
    description: 'Unwashed 13.5oz denim that will fade to your own pattern of wear. A mid rise, slim thigh and gentle taper to the ankle give a clean line that works with sneakers and boots alike.',
    specs: [['Composition', '100% cotton, 13.5oz raw denim'], ['Fit', 'Slim, tapered'], ['Rise', 'Mid'], ['Care', 'Wash sparingly, cold, inside out']],
    tags: ['jeans', 'denim', 'raw', 'indigo'],
  },
  {
    key: 'wide-leg-jeans', slug: 'high-rise-straight-jeans', name: 'High-Rise Straight Jeans',
    department: 'clothing', gender: 'women', category: 'jeans', brand: 'Maison Ardent', styles: ['casual'],
    price: 11500, cost: 3800, sizes: WOMENS, sizeGuide: 'bottoms', newArrival: true,
    short: 'Light-wash rigid denim with a high rise and straight leg.',
    description: 'A high-rise straight jean in rigid light-wash denim, cut to sit at the natural waist and fall cleanly to the ankle. Vintage-inspired, with a modern, flattering line.',
    specs: [['Composition', '100% cotton denim'], ['Fit', 'High rise, straight leg'], ['Wash', 'Light vintage'], ['Care', 'Machine wash 30°C']],
    tags: ['jeans', 'denim', 'light wash', 'womens'],
  },
  {
    key: 'tailored-wool-trousers', slug: 'tailored-wool-trousers', name: 'Tailored Pleated Trousers',
    department: 'clothing', gender: 'unisex', category: 'trousers', brand: 'VELORA Atelier', styles: ['formal'],
    price: 14500, cost: 4900, sizes: WAIST, sizeGuide: 'bottoms', featured: true,
    short: 'Single-pleat trousers in fluid wool-blend twill.',
    description: 'Single forward pleats and a softly wide leg give these trousers an easy, considered drape. Cut from a fluid wool-blend twill with a hook-and-bar closure and pressed crease.',
    specs: [['Composition', '70% wool, 30% polyester'], ['Fit', 'Relaxed, wide leg'], ['Closure', 'Hook-and-bar, zip fly'], ['Care', 'Dry clean']],
    tags: ['trousers', 'tailoring', 'pleated', 'formal'],
  },
  {
    key: 'utility-cargo-pants', slug: 'utility-cargo-pants', name: 'Utility Cargo Trousers',
    department: 'clothing', gender: 'men', category: 'trousers', brand: 'Nordvale', styles: ['streetwear', 'casual'],
    price: 9500, cost: 3100, sizes: WAIST, sizeGuide: 'bottoms',
    short: 'Ripstop cotton cargos with bellowed pockets.',
    description: 'Cotton ripstop cargo trousers with bellowed side pockets, a relaxed straight leg and adjustable toggles at the hem. Built for function, refined for the city.',
    specs: [['Composition', '100% cotton ripstop'], ['Pockets', 'Six, including bellowed cargo'], ['Hem', 'Toggle adjusters'], ['Care', 'Machine wash 30°C']],
    tags: ['cargo', 'utility', 'olive', 'streetwear'],
  },
  {
    key: 'silk-slip-dress', slug: 'satin-slip-dress', name: 'Satin Slip Dress',
    department: 'clothing', gender: 'women', category: 'dresses', brand: 'Maison Ardent', styles: ['formal'],
    price: 16500, cost: 5200, sizes: WOMENS, sizeGuide: 'dresses', featured: true, newArrival: true,
    short: 'Bias-cut satin that skims and moves.',
    description: 'Cut on the bias from liquid satin so it skims the body and moves with you. Delicate adjustable straps and a cowl neckline make it equally at home under a blazer or alone for evening.',
    specs: [['Composition', '100% polyester satin'], ['Cut', 'Bias'], ['Length', 'Midi'], ['Care', 'Hand wash cold']],
    tags: ['dress', 'satin', 'slip', 'evening'],
  },
  {
    key: 'floral-wrap-dress', slug: 'floral-midi-dress', name: 'Floral Midi Dress',
    department: 'clothing', gender: 'women', category: 'dresses', brand: 'Maison Ardent', styles: ['casual'],
    price: 14500, sale: 10900, cost: 4600, sizes: WOMENS, sizeGuide: 'dresses',
    short: 'Printed crêpe with a defined waist and fluid skirt.',
    description: 'A painterly floral print on lightweight crêpe. The defined waist and softly flared midi skirt create a flattering silhouette for long summer days and garden parties.',
    specs: [['Composition', '100% viscose crêpe'], ['Length', 'Midi'], ['Lining', 'Bodice lined'], ['Care', 'Hand wash cold']],
    tags: ['dress', 'floral', 'summer', 'midi'],
  },
  {
    key: 'amethyst-lace-gown', slug: 'amethyst-lace-gown', name: 'Amethyst Lace Gown',
    department: 'clothing', gender: 'women', category: 'dresses', brand: 'VELORA Atelier', styles: ['formal'],
    price: 26500, cost: 8900, sizes: WOMENS, sizeGuide: 'dresses', featured: true,
    short: 'Long-sleeve guipure lace gown with sculpted cut-outs.',
    description: 'An evening gown in deep amethyst guipure lace. Long sleeves and a floor-sweeping skirt are offset by sculpted waist cut-outs — a statement for black-tie and beyond.',
    specs: [['Composition', '100% cotton guipure lace'], ['Lining', 'Fully lined'], ['Length', 'Maxi'], ['Care', 'Specialist dry clean']],
    tags: ['gown', 'lace', 'evening', 'occasion'],
  },
  {
    key: 'leather-biker-jacket', slug: 'leather-biker-jacket', name: 'Leather Biker Jacket',
    department: 'clothing', gender: 'unisex', category: 'jackets', brand: 'Nordvale', styles: ['streetwear', 'casual'],
    price: 49500, cost: 17500, sizes: TOPS, sizeGuide: 'tops', featured: true, bestSeller: true,
    short: 'Supple lambskin with an asymmetric zip.',
    description: 'Our signature biker in supple, vegetable-tanned lambskin. Asymmetric front zip, notched lapels and zipped cuffs follow the classic silhouette, while a softened shoulder makes it endlessly wearable.',
    specs: [['Outer', '100% lambskin leather'], ['Lining', '100% cupro'], ['Hardware', 'Gunmetal zips'], ['Care', 'Specialist leather clean']],
    tags: ['leather', 'biker', 'jacket', 'black'],
  },
  {
    key: 'denim-trucker-jacket', slug: 'denim-trucker-jacket', name: 'Denim Trucker Jacket',
    department: 'clothing', gender: 'unisex', category: 'jackets', brand: 'VELORA Studio', styles: ['casual', 'streetwear'],
    price: 11900, cost: 3900, sizes: TOPS, sizeGuide: 'tops',
    short: 'Classic trucker in rigid 12oz denim.',
    description: 'The classic trucker silhouette in rigid 12oz denim with pleated chest panels, button flap pockets and adjustable waist tabs. A layering piece that only gets better with age.',
    specs: [['Composition', '100% cotton denim, 12oz'], ['Fit', 'Regular'], ['Pockets', 'Four'], ['Care', 'Machine wash cold']],
    tags: ['denim', 'jacket', 'trucker'],
  },
  {
    key: 'camel-wool-overcoat', slug: 'camel-wool-overcoat', name: 'Camel Wool Overcoat',
    department: 'clothing', gender: 'women', category: 'jackets', brand: 'VELORA Atelier', styles: ['formal'],
    price: 38500, sale: 29900, cost: 12800, sizes: WOMENS, sizeGuide: 'tops', featured: true,
    short: 'Double-faced wool-cashmere in an elongated silhouette.',
    description: 'An investment coat in double-faced wool and cashmere. The elongated silhouette, generous lapels and hand-finished seams create warmth without weight — a piece to keep for decades.',
    specs: [['Composition', '90% wool, 10% cashmere'], ['Construction', 'Double-faced, unlined'], ['Length', 'Below the knee'], ['Care', 'Dry clean only']],
    tags: ['coat', 'wool', 'camel', 'outerwear'],
  },
  {
    key: 'quilted-puffer-jacket', slug: 'quilted-puffer-jacket', name: 'Quilted Puffer Jacket',
    department: 'clothing', gender: 'unisex', category: 'jackets', brand: 'Nordvale', styles: ['casual', 'streetwear'],
    price: 24500, cost: 8100, sizes: TOPS, sizeGuide: 'tops', newArrival: true,
    short: 'Responsibly sourced down with a water-repellent shell.',
    description: 'Box-quilted and filled with responsibly sourced down for serious warmth. The water-repellent shell, stand collar and two-way zip make it built for the coldest commutes.',
    specs: [['Shell', '100% recycled nylon, DWR finish'], ['Fill', '90/10 RDS-certified down'], ['Warmth', 'Rated to −10°C'], ['Care', 'Machine wash 30°C, tumble dry with balls']],
    tags: ['puffer', 'down', 'winter', 'jacket'],
  },
  {
    key: 'cloud-fleece-hoodie', slug: 'cloud-fleece-hoodie', name: 'Cloud Fleece Hoodie',
    department: 'clothing', gender: 'unisex', category: 'hoodies', brand: 'VELORA Studio', styles: ['casual', 'sportswear'],
    price: 8500, cost: 2700, sizes: TOPS, sizeGuide: 'tops', bestSeller: true,
    short: 'Brushed-back organic fleece with a double-layer hood.',
    description: 'Our softest hoodie, in 400gsm organic cotton fleece brushed on the inside for a cloud-like feel. A double-layer hood, ribbed trims and kangaroo pocket complete the everyday essential.',
    specs: [['Composition', '100% organic cotton fleece, 400gsm'], ['Fit', 'Relaxed'], ['Hood', 'Double layer, no drawcord'], ['Care', 'Machine wash 30°C']],
    tags: ['hoodie', 'fleece', 'loungewear'],
  },
  {
    key: 'oversized-street-hoodie', slug: 'oversized-street-hoodie', name: 'Oversized Street Hoodie',
    department: 'clothing', gender: 'men', category: 'hoodies', brand: 'VELORA Studio', styles: ['streetwear'],
    price: 9500, cost: 3000, sizes: MENS_TOPS, sizeGuide: 'tops', newArrival: true,
    short: 'Dropped shoulders and a heavyweight loopback body.',
    description: 'A heavyweight loopback hoodie with dramatically dropped shoulders and an oversized body. Garment-dyed for a lived-in tone that pairs with everything in a streetwear rotation.',
    specs: [['Composition', '100% cotton loopback, 450gsm'], ['Fit', 'Oversized'], ['Finish', 'Garment dyed'], ['Care', 'Wash inside out at 30°C']],
    tags: ['hoodie', 'oversized', 'black', 'streetwear'],
  },
  {
    key: 'merino-crew-sweater', slug: 'merino-crew-sweater', name: 'Merino Crew Sweater',
    department: 'clothing', gender: 'unisex', category: 'knitwear', brand: 'VELORA Atelier', styles: ['casual', 'formal'],
    price: 12500, cost: 4100, sizes: TOPS, sizeGuide: 'tops',
    short: 'Extra-fine merino, fully fashioned.',
    description: 'Knitted from extra-fine 18.5-micron merino wool, fully fashioned for a precise fit with no bulky seams. Temperature-regulating and naturally odour resistant — the ideal layer from autumn to spring.',
    specs: [['Composition', '100% extra-fine merino wool'], ['Gauge', '12gg, fully fashioned'], ['Fit', 'Regular'], ['Care', 'Hand wash cold, dry flat']],
    tags: ['knit', 'merino', 'sweater', 'jumper'],
  },
  {
    key: 'navy-tailored-suit', slug: 'navy-tailored-suit', name: 'Navy Tailored Suit',
    department: 'clothing', gender: 'men', category: 'suits', brand: 'VELORA Atelier', styles: ['formal'],
    price: 59500, cost: 21000, sizes: ['36R', '38R', '40R', '42R', '44R'], sizeGuide: 'tops', featured: true,
    short: 'Half-canvassed Super 120s wool, two-piece.',
    description: 'A two-piece suit in Super 120s Italian wool with a half-canvas construction that moulds to you over time. Notch lapels, a soft natural shoulder and flat-front trousers — timeless formal wear.',
    specs: [['Cloth', 'Super 120s wool, Biella'], ['Construction', 'Half canvas'], ['Includes', 'Jacket and flat-front trousers'], ['Care', 'Dry clean only']],
    tags: ['suit', 'tailoring', 'wedding', 'formal'],
  },
  {
    key: 'sculpted-blazer', slug: 'sculpted-blazer', name: 'Sculpted Single-Breasted Blazer',
    department: 'clothing', gender: 'women', category: 'suits', brand: 'Maison Ardent', styles: ['formal'],
    price: 24500, cost: 8000, sizes: WOMENS, sizeGuide: 'tops', newArrival: true,
    short: 'Strong shoulders and a nipped waist.',
    description: 'A sharply sculpted blazer with defined shoulders, a nipped waist and single-button closure. Fully lined in silky cupro and cut to layer over knits or wear as a two-piece.',
    specs: [['Composition', '64% polyester, 34% viscose, 2% elastane'], ['Lining', '100% cupro'], ['Closure', 'Single button'], ['Care', 'Dry clean']],
    tags: ['blazer', 'tailoring', 'workwear'],
  },
  {
    key: 'aero-performance-tee', slug: 'aero-performance-tee', name: 'Aero Performance Tee',
    department: 'clothing', gender: 'men', category: 'activewear', brand: 'Kinetic Lab', styles: ['sportswear'],
    price: 4500, cost: 1300, sizes: MENS_TOPS, sizeGuide: 'tops',
    short: 'Quick-dry, anti-odour training tee.',
    description: 'A lightweight training tee in quick-drying recycled polyester with a silver-ion anti-odour finish. Laser-cut ventilation at the back keeps you cool through the hardest sessions.',
    specs: [['Composition', '88% recycled polyester, 12% elastane'], ['Features', 'Quick dry, anti-odour'], ['Fit', 'Athletic'], ['Care', 'Machine wash 30°C']],
    tags: ['training', 'gym', 'performance', 'sportswear'],
  },
  {
    key: 'contour-training-leggings', slug: 'contour-training-leggings', name: 'Contour Training Leggings',
    department: 'clothing', gender: 'women', category: 'activewear', brand: 'Kinetic Lab', styles: ['sportswear'],
    price: 6800, sale: 5400, cost: 2000, sizes: TOPS, sizeGuide: 'bottoms', bestSeller: true,
    short: 'Sculpting, squat-proof compression fabric.',
    description: 'High-rise leggings in a sculpting, squat-proof compression fabric with a buttery hand. A wide waistband stays put and a hidden pocket holds your keys or card.',
    specs: [['Composition', '75% recycled nylon, 25% elastane'], ['Rise', 'High'], ['Features', 'Squat-proof, hidden pocket'], ['Care', 'Machine wash cold']],
    tags: ['leggings', 'yoga', 'gym', 'sportswear'],
  },
  {
    key: 'velocity-track-jacket', slug: 'velocity-hooded-windbreaker', name: 'Velocity Hooded Windbreaker',
    department: 'clothing', gender: 'men', category: 'activewear', brand: 'Kinetic Lab', styles: ['sportswear', 'streetwear'],
    price: 11500, cost: 3700, sizes: MENS_TOPS, sizeGuide: 'tops',
    short: 'Packable, wind-resistant ripstop shell.',
    description: 'A packable hooded windbreaker in lightweight ripstop that blocks wind and sheds light rain. Elasticated cuffs and an adjustable hem make it ideal for runs, rides and travel.',
    specs: [['Composition', '100% recycled polyester ripstop'], ['Features', 'Wind resistant, packable'], ['Hood', 'Adjustable'], ['Care', 'Machine wash 30°C']],
    tags: ['windbreaker', 'running', 'jacket', 'sportswear'],
  },
  // ── Footwear ───────────────────────────────────────────────────────────
  {
    key: 'court-classic-sneaker', slug: 'court-classic-leather-sneaker', name: 'Court Classic Leather Sneaker',
    department: 'footwear', gender: 'unisex', category: 'sneakers', brand: 'Rue Lumière', styles: ['casual'],
    price: 12500, cost: 4200, sizes: UNISEX_SHOES, sizeGuide: 'footwear', featured: true, bestSeller: true,
    short: 'Full-grain leather court sneaker on a cupsole.',
    description: 'A minimal court sneaker in full-grain Italian leather, stitched to a durable rubber cupsole. Leather lining and a cushioned footbed make it the pair you reach for every day.',
    specs: [['Upper', 'Full-grain Italian leather'], ['Lining', 'Leather'], ['Sole', 'Stitched rubber cupsole'], ['Fit', 'True to size']],
    tags: ['sneakers', 'white', 'leather', 'trainers'],
  },
  {
    key: 'retro-runner-sneaker', slug: 'retro-runner-sneaker', name: 'Retro Runner Sneaker',
    department: 'footwear', gender: 'unisex', category: 'sneakers', brand: 'Kinetic Lab', styles: ['casual', 'streetwear'],
    price: 11500, cost: 3800, sizes: UNISEX_SHOES, sizeGuide: 'footwear', newArrival: true,
    short: 'Suede and mesh runner with a 90s profile.',
    description: 'A nineties-inspired runner in suede and breathable mesh, set on a cushioned EVA midsole. Bold colour blocking and a padded collar give it everyday comfort with archive attitude.',
    specs: [['Upper', 'Suede and mesh'], ['Midsole', 'EVA'], ['Outsole', 'Rubber'], ['Fit', 'True to size']],
    tags: ['sneakers', 'retro', 'runner', 'trainers'],
  },
  {
    key: 'canvas-high-top', slug: 'canvas-high-top', name: 'Canvas High-Top',
    department: 'footwear', gender: 'unisex', category: 'sneakers', brand: 'VELORA Studio', styles: ['casual', 'streetwear'],
    price: 7500, sale: 5900, cost: 2300, sizes: UNISEX_SHOES, sizeGuide: 'footwear',
    short: 'Heavy cotton canvas on a vulcanised sole.',
    description: 'The archetypal high-top in heavyweight cotton canvas with a vulcanised rubber sole, metal eyelets and a cushioned insole. Endlessly versatile and made to be broken in.',
    specs: [['Upper', '12oz cotton canvas'], ['Sole', 'Vulcanised rubber'], ['Insole', 'Cushioned'], ['Fit', 'Half size large']],
    tags: ['high top', 'canvas', 'sneakers'],
  },
  {
    key: 'platform-sneaker', slug: 'chunky-platform-sneaker', name: 'Chunky Platform Sneaker',
    department: 'footwear', gender: 'women', category: 'sneakers', brand: 'Kinetic Lab', styles: ['streetwear', 'casual'],
    price: 13500, cost: 4500, sizes: WOMENS_SHOES, sizeGuide: 'footwear', newArrival: true,
    short: 'Layered panels on a sculpted 5cm platform.',
    description: 'Layered leather and mesh panels sit on a sculpted 5cm platform sole for an elevated, lightweight lift. Statement-making but surprisingly comfortable for all-day wear.',
    specs: [['Upper', 'Leather and mesh'], ['Platform', '5cm'], ['Sole', 'Lightweight EVA'], ['Fit', 'True to size']],
    tags: ['platform', 'chunky', 'sneakers', 'womens'],
  },
  {
    key: 'velocity-running-shoe', slug: 'velocity-running-shoe', name: 'Velocity Running Shoe',
    department: 'footwear', gender: 'men', category: 'sports-shoes', brand: 'Kinetic Lab', styles: ['sportswear'],
    price: 13500, cost: 4600, sizes: MENS_SHOES, sizeGuide: 'footwear', featured: true,
    short: 'Responsive foam and an engineered-knit upper.',
    description: 'A daily trainer with a responsive supercritical foam midsole and a breathable engineered-knit upper. A rocker geometry rolls you smoothly from heel to toe, mile after mile.',
    specs: [['Upper', 'Engineered knit'], ['Midsole', 'Supercritical foam'], ['Drop', '8mm'], ['Weight', '255g (UK 8)']],
    tags: ['running', 'trainers', 'sports', 'gym'],
  },
  {
    key: 'suede-penny-loafer', slug: 'horsebit-leather-loafer', name: 'Horsebit Leather Loafer',
    department: 'footwear', gender: 'men', category: 'casual-shoes', brand: 'Oxford & Vale', styles: ['formal', 'casual'],
    price: 18500, cost: 6200, sizes: MENS_SHOES, sizeGuide: 'footwear',
    short: 'Hand-burnished calf leather with polished hardware.',
    description: 'A Blake-stitched loafer in hand-burnished calf leather finished with a polished horsebit. Flexible from the first wear and smart enough for tailoring.',
    specs: [['Upper', 'Calf leather, hand burnished'], ['Construction', 'Blake stitched'], ['Sole', 'Leather with rubber heel'], ['Fit', 'Half size small']],
    tags: ['loafer', 'leather', 'cognac'],
  },
  {
    key: 'canvas-slip-on', slug: 'canvas-skate-shoe', name: 'Canvas Skate Shoe',
    department: 'footwear', gender: 'unisex', category: 'casual-shoes', brand: 'VELORA Studio', styles: ['streetwear', 'casual'],
    price: 6500, cost: 2000, sizes: UNISEX_SHOES, sizeGuide: 'footwear',
    short: 'Suede and canvas on a grippy waffle sole.',
    description: 'A low-profile skate shoe in suede and canvas with a padded collar and grippy waffle outsole. Durable, comfortable and effortlessly cool.',
    specs: [['Upper', 'Suede and canvas'], ['Sole', 'Vulcanised waffle rubber'], ['Collar', 'Padded'], ['Fit', 'True to size']],
    tags: ['skate', 'canvas', 'casual shoes'],
  },
  {
    key: 'brogue-derby', slug: 'brogue-derby-shoe', name: 'Brogue Derby Shoe',
    department: 'footwear', gender: 'men', category: 'formal-shoes', brand: 'Oxford & Vale', styles: ['formal'],
    price: 21500, cost: 7400, sizes: MENS_SHOES, sizeGuide: 'footwear', featured: true,
    short: 'Goodyear-welted calf with full brogue detailing.',
    description: 'A Goodyear-welted derby in rich calf leather with full brogue perforations. Resoleable and built to last a lifetime, it bridges formal and weekend dressing with ease.',
    specs: [['Upper', 'Full-grain calf leather'], ['Construction', 'Goodyear welted'], ['Sole', 'Leather'], ['Fit', 'True to size']],
    tags: ['brogue', 'derby', 'formal shoes', 'leather'],
  },
  {
    key: 'pointed-stiletto-pump', slug: 'pointed-stiletto-pump', name: 'Pointed Stiletto Pump',
    department: 'footwear', gender: 'women', category: 'formal-shoes', brand: 'Rue Lumière', styles: ['formal'],
    price: 19500, sale: 15500, cost: 6300, sizes: WOMENS_SHOES, sizeGuide: 'footwear', bestSeller: true,
    short: 'Patent leather with a 95mm stiletto.',
    description: 'A sleek pointed-toe pump with a 95mm stiletto heel and a cushioned leather insole. The definitive evening shoe — sharp, elegant and surprisingly comfortable.',
    specs: [['Upper', 'Leather'], ['Heel', '95mm stiletto'], ['Insole', 'Padded leather'], ['Fit', 'True to size']],
    tags: ['heels', 'pumps', 'evening', 'stiletto'],
  },
  {
    key: 'leather-combat-boot', slug: 'leather-combat-boot', name: 'Leather Combat Boot',
    department: 'footwear', gender: 'unisex', category: 'boots', brand: 'Nordvale', styles: ['streetwear', 'casual'],
    price: 22500, cost: 7600, sizes: UNISEX_SHOES, sizeGuide: 'footwear', featured: true,
    short: 'Oiled leather with a lugged commando sole.',
    description: 'A lace-up combat boot in water-resistant oiled leather on a lugged commando sole. Goodyear welted for durability and finished with a padded collar for all-day comfort.',
    specs: [['Upper', 'Oiled full-grain leather'], ['Construction', 'Goodyear welted'], ['Sole', 'Lugged rubber commando'], ['Fit', 'True to size']],
    tags: ['boots', 'combat', 'leather', 'winter'],
  },
  {
    key: 'heeled-ankle-boot', slug: 'heeled-ankle-boot', name: 'Heeled Ankle Boot',
    department: 'footwear', gender: 'women', category: 'boots', brand: 'Rue Lumière', styles: ['formal', 'casual'],
    price: 19900, cost: 6600, sizes: WOMENS_SHOES, sizeGuide: 'footwear', newArrival: true,
    short: 'Soft leather with a 70mm block heel.',
    description: 'A sleek ankle boot in soft leather on a stable 70mm block heel, with an inside zip for easy on and off. Polished enough for the office, comfortable enough for the weekend.',
    specs: [['Upper', 'Leather'], ['Heel', '70mm block'], ['Closure', 'Inside zip'], ['Fit', 'True to size']],
    tags: ['ankle boots', 'heels', 'boots'],
  },
  {
    key: 'summit-hiking-boot', slug: 'summit-leather-hiking-boot', name: 'Summit Leather Hiking Boot',
    department: 'footwear', gender: 'men', category: 'boots', brand: 'Nordvale', styles: ['sportswear', 'casual'],
    price: 18900, cost: 6400, sizes: MENS_SHOES, sizeGuide: 'footwear',
    short: 'Waterproof nubuck with grippy lugs.',
    description: 'A trail-ready hiking boot in waterproof nubuck with a breathable membrane, padded ankle collar and deep multi-directional lugs for grip on rock and mud alike.',
    specs: [['Upper', 'Waterproof nubuck'], ['Membrane', 'Breathable waterproof'], ['Outsole', 'Multi-directional lug rubber'], ['Fit', 'Roomy toe box']],
    tags: ['hiking', 'boots', 'outdoor', 'waterproof'],
  },
  {
    key: 'suede-zip-ankle-boot', slug: 'suede-zip-ankle-boot', name: 'Suede Zip Ankle Boot',
    department: 'footwear', gender: 'women', category: 'boots', brand: 'Rue Lumière', styles: ['casual'],
    price: 16500, cost: 5500, sizes: WOMENS_SHOES, sizeGuide: 'footwear',
    short: 'Soft suede with a side zip and stud detail.',
    description: 'A flat ankle boot in velvety suede with a practical side zip and tonal stud detailing. Easy to wear with denim, dresses and everything in between.',
    specs: [['Upper', 'Suede'], ['Closure', 'Side zip'], ['Sole', 'Rubber'], ['Fit', 'True to size']],
    tags: ['ankle boots', 'suede', 'boots'],
  },
  {
    key: 'leather-slide-sandal', slug: 'leather-slide-sandal', name: 'Leather Slide Sandal',
    department: 'footwear', gender: 'unisex', category: 'sandals', brand: 'Rue Lumière', styles: ['casual'],
    price: 8500, cost: 2600, sizes: UNISEX_SHOES, sizeGuide: 'footwear',
    short: 'Contoured cork footbed and soft leather straps.',
    description: 'A two-strap slide with a contoured cork-latex footbed that moulds to your foot, finished in soft suede-lined leather. Summer comfort, perfected.',
    specs: [['Straps', 'Leather with suede lining'], ['Footbed', 'Contoured cork-latex'], ['Sole', 'EVA'], ['Fit', 'True to size']],
    tags: ['sandals', 'slides', 'summer'],
  },
  {
    key: 'strappy-heeled-sandal', slug: 'strappy-heeled-sandal', name: 'Strappy Heeled Sandal',
    department: 'footwear', gender: 'women', category: 'sandals', brand: 'Rue Lumière', styles: ['formal'],
    price: 15500, cost: 5100, sizes: WOMENS_SHOES, sizeGuide: 'footwear', newArrival: true,
    short: 'Delicate straps on an 85mm heel.',
    description: 'Barely-there leather straps and an adjustable ankle buckle on an 85mm heel. Designed for occasions that call for elegance and ease in equal measure.',
    specs: [['Upper', 'Leather straps'], ['Heel', '85mm'], ['Closure', 'Adjustable buckle'], ['Fit', 'True to size']],
    tags: ['heels', 'sandals', 'evening', 'wedding'],
  },
  // ── Accessories ────────────────────────────────────────────────────────
  {
    key: 'structured-leather-tote', slug: 'structured-leather-tote', name: 'Structured Leather Tote',
    department: 'accessories', gender: 'women', category: 'bags', brand: 'Rue Lumière', styles: ['formal', 'casual'],
    price: 34500, cost: 11500, sizes: ONE, sizeGuide: 'none', featured: true,
    short: 'Pebbled leather that holds its shape.',
    description: 'A structured tote in pebbled calf leather with a suede-lined interior, zipped inner pocket and detachable pouch. Fits a 14" laptop with room for the day.',
    specs: [['Material', 'Pebbled calf leather'], ['Dimensions', '38 × 28 × 14 cm'], ['Interior', 'Suede lined, zip pocket'], ['Hardware', 'Brushed gold']],
    tags: ['bag', 'tote', 'leather', 'work'],
  },
  {
    key: 'minimal-leather-watch', slug: 'minimal-leather-watch', name: 'Minimal Leather Watch',
    department: 'accessories', gender: 'unisex', category: 'watches', brand: 'VELORA Atelier', styles: ['formal', 'casual'],
    price: 22500, cost: 7800, sizes: ONE, sizeGuide: 'none', bestSeller: true,
    short: 'Swiss quartz, sapphire crystal, 38mm.',
    description: 'A 38mm steel case with a domed sapphire crystal and Swiss quartz movement, paired with an Italian leather strap. Clean, legible and quietly confident.',
    specs: [['Case', '38mm stainless steel'], ['Movement', 'Swiss quartz'], ['Crystal', 'Sapphire'], ['Water resistance', '5 ATM']],
    tags: ['watch', 'leather', 'gift'],
  },
  {
    key: 'cashmere-scarf', slug: 'cashmere-blend-scarf', name: 'Cashmere-Blend Scarf',
    department: 'accessories', gender: 'unisex', category: 'scarves', brand: 'VELORA Atelier', styles: ['casual', 'formal'],
    price: 12500, sale: 8900, cost: 4000, sizes: ONE, sizeGuide: 'none',
    short: 'Brushed wool-cashmere with fringed edges.',
    description: 'A generously sized scarf in brushed wool and cashmere, woven in Scotland and finished with hand-twisted fringing. Warm, soft and impossibly light.',
    specs: [['Composition', '80% wool, 20% cashmere'], ['Dimensions', '190 × 35 cm'], ['Origin', 'Woven in Scotland'], ['Care', 'Dry clean']],
    tags: ['scarf', 'cashmere', 'winter', 'gift'],
  },
  {
    key: 'classic-leather-belt', slug: 'classic-leather-belt', name: 'Classic Leather Belt',
    department: 'accessories', gender: 'unisex', category: 'belts', brand: 'Oxford & Vale', styles: ['formal', 'casual'],
    price: 7500, cost: 2300, sizes: ['S', 'M', 'L'], sizeGuide: 'none',
    short: 'Bridle leather with a solid brass buckle.',
    description: 'Cut from a single strip of English bridle leather and finished with a solid brass buckle. Develops a rich patina and will outlast almost everything else in your wardrobe.',
    specs: [['Material', 'English bridle leather'], ['Width', '3.5cm'], ['Buckle', 'Solid brass'], ['Sizes', 'S 80cm · M 90cm · L 100cm']],
    tags: ['belt', 'leather', 'tan'],
  },
  {
    key: 'acetate-sunglasses', slug: 'acetate-sunglasses', name: 'Acetate Sunglasses',
    department: 'accessories', gender: 'unisex', category: 'eyewear', brand: 'Rue Lumière', styles: ['casual'],
    price: 16500, cost: 5200, sizes: ONE, sizeGuide: 'none', newArrival: true,
    short: 'Hand-polished acetate, polarised lenses.',
    description: 'Hand-polished Italian acetate frames with polarised, UV400-protective lenses and five-barrel hinges. Supplied with a leather case and cleaning cloth.',
    specs: [['Frame', 'Italian acetate'], ['Lens', 'Polarised, UV400'], ['Hinge', 'Five-barrel'], ['Includes', 'Leather case']],
    tags: ['sunglasses', 'eyewear', 'summer'],
  },
  {
    key: 'signature-cap', slug: 'signature-cotton-cap', name: 'Signature Cotton Cap',
    department: 'accessories', gender: 'unisex', category: 'hats', brand: 'VELORA Studio', styles: ['casual', 'streetwear'],
    price: 4500, cost: 1200, sizes: ONE, sizeGuide: 'none',
    short: 'Washed cotton twill with an adjustable strap.',
    description: 'A six-panel cap in washed cotton twill with a pre-curved brim and adjustable leather strap. Soft from day one, with tonal embroidery.',
    specs: [['Material', '100% cotton twill'], ['Fit', 'Adjustable leather strap'], ['Brim', 'Pre-curved'], ['Care', 'Spot clean']],
    tags: ['cap', 'hat', 'baseball cap'],
  },
];

/**
 * Garments shown on hangers in the 3D showroom (/showroom). Only pieces that
 * naturally hang on a rail are included — footwear, accessories, trousers and
 * activewear keep their normal product pages only.
 */
export const SHOWROOM_SLUGS: string[] = [
  // Shirts & polos
  'oxford-button-down-shirt',
  'relaxed-chambray-shirt',
  'pique-polo-shirt',
  // Tees
  'essential-organic-cotton-tee',
  'heavyweight-boxy-tee',
  'graphic-print-street-tee',
  // Outerwear
  'leather-biker-jacket',
  'denim-trucker-jacket',
  'camel-wool-overcoat',
  'quilted-puffer-jacket',
  // Dresses
  'satin-slip-dress',
  'floral-midi-dress',
  'amethyst-lace-gown',
  // Tailoring
  'navy-tailored-suit',
  'sculpted-blazer',
  // Knit & hoodies
  'merino-crew-sweater',
  'cloud-fleece-hoodie',
  'oversized-street-hoodie',
];
