/* =====================================================================
   LEANX SHOWROOM — PROJECT DATA
   ---------------------------------------------------------------------
   This is the ONLY file you edit to add, remove or reorder projects.
   The interface, search, capability lenses, overview map, project stage
   and viewer are all generated from this data.

   To add a project:
     1. Copy one of the objects below and give it a unique `id`
        (lowercase, letters/digits only).
     2. Fill in the fields (see the legend).
     3. Run  `node tools/capture.mjs <id>`  to generate its preview frames
        into assets/shots/ (or drop in your own JPGs using the same names).

   Field legend
     id            unique slug; preview frames are assets/shots/<id>-d1.jpg … -m2.jpg
     order         position in the showroom journey (lower = earlier)
     name          display name
     client        who it was built for (short)
     tagline       one memorable line, shown on the exhibit and stage
     url           live URL
     kind          what type of digital experience it is (short label)
     industry      the client's industry (short label)
     capabilities  array of capability ids from LEANX_CAPABILITIES
     description   "what we built" — one or two sentences, plain language
     highlights    three short facts shown on the stage
     tags          extra search terms (name, kind, industry, capabilities
                   and description are already searchable)
     accent        brand colour of the project (hex) — tints the environment
     featured      true = shown with the "Featured" mark
     embed         true = the live site can be shown inside the portal
                   false = the site forbids embedding (X-Frame-Options / CSP):
                           the viewer shows its captured frames and a QR code
                   Check any site with:  node tools/check-embed.mjs
     embedBlocked  why embedding is refused (shown in the viewer, so the booth
                   can answer the question honestly)
     access        "public" | "private" (private = the site needs a team login;
                   the viewer shows a bar explaining it, not a bare password box)
     gate          for a login-gated site: { note } shown over the viewer
     proxy         OPTIONAL { port } — serve this site through the local proxy
                   in tools/proxy.mjs instead of directly. Only needed for a
                   site that refuses to be framed and that you cannot change.
                   See "Sites that refuse to be embedded" in README.md.
     lang          primary language of the site (for the stage meta)
     capture       optional settings for tools/capture.mjs
                   { settle: ms to wait after load, wheelPause: ms between
                     scroll ticks, prep: JS to run before capturing }
   ===================================================================== */

window.LEANX_CAPABILITIES = [
  { id: 'interactive', label: '3D & Interactive',      short: '3D',         blurb: 'Worlds, simulators and games that run in a browser.',        hue: 186 },
  { id: 'apps',        label: 'AI & Apps',             short: 'AI · Apps',  blurb: 'Products and tools, not just pages.',                        hue: 48  },
  { id: 'commerce',    label: 'E-Commerce',            short: 'Commerce',   blurb: 'Catalogues, carts, checkout and storefront generation.',     hue: 24  },
  { id: 'booking',     label: 'Booking & Platforms',   short: 'Booking',    blurb: 'Marketplaces and booking flows for real operators.',        hue: 214 },
  { id: 'campaign',    label: 'Campaign & Exhibition', short: 'Campaign',   blurb: 'Experiences built for events, launches and promotions.',    hue: 264 },
  { id: 'web',         label: 'Brand & Business Sites', short: 'Websites',  blurb: 'Corporate and service websites that convert.',              hue: 150 },
];

window.LEANX_PROJECTS = [
  {
    id: 'sxan', order: 1, featured: true,
    name: 'SXAN', client: 'MNA Dynamic Torque',
    tagline: 'A CVT gearbox you can drive, break and diagnose in 3D.',
    url: 'https://www.mnadynamictorque.my/sim.html',
    kind: '3D simulator & diagnostic tool', industry: 'Automotive engineering',
    capabilities: ['interactive', 'apps'],
    description: 'A holographic 3D simulator of a steel-belt CVT unit. Shift gears, drag the throttle and watch a physics model spin the pulleys in real time, inject documented faults, read live telemetry, then explode, section or wireframe the 114,000-triangle model.',
    highlights: ['Real-time physics & live telemetry', 'Fault injection with DTC codes', 'Explode, section & hand control'],
    tags: ['3D', 'simulator', 'simulation', 'CVT', 'gearbox', 'transmission', 'motor', 'car', 'diagnostics', 'engineering', 'WebGL', 'telemetry', 'holographic', 'command centre'],
    accent: '#37C8D6', embed: true, access: 'public', lang: 'EN',
    capture: { settle: 14000 },
  },
  {
    id: 'ceritera', order: 2, featured: true,
    name: 'Ceritera', client: 'ceritera.io',
    tagline: 'A bookstore you walk through, not scroll past.',
    url: 'https://bukku-beige.vercel.app/',
    kind: '3D e-commerce world', industry: 'Retail · Books',
    capabilities: ['interactive', 'commerce'],
    description: 'An online Malay bookstore built as an explorable 3D world: eight districts, 91 titles on the shelves, and every book can be picked up, opened and taken home through a full FPX, card and DuitNow checkout.',
    highlights: ['Explorable 3D world, 8 districts', 'Books you can pick up and open', 'Full checkout: FPX, card, DuitNow'],
    tags: ['3D', 'books', 'bookstore', 'shop', 'e-commerce', 'ecommerce', 'world', 'interactive', 'WebGL', 'Malay', 'immersive', 'map'],
    accent: '#D9A441', embed: true, access: 'public', lang: 'BM',
    capture: { settle: 20000, wheelPause: 900 },
  },
  {
    id: 'nexova', order: 3, featured: true,
    name: 'Nexova AI', client: 'Nexova',
    tagline: 'Paste a Shopee or TikTok Shop link. Watch a store go live.',
    url: 'https://www.nexova.my/',
    kind: 'AI storefront builder', industry: 'Digital commerce',
    capabilities: ['apps', 'commerce'],
    description: 'An AI product that reads a seller’s Shopee or TikTok Shop link, then thinks, designs and builds a live storefront in real time, with desktop and mobile previews while it works.',
    highlights: ['Live AI generation, step by step', 'Shopee & TikTok Shop import', 'Desktop and mobile preview'],
    tags: ['AI', 'artificial intelligence', 'automation', 'e-commerce', 'ecommerce', 'storefront', 'Shopee', 'TikTok', 'generator', 'SaaS', 'product', 'website builder'],
    accent: '#4F6BED', embed: false, access: 'public', lang: 'EN',
    embedBlocked: "nexova.my sends X-Frame-Options: SAMEORIGIN and CSP frame-ancestors 'self'",
  },
  {
    id: 'mihas', order: 4, featured: true,
    name: 'Mission X', client: 'MIHAS 2026',
    tagline: 'The whole MIHAS expo, live on your phone.',
    url: 'https://mihas.leanxdigital.io/',
    kind: 'Multiplayer expo game', industry: 'Events & exhibitions',
    capabilities: ['campaign', 'interactive'],
    description: 'An interactive exhibition campaign: a 3D map of the MIHAS halls where visitors make a digital business card, walk the halls alongside other players, find the X and scan QR codes at exhibitor booths, while exhibitors collect leads.',
    highlights: ['3D expo halls you can walk', 'Digital business cards & QR missions', 'Lead capture for exhibitors'],
    tags: ['exhibition', 'expo', 'campaign', 'game', '3D', 'MIHAS', 'event', 'QR', 'leads', 'multiplayer', 'gamification', 'halal'],
    accent: '#3B6FE0', embed: true, access: 'public', lang: 'EN',
    capture: { settle: 14000 },
  },
  {
    id: 'byki', order: 5, featured: false,
    name: 'BYKI', client: 'BYKI',
    tagline: 'Understand your car’s health. No mechanic degree required.',
    url: 'https://www.bykiofficial.com/',
    kind: 'Browser-based diagnostics app', industry: 'Automotive',
    capabilities: ['apps'],
    description: 'A web app that connects to a car’s OBD2 port over Bluetooth and turns raw sensor data into a plain-language health report: a health score, live data, trouble codes and a WhatsApp hand-off to book a fix.',
    highlights: ['Web Bluetooth OBD2 connection', 'Live sensor data & trouble codes', 'Plain-language health score'],
    tags: ['car', 'OBD2', 'diagnostics', 'bluetooth', 'sensors', 'engine', 'app', 'motor', 'vehicle', 'automotive', 'IoT', 'hardware'],
    accent: '#3DDC84', embed: true, access: 'public', lang: 'EN',
  },
  {
    id: 'belum', order: 6, featured: false,
    name: 'Belum', client: 'Belum Platform',
    tagline: 'Six houseboat operators on Temenggor Lake, bookable from one place.',
    url: 'https://www.belumgo.com/',
    kind: 'Booking marketplace', industry: 'Tourism',
    capabilities: ['booking'],
    description: 'A two-sided booking platform for Royal Belum and Temenggor Lake: verified houseboat operators, packages filtered by duration and group size, activities, and an operator side to list a boat.',
    highlights: ['Multi-operator marketplace', 'Filters by duration & group size', 'Operator listings & verification'],
    tags: ['booking', 'houseboat', 'tourism', 'travel', 'marketplace', 'platform', 'Perak', 'Royal Belum', 'lake', 'packages', 'holiday'],
    accent: '#2F7BF6', embed: true, access: 'public', lang: 'EN',
    capture: { settle: 9000 },
  },
  {
    id: 'jomkaki', order: 7, featured: false,
    name: 'JomKaki Rider', client: 'Jom Kaki Motor',
    tagline: 'The ride you want, one message away.',
    url: 'https://jom-kaki-motor-new.vercel.app/',
    kind: 'Motorcycle e-commerce catalogue', industry: 'Automotive retail',
    capabilities: ['commerce', 'web'],
    description: 'A catalogue-commerce site for a motorcycle dealer with five branches: bikes, gear and genuine parts with pricing and financing figures, plus sell, trade-in and road-tax services, all converting through WhatsApp.',
    highlights: ['Catalogue with financing figures', 'Five-branch dealer network', 'Sell, trade-in & renewal flows'],
    tags: ['motorcycle', 'motor', 'bike', 'e-commerce', 'ecommerce', 'catalogue', 'dealer', 'Yamaha', 'Honda', 'retail', 'WhatsApp', 'financing', 'Sarawak'],
    accent: '#E8542A', embed: true, access: 'public', lang: 'EN',
  },
  {
    id: 'tropicor', order: 8, featured: false,
    name: 'Tropicor Foods', client: 'Tropicor Foods',
    tagline: 'Halal food manufacturing, from first recipe to full scale.',
    url: 'https://www.tropicorfoods.com/',
    kind: 'Corporate & product website', industry: 'Food manufacturing',
    capabilities: ['web'],
    description: 'A B2B website for a halal-certified seasoning, sauce and fruit-ingredient manufacturer: product catalogue, OEM and private-label services, the certification story and enquiry paths for foodservice and industry buyers.',
    highlights: ['Product & OEM catalogue', 'Halal, GMP & MESTI story', 'Enquiry & WhatsApp conversion'],
    tags: ['food', 'manufacturing', 'seasoning', 'sauce', 'OEM', 'private label', 'halal', 'B2B', 'ingredients', 'corporate', 'factory'],
    accent: '#2FA37A', embed: true, access: 'public', lang: 'EN',
  },
  {
    id: 'binaplus', order: 9, featured: false,
    name: 'BINA+ Design & Build', client: 'BINA+',
    tagline: 'Homes built with intention, from sketch to handover.',
    url: 'https://www.binaplusdesign.my/',
    kind: 'Bilingual brand website', industry: 'Property & construction',
    capabilities: ['web'],
    description: 'A bilingual (EN / BM) website for a Shah Alam design-and-build studio: packages from RM200k, a 2026 project catalogue, financing options and quote requests, all managed through a headless CMS.',
    highlights: ['EN / BM bilingual', 'Project catalogue & packages', 'Headless CMS the team edits'],
    tags: ['property', 'construction', 'renovation', 'design and build', 'homes', 'architecture', 'bilingual', 'CMS', 'brand', 'quote', 'house'],
    accent: '#B85C38', embed: true, access: 'public', lang: 'EN · BM',
  },
  {
    id: 'ombakdamai', order: 10, featured: false,
    name: 'Ombak Damai', client: 'Ombak Damai, Penarik',
    tagline: 'The sea at the end of the lane.',
    url: 'https://ombak-damai.vercel.app/',
    kind: 'Homestay booking website', industry: 'Hospitality',
    capabilities: ['booking', 'web'],
    description: 'A calm, editorial website for a private kampung homestay in Penarik, Terengganu: the house, the coast, availability and direct booking for one party at a time.',
    highlights: ['Editorial storytelling layout', 'Availability & direct booking', 'Single-property hospitality'],
    tags: ['homestay', 'hospitality', 'booking', 'beach', 'Terengganu', 'villa', 'holiday', 'travel', 'kampung', 'sea'],
    accent: '#3A9A9A', embed: true, access: 'public', lang: 'EN',
  },
  {
    id: 'ftech', order: 11, featured: false,
    name: 'FTECH Lighting', client: 'FTECH',
    tagline: 'Delivering values, solving complexities.',
    url: 'https://www.ftechlighting.com/',
    kind: 'Corporate brand website', industry: 'Lighting & engineering',
    capabilities: ['web'],
    description: 'An editorial corporate website for a lighting design and engineering firm: services from concept to commissioning, an award-winning project portfolio and a CMS the team updates themselves.',
    highlights: ['Editorial full-bleed layout', 'Project portfolio with CMS', 'Consultation & quote paths'],
    tags: ['lighting', 'corporate', 'engineering', 'portfolio', 'CMS', 'industrial', 'commercial', 'brand', 'architecture'],
    accent: '#C0272D', embed: false, access: 'public', lang: 'EN',
    embedBlocked: 'ftechlighting.com sends X-Frame-Options: DENY',
  },
  {
    id: 'tongroro', order: 12, featured: false,
    name: 'Saiboss Tong Roro', client: 'Saiboss Enterprise',
    tagline: 'Skip-bin rental for the Klang Valley, priced in three taps.',
    url: 'https://tongrorobin.vercel.app/',
    kind: 'Service website with instant quote', industry: 'Logistics & waste services',
    capabilities: ['web'],
    description: 'A Malay-language service site for roll-on roll-off bin rental: pick a size, an area and a duration to check the price instantly, then book over WhatsApp. Built to turn searches into calls.',
    highlights: ['Instant price checker', '25 areas, 3 bin sizes', 'WhatsApp-first conversion'],
    tags: ['rental', 'logistics', 'waste', 'bin', 'skip', 'service', 'local business', 'quote', 'calculator', 'Malay', 'lead generation'],
    accent: '#D63B2F', embed: true, access: 'public', lang: 'BM',
  },
  {
    id: 'onex', order: 13, featured: false,
    name: 'One X Transmission', client: 'One X Transmission',
    tagline: 'Diagnosis first. Repairs you can trust.',
    url: 'https://onex-jet.vercel.app/ms',
    kind: 'Workshop website & promo campaign', industry: 'Automotive services',
    capabilities: ['web', 'campaign'],
    description: 'A bilingual website for a CVT and automatic gearbox specialist in Shah Alam: diagnosis-first positioning, service packages, and a seasonal promo campaign with its own landing page and a free OBD2 device tie-in with BYKI.',
    highlights: ['Campaign landing & promo', 'Service packages & booking', 'Cross-promotion with BYKI'],
    tags: ['gearbox', 'transmission', 'workshop', 'automotive', 'motor', 'car', 'service', 'campaign', 'promo', 'Malay', 'Shah Alam', 'CVT'],
    accent: '#C8102E', embed: true, access: 'public', lang: 'BM · EN',
  },
  {
    id: 'discova', order: 14, featured: true,
    name: 'DISCOVA', client: 'Leanx Digital',
    tagline: 'Website visibility intelligence. Audit any site on the spot.',
    url: 'https://www.discova.site/',
    kind: 'Visibility audit platform', industry: 'Marketing intelligence',
    capabilities: ['apps'],
    description: 'Our own website visibility intelligence platform, built and run in-house. Give us a website at the booth and we will run a live audit on this screen and walk you through what it finds.',
    highlights: ['Live audit, run at the booth', 'Website visibility intelligence', 'Built and operated in-house'],
    tags: ['audit', 'visibility', 'SEO', 'analysis', 'intelligence', 'report', 'platform', 'application', 'app', 'software', 'SaaS', 'tool', 'scan'],
    accent: '#7C5CFF', embed: true, access: 'private', lang: 'EN',
    gate: { note: 'DISCOVA is our own tool, so it opens behind a team sign-in. Ask any of us to unlock it and we will audit your website right here.' },
  },
];
