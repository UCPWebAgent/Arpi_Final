// structuredExtraction.ts
// Parses free-form mechanic speech into structured YMME, parts, and symptom data.
// Receives text that has ALREADY been through Armenian normalization (personaEngine),
// so Armenian part names arrive as their English equivalents.

// ─── Public surface ───────────────────────────────────────────────────────────

export interface ExtractedVehicle {
  year?: string
  make?: string
  model?: string
  engine?: string
}

export interface ExtractedPart {
  name: string
  quantity: number
}

export interface ExtractionResult {
  vehicle: ExtractedVehicle
  parts: ExtractedPart[]
  symptomFragments: string[]
  hasVehicleData: boolean
  hasPartData: boolean
}

// ─── Year ─────────────────────────────────────────────────────────────────────

const YEAR_RE = /\b(19[5-9]\d|200\d|201\d|202[0-9])\b/

// ─── Engine ───────────────────────────────────────────────────────────────────

const ENGINE_RE =
  /\b(v[2468]|[1-9]\.[0-9]\s?(?:l(?:iter)?|t(?:urbo)?)|i[346]|inline[\s-]?[346]|flat[\s-]?[46]|turbo|diesel|hybrid|electric|rotary|boxer)\b/i

// ─── Makes ────────────────────────────────────────────────────────────────────
// Key: lowercase (may be multi-word). Value: display name.
// Sorted longest-first at build time so multi-word makes match before substrings.

const RAW_MAKES: [string, string][] = [
  ['mercedes-benz', 'Mercedes-Benz'], ['mercedes benz', 'Mercedes-Benz'],
  ['land rover', 'Land Rover'],       ['alfa romeo', 'Alfa Romeo'],
  ['aston martin', 'Aston Martin'],
  ['mercedes', 'Mercedes-Benz'],      ['chevrolet', 'Chevrolet'],
  ['mitsubishi', 'Mitsubishi'],       ['volkswagen', 'Volkswagen'],
  ['chrysler', 'Chrysler'],           ['cadillac', 'Cadillac'],
  ['infiniti', 'Infiniti'],           ['genesis', 'Genesis'],
  ['lincoln', 'Lincoln'],             ['hyundai', 'Hyundai'],
  ['porsche', 'Porsche'],             ['jaguar', 'Jaguar'],
  ['subaru', 'Subaru'],               ['nissan', 'Nissan'],
  ['toyota', 'Toyota'],               ['mazda', 'Mazda'],
  ['honda', 'Honda'],                 ['lexus', 'Lexus'],
  ['acura', 'Acura'],                 ['buick', 'Buick'],
  ['dodge', 'Dodge'],                 ['tesla', 'Tesla'],
  ['volvo', 'Volvo'],                 ['chevy', 'Chevrolet'],
  ['ford', 'Ford'],                   ['jeep', 'Jeep'],
  ['mini', 'MINI'],                   ['fiat', 'Fiat'],
  ['audi', 'Audi'],                   ['bmw', 'BMW'],
  ['gmc', 'GMC'],                     ['kia', 'Kia'],
  ['ram', 'Ram'],                     ['vw', 'Volkswagen'],
]

// Sort longest key first so "land rover" matches before "rover"-like substrings
const MAKES_SORTED = RAW_MAKES.sort((a, b) => b[0].length - a[0].length)

// ─── Known models (flat lookup, lowercase) ────────────────────────────────────

const KNOWN_MODELS = new Set<string>([
  // Toyota
  'camry','corolla','rav4','highlander','tacoma','tundra','sienna','prius',
  '4runner','sequoia','avalon','yaris','supra','venza','matrix','echo','tercel',
  // Honda
  'civic','accord','cr-v','pilot','odyssey','fit','hr-v','ridgeline','passport','insight','element',
  // Ford
  'f-150','f150','f-250','f-350','mustang','explorer','escape','focus','fusion',
  'edge','ranger','expedition','bronco','maverick','transit','taurus','excursion',
  // Chevrolet
  'silverado','equinox','traverse','malibu','camaro','corvette','colorado','tahoe',
  'suburban','blazer','trailblazer','impala','cruze','spark','trax','bolt','sonic','cobalt',
  // GMC
  'sierra','terrain','acadia','yukon','canyon','envoy','jimmy',
  // Dodge / Ram
  'charger','challenger','durango','journey','dart','viper','neon','stratus','magnum',
  '1500','2500','3500',
  // Jeep
  'wrangler','grand cherokee','cherokee','compass','renegade','gladiator','patriot','liberty',
  // Nissan
  'altima','maxima','sentra','versa','rogue','murano','pathfinder','frontier','titan',
  'xterra','armada','370z','350z','leaf','kicks','juke',
  // Hyundai / Kia
  'elantra','sonata','tucson','santa fe','kona','accent','veloster','tiburon',
  'optima','forte','sorento','sportage','soul','stinger','telluride','carnival','niro','rio','k5',
  // Subaru
  'outback','forester','impreza','legacy','crosstrek','ascent','wrx','brz',
  // Mazda
  'cx-5','cx-3','cx-9','mazda3','mazda6','mx-5','miata','cx-30',
  // VW
  'jetta','passat','golf','tiguan','atlas','beetle','touareg','gti','cc',
  // BMW
  '3 series','5 series','7 series','x3','x5','x1','x7','m3','m5','m4','4 series',
  // Lexus / Acura / Infiniti
  'rx','es','is','gx','lx','nx','ux','ls',
  'mdx','rdx','tlx','ilx','tsx','tl',
  'q50','q60','qx60','qx80','g37','fx35',
  // Mercedes / Audi
  'c-class','e-class','s-class','glc','gle','gla','cla',
  'a4','a6','a3','q5','q7','q3','a8','tt',
  // Cadillac / Buick
  'escalade','ct5','ct4','xt5','xt4','xt6','srx','cts','ats',
  'enclave','encore','envision','lacrosse','regal',
])

// Stopwords — end model scanning on these
const MODEL_STOPS = new Set([
  'the','a','an','my','our','this','that','its','with','and','or','for',
  'in','on','at','to','is','it','i','we','have','has','had','need','needed',
  'needs','want','get','got','bring','check','fix','repair','replace',
])

// ─── Parts ────────────────────────────────────────────────────────────────────
// Sorted longest-first to ensure multi-word names match before their substrings.

const RAW_PARTS: string[] = [
  // 3+ word
  'mass air flow sensor','idle air control valve','crankshaft position sensor',
  'camshaft position sensor','intake air temperature sensor',
  'evap canister purge valve','manifold absolute pressure sensor',
  'throttle position sensor','coolant temperature sensor',
  // 2-word
  'cabin air filter','air filter','oil filter','fuel filter','fuel pump',
  'water pump','timing belt','timing chain','serpentine belt','drive belt',
  'brake pads','brake pad','brake rotor','brake rotors','brake caliper','brake calipers',
  'brake fluid','brake line','brake hose',
  'wheel bearing','hub bearing','wheel hub',
  'control arm','tie rod','ball joint','sway bar','stabilizer bar',
  'cv axle','cv joint','half shaft',
  'head gasket','valve cover','intake manifold','exhaust manifold',
  'catalytic converter','oxygen sensor','egr valve','pcv valve',
  'ignition coil','ignition module','distributor cap','spark plug','spark plugs',
  'wiper blade','wiper blades','cabin filter',
  'motor mount','engine mount','transmission mount',
  'power steering pump','power steering fluid','steering rack',
  'transmission fluid','differential fluid','transfer case fluid',
  'radiator hose','heater hose','coolant reservoir',
  'window regulator','door handle','mirror motor',
  // 1-word
  'battery','alternator','starter','radiator','thermostat','compressor',
  'condenser','accumulator','distributor','solenoid','relay',
  'strut','struts','shocks','shock','caliper','rotor','rotors',
  'coolant','antifreeze','headlight','taillight','foglight',
  'brakes','sensor','actuator','module',
  'oil',
]

const PARTS_SORTED = [...new Set(RAW_PARTS)].sort((a, b) => b.length - a.length)

// ─── Quantities ───────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  'zero':0,'one':1,'a':1,'an':1,'two':2,'three':3,'four':4,'five':5,
  'six':6,'seven':7,'eight':8,'nine':9,'ten':10,
  'pair':2,'couple':2,'both':2,'set':4,
}
const DIGIT_RE = /\b(\d{1,2})\b/

// ─── Symptom keywords ─────────────────────────────────────────────────────────

const SYMPTOM_KEYWORDS = [
  'noise','sound','vibrat','shak','rattle','knock','ping','click','grind','squeal',
  'leak','drip','seep','smoke','smell','overheat','hot','burning',
  'rough','idle','stall','hesitat','miss','misfire','surge',
  'hard to start','won\'t start','no start','slow to start',
  'check engine','warning light','service light',
  'pull','drift','wander','shimmy','wobble',
  'sluggish','slow','power loss','no power','weak',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWordBoundary(text: string, start: number, end: number): boolean {
  const before = text[start - 1]
  const after  = text[end]
  const startOk = !before || /\W/.test(before)
  const endOk   = !after  || /\W/.test(after)
  return startOk && endOk
}

function extractQuantityBefore(snippet: string): number {
  // Check word numbers first
  const words = snippet.trim().split(/\s+/)
  for (let i = words.length - 1; i >= Math.max(0, words.length - 3); i--) {
    const w = words[i].toLowerCase()
    if (w in NUMBER_WORDS) return NUMBER_WORDS[w]
  }
  // Check digits
  const digits = snippet.match(DIGIT_RE)
  if (digits) {
    const n = parseInt(digits[digits.length - 1], 10)
    if (n > 0 && n <= 50) return n
  }
  return 1  // default
}

function capitalize(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function extractFromTranscript(raw: string): ExtractionResult {
  const lower = raw.toLowerCase()

  // ── Year ──────────────────────────────────────────────────────────────────
  const yearMatch = raw.match(YEAR_RE)
  const year = yearMatch?.[0]

  // ── Make + Model ──────────────────────────────────────────────────────────
  let make: string | undefined
  let model: string | undefined
  let makeEndIdx = -1

  for (const [key, display] of MAKES_SORTED) {
    const idx = lower.indexOf(key)
    if (idx === -1) continue
    if (!isWordBoundary(lower, idx, idx + key.length)) continue
    make = display
    makeEndIdx = idx + key.length
    break
  }

  if (makeEndIdx > -1) {
    // Scan up to 4 tokens after the make for a model name
    const tail = raw.slice(makeEndIdx).trim()
    const tokens = tail.split(/\s+/).slice(0, 4)
    const candidate: string[] = []

    for (const tok of tokens) {
      const clean = tok.replace(/[^a-zA-Z0-9\-]/g, '')
      const lc = clean.toLowerCase()
      if (!lc || MODEL_STOPS.has(lc)) break
      if (YEAR_RE.test(lc)) break           // hit another year — stop
      candidate.push(clean)
      if (candidate.length >= 2) break
    }

    const candidateStr = candidate.join(' ')
    if (candidateStr) {
      // Accept if it's in our known-models set OR looks like a plausible model tag
      if (KNOWN_MODELS.has(candidateStr.toLowerCase()) || /^[A-Za-z0-9][\w\- ]{0,18}$/.test(candidateStr)) {
        model = candidateStr
      }
    }
  }

  // ── Engine ────────────────────────────────────────────────────────────────
  const engineMatch = raw.match(ENGINE_RE)
  const engine = engineMatch ? engineMatch[0].toUpperCase().replace(/\s+/g, '') : undefined

  // ── Parts ─────────────────────────────────────────────────────────────────
  const parts: ExtractedPart[] = []
  const claimedRanges: [number, number][] = []

  for (const partKey of PARTS_SORTED) {
    let searchFrom = 0
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(partKey, searchFrom)
      if (idx === -1) break
      searchFrom = idx + 1

      if (!isWordBoundary(lower, idx, idx + partKey.length)) continue

      // Skip if already covered by a longer match
      const overlaps = claimedRanges.some(([s, e]) => idx < e && idx + partKey.length > s)
      if (overlaps) continue

      claimedRanges.push([idx, idx + partKey.length])

      // Look back up to 60 chars for a quantity
      const lookback = lower.slice(Math.max(0, idx - 60), idx)
      const qty = extractQuantityBefore(lookback)

      parts.push({ name: capitalize(partKey), quantity: qty })
      break  // only take first occurrence of each part name
    }
  }

  // ── Symptoms ──────────────────────────────────────────────────────────────
  const sentences = raw.split(/(?<=[.!?])\s+|(?<=\,)\s+/).filter(s => s.trim().length > 4)
  const symptomFragments = sentences.filter(s => {
    const lc = s.toLowerCase()
    return SYMPTOM_KEYWORDS.some(kw => lc.includes(kw))
  })

  // ── Result ────────────────────────────────────────────────────────────────
  const vehicle: ExtractedVehicle = {}
  if (year)   vehicle.year   = year
  if (make)   vehicle.make   = make
  if (model)  vehicle.model  = model
  if (engine) vehicle.engine = engine

  return {
    vehicle,
    parts,
    symptomFragments,
    hasVehicleData: !!(year || make || model || engine),
    hasPartData: parts.length > 0,
  }
}
