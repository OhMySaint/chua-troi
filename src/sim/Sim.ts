import { rand, randomState, seedRandom } from './rand';
import { SPECIAL_KINDS, type Kind } from '../art/buildings';
import { BASE_SEA, Cover, H, HILL_MAX, STEP, TICK, TICK_STEPS, W, YEAR, idx, roadTier } from '../world/constants';
import type { Command } from './commands';
import { type Airstrike, type Fleet, UNITS, type Unit, pickUnit } from './military';
import { World } from '../world/World';
import { ACHIEVEMENTS } from './achievements';
import { Animal, AnimalSystem } from './Animals';
import { type Culture, type Terrain, cultureById, cultureForTerrain, surveyTerrain } from './cultures';
import { ERAS, MAX_ERA, formatPop } from './eras';
import { Grid } from './Grid';
import { FAITHS, type FaithPolicy, GOVS, type Gov, type Stance, TAXES, civicGold, govsFor } from './policy';

export type Action =
  | 'idle'
  | 'wander'
  | 'flee'
  | 'swim'
  | 'rest'
  | 'huddle'
  | 'eat'
  | 'harvest'
  | 'hunt'
  | 'farm'
  | 'chop'
  | 'build'
  | 'deliver'
  | 'migrate'
  | 'fight'
  | 'march'
  | 'raid'
  | 'retreat'
  | 'pray';

export const ACTION_LABEL: Record<Action, string> = {
  idle: 'Nghỉ ngơi',
  wander: 'Đi dạo',
  flee: 'Chạy trốn',
  swim: 'Bơi vào bờ',
  rest: 'Ở trong nhà',
  huddle: 'Co ro ngoài trời',
  eat: 'Đi ăn',
  harvest: 'Kiếm thức ăn',
  hunt: 'Đi săn',
  farm: 'Khai hoang ruộng',
  chop: 'Đốn gỗ',
  build: 'Xây nhà',
  deliver: 'Chở đồ về làng',
  migrate: 'Di cư',
  fight: 'Chiến đấu',
  march: 'Hành quân',
  raid: 'Tấn công làng địch',
  retreat: 'Rút lui',
  pray: 'Cầu nguyện',
};

export type WishKind =
  | 'rain'
  | 'sun'
  | 'warmth'
  | 'harvest'
  | 'fertility'
  | 'victory'
  | 'peace'
  | 'game'
  | 'forest'
  | 'knowledge'
  | 'smite';

export interface Wish {
  id: number;
  village: number;
  /** The god this prayer is addressed to. */
  god: number;
  kind: WishKind;
  text: string;
  reason: string;
  expires: number;
  target: number;
}

export interface HistoryEntry {
  year: number;
  text: string;
}

export interface LogEntry {
  year: number;
  msg: string;
}

export interface Toast {
  icon: string;
  title: string;
  text: string;
}

export interface Milestone {
  year: number;
  icon: string;
  title: string;
  desc: string;
}

const OFFSETS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];
const MAX_POP = 3800;

/** Civic buildings a nation raises as it develops, with the era each unlocks in. */
export const SPECIALS: { kind: Kind; era: number; per: number }[] = [
  { kind: 'granary', era: 1, per: 25 },
  { kind: 'dock', era: 1, per: 0 },
  { kind: 'market', era: 2, per: 40 },
  { kind: 'smithy', era: 2, per: 0 },
  { kind: 'barracks', era: 3, per: 0 },
  { kind: 'mill', era: 3, per: 40 },
  { kind: 'library', era: 3, per: 0 },
  { kind: 'factory', era: 4, per: 50 },
  { kind: 'school', era: 4, per: 0 },
  { kind: 'hospital', era: 5, per: 0 },
  { kind: 'office', era: 5, per: 40 },
  { kind: 'spaceport', era: 6, per: 0 },
  { kind: 'monument', era: 2, per: 0 },
  { kind: 'theater', era: 3, per: 60 },
  { kind: 'bank', era: 4, per: 0 },
  { kind: 'powerplant', era: 4, per: 70 },
  { kind: 'university', era: 4, per: 0 },
  { kind: 'stadium', era: 5, per: 0 },
  { kind: 'airport', era: 5, per: 0 },
  { kind: 'park', era: 5, per: 50 },
  { kind: 'lab', era: 6, per: 40 },
];
export const SPECIAL_LABEL: Record<Kind, string> = {
  house: '🏠 Nhà ở',
  granary: '🌾 Kho lúa',
  market: '🏪 Chợ',
  smithy: '⚒️ Lò rèn',
  barracks: '🛡️ Doanh trại',
  mill: '⚙️ Cối xay',
  library: '📚 Thư viện',
  factory: '🏭 Nhà máy',
  school: '🏫 Trường học',
  hospital: '🏥 Bệnh viện',
  office: '🏢 Cao ốc',
  dock: '⚓ Bến thuyền',
  spaceport: '🚀 Sân bay vũ trụ',
  monument: '🗿 Tượng đài',
  theater: '🎭 Nhà hát',
  bank: '🏦 Ngân hàng',
  powerplant: '⚡ Nhà máy điện',
  university: '🎓 Đại học',
  stadium: '🏟️ Sân vận động',
  airport: '✈️ Sân bay',
  park: '🌳 Công viên',
  lab: '🔬 Viện nghiên cứu',
};
const kindIndex = (k: Kind) => SPECIAL_KINDS.indexOf(k);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const ADULT = 16 * YEAR;
const CLAIMED = new Set<Action>(['harvest', 'farm', 'chop', 'build']);

type FoodKind = 'farm' | 'forest' | 'fish';
const FOOD_THOUGHT: Record<FoodKind, string> = {
  farm: 'Đi gặt lúa',
  forest: 'Vào rừng hái quả',
  fish: 'Ra bờ nước câu cá',
};

const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const cx = (i: number) => i % W;
const cy = (i: number) => Math.floor(i / W);
const clampX = (v: number) => Math.max(0, Math.min(W - 1, Math.round(v)));
const clampY = (v: number) => Math.max(0, Math.min(H - 1, Math.round(v)));

interface Jobs {
  ripe: number[];
  farmSites: number[];
  houseSites: number[];
  trees: number[];
  firebreak: number[];
  fish: number[];
}

export class Village {
  /** Every village of the current world, indexed by id (lets cities find their capital). */
  static all: Village[] = [];
  id: number;
  base: string;
  culture: Culture;
  /** This settlement's own colour; a nation's cities all show their capital's. */
  hue: number;
  /** Id of the capital of the nation this city belongs to (its own id if it is a capital). */
  nation: number;
  cx: number;
  cy: number;
  founder: string;
  foundYear: number;
  parentName: string;
  terrain: Terrain;
  houses = new Set<number>();
  farms = new Set<number>();
  /** Civic buildings: cell → kind index. */
  buildings = new Map<number, number>();
  partners = new Set<number>();
  /** Foreign cultural influence, 0..100 per culture id. */
  influences = new Map<string, number>();
  food = 6;
  wood = 3;
  pop = 0;
  adults = 0;
  // Disasters lived through — and what they learned.
  floods = 0;
  fires = 0;
  winters = 0;
  strikes = 0;
  quakes = 0;
  minBuildHeight: number;
  foodPerPerson = 2;
  fireWary = false;
  stormWary = false;
  inWinter = false;
  alive = true;
  birthTimer = 10;
  // Progress
  era = 0;
  tech = 0;
  // Faith in the player
  /** Faith in each god (0..100). */
  faiths = [15, 15];
  /** The god this people worships: -1 = their own ancestral gods. */
  patron = -1;
  /** Faith in their patron god (or in whichever god they lean towards). */
  get faith() {
    return this.faiths[this.leaning];
  }
  /** The god who created this people (-1: unknown). */
  homeGod = -1;
  get leaning() {
    if (this.patron >= 0) return this.patron;
    if (this.faiths[0] === this.faiths[1] && this.homeGod >= 0) return this.homeGod;
    return this.faiths[1] > this.faiths[0] ? 1 : 0;
  }
  get religion(): 'native' | 'god' {
    return this.patron >= 0 ? 'god' : 'native';
  }
  addFaith(god: number, d: number) {
    this.faiths[god] = Math.max(0, Math.min(100, this.faiths[god] + d));
  }
  temple = false;
  ritualTimer = 120 + rand() * 120;
  praying = 0;
  wishCooldown = 30 + rand() * 40;
  blessFertile = 0;
  blessWar = 0;
  // Politics
  opinion = new Map<number, number>();
  /** Capital ids of the nations this nation is at war with (only meaningful on a capital). */
  warSet = new Set<number>();
  /** Capital ids of allied nations. */
  allies = new Set<number>();
  /** Capital ids of nations bound to this one by a god's peace treaty: no war, open trade, shared ideas. */
  pacts = new Set<number>();
  // The nation's army (on a capital): rally at the front, march in formation, then lay siege.
  armyPhase: 'none' | 'rally' | 'march' | 'siege' = 'none';
  armyX = 0;
  armyY = 0;
  armyTarget = -1;
  armyT = 0;
  /** The army's planned land route: waypoints x0, y0, x1, y1… (cells), for target armyPathFor. */
  armyPath: number[] = [];
  armyPathFor = -1;
  slots = 0;
  airCd = 30;
  navyCd = 40;
  kills = 0;
  losses = 0;
  annexed = 0;
  absorbedBy = -1;
  leaderId = -1;
  leaderName = '';
  regnal = new Map<string, number>();
  history: HistoryEntry[] = [];
  jobs: Jobs = { ripe: [], farmSites: [], houseSites: [], trees: [], firebreak: [], fish: [] };
  jobTimer = 0;
  colonizeCd = 120;
  /** Lingering damage from disasters and wars (0..1): slows growth and learning until healed. */
  trauma = 0;
  slump = false;

  constructor(id: number, base: string, culture: Culture, color: number, x: number, y: number, minH: number) {
    this.id = id;
    this.nation = id;
    this.base = base;
    this.culture = culture;
    this.hue = color;
    this.cx = x;
    this.cy = y;
    this.minBuildHeight = minH;
    this.founder = '';
    this.foundYear = 0;
    this.parentName = '';
    this.terrain = { water: 0, forest: 0, mountain: 0, open: 0, chill: 0, landmass: 0 };
  }

  get capital(): Village {
    return Village.all[this.nation] ?? this;
  }
  get isCapital() {
    return this.nation === this.id;
  }
  get color() {
    return this.capital.hue;
  }
  /** Wars are fought by nations: every city shares its capital's list of enemy nations. */
  get enemies() {
    return this.capital.warSet;
  }
  /** Is the settlement with id `other` part of a nation we are at war with? */
  hostileTo(other: number) {
    const o = Village.all[other];
    return !!o && this.capital.warSet.has(o.nation);
  }
  /** Extra land the city has spread over beyond its era's core (grows as it needs room). */
  reach = 0;
  /** Seconds an enemy army has held the city unopposed. */
  siegeT = 0;
  /** People lost to collapsing, burning or drowned homes this moment (reported, then reset). */
  toll = 0;
  // ---- Governance (on a capital) ----
  gov: Gov = 'council';
  /** 0 low, 1 normal, 2 high. */
  tax = 1;
  stance: Stance = 'defend';
  openTrade = true;
  faithPolicy: FaithPolicy = 'ancestral';
  /** Civic buildings the rulers have ordered, in order (by kind name). */
  queue: string[] = [];
  /** When false, only the queue is built (the player decides). */
  autoBuild = true;
  /** The treasury. */
  gold = 30;
  /** The people's contentment, 0–100. */
  mood = 60;
  /** Seconds until the AI reconsiders its policies. */
  policyT = 30;
  /** Political system (on a capital, from the industrial age). */
  ideology: '' | 'capitalism' | 'socialism' | 'communism' = '';
  /** Economic health: 1 normal, below 1 in a crisis, above 1 in a boom. */
  econ = 1;
  /** Seconds left of the current crisis (>0) or boom (<0). */
  econT = 0;
  /** Ruined plots rebuilt so far in the current recovery. */
  rebuilt = 0;
  /** Plots where homes were destroyed, waiting to be rebuilt. */
  ruins: number[] = [];
  get radius() {
    return ERAS[this.era].radius + Math.floor(this.reach);
  }
  /** Real population this nation stands for (each person on the map represents many). */
  get people() {
    return this.pop * ERAS[this.era].popScale;
  }
  get cap() {
    return this.houses.size * ERAS[this.era].houseCap;
  }
  count(kind: Kind) {
    const k = SPECIAL_KINDS.indexOf(kind);
    let n = 0;
    for (const v of this.buildings.values()) if (v === k) n++;
    return n;
  }
  has(kind: Kind) {
    return this.count(kind) > 0;
  }
  get title() {
    // From the industrial age the state is named for its politics.
    if (this.era >= 4 && this.ideology) {
      if (this.ideology === 'communism') return 'Cộng hòa Nhân dân';
      if (this.ideology === 'socialism') return 'Cộng hòa Xã hội';
      return this.annexed >= 2 ? 'Liên bang' : 'Cộng hòa';
    }
    if ((this.gov === 'republic' || this.gov === 'merchant') && this.isCapital) return this.era <= 1 ? 'Thành bang' : 'Cộng hòa';
    if (this.annexed >= 2 && this.era >= 2) return this.culture.id === 'thao_nguyen' ? 'Đế quốc' : 'Đế chế';
    return this.culture.states[this.era];
  }
  /** The nation's name ("Đế chế Novgorod"). */
  get nationName() {
    const c = this.capital;
    return `${c.title} ${c.base}`;
  }
  /** A capital is called by its nation's name; other cities just by their own. */
  get name() {
    return this.isCapital ? `${this.title} ${this.base}` : this.base;
  }
  get ruler() {
    return this.leaderName ? `${this.culture.rulers[this.era]} ${this.leaderName}` : '';
  }
}

export class Human {
  id: number;
  name: string;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  culture: string | null = null;
  /** The god whose hand created this person (-1: born of the world). */
  god = -1;
  origin = '';
  colonist = false;
  /** Set down by a god outside any land: wants to break new ground rather than join a village. */
  pioneer = false;
  /** Set down by a god (rather than born): founds a people of the current age, with a story. */
  godMade = false;
  /** Settlers travelling together share a band; they follow its leader and found one village. */
  band = -1;
  leftAt = 0;
  originId = -1;
  /** Settlers sent by a nation found a city of that nation. */
  colonyOf = -1;
  /** While > world time this person is aboard a ship crossing the sea. */
  voyageUntil = 0;
  sailed = false;
  village = -1;
  role: 'none' | 'soldier' = 'none';
  unit: Unit = 'infantry';
  /** Place in the army's formation. */
  slot = 0;
  hunger = rand() * 0.3;
  warmth = 1;
  health = 1;
  action: Action = 'idle';
  thought = '';
  targetIdx = -1;
  tx = 0;
  ty = 0;
  hasTarget = false;
  think = rand() * 0.5;
  work = 0;
  carryFood = 0;
  carryWood = 0;
  turn = rand() < 0.5 ? 1 : -1;
  stuck = 0;
  lastDist = Infinity;
  heading = rand() * Math.PI * 2;
  inside = false;
  dead = false;
  harm = '';
  avoid = -1;
  avoidUntil = 0;
  foe: Human | null = null;
  prey: Animal | null = null;
  attackCd = 0;
  lastHitBy = -1;

  constructor(id: number, name: string, x: number, y: number, age: number) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.age = age;
    this.maxAge = (55 + rand() * 30) * YEAR;
  }
}

interface War {
  a: number;
  b: number;
  start: number;
  /** No conquest or treaty before this time (for wars the gods start). */
  minEnd?: number;
  /** Each side's people when the war began, to judge exhaustion. */
  popA0?: number;
  popB0?: number;
  /** When either side last took a city: fresh gains keep a war going. */
  lastGain?: number;
}

/** Banner colours chosen to be told apart at a glance on the map. */
const NATION_COLORS = [
  0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x42d4f4, 0xf032e6, 0xbfef45, 0xfabed4,
  0x469990, 0xdcbeff, 0xc8853a, 0xfffac8, 0xff6f61, 0xaaffc3, 0xb5b520, 0xffd8b1, 0x7f8cff, 0x00b3a4,
];

export class Sim {
  world = new World();
  animals = new AnimalSystem(this.world);
  humans: Human[] = [];
  villages: Village[] = [];
  wars: War[] = [];
  wishes: Wish[] = [];
  /** World time before which no new prayer is heard (prayers are rare and precious). */
  nextWishAt = 0;
  /** The two gods' names; god 1 only acts in multiplayer. */
  godNames = ['Đấng Sáng Thế', 'Đấng Hắc Nguyệt'];
  /** How many gods the world has known (1 alone, 2 once a second god has joined). */
  gods = 1;
  /** While two gods are connected, each answers only the prayers addressed to them. */
  strictGods = false;
  /** Who acted last (for attributing disasters). */
  private actor = 0;
  get godName() {
    return this.godNames[this.me];
  }
  set godName(n: string) {
    this.godNames[this.me] = n;
  }
  /** Name of the god a people worships or leans towards. */
  deityOf(v: Village) {
    return this.godNames[v.leaning];
  }
  speed = 1;
  paused = false;
  /** Increments on every new world so the renderer knows to redraw everything. */
  generation = 0;
  strikes: { x: number; y: number; t: number }[] = [];
  shots: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
  clashes: { x: number; y: number; t: number }[] = [];
  impacts: { x: number; y: number; r: number; kind: string; t: number }[] = [];
  /** Bombers in flight (simulation state: they strike when they arrive). */
  airstrikes: Airstrike[] = [];
  fleets: Fleet[] = [];
  /** The people each god guides (a city id; follows its nation), or -1. */
  chosen = [-1, -1];
  private airId = 1;
  /** Areas whose colours changed hands (visual only: the renderer repaints them and flashes the new banner). */
  repaints: { x: number; y: number; r: number; color: number }[] = [];
  voyages: { x1: number; y1: number; x2: number; y2: number; start: number; end: number; color: number; era: number }[] = [];
  shake = 0;
  log: LogEntry[] = [];
  toasts: Toast[] = [];
  /** Sound cues for the audio engine (output only; never read back by the simulation). */
  sfx: string[] = [];
  milestones: Milestone[] = [];
  achieved = new Map<string, number>();
  stats = {
    wars: 0,
    treaties: 0,
    annexations: 0,
    hunted: 0,
    wolfKills: 0,
    volcanoes: 0,
    meteors: 0,
    quakes: 0,
    extinctions: 0,
    wishesGranted: 0,
    wishesDenied: 0,
    apostasies: 0,
    voyages: 0,
    nukes: 0,
    unions: 0,
    exchanges: 0,
    worldUnified: 0,
    births: 0,
    deaths: 0,
  };
  selectedHuman: Human | null = null;
  selectedVillage: Village | null = null;
  humanGrid = new Grid<Human>();

  private acc = 0;
  private nextId = 1;
  private wishId = 1;
  private startTime = 0;
  private deaths = new Map<string, number>();
  private births = 0;
  private summaryTimer = 0;
  private slowTimer = 0;
  private throttle = new Map<string, number>();
  private claims = new Map<number, Human>();
  private byId = new Map<number, Human>();
  private nextBand = 1;
  private bandLeaders = new Map<number, Human>();
  private bandSizes = new Map<number, number>();

  constructor() {
    this.animals.onHumanBitten = (p) => {
      const h = p as Human;
      if (h.health <= 0) this.stats.wolfKills++;
      else if (h.action !== 'fight' && h.age >= ADULT) {
        h.thought = 'Sói tấn công! Đánh trả!';
      }
    };
  }

  get year() {
    return Math.floor((this.world.time - this.startTime) / YEAR) + 1;
  }

  say(msg: string, key?: string, cooldown = 25) {
    if (key) {
      const last = this.throttle.get(key);
      if (last !== undefined && this.world.time - last < cooldown) return;
      this.throttle.set(key, this.world.time);
    }
    this.log.unshift({ year: this.year, msg });
    if (this.log.length > 120) this.log.pop();
  }

  /** Record an event in a village's own history (and optionally the world chronicle). */
  chronicle(v: Village, text: string, global = true) {
    v.history.push({ year: this.year, text });
    if (v.history.length > 60) v.history.splice(1, 1); // keep the founding entry
    if (global) this.say(text);
  }

  /** A compass direction in Vietnamese for an offset (north is up). */
  private compass(dx: number, dy: number) {
    const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
    const dirs = ['đông', 'đông bắc', 'bắc', 'tây bắc', 'tây', 'tây nam', 'nam', 'đông nam'];
    return dirs[(Math.round(a / 45) + 8) % 8];
  }

  /** Seed of the current world (multiplayer peers generate the same world from it). */
  seed = 0;

  /** Map layout and number of starting stone-age clans (0 = an empty world for the gods to people). */
  newWorld(seed = Date.now() % 2147483647, opts: { layout?: 'random' | 'halves'; tribes?: number; grows?: boolean } = {}) {
    const layout = opts.layout ?? 'random';
    const tribes = opts.tribes ?? 0;
    this.generation++;
    this.seed = seed;
    seedRandom(seed);
    // Every counter that influences decisions starts from scratch, so the same seed replays exactly.
    this.stepNo = 0;
    this.pending.clear();
    this.acc = 0;
    this.nextId = 1;
    this.wishId = 1;
    this.nextBand = 1;
    this.slowTimer = 0;
    this.summaryTimer = 0;
    this.births = 0;
    this.deaths.clear();
    this.voyages = [];
    this.airstrikes = [];
    this.fleets = [];
    this.chosen = [-1, -1];
    this.wars = [];
    this.warFrom = null;
    this.peaceFrom = null;
    this.world.generate(seed, layout, opts.grows ?? false);
    this.startTime = this.world.time;
    this.humans = [];
    this.villages = [];
    Village.all = this.villages;
    this.wars = [];
    this.wishes = [];
    this.nextWishAt = 0;
    this.strikes = [];
    this.log = [];
    this.toasts = [];
    this.milestones = [];
    this.achieved.clear();
    for (const k of Object.keys(this.stats)) this.stats[k as keyof typeof this.stats] = 0;
    this.throttle.clear();
    this.claims.clear();
    this.byId.clear();
    this.selectedHuman = null;
    this.selectedVillage = null;
    this.animals.reset();
    this.animals.populate(1400, 200);
    this.say(
      tribes
        ? '🌍 Một thế giới mới vừa được tạo ra. Những nhóm người du mục đầu tiên đang tìm đất lành...'
        : '🌍 Một thế giới hoang sơ vừa được tạo ra — chưa có bóng người. Hãy dùng 🧑 Người để gieo sự sống.',
    );
    // Clans are spread across the great landmasses (in 'halves', the two continents alternate).
    const isl = layout === 'halves' ? [this.world.islands[0], this.world.islands[2]] : this.world.islands;
    for (let g = 0; g < tribes; g++) {
      const home = isl[g % isl.length];
      const god = layout === 'halves' ? g % 2 : -1;
      let site = -1;
      for (let t = 0; t < 600 && site < 0 && home; t++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * home.r * 0.6;
        const x = Math.round(home.x + Math.cos(a) * d);
        const y = Math.round(home.y + Math.sin(a) * d);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (this.goodSite(idx(x, y))) site = idx(x, y);
      }
      if (site < 0) continue;
      for (let k = 0; k < 6; k++) {
        const j = this.world.findNearest(cx(site) + rand() * 4 - 2, cy(site) + rand() * 4 - 2, 5, (c) =>
          this.world.canWalk(c),
        );
        if (j >= 0) this.spawnHuman(cx(j) + 0.5, cy(j) + 0.5, -1, false, god);
      }
    }
  }

  spawnHuman(x: number, y: number, village = -1, child = false, god = -1) {
    if (this.humans.length >= MAX_POP) return null;
    const v = village >= 0 ? this.villages[village] : null;
    const names = v ? v.culture.names : ['Ka', 'Mo', 'Ra', 'Tu', 'Na', 'Le', 'Bo', 'Ki', 'Su', 'Da'];
    const h = new Human(this.nextId++, pick(names), x, y, child ? 0 : (18 + rand() * 20) * YEAR);
    h.village = village;
    h.god = god >= 0 ? god : (v?.homeGod ?? -1);
    if (v) {
      h.culture = v.culture.id;
      h.maxAge *= ERAS[v.era].life;
    }
    this.humans.push(h);
    this.byId.set(h.id, h);
    return h;
  }

  spawnAnimal(kind: 'deer' | 'wolf', x: number, y: number) {
    const i = idx(Math.floor(x), Math.floor(y));
    if (x < 0 || y < 0 || x >= W || y >= H || !this.world.canWalk(i) || this.world.isWater(i)) return;
    this.animals.spawn(kind, x, y);
  }

  // ---------- God powers ----------

  volcano(x: number, y: number) {
    this.world.volcano(x, y);
    this.stats.volcanoes++;
  }
  quake(x: number, y: number, r: number) {
    this.world.quake(x, y, r);
    this.stats.quakes++;
  }
  meteor(x: number, y: number, r: number) {
    this.world.meteor(x, y, r);
    this.stats.meteors++;
  }

  /** The city picked first with the war tool, waiting for its target. */
  warFrom: Village | null = null;
  /** The city picked first with the peace tool. */
  peaceFrom: Village | null = null;

  /** War tool: first click picks the aggressor, second the city it attacks (a city of the same nation rises in revolt). */
  incite(x: number, y: number) {
    const city = this.territoryAt(x, y);
    if (!city) {
      this.toasts.push({ icon: '⚔️', title: 'Chưa chọn được nước nào', text: 'Hãy bấm vào lãnh thổ của một quốc gia.' });
      return;
    }
    this.peaceFrom = null;
    if (!this.warFrom?.alive || this.warFrom === city) {
      this.warFrom = this.warFrom === city ? null : city;
      if (this.warFrom) this.toasts.push({ icon: '⚔️', title: `Bên tấn công: ${city.isCapital ? city.name : `${city.base} · ${city.capital.name}`}`, text: 'Giờ bấm vào nước bị tấn công. Bấm một thành khác của cùng nước để nó ly khai (Esc để hủy).' });
      return;
    }
    const A = this.warFrom.capital;
    const B = city.capital;
    if (A !== B && A.enemies.has(B.id)) {
      this.toasts.push({ icon: '⚔️', title: 'Đã có chiến tranh', text: `${A.name} và ${B.name} đang đánh nhau rồi.` });
    } else this.issue({ god: this.me, t: 'war', a: this.warFrom.id, b: city.id });
    this.warFrom = null;
    this.peaceFrom = null;
  }

  /** Peace tool: pick two nations; they make peace and bind themselves by treaty. */
  pacify(x: number, y: number) {
    const city = this.territoryAt(x, y);
    if (!city) {
      this.toasts.push({ icon: '🕊️', title: 'Chưa chọn được nước nào', text: 'Hãy bấm vào lãnh thổ của một quốc gia.' });
      return;
    }
    this.warFrom = null;
    const v = city.capital;
    if (!this.peaceFrom?.alive || this.peaceFrom.capital === v) {
      this.peaceFrom = this.peaceFrom?.capital === v ? null : city;
      if (this.peaceFrom) this.toasts.push({ icon: '🕊️', title: `Sứ giả hòa bình: ${v.name}`, text: 'Giờ bấm vào nước thứ hai để hai nước ký hòa ước (Esc để hủy).' });
      return;
    }
    const A = this.peaceFrom.capital;
    if (A.pacts.has(v.id)) this.toasts.push({ icon: '🕊️', title: 'Đã hòa hiếu', text: `${A.name} và ${v.name} đã có hòa ước rồi.` });
    else this.issue({ god: this.me, t: 'peace', a: A.id, b: v.id });
    this.peaceFrom = null;
  }

  /** The city whose territory covers (x, y), or the nearest one if close enough. */
  territoryAt(x: number, y: number) {
    let best: Village | null = null;
    let bd = Infinity;
    for (const v of this.villages) {
      if (!v.alive) continue;
      const d = Math.hypot(v.cx - x, v.cy - y) - v.radius;
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return bd < 12 ? best : null;
  }

  warBetween(a: number, b: number) {
    const ca = this.villages[a];
    const cb = this.villages[b];
    if (!ca?.alive || !cb?.alive || ca === cb) return;
    // Two cities of one nation: the one that is not the seat breaks away, and the war is a war of independence.
    if (ca.capital === cb.capital) {
      const rebel = cb.isCapital ? ca : cb;
      this.secede(rebel, `${this.godNames[this.actor]} thổi bùng lòng ly khai`);
    }
    const A = ca.capital;
    const B = cb.capital;
    if (A === B || A.enemies.has(B.id)) return;
    if (A.pacts.delete(B.id)) {
      B.pacts.delete(A.id);
      this.chronicle(A, `📜 Hòa ước giữa ${A.name} và ${B.name} bị xé bỏ.`);
    }
    A.allies.delete(B.id);
    B.allies.delete(A.id);
    this.declareWar(A, B, `vì ${this.godNames[this.actor]} gieo rắc thù hận vào lòng họ`);
    // A war the gods start is fought out, not settled at the first council.
    const war = this.wars.find((w) => w.a === A.id && w.b === B.id);
    if (war) war.minEnd = this.world.time + 90;
  }

  /** The banner colour that stands out most from every living nation's (and their neighbours' most of all). */
  private distinctColor(except?: Village) {
    const others = this.nations().filter((n) => n !== except);
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    let best = NATION_COLORS[0];
    let bestScore = -1;
    for (const c of NATION_COLORS) {
      const [r, g, b] = rgb(c);
      let score = Infinity;
      for (const n of others) {
        const [r2, g2, b2] = rgb(n.hue);
        // Perceptual-ish distance: green differences show most, blue least.
        score = Math.min(score, Math.sqrt(2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2));
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /** A city breaks from its nation and becomes a nation of its own. */
  private secede(city: Village, why: string) {
    const old = city.capital;
    if (city.isCapital) return;
    city.nation = city.id;
    city.warSet = new Set();
    city.opinion = new Map([[old.id, -70]]);
    old.opinion.set(city.id, -70);
    city.partners = new Set();
    city.allies = new Set();
    city.pacts = new Set();
    city.annexed = 0;
    city.absorbedBy = -1;
    city.tech = Math.max(city.tech, old.tech * 0.9);
    // A banner of its own, unlike any other nation's.
    city.hue = this.distinctColor(city);
    this.repaints.push({ x: city.cx, y: city.cy, r: city.radius + 8, color: city.hue });
    for (const h of this.humans) if (h.village === city.id) h.role = 'none';
    this.chronicle(city, `🔥 ${city.base} ly khai khỏi ${old.name}, lập nên ${city.name} — ${why}.`);
    this.chronicle(old, `🔥 ${city.base} ly khai, lập nước riêng.`, false);
    this.toasts.push({ icon: '🔥', title: 'Ly khai!', text: `${city.base} tách khỏi ${old.name}` });
  }

  /** A god's peace: the two nations end their war and are bound by treaty. */
  peaceBetween(a: number, b: number, god: number) {
    const A = this.villages[a]?.capital;
    const B = this.villages[b]?.capital;
    if (!A?.alive || !B?.alive || A === B) return;
    const why = `${this.godNames[god]} giáng xuống ý chỉ hòa bình`;
    this.makePeace(A, B, why);
    A.pacts.add(B.id);
    B.pacts.add(A.id);
    A.opinion.set(B.id, Math.max(60, A.opinion.get(B.id) ?? 0));
    B.opinion.set(A.id, Math.max(60, B.opinion.get(A.id) ?? 0));
    A.partners.add(B.id);
    B.partners.add(A.id);
    const [, ca, cb] = this.nearestCities(A, B);
    this.carveHighway(ca, cb);
    this.chronicle(A, `🕊️ ${A.name} và ${B.name} ký hòa ước hữu nghị — ${why}. Từ nay hai nước giao thương, học hỏi lẫn nhau.`);
    this.chronicle(B, `🕊️ ${B.name} và ${A.name} ký hòa ước hữu nghị.`, false);
    this.toasts.push({ icon: '🕊️', title: 'Hòa ước hữu nghị', text: `${A.name} 🤝 ${B.name}` });
  }

  private villageNear(x: number, y: number, r: number) {
    let best: Village | null = null;
    let bd = r;
    for (const v of this.villages) {
      if (!v.alive) continue;
      const d = Math.hypot(v.cx - x, v.cy - y);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // ---------- Main loop ----------

  // ---------- Lockstep core ----------

  /** Number of fixed steps simulated so far. */
  stepNo = 0;
  /** Commands waiting for the step they were scheduled at. */
  private pending = new Map<number, Command[]>();
  /** Multiplayer hook: may a step run yet? (Lockstep waits until both gods' orders for it are in.) */
  gate: ((step: number) => boolean) | null = null;
  /** Multiplayer hook: where locally issued commands go (default: next step, locally). */
  sender: ((cmd: Command) => void) | null = null;
  /** Which god this machine plays (0 or 1). */
  me = 0;

  /** Issue a god command: scheduled for a future step and applied identically everywhere. */
  issue(cmd: Command) {
    if (this.sender) this.sender(cmd);
    else this.schedule(this.stepNo, [cmd]);
  }

  schedule(step: number, cmds: Command[]) {
    const at = Math.max(step, this.stepNo);
    const list = this.pending.get(at) ?? [];
    list.push(...cmds);
    this.pending.set(at, list);
  }

  /** A cheap fingerprint of the world state, compared between peers to detect desyncs. */
  checksum() {
    let h = this.stepNo | 0;
    const mix = (v: number) => {
      h = Math.imul(h ^ (v | 0), 16777619);
    };
    mix(this.humans.length);
    for (let k = 0; k < this.humans.length; k += 7) {
      const p = this.humans[k];
      mix(p.x * 1000);
      mix(p.y * 1000);
      mix(p.id);
    }
    for (const v of this.villages) {
      mix(v.food * 10);
      mix(v.tech * 10);
      mix(v.houses.size);
    }
    mix(this.animals.list.length);
    mix(this.world.seaLevel * 1e6);
    return h >>> 0;
  }

  private apply(c: Command) {
    const w = this.world;
    this.actor = c.god;
    switch (c.t) {
      case 'raise':
        w.raise(c.x, c.y, c.r, c.a);
        break;
      case 'smooth':
        w.smooth(c.x, c.y, c.r, c.k);
        break;
      case 'water':
        w.water(c.x, c.y, c.r);
        break;
      case 'forest':
        w.plantForest(c.x, c.y, c.r);
        break;
      case 'fire':
        w.setFire(c.x, c.y, c.r);
        break;
      case 'weather':
        w.paintWeather(c.x, c.y, c.r, c.w);
        break;
      case 'weatherAll':
        w.autoWeather = false;
        w.setWeather(c.w);
        break;
      case 'autoWeather':
        w.autoWeather = c.on;
        break;
      case 'volcano':
        this.volcano(c.x, c.y);
        break;
      case 'quake':
        this.quake(c.x, c.y, c.r);
        break;
      case 'meteor':
        this.meteor(c.x, c.y, c.r);
        break;
      case 'human': {
        const i = idx(Math.floor(c.x), Math.floor(c.y));
        if (!(c.x >= 0 && c.y >= 0 && c.x < W && c.y < H && w.canWalk(i))) break;
        // Inside a people's land: they take the newcomer in.
        let home: Village | null = null;
        let bd = 0;
        for (const v of this.villages) {
          if (!v.alive) continue;
          const d = Math.hypot(v.cx - c.x, v.cy - c.y) - v.radius;
          if (d <= 2 && (!home || d < bd)) {
            home = v;
            bd = d;
          }
        }
        const h = this.spawnHuman(c.x, c.y, home ? home.id : -1, false, c.god);
        if (!h) break;
        if (home) {
          home.pop++;
          h.thought = `Gia nhập ${home.name}`;
        } else {
          // Outside: some seek the nearest village, others set out to found a place of their own.
          h.pioneer = rand() < 0.5;
          h.godMade = true;
          h.leftAt = w.time;
        }
        break;
      }
      case 'animal':
        this.spawnAnimal(c.kind, c.x, c.y);
        break;
      case 'war':
        this.warBetween(c.a, c.b);
        break;
      case 'peace':
        if (c.b === undefined) {
          const v = this.villages[c.a]?.capital;
          if (v) for (const e of [...v.enemies]) this.makePeace(v, this.villages[e], `${this.godNames[c.god]} giáng xuống ý chỉ hòa bình`);
        } else this.peaceBetween(c.a, c.b, c.god);
        break;
      case 'wish':
        this.answerWish(c.id, c.yes, c.god);
        break;
      case 'godName':
        this.godNames[c.god] = c.name;
        break;
      case 'choose': {
        const v = this.villages[c.v];
        if (!v?.alive) break;
        this.chosen[c.god] = v.capital.id;
        const cap = v.capital;
        cap.autoBuild = true;
        this.chronicle(cap, `🌟 ${this.godNames[c.god]} chọn ${cap.name} làm dân tộc của mình, dõi theo họ qua dòng lịch sử.`);
        break;
      }
      case 'policy': {
        const cap = this.villages[c.v]?.capital;
        if (!cap?.alive || this.peopleOf(c.god) !== cap) break;
        this.setPolicy(cap, c.key, c.value, true);
        break;
      }
      case 'queue': {
        const cap = this.villages[c.v]?.capital;
        if (!cap?.alive || this.peopleOf(c.god) !== cap) break;
        if (c.add) {
          if (cap.queue.length < 8) cap.queue.push(c.kind);
        } else {
          const k = cap.queue.indexOf(c.kind);
          if (k >= 0) cap.queue.splice(k, 1);
        }
        break;
      }
    }
  }

  /** Advance the simulation by real time (called from a timer, also when the tab is in the background). */
  update(realDt: number) {
    if (this.paused) return;
    // Catch up after the browser throttled us, but never more than a few seconds of game time at once.
    this.acc = Math.min(this.acc + Math.min(realDt, 2) * this.speed, STEP * 400);
    let n = 0;
    const t0 = performance.now();
    while (this.acc >= STEP && n < 400 && performance.now() - t0 < 25) {
      if (this.gate && !this.gate(this.stepNo)) break; // waiting for the other god's orders
      this.acc -= STEP;
      this.step();
      n++;
    }
  }

  /** Fade visual effects (lightning, shots...) by render time. */
  tickVisuals(realDt: number) {
    for (const s of this.strikes) s.t -= realDt;
    this.strikes = this.strikes.filter((s) => s.t > 0);
    this.voyages = this.voyages.filter((v) => v.end > this.world.time);
    for (const s of this.shots) s.t -= realDt;
    this.shots = this.shots.filter((s) => s.t > 0);
    for (const s of this.clashes) s.t -= realDt;
    this.clashes = this.clashes.filter((s) => s.t > 0);
    for (const s of this.impacts) s.t -= realDt;
    this.impacts = this.impacts.filter((s) => s.t > 0);
    this.shake = Math.max(0, this.shake - realDt);
  }

  private step() {
    const cmds = this.pending.get(this.stepNo);
    if (cmds) {
      this.pending.delete(this.stepNo);
      // Same order on every machine: god 0's commands, then god 1's (each in the order issued).
      cmds.sort((a, b) => a.god - b.god);
      for (const c of cmds) this.apply(c);
    }
    const dt = STEP;
    if (this.stepNo % TICK_STEPS === 0) {
      this.world.people = this.humans.length;
      this.world.tick(TICK);
      this.airTick();
      this.handleEvents();
      this.villageTick(TICK);
      this.slowTimer += TICK;
      if (this.slowTimer >= 5) {
        this.slowTimer = 0;
        this.diplomacyTick();
        this.mergeCities();
        this.checkAchievements();
      }
    }

    for (const v of this.villages) {
      v.pop = 0;
      v.adults = 0;
    }
    this.bandLeaders.clear();
    this.bandSizes.clear();
    for (const h of this.humans) {
      if (h.band >= 0) {
        const l = this.bandLeaders.get(h.band);
        if (!l || h.id < l.id) this.bandLeaders.set(h.band, h);
        this.bandSizes.set(h.band, (this.bandSizes.get(h.band) ?? 0) + 1);
      }
      if (h.village < 0) continue;
      const v = this.villages[h.village];
      v.pop++;
      if (h.age >= ADULT) v.adults++;
    }

    this.humanGrid.rebuild(this.humans);
    this.animals.update(dt, this.humanGrid, (x, y) => this.inTown(x, y));
    for (const h of this.humans) if (!h.dead) this.updateHuman(h, dt);
    for (const h of this.humans) if (h.dead) this.byId.delete(h.id);
    this.humans = this.humans.filter((h) => !h.dead);
    if (this.selectedHuman?.dead) this.selectedHuman = null;

    this.summaryTimer += dt;
    if (this.summaryTimer > 30) {
      this.summaryTimer = 0;
      if (this.deaths.size) {
        const parts = [...this.deaths].map(([cause, n]) => `${n} người ${cause}`);
        this.say(`💀 ${parts.join(', ')}.`);
        this.deaths.clear();
      }
      if (this.births) {
        this.say(`👶 ${this.births} em bé chào đời.`);
        this.births = 0;
      }
    }
    this.stepNo++;
  }

  private inTown(x: number, y: number) {
    for (const v of this.villages) if (v.alive && Math.hypot(v.cx - x, v.cy - y) < v.radius * 0.6) return true;
    return false;
  }

  private checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.achieved.has(a.id) || !a.check(this)) continue;
      this.achieved.set(a.id, this.year);
      this.milestones.push({ year: this.year, icon: a.icon, title: a.title, desc: a.desc });
      this.toasts.push({ icon: a.icon, title: a.title, text: a.desc });
      this.sfx.push('achievement');
      this.say(`🏆 Thành tựu: ${a.icon} ${a.title} — ${a.desc}`);
    }
  }

  // ---------- World events → village memory ----------

  private handleEvents() {
    const w = this.world;
    for (const e of w.events) {
      if (e.type === 'lightning') {
        this.strikes.push({ x: e.x, y: e.y, t: 0.5 });
        this.humanGrid.each(e.x + 0.5, e.y + 0.5, 1.5, (h) => {
          if (!h.inside) this.kill(h, 'bị sét đánh');
        });
        for (const v of this.villages) {
          if (!v.alive || Math.hypot(v.cx - e.x, v.cy - e.y) > v.radius + 6) continue;
          v.strikes++;
          if (!v.stormWary) {
            v.stormWary = true;
            this.chronicle(v, `⚡ Sét đánh gần ${v.name}! Từ đó họ học được: khi có bão phải tránh xa cây cao.`);
          }
        }
        continue;
      }
      if (e.type === 'impact') {
        this.impacts.push({ x: e.x, y: e.y, r: e.r, kind: e.kind, t: e.kind === 'meteor' ? 1.2 : 0.8 });
        this.shake = e.kind === 'quake' ? 1.2 : 0.6;
        if (e.kind === 'meteor') {
          this.humanGrid.each(e.x, e.y, e.r + 1, (h) => this.kill(h, 'chết vì thiên thạch'));
          for (const a of this.animals.list) if (Math.hypot(a.x - e.x, a.y - e.y) < e.r + 1) a.dead = true;
        }
        // Casualties: the nearer a city to the blow, the more of its people die.
        const reach = e.kind === 'quake' ? e.r * 2.5 + 10 : e.kind === 'meteor' ? e.r * 3 + 8 : 22;
        const worst = e.kind === 'quake' ? 0.3 : e.kind === 'meteor' ? 0.45 : 0.35;
        for (const v of this.villages) {
          if (!v.alive) continue;
          const d = Math.max(0, Math.hypot(v.cx - e.x, v.cy - e.y) - v.radius * 0.5);
          if (d > reach) continue;
          const f = worst * (1 - d / reach);
          const cause = e.kind === 'quake' ? 'chết trong động đất' : e.kind === 'meteor' ? 'chết vì thiên thạch' : 'chết vì núi lửa phun trào';
          this.casualties(v, f, cause, e.kind === 'quake' ? '🏚️ Động đất' : e.kind === 'meteor' ? '☄️ Thiên thạch' : '🌋 Núi lửa');
        }
        for (const v of this.villages) {
          if (!v.alive || Math.hypot(v.cx - e.x, v.cy - e.y) > v.radius + 15) continue;
          v.addFaith(this.actor, 6);
          if (e.kind === 'quake') v.quakes++;
          const what = e.kind === 'meteor' ? 'Lửa trời giáng xuống' : e.kind === 'quake' ? 'Mặt đất rung chuyển dữ dội' : 'Một ngọn núi lửa trồi lên phun trào';
          this.chronicle(v, `😨 ${what} gần ${v.name}. Họ tin rằng ${this.godNames[this.actor]} đang nổi giận và cầu khấn nhiều hơn.`, false);
        }
        continue;
      }
      if (e.type === 'emerge') {
        // New land has risen: wildlife wanders in, and the chronicles take note.
        const dir = this.compass(e.x - this.world.origin.x, e.y - this.world.origin.y);
        const big = e.cells > 20000 ? 'Một lục địa mới' : e.cells > 3000 ? 'Một hòn đảo lớn' : 'Một hòn đảo nhỏ';
        this.say(`🏝️ ${big} trồi lên từ biển ở phía ${dir}.`);
        if (e.cells > 800) this.toasts.push({ icon: '🏝️', title: 'Đất mới trồi lên!', text: `${big} ở phía ${dir}` });
        this.repaints.push({ x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2, r: Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 4, color: -1 });
        for (let k = 0; k < Math.min(12, e.cells / 600); k++) {
          const x = e.x0 + rand() * (e.x1 - e.x0);
          const y = e.y0 + rand() * (e.y1 - e.y0);
          this.spawnAnimal(rand() < 0.8 ? 'deer' : 'wolf', x, y);
        }
        continue;
      }
      const v = this.villages[e.owner];
      if (!v) continue;
      if (e.what === 'farm') {
        v.farms.delete(e.i);
        continue;
      }
      // Those inside a home that falls, burns or is swept away may not get out.
      if (v.houses.has(e.i) && rand() < (e.type === 'burn' ? 0.35 : 0.5)) {
        let victim: Human | null = null;
        for (const o of this.humans) {
          if (o.village !== v.id || o.dead) continue;
          if (o.inside || Math.hypot(o.x - cx(e.i), o.y - cy(e.i)) < 3) {
            victim = o;
            break;
          }
        }
        if (victim) {
          this.kill(victim, e.type === 'flood' ? 'chết đuối trong lũ' : e.type === 'burn' ? 'chết cháy' : 'bị vùi dưới nhà sập');
          v.toll++;
        }
      }
      if (v.houses.has(e.i) && v.ruins.length < 300) {
        if (!v.ruins.length && v.alive) this.chronicle(v, `🔨 Người dân ${v.name} dọn đống đổ nát, bắt tay xây dựng lại.`, false);
        v.ruins.push(e.i);
      }
      v.houses.delete(e.i);
      v.buildings.delete(e.i);
      v.trauma = Math.min(1, v.trauma + 0.03);
      v.capital.tech = Math.max(0, v.capital.tech - ERAS[v.capital.era].tech * 0.004);
      if (e.type === 'flood') {
        v.floods++;
        const safer = w.seaLevel + 0.05 + v.floods * 0.01;
        if (safer > v.minBuildHeight) v.minBuildHeight = safer;
        if (this.once(`flood${v.id}`, 40)) this.chronicle(v, `🌊 Nước lũ cuốn trôi nhà của ${v.name}! Từ đó họ chỉ dựng nhà trên chỗ đất cao.`);
      } else if (e.type === 'slide') {
        if (this.once(`slide${v.id}`, 30)) this.chronicle(v, `⛰️ Mặt đất nhô cao thành núi, nhà cửa ở ${v.name} đổ sập.`);
      } else if (e.type === 'quake') {
        if (this.once(`quake${v.id}`, 20)) this.chronicle(v, `🏚️ Động đất làm sập nhà ở ${v.name}.`);
      } else {
        v.fires++;
        const first = !v.fireWary;
        v.fireWary = true;
        if (this.once(`fire${v.id}`, 30)) {
          this.chronicle(
            v,
            first
              ? `🔥 Lửa thiêu rụi nhà ở ${v.name}! Họ bắt đầu chặt cây quanh làng làm vành đai chống cháy.`
              : `🔥 ${v.name} lại bị cháy nhà.`,
          );
        }
      }
    }
    w.events.length = 0;
    for (const v of this.villages) {
      // Tallied over a while so one fire or flood makes one entry, not dozens.
      if (!v.toll || !this.once(`toll${v.id}`, 20)) continue;
      if (v.alive) this.chronicle(v, `💀 Khoảng ${formatPop(v.toll * ERAS[v.era].popScale)} người ở ${v.name} thiệt mạng khi nhà cửa bị tàn phá.`, false);
      v.toll = 0;
    }
  }

  /** A disaster takes a share of a city's people; the chronicle counts the dead (as the people they stand for). */
  private casualties(v: Village, share: number, cause: string, what: string) {
    if (share <= 0.01) return;
    let n = 0;
    for (const h of this.humans) {
      if (h.village !== v.id || h.dead) continue;
      if (rand() < share) {
        this.kill(h, cause);
        n++;
      }
    }
    if (!n) return;
    v.trauma = Math.min(1, v.trauma + share);
    const dead = formatPop(n * ERAS[v.era].popScale);
    this.chronicle(v, `💀 ${what} cướp đi khoảng ${dead} sinh mạng ở ${v.name}.`);
    if (share > 0.15) this.toasts.push({ icon: '💀', title: `${v.base} tang thương`, text: `${what}: ~${dead} người chết` });
  }

  /** True at most once per cooldown for a key (for throttling noisy history). */
  private once(key: string, cooldown: number) {
    const last = this.throttle.get(key);
    if (last !== undefined && this.world.time - last < cooldown) return false;
    this.throttle.set(key, this.world.time);
    return true;
  }

  private villageTick(dt: number) {
    const w = this.world;
    const nations = this.nations();
    this.maxEra = nations.reduce((m, v) => Math.max(m, v.era), 0);
    this.avgEra = nations.length ? nations.reduce((m, v) => m + v.era, 0) / nations.length : 0;
    for (const v of this.villages) {
      for (const i of v.houses) if (w.cover[i] !== Cover.HOUSE || w.owner[i] !== v.id) v.houses.delete(i);
      for (const i of v.buildings.keys()) if (w.cover[i] !== Cover.HOUSE || w.owner[i] !== v.id) v.buildings.delete(i);
      for (const i of v.farms) if (w.cover[i] !== Cover.FARM || w.owner[i] !== v.id) v.farms.delete(i);
      if (!v.alive) {
        if (v.houses.size || v.farms.size) this.abandoned(v, dt);
        continue;
      }

      if (v.pop === 0) {
        const heir = this.villages.filter((o) => o.alive && o !== v && o.nation === v.id && o.pop > 0).sort((a, b) => b.pop - a.pop)[0];
        if (v.isCapital && heir) this.moveCapital(v, heir);
        else if (v.isCapital) this.endWars(v);
        v.alive = false;
        if (!this.villages.some((o) => o.alive && o.culture.id === v.culture.id)) this.stats.extinctions++;
        this.chronicle(v, v.houses.size ? `🏚️ ${v.name} bị bỏ hoang.` : `🕯️ ${v.name} đã biến mất khỏi lịch sử.`);
        continue;
      }

      // An undefended city falls to the army standing in it.
      // A city whose defenders are beaten falls to the army holding it; its people become the victor's.
      if (v.enemies.size) {
        const count = new Map<number, number>();
        let defenders = 0;
        this.humanGrid.each(v.cx, v.cy, v.radius * 0.8, (o) => {
          if (o.role !== 'soldier' || o.village < 0) return;
          const n = this.villages[o.village]?.nation;
          if (n === v.nation) defenders++;
          else if (v.hostileTo(o.village)) count.set(n, (count.get(n) ?? 0) + 1);
        });
        let attacker: Village | null = null;
        let n = 0;
        for (const [k, c] of count) {
          if (c > n) {
            n = c;
            attacker = this.villages[k];
          }
        }
        const holding = attacker && defenders === 0 && n >= Math.max(3, Math.min(10, v.pop * 0.12));
        v.siegeT = holding ? v.siegeT + dt : Math.max(0, v.siegeT - dt);
        if (holding && v.siegeT > 8) {
          const a = attacker as Village;
          const from = v.capital;
          v.siegeT = 0;
          this.chronicle(a, `🏴 Quân ${a.name} đánh bại quân giữ thành, chiếm được ${v.base}! ${v.base} giờ thuộc về ${a.name}.`);
          this.chronicle(from, `🏳️ ${v.base} thất thủ, rơi vào tay ${a.name}.`, false);
          this.toasts.push({ icon: '🏴', title: 'Thành thất thủ!', text: `${v.base} → ${a.name}` });
          for (const wr of this.wars) if ((wr.a === a.id && wr.b === from.id) || (wr.b === a.id && wr.a === from.id)) wr.lastGain = this.world.time;
          this.transferCity(v, a);
          this.stats.annexations++;
          // Some of the victors stay on as the new townsfolk; more follow from home.
          let garrison = 0;
          this.humanGrid.each(v.cx, v.cy, v.radius, (o) => {
            if (garrison < 3 && o.role === 'soldier' && o.village >= 0 && this.villages[o.village]?.nation === a.id) {
              o.village = v.id;
              o.role = 'none';
              garrison++;
            }
          });
          const came = this.sendSettlers(v, a, Math.max(4, Math.min(12, v.houses.size)));
          if (came) this.chronicle(a, `🧳 ${came} gia đình người ${a.name} dọn tới ${v.base} sinh sống.`, false);
        }
      }

      v.trauma = Math.max(0, v.trauma - dt * 0.004);
      // Modern supply chains: a city short of food buys it in (or gets aid), unless besieged.
      if (v.era >= 4 && v.siegeT === 0 && v.food < v.pop * 1.5) v.food += v.pop * 0.04 * dt * (v.era - 2);
      v.jobTimer -= dt;
      if (v.jobTimer <= 0) {
        v.jobTimer = 1.5 + rand() * 0.5;
        this.refreshJobs(v);
      }

      this.leadership(v);
      this.progress(v, dt);
      this.religionTick(v, dt);
      this.wishTick(v, dt);

      const center = idx(v.cx, v.cy);
      if (w.localTemp(center) < 0 && !v.inWinter) {
        v.inWinter = true;
        v.winters++;
        v.foodPerPerson = Math.min(6, 2 + v.winters * 1.5);
        if (v.winters === 1) this.chronicle(v, `❄️ ${v.name} trải qua mùa đông đầu tiên. Họ bắt đầu tích trữ lương thực cho những mùa đông sau.`);
      } else if (w.localTemp(center) > 6) {
        v.inWinter = false;
      }

      // The heart of the city drowned, buried under a mountain or lava: the people move it.
      const drowned = w.isWater(center);
      const buried = !drowned && (w.height[center] >= HILL_MAX + 0.03 || w.cover[center] === Cover.LAVA || w.cover[center] === Cover.BASALT);
      if (drowned || buried) {
        const dry = w.findNearest(v.cx, v.cy, 30, (j) => w.canWalk(j) && !w.isWater(j) && w.height[j] >= v.minBuildHeight && w.height[j] < HILL_MAX && w.cover[j] !== Cover.LAVA && w.cover[j] !== Cover.BASALT);
        if (dry >= 0) {
          v.cx = cx(dry);
          v.cy = cy(dry);
          v.jobTimer = 0;
          if (this.once(`move${v.id}`, 30))
            this.chronicle(v, drowned ? `🚶 ${v.name} bị ngập, cả làng dời lên chỗ đất cao.` : `🚶 Đất đai ở ${v.name} biến đổi dữ dội, người dân dời trung tâm thành sang chỗ bằng phẳng.`);
        }
      }

      v.blessFertile = Math.max(0, v.blessFertile - dt);
      v.blessWar = Math.max(0, v.blessWar - dt);
      const content = v.capital.mood > 75 ? 1.3 : v.capital.mood < 25 ? 0.7 : 1;
      v.birthTimer -= dt * (v.blessFertile > 0 ? 3 : 1) * (1 - 0.7 * v.trauma) * content;
      // Decline and recovery are part of the chronicle.
      if (v.trauma > 0.5 && !v.slump) {
        v.slump = true;
        this.chronicle(v, `🥀 ${v.name} chìm trong suy thoái sau thảm họa: mùa màng thất bát, tri thức mai một.`);
      } else if (v.trauma < 0.15 && v.slump) {
        v.slump = false;
        this.chronicle(v, `🌱 ${v.name} dần hồi phục sau những năm tháng khốn khó.`);
      }
      if (v.birthTimer <= 0) {
        v.birthTimer = (8 + rand() * 6) / (1 + v.pop / 30);
        if (v.pop >= 2 && v.pop < v.cap && v.pop < (v.era >= 1 ? 60 + v.era * 15 : 70) && v.food >= v.pop * 0.6 + 2 && w.localTemp(center) > 0) {
          const house = pick([...v.houses]);
          if (this.spawnHuman(cx(house) + 0.5, cy(house) + 0.5, v.id, true)) {
            v.food -= 2;
            this.births++;
            this.stats.births++;
          }
        }
      }

      // Roads are resurfaced as the nation advances.
      if (v.houses.size && rand() < 0.1) {
        const all = [...v.houses];
        this.carveRoad(v, all[Math.floor(rand() * all.length)]);
      }

      // Old houses are gradually rebuilt in the current era's style.
      if (v.houses.size && rand() < 0.04 * dt * 4 && v.wood >= ERAS[v.era].houseWood + 2) {
        for (const i of v.houses) {
          if (w.timer[i] < v.era) {
            w.timer[i] = Math.floor(w.timer[i]) + 1;
            v.wood -= ERAS[v.era].houseWood;
            break;
          }
        }
      }

      // A crowded village with no room left sends settlers to found a colony.
      // A clan that outgrows its land (or its era's ideal size) splits off a new people.
      v.colonizeCd -= dt;
      // Only when the city cannot spread any further (or has grown very large) do settlers leave.
      const crowded = v.pop >= 30 && v.jobs.houseSites.length === 0;
      // From the bronze age on, settlers found new cities of their own nation: nations grow outward.
      // Stone-age clans still split into new tribes; later cities simply keep growing.
      const tooBig = v.era === 0 && v.pop >= 70;
      const room = this.villages.filter((o) => o.alive).length < 90;
      // A thriving nation also sends pioneers to break new ground and found cities on open land.
      const pioneering = v.era >= 1 && v.pop >= 40 && v.food > v.pop * 2 && this.citiesOf(v.capital).length < 2 + this.nationPop(v.capital) / 70 && rand() < 0.35;
      if (v.colonizeCd <= 0 && room && (crowded || tooBig || pioneering) && v.enemies.size === 0) {
        v.colonizeCd = v.era >= 1 ? 90 + rand() * 80 : 160 + rand() * 120;
        const n = tooBig ? 14 : 8;
        const settlers = this.humans.filter((h) => h.village === v.id && h.age >= ADULT && h.age < 40 * YEAR && h.role === 'none').slice(0, n);
        if (settlers.length >= 5) {
          const heading = rand() * Math.PI * 2;
          const band = this.nextBand++;
          for (const h of settlers) {
            h.village = -1;
            h.band = band;
            h.leftAt = this.world.time;
            h.originId = v.id;
            h.colonyOf = v.era >= 1 ? v.nation : -1;
            h.colonist = true;
            h.origin = v.name;
            h.heading = heading;
            h.carryFood = 2;
          }
          this.chronicle(
            v,
            crowded || tooBig
              ? `⛵ ${v.name} hết đất, ${settlers.length} người lên đường đi khai phá vùng đất mới.`
              : `🧭 ${v.name} cử ${settlers.length} người đi khai hoang, lập thành phố mới nơi biên cương.`,
          );
        }
      }

      if (v.isCapital) {
        this.armyTick(v, dt);
        this.economyTick(v, dt);
        this.politicsTick(v, dt);
      }

      // Soldiers: about a third of the adults go to war.
      if (v.enemies.size) {
        // A nation massing for an offensive calls up more of its people.
        const cp = v.capital;
        const rate = ((v.has('barracks') ? 0.5 : cp.armyPhase === 'rally' ? 0.45 : 0.35) + GOVS[cp.gov].army) * (cp.stance === 'peace' ? 0.6 : cp.stance === 'expand' ? 1.15 : 1);
        const want = Math.min(60, Math.ceil(v.adults * rate));
        let have = 0;
        for (const h of this.humans) if (h.village === v.id && h.role === 'soldier') have++;
        if (have < want) {
          for (const h of this.humans) {
            if (have >= want) break;
            if (h.village === v.id && h.role === 'none' && h.age >= ADULT && h.age < 50 * YEAR && h.health > 0.7) {
              h.role = 'soldier';
              h.unit = pickUnit(v.era, v.culture.id, rand());
              h.slot = v.capital.slots++;
              have++;
            }
          }
        }
      }
    }
  }

  private leadership(v: Village) {
    const leader = this.byId.get(v.leaderId);
    if (leader && !leader.dead && leader.village === v.id) return;
    // The new ruler is a mature adult (around 30), so reigns last decades rather than years.
    let best: Human | null = null;
    let bestScore = Infinity;
    for (const h of this.humans) {
      if (h.village !== v.id || h.age < ADULT) continue;
      const score = Math.abs(h.age / YEAR - 30);
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    if (!best) return;
    const old = v.leaderName ? v.ruler : '';
    const n = (v.regnal.get(best.name) ?? 0) + 1;
    v.regnal.set(best.name, n);
    v.leaderId = best.id;
    v.leaderName = n > 1 ? `${best.name} ${ROMAN[Math.min(n, ROMAN.length) - 1]}` : best.name;
    this.chronicle(v, old ? `👑 ${old} qua đời. ${v.ruler} lên nắm quyền ${v.name}.` : `👑 ${v.ruler} trở thành người đứng đầu ${v.name}.`, false);
  }

  /** Highest and average era among nations (refreshed every tick). */
  private maxEra = 0;
  private avgEra = 0;

  private progress(v: Village, dt: number) {
    const cap = v.capital;
    if (v !== cap) {
      v.era = cap.era;
      v.tech = cap.tech;
      return;
    }
    // Knowledge grows with the square root of the whole nation's people: an empire learns
    // faster than a tribe, but not seventy times faster for seventy cities.
    let pop = 0;
    let cities = 0;
    let lib = 0;
    let trauma = 0;
    let fed = 0;
    let believers = 0;
    for (const c of this.villages) {
      if (!c.alive || c.nation !== cap.id) continue;
      cities++;
      pop += c.pop;
      trauma += c.trauma;
      if (c.food > c.pop * c.foodPerPerson) fed++;
      if (c.patron >= 0) believers++;
      lib += (c.has('market') ? 0.1 : 0) + (c.has('library') ? 0.2 : 0) + (c.has('school') ? 0.2 : 0) + (c.has('office') ? 0.15 : 0);
    }
    if (!cities) return;
    const learning = (1 + lib / cities) * (cap.partners.size ? 1 + 0.08 * Math.min(3, cap.partners.size) : 1);
    const surplus = 1 + 0.15 * (fed / cities);
    const faith = 1 + 0.1 * (believers / cities);
    // Ideas travel: laggards catch up quickly, a runaway leader slows — the world stays in step.
    const gap = this.maxEra - cap.era;
    const pace = gap > 0 ? 1 + 1.4 * gap : cap.era > this.avgEra + 1 ? 0.5 : 1;
    const recovering = 1 - 0.7 * (trauma / cities);
    // Universities, labs and power feed science; the economy and the political system set the pace.
    const science = 1 + 0.12 * Math.min(3, this.nationCount(cap, 'university') + this.nationCount(cap, 'lab') + 0.5 * this.nationCount(cap, 'powerplant'));
    const system = GOVS[cap.gov].tech * (cap.faithPolicy === 'secular' ? 1.08 : 1) * (cap.mood > 75 ? 1.06 : cap.mood < 25 ? 0.85 : 1);
    v.tech += dt * 0.09 * Math.sqrt(pop) * ERAS[cap.era].pace * v.culture.traits.tech * surplus * faith * learning * pace * recovering * science * system * cap.econ;
    while (v.era < MAX_ERA && v.tech >= ERAS[v.era + 1].tech) {
      const before = v.name;
      v.era++;
      const e = ERAS[v.era];
      this.chronicle(v, `${e.icon} ${before} bước vào ${e.name}! Từ nay họ được gọi là ${v.name}.`);
      this.toasts.push({ icon: e.icon, title: `${v.base}: ${e.name}`, text: `${v.ruler || v.name} dẫn dắt dân tộc bước vào kỷ nguyên mới.` });
      this.sfx.push('era');
      if (v.era === 4 && !v.ideology) this.chooseIdeology(v);
    }
    // A catastrophe can knock a civilisation back an age.
    while (v.era > 0 && v.tech < ERAS[v.era].tech * 0.92) {
      v.era--;
      this.chronicle(v, `📉 ${v.base} suy tàn sau bao tai ương, lùi về ${ERAS[v.era].name}.`);
    }
  }

  // ---------- Religion & wishes ----------

  private religionTick(v: Village, dt: number) {
    for (let g = 0; g < this.gods; g++) {
      if (v.patron === g) v.addFaith(g, -dt * 0.04);
      else v.addFaith(g, (15 - v.faiths[g]) * dt * 0.002);
      // Missionaries from neighbours who worship this god.
      for (const o of this.villages) {
        if (o !== v && o.alive && o.patron === g && !v.hostileTo(o.id) && Math.hypot(o.cx - v.cx, o.cy - v.cy) < 45) {
          v.addFaith(g, dt * (v.patron === g ? 0.03 : 0.05));
          break;
        }
      }
    }

    const best = this.gods > 1 && v.faiths[1] > v.faiths[0] ? 1 : 0;
    if (v.patron < 0 && v.faiths[best] >= 60) {
      v.patron = best;
      this.chronicle(v, `✨ ${v.name} từ bỏ tín ngưỡng ${v.culture.deity}, quay sang tôn thờ ${this.godNames[best]}!`);
    } else if (v.patron >= 0 && best !== v.patron && v.faiths[best] >= 60 && v.faiths[best] > v.faiths[v.patron] + 20) {
      const old = this.godNames[v.patron];
      v.patron = best;
      v.temple = false;
      this.chronicle(v, `🔁 ${v.name} rời bỏ ${old}, cải đạo sang thờ ${this.godNames[best]}!`);
    } else if (v.patron >= 0 && v.faiths[v.patron] < 20) {
      const old = this.godNames[v.patron];
      v.patron = -1;
      v.temple = false;
      this.stats.apostasies++;
      this.chronicle(v, `💔 ${v.name} mất niềm tin vào ${old}, đập bỏ đền thờ và quay về với ${v.culture.deity}.`);
    }

    if (!v.temple && v.religion === 'god' && v.era >= 1 && v.wood >= 6) {
      v.temple = true;
      v.wood -= 6;
      this.chronicle(v, `⛩️ ${v.name} dựng đền thờ đầu tiên dâng lên ${this.deityOf(v)}.`);
    }

    v.praying = Math.max(0, v.praying - dt);
    v.ritualTimer -= dt;
    if (v.ritualTimer <= 0) {
      v.ritualTimer = 150 + rand() * 120;
      v.praying = 10;
      const deity = v.patron >= 0 ? this.godNames[v.patron] : v.culture.deity;
      if (v.patron >= 0) v.addFaith(v.patron, 3);
      this.chronicle(v, `🛐 ${v.name} mở ${v.culture.festival}, cả làng tụ họp cầu khấn ${deity}.`, false);
    }
  }

  private wishTick(v: Village, dt: number) {
    v.wishCooldown -= dt;
    // An unanswered prayer fades away; silence costs a little faith.
    if (this.wishes.some((x) => !this.villages[x.village]?.alive)) this.wishes = this.wishes.filter((x) => this.villages[x.village]?.alive);
    const stale = this.wishes.find((x) => x.village === v.id && x.expires <= this.world.time);
    if (stale) {
      this.wishes = this.wishes.filter((x) => x !== stale);
      v.addFaith(stale.god, -3);
    }
    if (v.wishCooldown > 0 || this.wishes.some((x) => x.village === v.id)) return;
    v.wishCooldown = 240 + (100 - v.faith) * 2 + rand() * 160;
    if (v.faith < 5 || v.capital.faithPolicy === 'secular') return;
    // Across the whole world: at most 3 waiting, and a pause between any two prayers.
    if (this.wishes.length >= 3 || this.world.time < this.nextWishAt) return;
    this.nextWishAt = this.world.time + 120 + rand() * 90;
    const wish = this.composeWish(v);
    if (!wish) return;
    this.wishes.push(wish);
    this.toasts.push({ icon: '🙏', title: `${v.base} cầu nguyện`, text: wish.text });
    this.sfx.push('wish');
  }

  private composeWish(v: Village): Wish | null {
    const w = this.world;
    const center = idx(v.cx, v.cy);
    // A people prays to the god they worship; otherwise to the god who created them.
    const to = this.gods > 1 ? (v.patron >= 0 ? v.patron : v.homeGod >= 0 ? v.homeGod : v.leaning) : 0;
    const god = this.godNames[to];
    const mk = (kind: WishKind, text: string, reason: string, target = -1): Wish => ({
      id: this.wishId++,
      village: v.id,
      god: to,
      kind,
      text,
      reason,
      target,
      expires: w.time + 150,
    });

    // What people ask for, and how they say it, belongs to their age:
    // 0 stone · 1 bronze · 2 iron · 3 medieval · 4 industrial · 5 modern · 6 space.
    const e = v.era;
    const by = <T,>(...opts: T[]) => opts[Math.min(e, opts.length - 1)];
    const town = by('bộ lạc', 'làng', 'thành', 'thành', 'thành phố', 'thành phố', 'đô thị');

    if (v.enemies.size) {
      const enemy = this.villages[[...v.enemies][0]];
      if (v.losses > v.kills + 3 || v.pop < enemy.pop * 0.7) {
        return v.culture.traits.aggression >= 1.3
          ? mk(
              'smite',
              by(
                `Hỡi ${god}, xin giáng sấm sét xuống bộ lạc ${enemy.base}!`,
                `Hỡi ${god}, xin giáng sấm sét trừng phạt ${enemy.name}!`,
                `Hỡi ${god}, xin giáng sấm sét trừng phạt ${enemy.name}!`,
                `Lạy ${god}, xin giáng thiên phạt xuống quân xâm lược ${enemy.name}!`,
                `Lạy ${god}, xin giáng cơn thịnh nộ lên các nhà máy và pháo đài của ${enemy.name}!`,
                `Lạy ${god}, xin trừng phạt những kẻ đã ném bom ${v.base}!`,
                `${god} ơi, xin vô hiệu hóa hạm đội và chiến giáp của ${enemy.name}!`,
              ),
              `Họ đã mất ${v.losses} chiến binh trong cuộc chiến.`,
              enemy.id,
            )
          : mk(
              'peace',
              by(
                `Xin ${god} cho hai bộ lạc thôi chém giết nhau.`,
                `Xin ${god} chấm dứt chiến tranh với ${enemy.name}.`,
                `Xin ${god} chấm dứt chiến tranh với ${enemy.name}.`,
                `Lạy ${god}, xin cho hai nước giảng hòa, binh đao chấm dứt.`,
                `Xin ${god} cho hai bên ngồi vào bàn đàm phán, ký hòa ước.`,
                `Xin ${god} cho lệnh ngừng bắn với ${enemy.name}, cho con em chúng con trở về.`,
                `Xin ${god} cho các hội đồng liên hành tinh lập lại hòa bình với ${enemy.name}.`,
              ),
              `Chiến tranh đã cướp đi ${v.losses} sinh mạng.`,
              enemy.id,
            );
      }
      return mk(
        'victory',
        by(
          `Xin ${god} cho giáo mác các chiến binh sắc bén, đánh thắng ${enemy.base}!`,
          `Xin ${god} phù hộ cho đoàn quân ${v.base} chiến thắng!`,
          `Xin ${god} phù hộ cho đạo quân ${v.base} phá tan quân thù!`,
          `Lạy ${god}, xin phù hộ các hiệp sĩ và cung thủ của ${v.base} toàn thắng!`,
          `Xin ${god} phù hộ cho pháo binh và tàu chiến ${v.base} giành chiến thắng!`,
          `Xin ${god} phù hộ cho không quân và lục quân ${v.base} chiến thắng!`,
          `Xin ${god} phù hộ cho hạm đội và chiến giáp ${v.base} khải hoàn!`,
        ),
        `Họ đang giao chiến với ${enemy.name}.`,
        enemy.id,
      );
    }
    if (w.localTemp(center) < 2)
      return mk(
        'warmth',
        by(
          `Xin ${god} xua tan giá rét, cho lửa trại đừng tắt.`,
          `Xin ${god} xua tan giá rét, mang mùa xuân trở lại.`,
          `Xin ${god} xua tan giá rét, mang mùa xuân trở lại.`,
          `Lạy ${god}, xin cho mùa đông khắc nghiệt sớm qua đi.`,
          `Xin ${god} cho than đá đủ dùng qua mùa đông này.`,
          `Xin ${god} chấm dứt đợt rét đậm, lưới điện sắp quá tải rồi.`,
          `Xin ${god} điều hòa khí hậu, máy sưởi hạt nhân sắp quá tải.`,
        ),
        `Trời lạnh ${Math.round(w.localTemp(center))}°C, ruộng đồng đóng băng.`,
      );
    const here = w.weatherAt(center);
    if (here === 'drought')
      return mk(
        'rain',
        by(
          `Xin ${god} cho mưa xuống, suối đã cạn khô.`,
          `Xin ${god} chấm dứt hạn hán, ban mưa xuống.`,
          `Xin ${god} chấm dứt hạn hán, ban mưa xuống.`,
          `Lạy ${god}, xin ban mưa cứu lấy mùa màng.`,
          `Xin ${god} cho mưa xuống, các hồ chứa và kênh đào đã cạn.`,
          `Xin ${god} chấm dứt đợt hạn hán lịch sử, nhà máy nước đang cạn kiệt.`,
          `Xin ${god} cho mưa, máy tạo mây đã hỏng hết rồi.`,
        ),
        'Hạn hán làm ruộng đồng khô nứt, cây rừng bốc cháy.',
      );
    if (here === 'storm' || (w.rainingAt(center) && v.floods > 0))
      return mk(
        'sun',
        by(
          `Xin ${god} cho trời tạnh, lều trại sắp bị cuốn trôi.`,
          `Xin ${god} cho trời tạnh, nước rút.`,
          `Xin ${god} cho trời tạnh, nước rút.`,
          `Lạy ${god}, xin cho bão tan, nước rút khỏi thành.`,
          `Xin ${god} cho bão tan, đê điều sắp vỡ.`,
          `Xin ${god} đẩy cơn bão ra biển, thành phố đang ngập lụt.`,
          `Xin ${god} làm tan siêu bão, lá chắn thời tiết đã quá tải.`,
        ),
        here === 'storm' ? 'Bão tố đang tàn phá vùng đất.' : 'Họ từng bị lũ cuốn trôi nhà cửa.',
      );
    if (v.food < v.pop) {
      return here === 'sun'
        ? mk(
            'rain',
            by(
              `Xin ${god} ban mưa cho cây trái ra quả.`,
              `Xin ${god} ban mưa xuống cho ruộng đồng.`,
              `Xin ${god} ban mưa xuống cho ruộng đồng.`,
              `Lạy ${god}, xin ban mưa thuận cho ruộng lúa.`,
              `Xin ${god} ban mưa cho các đồn điền.`,
              `Xin ${god} ban mưa, giá lương thực đang tăng vọt.`,
              `Xin ${god} ban mưa cho các nông trại thủy canh.`,
            ),
            `Kho chỉ còn ${Math.floor(v.food)} phần ăn cho ${v.pop} người.`,
          )
        : mk(
            'harvest',
            by(
              `Xin ${god} cho chúng con hái lượm đủ ăn.`,
              `Xin ${god} ban cho một mùa bội thu.`,
              `Xin ${god} ban cho một mùa bội thu.`,
              `Lạy ${god}, xin cho mùa màng bội thu, kho lẫm đầy ắp.`,
              `Xin ${god} cho nhà máy và đồng ruộng làm ra đủ cái ăn.`,
              `Xin ${god} cứu ${v.base} khỏi khủng hoảng lương thực.`,
              `Xin ${god} cho các trạm tổng hợp thực phẩm hoạt động trở lại.`,
            ),
            `Kho chỉ còn ${Math.floor(v.food)} phần ăn cho ${v.pop} người.`,
          );
    }
    if (v.jobs.trees.length < 6)
      return mk(
        'forest',
        by(
          `Xin ${god} cho rừng xanh mọc lại quanh bộ lạc.`,
          `Xin ${god} cho rừng xanh mọc lại quanh làng.`,
          `Xin ${god} cho rừng xanh mọc lại quanh thành.`,
          `Lạy ${god}, xin cho rừng xanh tốt lại, thợ mộc không còn gỗ.`,
          `Xin ${god} cho rừng hồi sinh, khói nhà máy đã làm cây chết hết.`,
          `Xin ${god} phủ xanh lại đồi trọc, không khí ô nhiễm quá.`,
          `Xin ${god} giúp hồi sinh hệ sinh thái quanh ${v.base}.`,
        ),
        `Cây cối quanh ${town} đã bị chặt gần hết.`,
      );
    // Only hunters and herders pray for game.
    if (e <= 1 && this.animals.grid.count(v.cx, v.cy, v.radius + 8, (a) => a.kind === 'deer') < 2) {
      return mk('game', e === 0 ? `Xin ${god} ban cho muông thú để săn bắt.` : `Xin ${god} cho đàn gia súc và thú rừng sinh sôi.`, 'Thú rừng quanh đây đã biến mất.');
    }
    if (v.pop < 15)
      return mk(
        'fertility',
        by(
          `Xin ${god} ban phước cho bộ lạc đông người.`,
          `Xin ${god} ban phước cho con cháu đầy đàn.`,
          `Xin ${god} ban phước cho con cháu đầy đàn.`,
          `Lạy ${god}, xin cho dòng họ đông con nhiều cháu.`,
          `Xin ${god} cho ${v.base} thêm nhân công.`,
          `Xin ${god} cho các gia đình trẻ thêm con, dân số đang già đi.`,
          `Xin ${god} cho ${v.base} đông dân như các thuộc địa vũ trụ.`,
        ),
        `${town[0].toUpperCase() + town.slice(1)} chỉ có ${v.pop} người.`,
      );
    const roll = rand();
    if (roll < 0.4 && v.era < MAX_ERA)
      return mk(
        'knowledge',
        by(
          `Xin ${god} chỉ cho chúng con cách giữ lửa và rèn đá sắc hơn.`,
          `Xin ${god} dạy chúng con đúc đồng sáng loáng.`,
          `Xin ${god} dạy chúng con luyện sắt, viết chữ.`,
          `Lạy ${god}, xin khai sáng cho các học giả của ${v.base}.`,
          `Xin ${god} soi đường cho các nhà phát minh của ${v.base}.`,
          `Xin ${god} cho các nhà khoa học ${v.base} có bước đột phá.`,
          `Xin ${god} mở cánh cửa tri thức vũ trụ cho ${v.base}.`,
        ),
        `Họ khao khát tiến tới ${ERAS[v.era + 1].name}.`,
      );
    if (roll < 0.7)
      return mk(
        'harvest',
        by(
          `Xin ${god} cho rừng nhiều quả ngọt.`,
          `Xin ${god} ban cho một mùa bội thu.`,
          `Xin ${god} ban cho một mùa bội thu.`,
          `Lạy ${god}, xin cho mùa màng bội thu, chợ phiên đông vui.`,
          `Xin ${god} cho buôn bán phát đạt, mùa màng bội thu.`,
          `Xin ${god} cho kinh tế ${v.base} tăng trưởng.`,
          `Xin ${god} cho các trạm năng lượng và nông trại vũ trụ dồi dào.`,
        ),
        e >= 4 ? 'Lời nguyện cầu đầu năm của người dân.' : 'Lời cầu nguyện thường niên của dân làng.',
      );
    return mk(
      'fertility',
      by(
        `Xin ${god} phù hộ cho bộ lạc sinh sôi.`,
        `Xin ${god} phù hộ cho các gia đình đông con.`,
        `Xin ${god} phù hộ cho các gia đình đông con.`,
        `Lạy ${god}, xin cho gia đình hạnh phúc, con cháu hiếu thảo.`,
        `Xin ${god} cho trẻ em khỏe mạnh, khỏi dịch bệnh.`,
        `Xin ${god} cho mọi gia đình bình an, khỏe mạnh.`,
        `Xin ${god} cho hậu duệ chúng con vươn tới các vì sao.`,
      ),
      'Họ mong dân tộc mình hưng thịnh.',
    );
  }

  answerWish(id: number, yes: boolean, by = 0) {
    const wish = this.wishes.find((x) => x.id === id);
    if (!wish || (this.strictGods && wish.god !== by)) return;
    const g = wish.god;
    this.wishes = this.wishes.filter((x) => x !== wish);
    const v = this.villages[wish.village];
    if (!v?.alive) return;
    if (!yes) {
      v.addFaith(g, -10);
      this.stats.wishesDenied++;
      this.chronicle(v, `😞 ${this.godNames[g]} im lặng trước lời cầu xin của ${v.name}. Niềm tin của họ lung lay.`);
      return;
    }
    this.grant(v, wish);
    this.sfx.push('miracle');
    v.addFaith(g, 12);
    this.stats.wishesGranted++;
    for (const o of this.villages) {
      if (o !== v && o.alive && Math.hypot(o.cx - v.cx, o.cy - v.cy) < 40) o.addFaith(g, 3);
    }
  }

  private grant(v: Village, wish: Wish) {
    const w = this.world;
    const god = this.godNames[wish.god];
    switch (wish.kind) {
      case 'rain':
        w.paintWeather(v.cx, v.cy, v.radius + 24, 'rain');
        this.chronicle(v, `🌧️ ${god} ban mưa cho ${v.name}. Dân làng nhảy múa dưới mưa.`);
        break;
      case 'sun':
        w.paintWeather(v.cx, v.cy, v.radius + 24, 'sun');
        w.seaLevel = Math.min(w.seaLevel, BASE_SEA + 0.005);
        this.chronicle(v, `☀️ ${god} xua tan mây đen, nước rút về biển. ${v.name} tạ ơn thần linh.`);
        break;
      case 'warmth':
        w.paintWeather(v.cx, v.cy, v.radius + 24, 'sun', 16);
        this.chronicle(v, `🌸 ${god} mang mùa xuân trở lại, băng tuyết tan dần quanh ${v.name}.`);
        break;
      case 'harvest':
        for (const i of v.farms) w.timer[i] = 1;
        v.food += v.pop * 1.5;
        this.chronicle(v, `🌾 ${god} ban mùa bội thu, kho lúa của ${v.name} đầy ắp.`);
        break;
      case 'fertility':
        v.blessFertile = 90;
        this.chronicle(v, `👶 ${god} ban phước, các gia đình ở ${v.name} đông con hơn.`);
        break;
      case 'victory':
        v.blessWar = 90;
        this.chronicle(v, `⚔️ ${god} phù hộ đoàn quân ${v.base} — các chiến binh hăng hái gấp bội.`);
        break;
      case 'peace': {
        const o = this.villages[wish.target];
        if (o) this.makePeace(v, o, `${god} đáp lời cầu xin hòa bình`);
        break;
      }
      case 'smite': {
        const o = this.villages[wish.target];
        if (!o?.alive) break;
        const houses = [...o.houses];
        for (let k = 0; k < 4; k++) {
          const i = houses.length ? pick(houses) : idx(o.cx, o.cy);
          w.events.push({ type: 'lightning', x: cx(i), y: cy(i) });
          if (w.canBurn(i)) w.ignite(i);
        }
        o.addFaith(wish.god, 10);
        this.chronicle(v, `⚡ ${god} giáng sấm sét xuống ${o.name} theo lời cầu xin của ${v.name}!`);
        break;
      }
      case 'game':
        for (let k = 0; k < 8; k++) this.spawnAnimal('deer', v.cx + rand() * 14 - 7, v.cy + rand() * 14 - 7);
        this.chronicle(v, `🦌 ${god} gửi đàn hươu tới vùng đất của ${v.name}.`);
        break;
      case 'forest':
        for (let k = 0; k < 4; k++) {
          const a = rand() * Math.PI * 2;
          w.plantForest(v.cx + Math.cos(a) * (v.radius + 2), v.cy + Math.sin(a) * (v.radius + 2), 3);
          w.plantForest(v.cx + Math.cos(a) * (v.radius + 2), v.cy + Math.sin(a) * (v.radius + 2), 3);
        }
        this.chronicle(v, `🌳 ${god} cho rừng xanh mọc lên quanh ${v.name}.`);
        break;
      case 'knowledge':
        v.tech += 60;
        this.chronicle(v, `📜 ${god} khai sáng cho các hiền nhân của ${v.name}.`);
        break;
    }
  }

  // ---------- War & diplomacy ----------

  // ---------- Nations ----------

  /** Capitals of living nations. */
  nations() {
    return this.villages.filter((v) => v.alive && v.isCapital);
  }
  citiesOf(cap: Village) {
    return this.villages.filter((v) => v.alive && v.nation === cap.id);
  }
  nationPop(cap: Village) {
    let n = 0;
    for (const v of this.villages) if (v.alive && v.nation === cap.id) n += v.pop;
    return n;
  }
  private nationCount(cap: Village, kind: Kind) {
    let n = 0;
    for (const v of this.villages) if (v.alive && v.nation === cap.id) n += v.count(kind);
    return n;
  }

  /** On industrialising, a nation settles on a political system shaped by its people and its friends. */
  private chooseIdeology(cap: Village) {
    const friends = [...cap.allies, ...cap.pacts].map((i) => this.villages[i]).filter((o) => o?.alive && o.ideology);
    const r = rand();
    let pick: Village['ideology'];
    if (friends.length && r < 0.5) pick = friends[0].ideology;
    else if (cap.culture.traits.aggression >= 1.3) pick = r < 0.55 ? 'communism' : r < 0.8 ? 'socialism' : 'capitalism';
    else if (cap.partners.size >= 2) pick = r < 0.6 ? 'capitalism' : r < 0.85 ? 'socialism' : 'communism';
    else pick = r < 0.4 ? 'capitalism' : r < 0.75 ? 'socialism' : 'communism';
    cap.ideology = pick;
    if (pick) cap.gov = pick;
    const what = { capitalism: '💰 kinh tế thị trường tư bản chủ nghĩa', socialism: '🌹 con đường xã hội chủ nghĩa', communism: '☭ chủ nghĩa cộng sản' }[pick as 'capitalism'];
    this.chronicle(cap, `🏛️ Bước vào thời công nghiệp, ${cap.base} chọn ${what}. Từ nay gọi là ${cap.name}.`);
  }

  /** The people a god guides (its current capital), or null. */
  peopleOf(god: number): Village | null {
    const id = this.chosen[god];
    const v = id >= 0 ? this.villages[id] : null;
    if (!v) return null;
    const cap = v.capital;
    if (!cap.alive) return null;
    if (cap.id !== id) this.chosen[god] = cap.id; // the seat moved, or they were absorbed
    return cap;
  }
  /** Is this nation guided by a god (so the AI leaves its policies alone)? */
  guided(cap: Village) {
    return this.chosen.some((id, g) => id >= 0 && this.peopleOf(g) === cap);
  }

  private setPolicy(cap: Village, key: string, value: string | number | boolean, byGod: boolean) {
    const said = (t: string) => byGod && this.chronicle(cap, t);
    switch (key) {
      case 'gov': {
        const g = value as Gov;
        if (!GOVS[g] || !govsFor(cap.era).includes(g) || cap.gov === g) return;
        cap.gov = g;
        if (g === 'capitalism' || g === 'socialism' || g === 'communism') cap.ideology = g;
        // Changing the system shakes the realm for a while.
        cap.mood = Math.max(0, cap.mood - 12);
        said(`📜 ${cap.base} chuyển sang chính thể ${GOVS[g].icon} ${GOVS[g].name}. Từ nay gọi là ${cap.name}.`);
        return;
      }
      case 'tax':
        cap.tax = Math.max(0, Math.min(2, Number(value)));
        said(`💰 ${cap.name} đặt mức thuế ${TAXES[cap.tax].name.toLowerCase()}.`);
        return;
      case 'stance':
        cap.stance = value as Stance;
        return;
      case 'trade':
        cap.openTrade = !!value;
        if (!cap.openTrade) for (const p of [...cap.partners]) {
          cap.partners.delete(p);
          this.villages[p]?.partners.delete(cap.id);
        }
        said(cap.openTrade ? `⛵ ${cap.name} mở cửa giao thương với thiên hạ.` : `🚪 ${cap.name} đóng cửa biên giới, bế quan tỏa cảng.`);
        return;
      case 'faith': {
        const f = value as FaithPolicy;
        if (!FAITHS[f] || cap.era < FAITHS[f].from) return;
        cap.faithPolicy = f;
        said(`🛐 ${cap.name} chọn ${FAITHS[f].name.toLowerCase()} làm quốc giáo.`);
        return;
      }
      case 'auto':
        cap.autoBuild = !!value;
        return;
    }
  }

  /**
   * The life of a realm: taxes fill the treasury, contentment rises and falls with food, taxes, war
   * and faith; discontent breeds unrest. Unguided nations set their own policies.
   */
  private politicsTick(cap: Village, dt: number) {
    // The system must suit the age; when the age outgrows it, the realm moves on.
    if (!govsFor(cap.era).includes(cap.gov)) {
      const options = govsFor(cap.era);
      const pick = cap.era >= 4 && cap.ideology && options.includes(cap.ideology) ? cap.ideology : this.aiGov(cap, options);
      const before = GOVS[cap.gov].name;
      cap.gov = pick;
      if (pick === 'capitalism' || pick === 'socialism' || pick === 'communism') cap.ideology = pick;
      this.chronicle(cap, `📜 Thời thế đổi thay: ${before} nhường chỗ cho ${GOVS[pick].icon} ${GOVS[pick].name} ở ${cap.base}.`);
      if (this.guided(cap)) this.toasts.push({ icon: '📜', title: 'Chính thể mới', text: `${GOVS[pick].name} — có thể đổi trong thẻ 👑` });
    }
    const cities = this.citiesOf(cap);
    const pop = cities.reduce((n, c) => n + c.pop, 0);
    const gov = GOVS[cap.gov];
    cap.gold += dt * (0.4 + pop * 0.03) * TAXES[cap.tax].income * gov.tax * cap.econ * (cap.mood < 25 ? 0.6 : 1);

    // State religion: the creator's cult grows its faith; a secular state lets faith fade.
    for (const c of cities) {
      if (cap.faithPolicy === 'god' && c.homeGod >= 0) c.addFaith(c.homeGod, dt * 0.06);
      else if (cap.faithPolicy === 'secular') for (let g = 0; g < c.faiths.length; g++) c.addFaith(g, -dt * 0.03);
    }
    const fed = cities.filter((c) => c.food >= c.pop * 0.8).length / (cities.length || 1);
    const trauma = cities.reduce((n, c) => n + c.trauma, 0) / (cities.length || 1);
    const faithful = cap.faithPolicy !== 'secular' && cap.faith > 50 ? 5 : 0;
    const target =
      55 + 20 * (fed - 0.5) + TAXES[cap.tax].mood + gov.mood + faithful - (cap.enemies.size ? 10 : 0) - trauma * 30 - (cap.econT > 0 ? 18 : cap.econT < 0 ? -6 : 0) + Math.min(9, cap.pacts.size * 3);
    cap.mood += (Math.max(0, Math.min(100, target)) - cap.mood) * Math.min(1, dt * 0.02);

    // Unrest: provinces break away, or the regime falls.
    if (cap.mood < 22 && rand() < dt * 0.003) {
      const far = cities.filter((c) => c !== cap).sort((a, b) => Math.hypot(b.cx - cap.cx, b.cy - cap.cy) - Math.hypot(a.cx - cap.cx, a.cy - cap.cy))[0];
      if (far && rand() < 0.6) {
        this.secede(far, 'vì lòng dân oán thán triều đình');
      } else {
        const options = govsFor(cap.era).filter((g) => g !== cap.gov);
        if (options.length) {
          const before = cap.name;
          const g = options[Math.floor(rand() * options.length)];
          cap.gov = g;
          if (g === 'capitalism' || g === 'socialism' || g === 'communism') cap.ideology = g;
          cap.mood = 50;
          cap.tax = 1;
          this.chronicle(cap, `✊ Dân chúng nổi dậy lật đổ ${before}! Chính quyền mới: ${GOVS[g].icon} ${GOVS[g].name}.`);
          this.toasts.push({ icon: '✊', title: 'Nổi dậy!', text: `${before} → ${cap.name}` });
        }
      }
    }

    // Unguided nations govern themselves.
    if (this.guided(cap)) return;
    cap.policyT -= dt;
    if (cap.policyT > 0) return;
    cap.policyT = 40 + rand() * 40;
    cap.tax = cap.mood < 35 ? 0 : cap.gold < civicGold(cap.era) * 2 ? 2 : 1;
    const ag = cap.culture.traits.aggression;
    cap.stance = ag >= 1.3 ? 'expand' : ag <= 0.8 ? 'peace' : 'defend';
    if (cap.era >= 4 && cap.faithPolicy !== 'secular' && cap.faith < 25 && rand() < 0.3) cap.faithPolicy = 'secular';
  }

  private aiGov(cap: Village, options: Gov[]): Gov {
    const t = cap.culture.traits;
    const score = (g: Gov) => GOVS[g].tech * t.tech + GOVS[g].army * 4 * t.aggression + GOVS[g].mood * 0.02 + rand() * 0.3;
    return options.slice().sort((a, b) => score(b) - score(a))[0];
  }

  /**
   * Booms and busts. Capitalist economies grow fastest but crash most often; planned economies are
   * steady but sluggish. Wars and disasters can tip any economy into crisis, and a deep crisis can
   * end in revolution.
   */
  private economyTick(cap: Village, dt: number) {
    if (cap.era < 3) return;
    if (cap.era >= 4 && !cap.ideology) this.chooseIdeology(cap);
    if (cap.econT > 0) {
      cap.econT -= dt;
      cap.econ = 0.6;
      for (const c of this.citiesOf(cap)) {
        c.wood = Math.max(0, c.wood - dt * 0.2);
        c.trauma = Math.min(1, c.trauma + dt * 0.001);
      }
      // A long crisis breeds revolution.
      if (cap.era >= 4 && rand() < dt * 0.004) {
        const before = cap.name;
        const next: Village['ideology'] = cap.ideology === 'capitalism' ? (rand() < 0.5 ? 'socialism' : 'communism') : cap.ideology === 'communism' ? 'capitalism' : rand() < 0.5 ? 'capitalism' : 'communism';
        cap.ideology = next;
        if (next) cap.gov = next;
        cap.econT = Math.min(cap.econT, 10);
        this.chronicle(cap, `✊ Cách mạng nổ ra giữa khủng hoảng! ${before} sụp đổ, ${cap.name} ra đời.`);
        this.toasts.push({ icon: '✊', title: 'Cách mạng!', text: `${before} → ${cap.name}` });
      }
      if (cap.econT <= 0) {
        cap.econT = -(40 + rand() * 40);
        this.chronicle(cap, `📈 Kinh tế ${cap.name} phục hồi, bước vào thời kỳ tăng trưởng.`, false);
      }
      return;
    }
    if (cap.econT < 0) {
      cap.econT = Math.min(0, cap.econT + dt);
      cap.econ = cap.ideology === 'capitalism' ? 1.3 : 1.15;
      return;
    }
    cap.econ = cap.ideology === 'communism' ? 0.9 : 1;
    const base = cap.era === 3 ? 0.0006 : cap.ideology === 'capitalism' ? 0.0022 : cap.ideology === 'socialism' ? 0.001 : 0.0005;
    const stress = (cap.enemies.size ? 0.0012 : 0) + (cap.trauma > 0.4 ? 0.0015 : 0);
    if (rand() < (base + stress) * dt) {
      cap.econT = 50 + rand() * 90;
      const how = cap.era === 3 ? 'mất mùa, giá lúa tăng vọt, thương nhân phá sản' : cap.ideology === 'capitalism' ? 'thị trường chứng khoán sụp đổ, ngân hàng phá sản, thất nghiệp tràn lan' : 'kế hoạch đổ vỡ, hàng hóa khan hiếm, xếp hàng dài';
      this.chronicle(cap, `📉 Khủng hoảng kinh tế ở ${cap.name}: ${how}.`);
      this.toasts.push({ icon: '📉', title: 'Khủng hoảng kinh tế', text: cap.name });
    }
  }

  private nationHas(cap: Village, kind: Kind) {
    return this.villages.some((v) => v.alive && v.nation === cap.id && v.has(kind));
  }
  /** The closest pair of cities between two nations, and their distance. */
  private nearestCities(a: Village, b: Village): [number, Village, Village] {
    let best: [number, Village, Village] = [Infinity, a, b];
    for (const ca of this.villages) {
      if (!ca.alive || ca.nation !== a.id) continue;
      for (const cb of this.villages) {
        if (!cb.alive || cb.nation !== b.id) continue;
        const d = Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy);
        if (d < best[0]) best = [d, ca, cb];
      }
    }
    return best;
  }

  /** A city changes hands (conquest or union); if it was a capital, its nation moves its seat. */
  private transferCity(city: Village, to: Village) {
    const from = city.capital;
    if (from === to.capital) return;
    if (city.isCapital) {
      const rest = this.villages.filter((v) => v.alive && v !== city && v.nation === city.id).sort((x, y) => y.pop - x.pop);
      if (rest.length) this.moveCapital(city, rest[0]);
      else this.endWars(city);
    }
    for (const v of this.villages) if (v === city) v.nation = to.capital.id;
    this.repaints.push({ x: city.cx, y: city.cy, r: city.radius + 8, color: to.capital.hue });
    for (const h of this.humans) if (h.village === city.id) h.role = 'none';
    city.opinion.clear();
    city.partners.clear();
    city.allies.clear();
    city.pacts.clear();
  }

  /**
   * Settlers from the nation's most crowded other city move into `city` (a conquest, an empty town).
   * Returns how many came.
   */
  private sendSettlers(city: Village, cap: Village, n: number) {
    const donors = this.citiesOf(cap).filter((c) => c !== city && c.pop > 6).sort((a, b) => b.pop - a.pop);
    let moved = 0;
    for (const d of donors) {
      const spare = Math.floor(d.pop * 0.25);
      let k = 0;
      for (const h of this.humans) {
        if (moved >= n || k >= spare) break;
        if (h.dead || h.village !== d.id || h.role !== 'none' || h.age < ADULT) continue;
        h.village = city.id;
        h.culture = h.culture || d.culture.id;
        this.go(h, 'migrate', idx(city.cx, city.cy), `Dọn tới ${city.base} lập nghiệp`);
        moved++;
        k++;
      }
      if (moved >= n) break;
    }
    return moved;
  }

  /**
   * An empty town: a living city next to it (often the conqueror) moves in and takes it over;
   * otherwise its houses and fields crumble away.
   */
  private abandoned(v: Village, dt: number) {
    const w = this.world;
    v.jobTimer -= dt;
    if (v.jobTimer > 0) return;
    v.jobTimer = 3;
    let heir: Village | null = null;
    let bd = Infinity;
    for (const o of this.villages) {
      if (!o.alive || o === v) continue;
      const d = Math.hypot(o.cx - v.cx, o.cy - v.cy);
      if (d < o.radius + v.radius + 45 && d < bd) {
        bd = d;
        heir = o;
      }
    }
    if (heir) {
      // The neighbour's nation resettles the empty town as one of its own cities.
      const cap = heir.capital;
      const came = this.sendSettlers(v, cap, Math.max(5, Math.min(14, v.houses.size)));
      if (came >= 2) {
        v.alive = true;
        v.nation = cap.id;
        v.warSet = new Set();
        v.opinion = new Map();
        v.partners = new Set();
        v.allies = new Set();
        v.pacts = new Set();
        v.absorbedBy = -1;
        v.era = cap.era;
        v.tech = Math.max(v.tech, ERAS[cap.era].tech);
        v.food = Math.max(v.food, 20);
        v.wood = Math.max(v.wood, 10);
        v.trauma = 0.3;
        this.repaints.push({ x: v.cx, y: v.cy, r: v.radius + 8, color: cap.hue });
        this.chronicle(cap, `🏘️ ${cap.name} đưa ${came} gia đình tới ở ${v.base} bỏ hoang — ${v.base} hồi sinh thành một thành phố của ${cap.name}.`);
        return;
      }
    }
    // Nobody to move in: a few homes and fields fall to ruin each time.
    const crumble = (set: Set<number>) => {
      let n = Math.max(1, Math.ceil(set.size * 0.04));
      for (const i of [...set]) {
        if (n-- <= 0) break;
        set.delete(i);
        v.buildings.delete(i);
        w.cover[i] = Cover.NONE;
        w.building[i] = 0;
        w.owner[i] = -1;
      }
    };
    crumble(v.houses);
    crumble(v.farms);
    this.repaints.push({ x: v.cx, y: v.cy, r: v.radius + 4, color: -1 });
  }

  /** Two cities of one nation that have grown into each other become one city. */
  private mergeCities() {
    const w = this.world;
    for (const a of this.villages) {
      if (!a.alive) continue;
      for (const b of this.villages) {
        if (b === a || !b.alive || b.nation !== a.nation) continue;
        if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > (a.radius + b.radius) * 0.75) continue;
        // The larger absorbs the smaller (the capital always stays the capital).
        let [big, small] = a.pop + a.houses.size >= b.pop + b.houses.size ? [a, b] : [b, a];
        if (small.isCapital) [big, small] = [small, big];
        for (const h of this.humans) if (h.village === small.id) h.village = big.id;
        for (const i of small.houses) {
          big.houses.add(i);
          w.owner[i] = big.id;
        }
        for (const i of small.farms) {
          big.farms.add(i);
          w.owner[i] = big.id;
        }
        for (const [i, k] of small.buildings) big.buildings.set(i, k);
        big.pop += small.pop;
        big.food += small.food;
        big.wood += small.wood;
        big.reach = Math.max(big.reach, small.reach) + 2;
        big.tech = Math.max(big.tech, small.tech);
        small.houses.clear();
        small.farms.clear();
        small.buildings.clear();
        small.pop = 0;
        small.alive = false;
        small.absorbedBy = big.id;
        this.chronicle(big, `🏙️ ${small.base} và ${big.base} lớn lên chạm vào nhau, hợp thành một đô thị lớn mang tên ${big.base}.`);
        return; // one merge per pass keeps things simple and deterministic
      }
    }
  }

  /** The seat of a nation moves to another of its cities (keeps its name, wars, friends). */
  private moveCapital(old: Village, seat: Village) {
    for (const v of this.villages) if (v.nation === old.id) v.nation = seat.id;
    seat.warSet = old.warSet;
    old.warSet = new Set();
    seat.opinion = old.opinion;
    seat.partners = old.partners;
    seat.allies = old.allies;
    seat.pacts = old.pacts;
    seat.hue = old.hue;
    seat.annexed = old.annexed;
    seat.tech = Math.max(seat.tech, old.tech);
    old.opinion = new Map();
    old.partners = new Set();
    old.allies = new Set();
    old.pacts = new Set();
    for (const o of this.villages) {
      for (const set of [o.warSet, o.partners, o.allies, o.pacts]) if (set.delete(old.id)) set.add(seat.id);
      const op = o.opinion.get(old.id);
      if (op !== undefined) {
        o.opinion.delete(old.id);
        o.opinion.set(seat.id, op);
      }
    }
    for (const w of this.wars) {
      if (w.a === old.id) w.a = seat.id;
      if (w.b === old.id) w.b = seat.id;
    }
    this.chronicle(seat, `🏛️ ${seat.nationName} dời đô về ${seat.base}.`);
  }

  /** Industrial nations bridge the straits between their own cities and to their trading partners. */
  private bridgeTick(nations: Village[]) {
    const w = this.world;
    for (const n of nations) {
      if (n.era < 4 || rand() > 0.15) continue;
      const maxSpan = [0, 0, 5, 8, 24, 45, 80][Math.min(6, n.era)];
      const mine = this.citiesOf(n);
      const others = [...n.partners, ...n.pacts].flatMap((p) => (this.villages[p]?.alive ? this.citiesOf(this.villages[p]) : []));
      for (const a of mine) {
        for (const b of [...mine, ...others]) {
          if (a === b || a.id > b.id && b.nation === n.id) continue;
          const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
          if (d > maxSpan + 60 || !this.seaBetween(a.cx, a.cy, b.cx, b.cy)) continue;
          // Count the open water on the way: too wide a sea and no bridge can span it.
          let wet = 0;
          let run = 0;
          const steps = Math.ceil(d);
          for (let k = 0; k <= steps; k++) {
            const i = idx(Math.round(a.cx + ((b.cx - a.cx) * k) / steps), Math.round(a.cy + ((b.cy - a.cy) * k) / steps));
            if (w.isWater(i)) run++;
            else {
              wet = Math.max(wet, run);
              run = 0;
            }
          }
          if (Math.max(wet, run) > maxSpan) continue;
          this.carveHighway(a, b);
          this.chronicle(n, `🌉 ${n.name} xây cầu vượt biển nối ${a.base} với ${b.base}.`);
          this.toasts.push({ icon: '🌉', title: 'Cầu vượt biển', text: `${a.base} ↔ ${b.base}` });
          this.repaints.push({ x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2, r: d / 2 + 4, color: -1 });
          return; // one great work at a time
        }
      }
    }
  }

  private diplomacyTick() {
    const nations = this.nations();
    this.bridgeTick(nations);
    const maxEra = nations.reduce((m, v) => Math.max(m, v.era), 0);

    for (const a of nations) {
      for (const b of nations) {
        if (a.id >= b.id) continue;
        const [d, ca, cb] = this.nearestCities(a, b);
        const atWar = a.enemies.has(b.id);
        // Trade between nations at peace whose markets are within reach.
        const pact = a.pacts.has(b.id);
        // Treaty partners trade over any distance, markets or not.
        const trading = !atWar && a.openTrade && b.openTrade && (pact || (d < 120 && this.nationHas(a, 'market') && this.nationHas(b, 'market')));
        if (trading && !a.partners.has(b.id)) {
          a.partners.add(b.id);
          b.partners.add(a.id);
          this.carveHighway(ca, cb);
          this.chronicle(a, `🤝 ${a.name} và ${b.name} mở đường buôn bán.`);
          this.chronicle(b, `🤝 ${b.name} và ${a.name} mở đường buôn bán.`, false);
        } else if (!trading && a.partners.has(b.id)) {
          a.partners.delete(b.id);
          b.partners.delete(a.id);
        }
        if (trading) {
          a.opinion.set(b.id, Math.min(100, (a.opinion.get(b.id) ?? 0) + 1.5));
          b.opinion.set(a.id, Math.min(100, (b.opinion.get(a.id) ?? 0) + 1.5));
          if (rand() < 0.05) this.carveHighway(ca, cb);
          // Goods flow from surplus to need.
          for (const key of ['food', 'wood'] as const) {
            const diff = (a[key] - b[key]) * 0.05;
            const amt = Math.max(-20, Math.min(20, diff));
            a[key] -= amt;
            b[key] += amt;
          }
          if (ca.culture.id !== cb.culture.id) {
            this.influence(ca, cb);
            this.influence(cb, ca);
            if (pact) {
              this.influence(ca, cb);
              this.influence(cb, ca);
            }
          }
          if (pact) {
            // Friends in peace grow rich together and share what they know.
            const pa = this.nationPop(a);
            const pb = this.nationPop(b);
            a.food += 2 + pa * 0.03;
            b.food += 2 + pb * 0.03;
            a.wood += 1 + pa * 0.02;
            b.wood += 1 + pb * 0.02;
            const gap = a.tech - b.tech;
            if (gap > 0) b.tech += gap * 0.004;
            else a.tech -= gap * 0.004;
            a.opinion.set(b.id, Math.min(100, (a.opinion.get(b.id) ?? 0) + 1.5));
            b.opinion.set(a.id, Math.min(100, (b.opinion.get(a.id) ?? 0) + 1.5));
          }
        }
        // Friendship becomes alliance; alliances fray when opinion sours.
        const oa = a.opinion.get(b.id) ?? 0;
        const ob = b.opinion.get(a.id) ?? 0;
        if (!atWar && !a.allies.has(b.id) && oa > 55 && ob > 55) {
          a.allies.add(b.id);
          b.allies.add(a.id);
          this.chronicle(a, `🛡️ ${a.name} và ${b.name} ký hiệp ước liên minh.`);
          this.chronicle(b, `🛡️ ${b.name} và ${a.name} ký hiệp ước liên minh.`, false);
        } else if (a.allies.has(b.id) && (oa < 20 || ob < 20)) {
          a.allies.delete(b.id);
          b.allies.delete(a.id);
          this.chronicle(a, `💔 Liên minh giữa ${a.name} và ${b.name} tan vỡ.`);
        }
        // Kindred peoples who have long traded in friendship may unite into one nation.
        if (trading && oa > 70 && ob > 70 && a.culture.id === b.culture.id && !a.enemies.size && !b.enemies.size && rand() < 0.05) {
          const [big, small] = this.nationPop(a) >= this.nationPop(b) ? [a, b] : [b, a];
          this.annex(big, small, true);
        }
      }
    }

    // Opinions, and wars when they sour.
    for (const a of nations) {
      if (!a.alive || !a.isCapital) continue;
      const popA = this.nationPop(a);
      for (const b of nations) {
        if (a === b || !b.alive || !b.isCapital) continue;
        const [d, ca, cb] = this.nearestCities(a, b);
        if (d > 110) continue;
        const border = d < ca.radius + cb.radius + 12;
        let delta = 0;
        if (border) delta -= 1.5;
        if (ca.pop >= 8 && (ca.pop >= ca.cap * 0.9 || ca.jobs.houseSites.length === 0)) delta -= 1.5;
        if (a.food < popA * 0.6) delta -= 1.2;
        if (a.era > b.era) delta -= 0.5 * (a.era - b.era);
        if (a.patron !== b.patron) delta -= a.patron >= 0 && b.patron >= 0 ? 1.6 : 0.8; // holy wars between two gods' faithful
        if (a.culture.id === b.culture.id) delta += 0.7;
        if (a.allies.has(b.id)) delta += 1.2;
        if (a.pacts.has(b.id)) delta += 2.5;
        // The cold war: different systems distrust each other, kindred systems stick together.
        if (a.ideology && b.ideology) delta += a.ideology === b.ideology ? 0.6 : -0.7;
        if (!border) delta += 0.6;
        if (delta < 0) delta *= a.culture.traits.aggression;
        delta += rand() - 0.5;
        const op = Math.max(-100, Math.min(100, (a.opinion.get(b.id) ?? 0) + delta));
        a.opinion.set(b.id, op);
        if (op < (a.stance === 'expand' ? -40 : -60) && a.stance !== 'peace' && border && !a.enemies.has(b.id) && !a.allies.has(b.id) && !a.pacts.has(b.id) && a.enemies.size === 0 && popA >= 8 && this.nationPop(b) >= 3) {
          const why =
            a.patron >= 0 && b.patron >= 0 && a.patron !== b.patron
              ? `nhân danh ${this.godNames[a.patron]} — một cuộc thánh chiến`
              : a.patron !== b.patron
                ? 'vì khác biệt tín ngưỡng'
                : a.food < popA * 0.6
                  ? 'vì nạn đói, quyết tranh giành lương thực'
                  : 'để mở rộng lãnh thổ';
          this.declareWar(a, b, why);
          // Allies honour their treaties.
          for (const al of b.allies) {
            const ally = this.villages[al];
            if (ally?.alive && ally.isCapital && ally !== a && !ally.enemies.has(a.id) && !ally.pacts.has(a.id) && rand() < 0.6) this.declareWar(ally, a, `để bảo vệ đồng minh ${b.name}`);
          }
          for (const al of a.allies) {
            const ally = this.villages[al];
            if (ally?.alive && ally.isCapital && ally !== b && !ally.enemies.has(b.id) && !ally.pacts.has(b.id) && rand() < 0.4) this.declareWar(ally, b, `sát cánh cùng đồng minh ${a.name}`);
          }
        }
      }
    }

    // Peoples left far behind are drawn into a more advanced neighbour.
    if (maxEra >= 4) {
      for (const n of this.nations()) {
        if (n.era > maxEra - 3 || n.era > 1) continue;
        let best: Village | null = null;
        let bd = 170;
        for (const m of this.nations()) {
          if (m.era < maxEra - 1) continue;
          const [d] = this.nearestCities(m, n);
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
        if (best && rand() < 0.05) this.annex(best, n, true, `${n.name} được ${best.name} khai hóa và sáp nhập`);
      }
    }

    // Wars end by conquest or exhaustion.
    for (const war of [...this.wars]) {
      const A = this.villages[war.a];
      const B = this.villages[war.b];
      if (!A?.alive || !B?.alive || !A.isCapital || !B.isCapital || !A.enemies.has(B.id)) {
        this.wars = this.wars.filter((x) => x !== war);
        continue;
      }
      const pa = this.nationPop(A);
      const pb = this.nationPop(B);
      const [weak, strong, pw, ps] = pa < pb ? [A, B, pa, pb] : [B, A, pb, pa];
      if ((war.minEnd ?? 0) > this.world.time) continue;
      // A weak nation surrenders only once the war has truly broken it (half its people gone).
      const pw0 = weak === A ? (war.popA0 ?? pw) : (war.popB0 ?? pw);
      // …and only to an army actually standing on its soil.
      const boots = () =>
        this.citiesOf(weak).some((c) => {
          let n = 0;
          this.humanGrid.each(c.cx, c.cy, c.radius + 10, (o) => {
            if (o.role === 'soldier' && o.village >= 0 && this.villages[o.village]?.nation === strong.id) n++;
          });
          return n >= 3;
        });
      if (pw <= Math.max(5, ps * 0.25) && ps >= 10 && pw <= pw0 * 0.5 && boots()) {
        this.annex(strong, weak);
        continue;
      }
      // Wars are fought out: great powers fight longer, and nobody sues for peace while the guns
      // are winning. Peace comes when a side is bled white — or after a long, hopeless stalemate.
      const age = this.world.time - war.start;
      const minAge = 200 + 25 * Math.sqrt(pa + pb);
      const tiredA = pa < (war.popA0 ?? pa) * 0.7 || A.econT > 0;
      const tiredB = pb < (war.popB0 ?? pb) * 0.7 || B.econT > 0;
      const fighting = A.armyPhase === 'siege' || B.armyPhase === 'siege' || this.world.time - (war.lastGain ?? -1e9) < 90;
      const stalemate = age > minAge * 3;
      if (age > minAge && !fighting && (tiredA || tiredB || stalemate) && rand() < 0.05) {
        // The beaten side pays: it cedes the city nearest the front.
        const loser = tiredA && !tiredB ? A : tiredB && !tiredA ? B : null;
        const winner = loser === A ? B : A;
        let ceded = '';
        if (loser && this.citiesOf(loser).length > 1) {
          const [, , city] = this.nearestCities(winner, loser);
          if (!city.isCapital) {
            ceded = city.base;
            this.transferCity(city, winner);
          }
        }
        this.makePeace(A, B, loser ? `${loser.name} kiệt quệ, phải cầu hòa${ceded ? ` và cắt ${ceded} cho ${winner.name}` : ''}` : 'sau nhiều năm giằng co bất phân thắng bại, hai bên ký hòa ước');
      }
    }
  }

  /** Trade carries customs, festivals and ideas from one people to another. */
  private influence(v: Village, from: Village) {
    const before = v.influences.get(from.culture.id) ?? 0;
    const after = Math.min(100, before + 2);
    v.influences.set(from.culture.id, after);
    if (before < 50 && after >= 50) {
      this.stats.exchanges++;
      this.chronicle(v, `🎎 Văn hóa ${from.culture.name} lan tỏa sang ${v.name}: người dân bắt đầu mở cả ${from.culture.festival} và học nghề ${from.culture.craft}.`);
    }
  }

  private declareWar(a: Village, b: Village, why: string) {
    if (a.enemies.has(b.id)) return;
    a.enemies.add(b.id);
    b.enemies.add(a.id);
    a.opinion.set(b.id, -80);
    b.opinion.set(a.id, -80);
    this.wars.push({ a: a.id, b: b.id, start: this.world.time, popA0: this.nationPop(a), popB0: this.nationPop(b) });
    this.stats.wars++;
    const text = `⚔️ ${a.ruler || a.name} của ${a.name} tuyên chiến với ${b.name} ${why}!`;
    this.chronicle(a, text);
    this.chronicle(b, `⚔️ ${b.name} bị ${a.name} tuyên chiến.`, false);
    this.toasts.push({ icon: '⚔️', title: 'Chiến tranh!', text: `${a.name} tuyên chiến với ${b.name}` });
    this.sfx.push('war');
  }

  /** Stand a nation's soldiers down once it has no wars left. */
  private demobilise(cap: Village) {
    if (cap.enemies.size) return;
    for (const h of this.humans) if (h.village >= 0 && this.villages[h.village]?.nation === cap.id) h.role = 'none';
  }

  private makePeace(a: Village, b: Village, why: string) {
    if (!a.enemies.has(b.id)) return;
    a.enemies.delete(b.id);
    b.enemies.delete(a.id);
    a.opinion.set(b.id, 10);
    b.opinion.set(a.id, 10);
    this.wars = this.wars.filter((w) => !((w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id)));
    this.stats.treaties++;
    this.demobilise(a);
    this.demobilise(b);
    this.chronicle(a, `🕊️ ${a.name} và ${b.name} ký hòa ước — ${why}.`);
    this.chronicle(b, `🕊️ ${b.name} và ${a.name} ký hòa ước.`, false);
  }

  private endWars(v: Village) {
    for (const e of [...v.enemies]) {
      const o = this.villages[e];
      if (!o) continue;
      o.enemies.delete(v.id);
      this.demobilise(o);
    }
    v.enemies.clear();
    this.wars = this.wars.filter((w) => w.a !== v.id && w.b !== v.id);
  }

  /** A whole nation (all its cities) joins another — by conquest, union, or being civilised. */
  private annex(winner: Village, loser: Village, peaceful = false, message = '') {
    winner = winner.capital;
    loser = loser.capital;
    if (winner === loser || !winner.alive || !loser.alive) return;
    this.endWars(loser);
    for (const o of this.villages) {
      o.allies.delete(loser.id);
      o.partners.delete(loser.id);
      o.pacts.delete(loser.id);
    }
    const joined = new Set(this.villages.filter((c) => c.nation === loser.id).map((c) => c.id));
    for (const c of this.villages) {
      if (!joined.has(c.id)) continue;
      c.nation = winner.id;
      this.repaints.push({ x: c.cx, y: c.cy, r: c.radius + 8, color: winner.hue });
    }
    for (const h of this.humans) if (joined.has(h.village)) h.role = 'none';
    winner.tech = Math.max(winner.tech, loser.tech);
    winner.annexed++;
    loser.absorbedBy = winner.id;
    loser.opinion.clear();
    loser.partners.clear();
    loser.allies.clear();
    loser.pacts.clear();
    for (const [c, k] of loser.influences) winner.influences.set(c, Math.max(winner.influences.get(c) ?? 0, k));
    if (winner.culture.id !== loser.culture.id) winner.influences.set(loser.culture.id, Math.max(40, winner.influences.get(loser.culture.id) ?? 0));
    const cities = this.citiesOf(winner).length;
    if (peaceful) {
      this.stats.unions++;
      const text = message || `${loser.base} tự nguyện hợp nhất vào ${winner.name}`;
      this.chronicle(winner, `🤝 ${text}. ${winner.name} giờ có ${cities} thành phố.`);
      this.chronicle(loser, `🤝 ${text}.`, false);
      this.toasts.push({ icon: '🤝', title: 'Thống nhất!', text });
    } else {
      this.stats.annexations++;
      const assim = winner.culture.id !== loser.culture.id ? ` Người ${loser.base} vẫn giữ văn hóa ${loser.culture.name}.` : '';
      this.chronicle(winner, `👑 ${winner.name} chinh phục ${loser.base}! ${winner.name} giờ có ${cities} thành phố.${assim}`);
      this.chronicle(loser, `🏳️ ${loser.base} đầu hàng, trở thành một thành phố của ${winner.name}.`, false);
      this.toasts.push({ icon: '👑', title: 'Chinh phục!', text: `${winner.name} sáp nhập ${loser.base}` });
    }
    if (this.nations().length === 1 && this.villages.filter((v) => v.alive).length >= 4) {
      this.chronicle(winner, `🌐 ${winner.name} thống nhất toàn bộ thế giới dưới một ngọn cờ!`);
      this.toasts.push({ icon: '🌐', title: 'Thế giới thống nhất', text: `${winner.name} cai trị mọi vùng đất` });
      this.stats.worldUnified = 1;
    }
  }

  // ---------- Individual humans ----------

  private kill(h: Human, cause: string) {
    if (h.dead) return;
    h.dead = true;
    if (h.village >= 0 && !cause.includes('tuổi già')) {
      const v = this.villages[h.village];
      if (v) v.trauma = Math.min(1, v.trauma + (cause.includes('đói') ? 0.006 : 0.012));
    }
    this.stats.deaths++;
    this.deaths.set(cause, (this.deaths.get(cause) ?? 0) + 1);
    if (cause === 'tử trận' && h.lastHitBy >= 0) {
      const killer = this.villages[h.lastHitBy];
      if (killer) killer.kills++;
      if (h.village >= 0) this.villages[h.village].losses++;
    }
  }

  private updateHuman(h: Human, dt: number) {
    const w = this.world;
    if (h.voyageUntil > w.time) {
      h.inside = true; // aboard ship
      return;
    }
    if (h.voyageUntil > 0) {
      h.voyageUntil = 0;
      h.inside = false;
    }
    h.age += dt;
    h.hunger = Math.min(1.2, h.hunger + dt * 0.006);
    const v = h.village >= 0 ? this.villages[h.village] : null;

    const ci = idx(Math.floor(h.x), Math.floor(h.y));
    const inWater = w.isWater(ci) && !w.isIce(ci) && !w.road[ci];
    h.inside = (h.action === 'rest' || h.action === 'retreat') && w.cover[ci] === Cover.HOUSE && !h.hasTarget;

    if (inWater) {
      h.health -= dt * 0.12;
      h.harm = 'chết đuối';
    }
    const c = w.cover[ci];
    if (c === Cover.FIRE) {
      h.health -= dt * 0.5;
      h.harm = 'chết cháy';
    } else if (c === Cover.LAVA) {
      h.health -= dt * 2;
      h.harm = 'bị dung nham thiêu';
    }
    const byFire = v !== null && Math.hypot(h.x - v.cx - 0.5, h.y - v.cy - 0.5) < 2.5;
    if (h.inside || byFire) {
      h.warmth = Math.min(1, h.warmth + dt * (h.inside ? 0.15 : 0.08));
      if (h.inside) h.health = Math.min(1, h.health + dt * 0.01);
    } else {
      const temp = w.localTemp(ci);
      const hardy = (v ? ERAS[v.era].cold * v.culture.traits.cold : 1) || 1;
      let loss = 0;
      if (temp < 6) loss += (6 - temp) * 0.0015 * hardy;
      if (w.rainingAt(ci)) loss += 0.01 * hardy;
      if (inWater) loss += 0.05;
      h.warmth = loss > 0 ? Math.max(0, h.warmth - loss * dt) : Math.min(1, h.warmth + dt * 0.05);
    }
    if (h.warmth < 0.15) {
      h.health -= dt * 0.03;
      h.harm = 'chết rét';
    }
    // From the industrial age on, imports and relief keep people from starving — unless the city is besieged.
    if (v && v.era >= 4 && v.siegeT === 0) h.hunger = Math.min(h.hunger, 0.9);
    if (h.hunger >= 1) {
      h.health -= dt * 0.02;
      h.harm = 'chết đói';
    }
    if (h.hunger < 0.6 && h.warmth > 0.4 && !inWater && h.action !== 'fight') h.health = Math.min(1, h.health + dt * 0.02);

    if (h.health <= 0) return this.kill(h, h.harm || 'chết');
    if (h.age > h.maxAge) return this.kill(h, 'qua đời vì tuổi già');

    h.think -= dt;
    const panicking = h.action === 'flee' || h.action === 'swim';
    const danger = !panicking && (inWater || (w.fireCount > 0 && this.dangerNear(h, 3)));
    if (h.think <= 0 || danger) {
      h.think = 0.6 + rand() * 0.4;
      this.decide(h);
    }
    this.act(h, dt);
  }

  private dangerNear(h: Human, r: number) {
    return this.world.findNearest(h.x, h.y, r, (j) => this.world.isDanger(j)) >= 0;
  }

  /** True if no one else is already on their way to work cell i. */
  private free(i: number, h: Human) {
    const o = this.claims.get(i);
    return !o || o === h || o.dead || o.targetIdx !== i || !o.hasTarget;
  }

  private go(h: Human, action: Action, target: number, thought: string) {
    if (target < 0) return false;
    if (target === h.avoid && this.world.time < h.avoidUntil) return false;
    if (CLAIMED.has(action)) this.claims.set(target, h);
    if (action !== h.action || target !== h.targetIdx) {
      h.work = 0;
      h.stuck = 0;
      h.lastDist = Infinity;
    }
    h.action = action;
    h.targetIdx = target;
    h.tx = cx(target) + 0.5;
    h.ty = cy(target) + 0.5;
    h.hasTarget = true;
    h.thought = thought;
    return true;
  }

  private chase(h: Human, action: 'fight' | 'hunt', x: number, y: number, thought: string) {
    if (h.action !== action) {
      h.stuck = 0;
      h.lastDist = Infinity;
    }
    h.action = action;
    h.targetIdx = idx(clampX(x), clampY(y));
    h.tx = x;
    h.ty = y;
    h.hasTarget = true;
    h.thought = thought;
    return true;
  }

  private stay(h: Human, action: Action, thought: string) {
    h.action = action;
    h.hasTarget = false;
    h.thought = thought;
  }

  /** Priority-ordered reasoning: survive, defend, shelter, eat, then work for the village. */
  private decide(h: Human) {
    const w = this.world;
    let v = h.village >= 0 ? this.villages[h.village] : null;
    if (v && !v.alive) {
      h.village = v.absorbedBy;
      v = h.village >= 0 ? this.villages[h.village] : null;
      if (v && !v.alive) {
        h.village = -1;
        v = null;
      }
    }
    if (!v) h.role = 'none';
    const x = Math.floor(h.x);
    const y = Math.floor(h.y);
    const ci = idx(x, y);
    const storm = w.weatherAt(ci) === 'storm';
    const adult = h.age >= ADULT;

    // 1. Drowning → swim to the nearest dry land.
    if (w.isWater(ci) && !w.isIce(ci)) {
      const land = w.findNearest(x, y, 25, (j) => w.canWalk(j) && w.height[j] > w.seaLevel + 0.01);
      if (this.go(h, 'swim', land, 'Cứu với! Nước ngập rồi!')) return;
    }

    // 2. Fire or lava nearby → run directly away.
    if (w.fireCount > 0) {
      const fire = w.findNearest(x, y, 4, (j) => w.isDanger(j));
      if (fire >= 0) {
        const dx = h.x - cx(fire) - 0.5;
        const dy = h.y - cy(fire) - 0.5;
        const d = Math.hypot(dx, dy) || 1;
        const safe = w.findNearest(clampX(h.x + (dx / d) * 10), clampY(h.y + (dy / d) * 10), 6, (j) =>
          w.canWalk(j) && w.cover[j] !== Cover.FOREST,
        );
        const what = w.cover[fire] === Cover.LAVA ? 'Dung nham! Chạy mau!' : 'Cháy! Chạy mau!';
        if (this.go(h, 'flee', safe, what)) return;
      }
    }

    // 3. Water rising and we're on low ground → climb.
    if ((storm || w.seaLevel > BASE_SEA + 0.015) && w.height[ci] < w.seaLevel + 0.025) {
      const high = w.findNearest(x, y, 20, (j) => w.canWalk(j) && w.height[j] > w.seaLevel + 0.07);
      if (this.go(h, 'flee', high, 'Nước đang dâng, lên chỗ cao thôi!')) return;
    }

    // 4. War: soldiers fight, villagers defend their homes.
    if (v && v.enemies.size) {
      if (h.role === 'soldier' && this.soldierDuty(h, v)) return;
      const invader = this.humanGrid.nearest(h.x, h.y, 7, (o) => o.village >= 0 && v!.hostileTo(o.village) && !o.inside);
      if (invader) {
        if (adult && h.health > 0.5) {
          h.foe = invader;
          if (this.chase(h, 'fight', invader.x, invader.y, 'Giặc tới! Cầm vũ khí giữ làng!')) return;
        }
        const home = this.nearestHouse(h, v);
        if (this.go(h, 'rest', home, 'Giặc tới! Trốn vào nhà!')) return;
      }
    }

    // 5. Wolves: adults drive them off, children hide.
    const wolf = this.animals.grid.nearest(h.x, h.y, 5, (a) => a.kind === 'wolf');
    if (wolf) {
      if (adult && h.health > 0.4) {
        h.prey = wolf;
        if (this.chase(h, 'hunt', wolf.x, wolf.y, 'Sói! Đuổi nó đi!')) return;
      }
      const home = this.nearestHouse(h, v);
      if (this.go(h, 'rest', home, 'Có sói! Trốn vào nhà!')) return;
    }

    // 6. Shelter from storm, cold, rain and night.
    const night = w.daylight() < 0.3;
    const cold = w.localTemp(ci) < 2;
    const needShelter = storm || night || (cold && h.warmth < 0.8) || (w.rainingAt(ci) && h.warmth < 0.6);
    if (needShelter && h.hunger < 0.85) {
      const home = this.nearestHouse(h, v);
      if (home >= 0) {
        const why = storm ? 'Bão to quá, trốn trong nhà' : cold ? 'Lạnh quá, vào nhà sưởi ấm' : night ? 'Tối rồi, về nhà ngủ' : 'Mưa rồi, về nhà thôi';
        if (this.go(h, 'rest', home, why)) return;
      }
      if (v && v.wood >= ERAS[v.era].houseWood && !storm) {
        if (this.go(h, 'build', this.pickJob(v.jobs.houseSites, h, (j) => this.validHouseSite(j, v!), true), 'Không có chỗ trú, phải dựng nhà ngay!')) return;
      }
      if (v && cold && !storm) {
        if (this.go(h, 'rest', idx(v.cx, v.cy), 'Chưa có nhà, ra sưởi bên đống lửa của làng')) return;
      }
      if (storm) {
        if (v?.stormWary && w.findNearest(x, y, 1, (j) => w.cover[j] === Cover.FOREST) >= 0) {
          const open = w.findNearest(x, y, 8, (j) => w.canWalk(j) && w.cover[j] === Cover.NONE);
          if (this.go(h, 'flee', open, 'Bão có sét, phải tránh xa cây cao!')) return;
        }
        return this.stay(h, 'huddle', 'Không có nhà... co ro chờ bão tan');
      }
      if (night) return this.stay(h, 'huddle', 'Ngủ tạm ngoài trời');
    }

    // 7. Festival / worship at the village centre.
    if (v && v.praying > 0 && h.hunger < 0.7) {
      const a = (h.id * 2.4) % (Math.PI * 2);
      const ring = 2.5 + (h.id % 5) * 0.9; // concentric rings around the shrine
      const spot = w.findNearest(v.cx + Math.cos(a) * ring, v.cy + Math.sin(a) * ring, 2, (j) => w.canWalk(j));
      const deity = v.patron >= 0 ? this.godNames[v.patron] : v.culture.deity;
      if (this.go(h, 'pray', spot, `Cầu khấn ${deity} trong ${v.culture.festival}`)) return;
    }

    // 8. Hunger.
    if (h.hunger > 0.55) {
      if (h.carryFood > 0) {
        h.carryFood--;
        h.hunger = Math.max(0, h.hunger - 0.5);
        return this.stay(h, 'idle', 'Ăn chỗ đồ ăn mang theo');
      }
      if (v && v.food >= 1) {
        if (this.go(h, 'eat', idx(v.cx, v.cy), 'Đói rồi, về kho làng ăn')) return;
      }
      const food = v
        ? this.pickJob([...v.jobs.ripe, ...v.jobs.fish, ...v.jobs.trees], h, (j) => this.foodAt(j) !== null)
        : w.findNearest(x, y, 20, (j) => this.foodAt(j) !== null && this.free(j, h));
      if (food >= 0 && this.go(h, 'harvest', food, FOOD_THOUGHT[this.foodAt(food)!])) return;
      if (v) {
        this.say(`🍂 ${v.name} cạn lương thực, có người bỏ làng ra đi.`, `starve${v.id}`, 60);
        h.origin = v.name;
        h.village = -1;
        h.role = 'none';
      }
      return this.migrate(h, 'Đói... phải đi xa tìm vùng đất màu mỡ');
    }

    // 9. Bring gathered goods home.
    if (v && (h.carryFood > 0 || h.carryWood > 0)) {
      if (this.go(h, 'deliver', idx(v.cx, v.cy), 'Mang đồ về kho làng')) return;
    }

    if (v) return this.work(h, v);
    return this.nomad(h);
  }

  private soldierDuty(h: Human, v: Village) {
    if (h.health < 0.35) {
      const home = this.nearestHouse(h, v);
      return this.go(h, 'retreat', home >= 0 ? home : idx(v.cx, v.cy), 'Bị thương nặng, rút về làng');
    }
    const u = UNITS[h.unit];
    const reach = (u.range || ERAS[v.era].range) + 6;
    const foe = this.humanGrid.nearest(h.x, h.y, reach, (o) => o.village >= 0 && v.hostileTo(o.village) && !o.inside);
    if (foe) {
      h.foe = foe;
      return this.chase(h, 'fight', foe.x, foe.y, `${u.name} xông lên! Đánh tan quân ${this.villages[foe.village].base}!`);
    }
    const cap = v.capital;
    const target = this.villages[cap.armyTarget];
    if (!target?.alive || cap.armyPhase === 'none') return false;
    const w = this.world;
    // A quarter of every city's soldiers stay home as its garrison; so do those the sea cuts off from the army.
    if (this.isGarrison(h, cap)) {
      if (Math.hypot(h.x - v.cx, h.y - v.cy) > v.radius * 0.8) return this.go(h, 'march', idx(v.cx, v.cy), `Đồn trú giữ ${v.base}`);
      return false;
    }
    if (cap.armyPhase === 'siege' && Math.hypot(target.cx - h.x, target.cy - h.y) < 7) {
      let house = -1;
      let hd = Infinity;
      for (const i of target.houses) {
        const d = Math.hypot(cx(i) - h.x, cy(i) - h.y);
        if (d < hd) {
          hd = d;
          house = i;
        }
      }
      if (house >= 0) return this.go(h, 'raid', house, v.era >= 3 ? `Chiếm lấy nhà của ${target.base}!` : `Đốt trụi làng ${target.base}!`);
    }
    // Hold my place in the formation: rows of eight behind the army's front, facing the enemy.
    let dx = target.cx - cap.armyX;
    let dy = target.cy - cap.armyY;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const k = h.slot % 64;
    const row = Math.floor(k / 8);
    const col = (k % 8) - 3.5;
    const sx = cap.armyX - dx * row * 1.4 - dy * col * 1.3;
    const sy = cap.armyY - dy * row * 1.4 + dx * col * 1.3;
    const spot = w.findNearest(clampX(sx), clampY(sy), 3, (j) => w.canWalk(j));
    const what = cap.armyPhase === 'rally' ? `Tập hợp quân ở ${this.villages[h.village].base}` : `Hành quân tới ${target.name}`;
    return this.go(h, 'march', spot, `${u.name}: ${what}, vì ${cap.base}!`);
  }

  /** Soldiers who guard their own city rather than join the field army. */
  private isGarrison(h: Human, cap: Village) {
    return h.id % 4 === 0 || this.seaBetween(h.x, h.y, cap.armyX, cap.armyY);
  }

  /** A nation's army: rally at the city nearest the enemy, march as one block, besiege. */
  /**
   * Generals weigh every enemy city: how far it is from our own, how cut off it is from the rest of
   * its nation, and how well defended. A lone outpost far from home is a tempting prize.
   * Returns [distance, our staging city, target, chosen for being isolated].
   */
  /** True if the straight way from (x1,y1) to (x2,y2) crosses open sea (bridges and ice count as land). */
  seaBetween(x1: number, y1: number, x2: number, y2: number) {
    const w = this.world;
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    let wet = 0;
    for (let k = 0; k <= n; k++) {
      const x = Math.floor(x1 + ((x2 - x1) * k) / (n || 1));
      const y = Math.floor(y1 + ((y2 - y1) * k) / (n || 1));
      const i = idx(x, y);
      if (w.isWater(i) && !w.canWalk(i)) {
        if (++wet > 14) return true; // rivers and lakes can be crossed; open sea cannot
      } else wet = 0;
    }
    return false;
  }

  private pickTarget(cap: Village): [number, Village, Village, boolean] | null {
    const ours = this.citiesOf(cap);
    if (!ours.length) return null;
    let best: [number, Village, Village, boolean] | null = null;
    let bestScore = Infinity;
    let nearestD = Infinity;
    for (const c of this.villages) {
      if (!c.alive || !cap.enemies.has(c.nation)) continue;
      let from = ours[0];
      let d = Infinity;
      for (const o of ours) {
        const k = Math.hypot(o.cx - c.cx, o.cy - c.cy);
        if (k < d) {
          d = k;
          from = o;
        }
      }
      // How far is help? The distance to the nearest other city of its nation.
      let help = 200;
      for (const o of this.villages) if (o.alive && o !== c && o.nation === c.nation) help = Math.min(help, Math.hypot(o.cx - c.cx, o.cy - c.cy));
      let guards = 0;
      this.humanGrid.each(c.cx, c.cy, c.radius + 6, (h) => {
        if (h.role === 'soldier' && h.village >= 0 && this.villages[h.village]?.nation === c.nation) guards++;
      });
      // An army marches on land: a city across the sea is for the navy, not the infantry.
      const overseas = this.seaBetween(from.cx, from.cy, c.cx, c.cy);
      const score = d - Math.min(help, 200) * 0.7 + guards * 4 + c.pop * 0.3 - (c.isCapital ? 15 : 0) + (overseas ? 400 : 0);
      nearestD = Math.min(nearestD, d);
      if (score < bestScore) {
        bestScore = score;
        best = [d, from, c, false];
      }
    }
    if (best && !best[2].isCapital && best[0] > nearestD + 10) best[3] = true;
    return best;
  }

  private armyTick(cap: Village, dt: number) {
    if (!cap.enemies.size) {
      cap.armyPhase = 'none';
      cap.armyTarget = -1;
      return;
    }
    // Now and then the generals reconsider, unless already laying siege.
    if (cap.armyTarget >= 0 && cap.armyPhase !== 'siege' && rand() < dt / 25) {
      const again = this.pickTarget(cap);
      if (again && again[2].id !== cap.armyTarget) cap.armyTarget = -1;
    }
    let target = this.villages[cap.armyTarget];
    if (!target?.alive || !cap.hostileTo(target.id)) {
      const best = this.pickTarget(cap);
      if (!best) return;
      target = best[2];
      if (best[3]) this.chronicle(cap, `🎯 Tướng lĩnh ${cap.name} nhận ra ${target.base} đứng trơ trọi, xa ${target.capital.name} — quyết đánh vào đó.`, false);
      cap.armyTarget = target.id;
      if (cap.armyPhase === 'none') {
        cap.armyPhase = 'rally';
        cap.armyX = best[1].cx;
        cap.armyY = best[1].cy;
        cap.armyT = 0;
      } else cap.armyPhase = 'march';
    }
    const d = Math.hypot(target.cx - cap.armyX, target.cy - cap.armyY);
    if (cap.armyPhase === 'rally') {
      // The whole field army gathers from every city that can reach the muster; the generals march
      // only once most have arrived and they outnumber the defenders (or have waited long enough).
      cap.armyT += dt;
      let total = 0;
      let near = 0;
      const towns = new Set<number>();
      for (const h of this.humans) {
        if (h.role !== 'soldier' || h.village < 0 || this.villages[h.village].nation !== cap.id || h.voyageUntil > this.world.time || this.isGarrison(h, cap)) continue;
        total++;
        if (Math.hypot(h.x - cap.armyX, h.y - cap.armyY) < 10) {
          near++;
          towns.add(h.village);
        }
      }
      let guards = 0;
      this.humanGrid.each(target.cx, target.cy, target.radius + 6, (o) => {
        if (o.role === 'soldier' && o.village >= 0 && this.villages[o.village]?.nation === target.nation) guards++;
      });
      const ready = total >= 4 && near >= total * 0.75 && near >= guards * 1.2;
      if (ready || cap.armyT > 100 || (cap.armyT > 50 && near >= total * 0.6 && near >= guards * 1.5)) {
        cap.armyPhase = 'march';
        this.chronicle(cap, `🚩 ${near} binh sĩ từ ${towns.size} thành của ${cap.name} tập hợp xong, lên đường tiến đánh ${target.name}${guards ? ` (quân giữ thành: ${guards})` : ''}.`, false);
      }
    } else if (cap.armyPhase === 'march' && cap.armyPathFor !== target.id) {
      // Plan the march: a road on land if there is one, else the army must go by sea.
      const route = this.landRoute(cap.armyX, cap.armyY, target.cx, target.cy);
      cap.armyPath = route ?? [];
      cap.armyPathFor = route ? target.id : -2 - target.id;
    } else if (cap.armyPhase === 'march' && cap.armyPathFor === -2 - target.id) {
      // The sea stands between the army and its goal: the whole field army boards a convoy and
      // lands on the far shore; until the ships are ready the warships keep up the pressure.
      cap.navyCd = Math.min(cap.navyCd, 3);
      if (cap.era >= 1 && cap.navyCd <= 3) {
        this.invade(cap, target);
        cap.armyPathFor = -1; // replan from the beachhead
      }
    } else if (cap.armyPhase === 'march') {
      // The banner advances along the planned route at a pace the whole column can follow.
      const tx = cap.armyPath.length ? cap.armyPath[0] : target.cx;
      const ty = cap.armyPath.length ? cap.armyPath[1] : target.cy;
      const dw = Math.hypot(tx - cap.armyX, ty - cap.armyY);
      const step = Math.min(dw, 1.4 * dt);
      cap.armyX += ((tx - cap.armyX) / (dw || 1)) * step;
      cap.armyY += ((ty - cap.armyY) / (dw || 1)) * step;
      if (cap.armyPath.length && dw < 1.5) cap.armyPath.splice(0, 2);
      if (d < 5) cap.armyPhase = 'siege';
    }

    // Industrial nations send biplanes, modern ones jet bombers — and, in desperation, the bomb.
    if (cap.era >= 4) {
      cap.airCd -= dt;
      if (cap.airCd <= 0) {
        cap.airCd = cap.era === 4 ? 50 + rand() * 40 : 25 + rand() * 25;
        const enemyPop = [...cap.enemies].reduce((n, e) => n + (this.villages[e]?.alive ? this.nationPop(this.villages[e]) : 0), 0);
        const losing = this.nationPop(cap) < enemyPop * 0.8;
        const nuke = cap.era >= 5 && losing && this.stats.nukes < 4 && rand() < 0.25;
        const from = this.citiesOf(cap).sort((a, b) => Math.hypot(a.cx - target!.cx, a.cy - target!.cy) - Math.hypot(b.cx - target!.cx, b.cy - target!.cy))[0] ?? cap;
        const dist = Math.hypot(target.cx - from.cx, target.cy - from.cy);
        const id = this.airId++;
        const now = this.world.time;
        if (nuke) {
          // The bomb comes by intercontinental missile: fast, from any distance, and unstoppable.
          this.airstrikes.push({ id, x1: cap.cx, y1: cap.cy, x2: target.cx, y2: target.cy, start: now, end: now + 5 + dist / 90, nuke, from: cap.id, color: cap.color, era: cap.era, missile: true });
          this.chronicle(cap, `🚀☢️ ${cap.name} tuyệt vọng, phóng tên lửa xuyên lục địa mang đầu đạn hạt nhân về phía ${target.name}!`);
          this.sfx.push('war');
        } else {
          const end = now + 3 + dist / (cap.era === 4 ? 18 : 30);
          // Modern powers strike far targets with cruise missiles as well as bombers.
          const cruise = cap.era >= 5 && (dist > 120 || rand() < 0.35);
          if (cruise) {
            this.airstrikes.push({ id, x1: from.cx, y1: from.cy, x2: target.cx + (rand() - 0.5) * 6, y2: target.cy + (rand() - 0.5) * 6, start: now, end: now + 3 + dist / 70, nuke: false, from: from.id, color: cap.color, era: cap.era, missile: true });
          } else this.airstrikes.push({ id, x1: from.cx, y1: from.cy, x2: target.cx, y2: target.cy, start: now, end, nuke, from: from.id, color: cap.color, era: cap.era });
          // A modern defender with an airfield scrambles fighters to meet the bombers halfway.
          const def = target.capital;
          if (def.era >= 5 && this.nationHas(def, 'airport') && rand() < 0.55) {
            const meet = 0.6;
            const mx = from.cx + (target.cx - from.cx) * meet;
            const my = from.cy + (target.cy - from.cy) * meet;
            const t = now + (end - now) * meet;
            this.airstrikes.push({ id: this.airId++, x1: target.cx, y1: target.cy, x2: mx, y2: my, start: now + Math.max(0, (t - now) * 0.3), end: t, nuke: false, from: target.id, color: def.color, era: def.era, hunt: id });
          }
        }
      }
    }

    // From the bronze age on, coastal nations take the war to sea.
    if (cap.era >= 1) {
      cap.navyCd -= dt;
      if (cap.navyCd <= 0) {
        cap.navyCd = 40 + rand() * 50;
        this.launchFleet(cap, target);
      }
    }
  }

  /**
   * A land route between two points, found on a coarse grid of 4×4-cell blocks (bridges and ice
   * count as land). Returns waypoints [x, y, x, y…] in cells, or null if only the sea leads there.
   */
  landRoute(x1: number, y1: number, x2: number, y2: number): number[] | null {
    const w = this.world;
    const B = 4;
    const BW = Math.ceil(W / B);
    const BH = Math.ceil(H / B);
    const walk = (bx: number, by: number) => {
      for (const [ox, oy] of [[2, 2], [0, 0], [3, 0], [0, 3], [3, 3]]) {
        const x = bx * B + ox;
        const y = by * B + oy;
        if (x < W && y < H && w.canWalk(idx(x, y))) return true;
      }
      return false;
    };
    const start = Math.floor(clampY(y1) / B) * BW + Math.floor(clampX(x1) / B);
    const goal = Math.floor(clampY(y2) / B) * BW + Math.floor(clampX(x2) / B);
    const prev = new Int32Array(BW * BH).fill(-1);
    prev[start] = start;
    const queue = new Int32Array(BW * BH);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let found = false;
    while (head < tail) {
      const b = queue[head++];
      if (b === goal) {
        found = true;
        break;
      }
      const bx = b % BW;
      const by = (b / BW) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = bx + dx;
          const ny = by + dy;
          if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
          const n = ny * BW + nx;
          if (prev[n] >= 0 || (n !== goal && !walk(nx, ny))) continue;
          prev[n] = b;
          queue[tail++] = n;
        }
      }
    }
    if (!found) return null;
    const blocks: number[] = [];
    for (let b = goal; b !== start; b = prev[b]) blocks.push(b);
    blocks.reverse();
    const out: number[] = [];
    for (let k = 2; k < blocks.length; k += 3) out.push((blocks[k] % BW) * B + 2, ((blocks[k] / BW) | 0) * B + 2);
    out.push(x2, y2);
    return out;
  }

  /** Embark the field army at the muster and land it on the coast nearest the target. */
  private invade(cap: Village, target: Village) {
    const w = this.world;
    const sea = (j: number) => w.isWater(j) && !w.isIce(j);
    const port = w.findNearest(cap.armyX, cap.armyY, 25, sea);
    const dest = w.findNearest(target.cx, target.cy, target.radius + 14, sea);
    if (port < 0 || dest < 0) return;
    const beach = w.findNearest(cx(dest), cy(dest), 8, (j) => w.canWalk(j) && !w.isWater(j));
    if (beach < 0) return;
    const troops = this.humans.filter(
      (h) => !h.dead && h.role === 'soldier' && h.voyageUntil <= w.time && h.village >= 0 && this.villages[h.village]?.nation === cap.id && h.id % 4 !== 0 && Math.hypot(h.x - cap.armyX, h.y - cap.armyY) < 14,
    );
    if (troops.length < 4) return;
    const dist = Math.hypot(cx(port) - cx(dest), cy(port) - cy(dest));
    const speed = cap.era <= 2 ? 6 : cap.era <= 3 ? 8 : 12;
    const end = w.time + 4 + dist / speed;
    const n = Math.min(60, troops.length);
    for (let k = 0; k < n; k++) {
      const h = troops[k];
      h.x = cx(beach) + 0.5 + (rand() - 0.5) * 4;
      h.y = cy(beach) + 0.5 + (rand() - 0.5) * 4;
      h.voyageUntil = end;
      h.hasTarget = false;
    }
    const carrier = cap.era >= 5;
    this.fleets.push({ x1: cx(port) + 0.5, y1: cy(port) + 0.5, x2: cx(dest) + 0.5, y2: cy(dest) + 0.5, start: w.time, end, era: cap.era, color: cap.color, from: cap.id, target: target.id, carrier, troops: n });
    // The army's banner goes ashore with them.
    cap.armyX = cx(beach) + 0.5;
    cap.armyY = cy(beach) + 0.5;
    cap.armyPhase = 'rally';
    cap.armyT = 0;
    const ships = cap.era <= 2 ? 'thuyền chiến' : cap.era === 3 ? 'chiến thuyền' : cap.era === 4 ? 'tàu vận tải' : 'tàu đổ bộ và tàu sân bay';
    this.chronicle(cap, `⛵ ${n} binh sĩ ${cap.name} lên ${ships} vượt biển, đổ bộ đánh ${target.name}!`);
    this.toasts.push({ icon: '⛵', title: 'Đổ bộ!', text: `${cap.name} → ${target.base} (${n} quân)` });
  }

  /** Sends a war fleet from our nearest port toward the coast by the target. */
  private launchFleet(cap: Village, target: Village) {
    const w = this.world;
    const sea = (j: number) => w.isWater(j) && !w.isIce(j);
    const dest = w.findNearest(target.cx, target.cy, target.radius + 10, sea);
    if (dest < 0) return;
    const ours = this.citiesOf(cap).sort((a, b) => Math.hypot(a.cx - target.cx, a.cy - target.cy) - Math.hypot(b.cx - target.cx, b.cy - target.cy));
    for (const from of ours) {
      const port = w.findNearest(from.cx, from.cy, from.radius + 6, sea);
      if (port < 0) continue;
      const dist = Math.hypot(cx(port) - cx(dest), cy(port) - cy(dest));
      if (dist < 15) return;
      const carrier = cap.era >= 5 && rand() < 0.45;
      const speed = cap.era <= 2 ? 6 : cap.era <= 3 ? 8 : 12;
      this.fleets.push({ x1: cx(port) + 0.5, y1: cy(port) + 0.5, x2: cx(dest) + 0.5, y2: cy(dest) + 0.5, start: w.time, end: w.time + 4 + dist / speed, era: cap.era, color: cap.color, from: from.id, target: target.id, carrier });
      const what = carrier ? 'Tàu sân bay' : cap.era <= 2 ? 'Thuyền chiến chở quân' : cap.era === 3 ? 'Chiến thuyền buồm' : cap.era === 4 ? 'Thiết giáp hạm' : cap.era === 5 ? 'Khu trục hạm' : 'Chiến hạm không gian';
      if (this.once(`navy${cap.id}`, 90)) this.chronicle(cap, `⚓ ${what} của ${cap.name} rời cảng ${from.base}, nhắm tới ${target.name}.`, false);
      return;
    }
  }

  /** Fleets that reach the enemy coast land troops, shell the shore, or launch aircraft. */
  private fleetTick() {
    const w = this.world;
    for (const f of [...this.fleets]) {
      if (f.end > w.time) continue;
      this.fleets = this.fleets.filter((x) => x !== f);
      const home = this.villages[f.from];
      const target = this.villages[f.target];
      if (!home?.alive || !target?.alive || !home.hostileTo(target.id)) continue;
      {
        // Troops wade ashore near the city (a carrier brings a whole regiment).
        const beach = w.findNearest(f.x2, f.y2, 8, (j) => w.canWalk(j) && !w.isWater(j));
        if (beach < 0) continue;
        let n = 0;
        const cargo = f.carrier ? 12 : f.era >= 3 ? 5 : 6;
        for (const h of this.humans) {
          if (n >= cargo) break;
          if (h.role !== 'soldier' || h.village < 0 || this.villages[h.village]?.nation !== home.nation) continue;
          if (Math.hypot(h.x - target.cx, h.y - target.cy) < target.radius + 10) continue; // already at the front
          h.x = cx(beach) + 0.5 + (rand() - 0.5) * 2;
          h.y = cy(beach) + 0.5 + (rand() - 0.5) * 2;
          h.hasTarget = false;
          n++;
        }
        if (n && this.once(`landing${home.nation}`, 60)) this.chronicle(home.capital, `⚓ ${n} binh sĩ ${home.capital.name} đổ bộ lên bờ biển gần ${target.base}.`, false);
      }
      if (f.era >= 3) {
        // Broadsides, then naval guns: shells land in and around the city.
        const shots = f.era === 3 ? 2 : 3;
        for (let k = 0; k < shots; k++) this.bombAt(target.cx + (rand() - 0.5) * target.radius, target.cy + (rand() - 0.5) * target.radius, f.era >= 5 ? 3 : 2, f.from);
        if (f.carrier) {
          for (let k = 0; k < 2; k++) {
            this.airstrikes.push({ x1: f.x2, y1: f.y2, x2: target.cx + (rand() - 0.5) * 6, y2: target.cy + (rand() - 0.5) * 6, start: w.time + k, end: w.time + k + 3, nuke: false, from: f.from, color: f.color, era: f.era });
          }
        }
      }
    }
  }

  /** Bombers that have reached their target drop their load. */
  private airTick() {
    this.fleetTick();
    const now = this.world.time;
    for (const a of [...this.airstrikes]) {
      if (a.end > now) continue;
      this.airstrikes = this.airstrikes.filter((x) => x !== a);
      if (a.hunt !== undefined) {
        // Dogfight: the fighters usually bring the bomber down.
        const prey = this.airstrikes.find((x) => x.id === a.hunt);
        if (prey && rand() < 0.65) {
          this.airstrikes = this.airstrikes.filter((x) => x !== prey);
          this.impacts.push({ x: a.x2, y: a.y2, r: 2, kind: 'bomb', t: 0.6 });
          const def = this.villages[a.from]?.capital;
          if (def && this.once(`dogfight${def.id}`, 40)) this.chronicle(def, `✈️ Tiêm kích ${def.name} bắn hạ máy bay ném bom địch trên bầu trời.`, false);
        }
        continue;
      }
      if (a.nuke) this.nukeAt(a);
      else this.bombAt(a.x2 + rand() * 4 - 2, a.y2 + rand() * 4 - 2, a.missile ? 4 : 3, a.from);
    }
  }

  private bombAt(x: number, y: number, r: number, from: number) {
    const w = this.world;
    this.humanGrid.each(x, y, r, (h) => {
      h.health -= 0.8;
      h.harm = 'tử trận dưới bom';
      h.lastHitBy = from;
    });
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > r * r) continue;
        const i = idx(xx, yy);
        if (w.canBurn(i) && rand() < 0.6) w.ignite(i);
      }
    }
    for (const v of this.villages) if (v.alive && Math.hypot(v.cx - x, v.cy - y) < v.radius) v.trauma = Math.min(1, v.trauma + 0.08);
    this.impacts.push({ x, y, r, kind: 'bomb', t: 0.8 });
  }

  private nukeAt(a: Airstrike) {
    const w = this.world;
    const R = 14;
    const x = a.x2;
    const y = a.y2;
    this.humanGrid.each(x, y, R, (h) => this.kill(h, 'chết trong vụ nổ hạt nhân'));
    for (const an of this.animals.list) if (Math.hypot(an.x - x, an.y - y) < R) an.dead = true;
    for (let dy = -R - 4; dy <= R + 4; dy++) {
      for (let dx = -R - 4; dx <= R + 4; dx++) {
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);
        const i = idx(xx, yy);
        if (d < R && !w.isWater(i)) w.scorch(i);
        else if (d < R + 4 && w.canBurn(i)) w.ignite(i);
      }
    }
    const attacker = this.villages[a.from]?.capital;
    for (const v of this.villages) {
      if (!v.alive) continue;
      const d = Math.hypot(v.cx - x, v.cy - y);
      if (d < R + 8) {
        v.trauma = 1;
        v.capital.tech *= 0.9;
      }
      // The whole world recoils from the one who did it.
      if (attacker && v.isCapital && v !== attacker) v.opinion.set(attacker.id, -100);
    }
    this.stats.nukes++;
    this.impacts.push({ x, y, r: R, kind: 'nuke', t: 6 });
    this.shake = 2;
    if (attacker) this.chronicle(attacker, `☢️ Bom nguyên tử nổ! Cả một vùng đất bị xóa sổ. Thế giới kinh hoàng trước ${attacker.name}.`);
    this.toasts.push({ icon: '☢️', title: 'Bom nguyên tử!', text: 'Cả một thành phố biến mất trong biển lửa.' });
  }

  private work(h: Human, v: Village) {
    const w = this.world;
    const era = ERAS[v.era];

    if (v.jobs.firebreak.length) {
      const tree = this.pickJob(v.jobs.firebreak, h, (j) => w.cover[j] === Cover.FOREST);
      if (this.go(h, 'chop', tree, 'Phát quang cây sát nhà để phòng cháy')) return;
    }

    const needFood = v.food < v.pop * v.foodPerPerson;
    const needHouse = v.cap < v.pop + 2;
    const foodFirst = needFood && (!needHouse || h.id % 2 === 0);

    if (foodFirst) {
      const ripe = this.pickJob(v.jobs.ripe, h, (j) => w.cover[j] === Cover.FARM && w.timer[j] >= 0.8);
      if (this.go(h, 'harvest', ripe, 'Lúa chín rồi, gặt mang về kho')) return;
      if (v.farms.size < Math.ceil(v.pop * 0.6) && w.localTemp(idx(v.cx, v.cy)) > 0) {
        const site = this.pickJob(v.jobs.farmSites, h, (j) => w.cover[j] === Cover.NONE && !w.isWater(j), true);
        const msg = v.winters > 0 ? 'Khai hoang thêm ruộng để trữ cho mùa đông' : 'Khai hoang ruộng mới';
        if (this.go(h, 'farm', site, msg)) return;
      }
      if (h.age >= ADULT) {
        const deer = this.animals.grid.nearest(h.x, h.y, 14, (a) => a.kind === 'deer');
        if (deer) {
          h.prey = deer;
          if (this.chase(h, 'hunt', deer.x, deer.y, `Đi săn hươu bằng ${era.weapon}`)) return;
        }
      }
      const wild = this.pickJob([...v.jobs.fish, ...v.jobs.trees], h, (j) => this.foodAt(j) !== null);
      if (wild >= 0 && this.go(h, 'harvest', wild, FOOD_THOUGHT[this.foodAt(wild)!] + ' cho làng')) return;
    }

    // After a disaster, two in three builders go back to raise the ruined homes.
    if (v.ruins.length && v.wood >= era.houseWood && h.id % 3 !== 0 && h.age >= ADULT) {
      const site = this.pickJob(v.ruins, h, (j) => this.validHouseSite(j, v), true);
      if (site >= 0 && this.go(h, 'build', site, 'Dựng lại căn nhà bị tàn phá')) return;
    }

    if (needHouse) {
      if (v.wood >= era.houseWood) {
        const site = this.pickJob(v.jobs.houseSites, h, (j) => this.validHouseSite(j, v), true);
        const msg = v.floods > 0 ? 'Dựng nhà mới — chọn chỗ cao cho khỏi lũ' : 'Dựng nhà mới cho làng';
        if (this.go(h, 'build', site, msg)) return;
      }
      const tree = this.pickJob(v.jobs.trees, h, (j) => w.cover[j] === Cover.FOREST);
      if (this.go(h, 'chop', tree, 'Đi đốn gỗ làm nhà')) return;
    }

    const civic = needHouse ? null : this.missingSpecial(v);
    if (civic && v.wood >= era.houseWood * 2) {
      if (this.go(h, 'build', this.civicSite(v, h, civic), `Xây ${SPECIAL_LABEL[civic]} cho ${v.base}`)) return;
    }

    if (v.wood < 8 + v.era * 2) {
      const tree = this.pickJob(v.jobs.trees, h, (j) => w.cover[j] === Cover.FOREST);
      if (this.go(h, 'chop', tree, 'Kiếm thêm gỗ dự trữ')) return;
    }

    // Nothing to do: mostly stay home (keeps streets readable), sometimes stroll.
    const home = this.nearestHouse(h, v);
    if (home >= 0 && (h.age < ADULT || rand() < 0.6)) {
      if (this.go(h, 'rest', home, h.age < ADULT ? 'Chơi đùa trong nhà' : 'Nghỉ ngơi ở nhà')) return;
    }
    const r = v.radius * 0.6;
    const spot = w.findNearest(v.cx + (rand() * 2 - 1) * r, v.cy + (rand() * 2 - 1) * r, 3, (j) => w.canWalk(j));
    if (!this.go(h, 'wander', spot, 'Thong thả dạo quanh làng')) this.stay(h, 'idle', 'Nghỉ ngơi');
  }

  /**
   * Choose a job cell from a village's list: the first free one for ordered lists (houses near the
   * centre first), otherwise the one nearest to the worker.
   */
  private pickJob(list: number[], h: Human, valid: (i: number) => boolean, ordered = false) {
    let best = -1;
    let bd = Infinity;
    for (const i of list) {
      if (!this.free(i, h) || (i === h.avoid && this.world.time < h.avoidUntil) || !valid(i)) continue;
      if (ordered) return i;
      const d = (cx(i) - h.x) ** 2 + (cy(i) - h.y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private validHouseSite(i: number, v: Village) {
    const w = this.world;
    return w.cover[i] === Cover.NONE && !w.isWater(i) && w.height[i] >= v.minBuildHeight;
  }

  private refreshJobs(v: Village) {
    const w = this.world;
    const j = v.jobs;
    j.ripe.length = 0;
    j.trees.length = 0;
    j.firebreak.length = 0;
    j.fish.length = 0;
    const houses: [number, number][] = [];
    const farms: [number, number][] = [];
    this.spread(v);
    // Ruins that have been rebuilt, or lie under sea, mountain or someone else's house, are done with.
    if (v.ruins.length) {
      for (const i of v.ruins) if (w.cover[i] === Cover.HOUSE && w.owner[i] === v.id) v.rebuilt++;
      v.ruins = v.ruins.filter((i) => !w.isWater(i) && w.height[i] < HILL_MAX && (w.cover[i] === Cover.NONE || w.cover[i] === Cover.ASH));
      if (!v.ruins.length) {
        if (v.rebuilt >= 5) this.chronicle(v, `🏗️ ${v.name} đã được xây dựng lại sau thảm họa.`);
        v.rebuilt = 0;
      }
    }
    const r = v.radius;
    const center = idx(v.cx, v.cy);
    const farmMin = v.floods > 1 ? v.minBuildHeight - 0.02 : w.seaLevel + 0.03;
    // Foreign cities whose land may overlap ours: where they are nearer (edge to edge), the land is theirs.
    const rivals = this.villages.filter((o) => o.alive && o !== v && o.nation !== v.nation && Math.hypot(o.cx - v.cx, o.cy - v.cy) < r + o.radius + 8);
    const foreign = (x: number, y: number, d2: number) => {
      if (!rivals.length) return false;
      const mine = Math.sqrt(d2) - r;
      for (const o of rivals) if (Math.hypot(o.cx - x, o.cy - y) - o.radius < mine) return true;
      return false;
    };
    for (let dy = -r; dy <= r; dy++) {
      const y = v.cy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = v.cx + dx;
        const d2 = dx * dx + dy * dy;
        if (x < 0 || x >= W || d2 > r * r) continue;
        const i = y * W + x;
        if (w.isWater(i)) continue;
        const c = w.cover[i];
        if (c === Cover.FARM) {
          if (w.owner[i] === v.id && w.timer[i] >= 0.95) j.ripe.push(i);
        } else if (c === Cover.FOREST) {
          j.trees.push(i);
          if (v.fireWary && this.nearHouse(i, v, 2)) j.firebreak.push(i);
        } else if (c === Cover.NONE && i !== center && !foreign(x, y, d2)) {
          if (this.isShore(i)) j.fish.push(i);
          const h = w.height[i];
          const square = Math.abs(dx) <= 4 && dy >= -2 && dy <= 1; // palace + temple plaza
          // Checkerboard plots leave room between buildings for lanes and keep sprites from piling up.
          if (!square && ((x + y) & 1) === 0 && !w.road[i] && h >= v.minBuildHeight && h < HILL_MAX && w.snow[i] < 0.6 && !(v.fireWary && this.nearForest(i)))
            houses.push([i, d2 + ((dx + dy) & 1 ? 0.5 : 0)]);
          if (d2 >= 20 && !w.road[i] && w.isFertile(i) && h >= farmMin && w.snow[i] < 0.3) farms.push([i, d2 + rand() * 4]);
        }
      }
    }
    houses.sort((a, b) => a[1] - b[1]);
    farms.sort((a, b) => a[1] - b[1]);
    j.houseSites = houses.slice(0, 40).map((p) => p[0]);
    j.farmSites = farms.slice(0, 40).map((p) => p[0]);
  }

  /**
   * A city spreads outward, without limit, whenever it runs short of building land and its size
   * justifies it; it draws back if it shrinks. Where two cities meet, the nearer one holds the land.
   */
  private spread(v: Village) {
    // Generous: a great city may spread to ~80 cells across its core (radius up to era core + 60).
    const target = Math.min(60, Math.sqrt(v.houses.size + v.buildings.size + v.farms.size * 0.5) * 3);
    const short = v.jobs.houseSites.length < 10 || v.jobs.farmSites.length < 6;
    if (v.reach < target && short) v.reach = Math.min(target, v.reach + 1);
    else if (v.reach > target) v.reach = Math.max(target, v.reach - 0.5);
  }

  private isShore(i: number) {
    const w = this.world;
    const x = cx(i);
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || Math.abs(cx(j) - x) > 1) continue;
      if (w.isWater(j)) return true;
    }
    return false;
  }

  private nearForest(i: number) {
    const w = this.world;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && w.cover[j] === Cover.FOREST) return true;
    return false;
  }

  /** Send a whole band by ship to good land across the water. */
  private trySail(h: Human) {
    const w = this.world;
    const home = this.villages[h.originId];
    if (!home || home.era < 2 || !home.has('dock') || h.sailed) return false;
    h.sailed = true;
    let best = -1;
    let bd = Infinity;
    for (let t = 0; t < 600; t++) {
      const i = Math.floor(rand() * W * H);
      if (!this.goodSite(i)) continue;
      const d = Math.hypot(cx(i) - h.x, cy(i) - h.y);
      // Must actually cross the sea.
      let water = 0;
      for (let k = 1; k < 20; k++) if (w.isWater(idx(Math.round(h.x + ((cx(i) - h.x) * k) / 20), Math.round(h.y + ((cy(i) - h.y) * k) / 20)))) water++;
      if (water >= 4 && d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return false;
    const dock = [...home.buildings].find(([, k]) => k === kindIndex('dock'))?.[0] ?? idx(home.cx, home.cy);
    const duration = 4 + bd / 6;
    const tx = cx(best) + 0.5;
    const ty = cy(best) + 0.5;
    for (const o of this.humans) {
      if (o.band !== h.band) continue;
      o.voyageUntil = w.time + duration;
      o.x = tx + rand() * 2 - 1;
      o.y = ty + rand() * 2 - 1;
      o.hasTarget = false;
      o.sailed = true;
    }
    this.voyages.push({ x1: cx(dock) + 0.5, y1: cy(dock) + 0.5, x2: tx, y2: ty, start: w.time, end: w.time + duration, color: home.color, era: home.era });
    this.stats.voyages++;
    this.chronicle(home, `⛵ Đoàn thuyền của ${home.name} rời bến, vượt biển đi tìm vùng đất mới.`);
    return true;
  }

  private nomad(h: Human) {
    const w = this.world;
    if (h.band >= 0) {
      const leader = this.bandLeaders.get(h.band);
      // No land left on this shore: a seafaring people sails for the islands beyond.
      if (leader === h && h.colonist && w.time - h.leftAt > 35 && this.trySail(h)) return;
      // A band that wandered too long without finding land settles for joining an existing people.
      if ((this.bandSizes.get(h.band) ?? 0) < 2 || (h.colonist && w.time - h.leftAt > 140)) {
        h.band = -1;
        h.colonist = false;
      } else if (leader && leader !== h) {
        // Followers stay with the leader of their band.
        if (Math.hypot(leader.x - h.x, leader.y - h.y) > 3) {
          const spot = w.findNearest(leader.x, leader.y, 3, (j) => w.canWalk(j));
          if (this.go(h, 'migrate', spot, leader.thought || `Theo ${leader.name} đi tìm đất mới`)) return;
        }
        return this.stay(h, 'idle', `Theo ${leader.name} đi tìm đất mới`);
      }
    }
    // A pioneer who found no companions in time gives up and looks for a village after all.
    if (h.pioneer && w.time - h.leftAt > 90) h.pioneer = false;
    if (!h.colonist && !h.pioneer) {
      let near: Village | null = null;
      let nd = 45;
      for (const v of this.villages) {
        const open = v.alive ? v.enemies.size === 0 && v.pop < v.cap + 3 : v.houses.size > 0;
        const d = Math.hypot(v.cx - h.x, v.cy - h.y);
        if (open && d < nd) {
          nd = d;
          near = v;
        }
      }
      if (near) {
        if (nd < 3) {
          h.village = near.id;
          if (h.culture !== near.culture.id) h.name = pick(near.culture.names);
          h.culture = near.culture.id;
          if (!near.alive) {
            near.alive = true;
            this.chronicle(near, `🏡 Những người du mục tìm thấy ${near.name} bị bỏ hoang và dọn vào ở.`);
          }
          near.pop++;
          return this.stay(h, 'idle', `Gia nhập ${near.name}`);
        }
        if (this.go(h, 'migrate', idx(near.cx, near.cy), `Thấy ${near.name} đằng xa, đến xin ở nhờ`)) return;
      }
    }

    // Once the world has grown civilised (Middle Ages on), wanderers seek out a city instead of
    // founding a stone-age tribe in the middle of it.
    if (!h.colonist && !h.pioneer && this.maxEra >= 3) {
      let near: Village | null = null;
      let nd = Infinity;
      for (const v of this.villages) {
        if (!v.alive) continue;
        const d = Math.hypot(v.cx - h.x, v.cy - h.y);
        if (d < nd) {
          nd = d;
          near = v;
        }
      }
      if (near && nd < 3) {
        h.village = near.id;
        if (h.culture !== near.culture.id) h.name = pick(near.culture.names);
        h.culture = near.culture.id;
        return this.stay(h, 'idle', `Định cư ở ${near.name}`);
      }
      if (near && this.go(h, 'migrate', idx(near.cx, near.cy), `Tìm tới ${near.name} để định cư`)) return;
      return this.migrate(h, 'Lang thang tìm nơi định cư');
    }

    // Wanderers near one another band together behind a leader; a loner seeks out others.
    if (h.band < 0 && !h.colonist) {
      const near: Human[] = [];
      this.humanGrid.each(h.x, h.y, 8, (o) => {
        if (o.village < 0 && o.band < 0 && !o.colonist) near.push(o);
      });
      if (near.length >= 2) {
        const band = this.nextBand++;
        for (const o of near) {
          o.band = band;
          o.leftAt = w.time;
        }
        return this.stay(h, 'idle', 'Gặp được những người khác — cùng nhau đi tìm đất lành');
      }
      const other = this.humanGrid.nearest(h.x, h.y, 45, (o) => o !== h && o.village < 0 && !o.colonist);
      if (other) {
        const spot = w.findNearest(other.x, other.y, 3, (j) => w.canWalk(j));
        if (this.go(h, 'migrate', spot, 'Thấy bóng người đằng xa, đi tới làm quen')) return;
      }
    }

    // A lone wanderer cannot found a people; a band (or a small crowd of nomads) can.
    const company = h.band >= 0 ? (this.bandSizes.get(h.band) ?? 0) : this.humanGrid.count(h.x, h.y, 5, (o) => o.village < 0 && o.band < 0);
    if (company < 2) return this.migrate(h, 'Lang thang một mình, tìm một ngôi làng để xin ở nhờ');
    const here = idx(Math.floor(h.x), Math.floor(h.y));
    // People a god set down in a civilised world know what they are about: any decent dry land will do.
    if (h.godMade && this.maxEra >= 1) {
      if (this.fairSite(here)) return this.found(h);
      const near = w.findNearest(h.x, h.y, 40, (j) => this.fairSite(j));
      if (this.go(h, 'migrate', near, 'Tìm chỗ dựng cờ lập nước')) return;
    }
    if (this.goodSite(here)) return this.found(h);
    const site = w.findNearest(h.x, h.y, 30, (j) => this.goodSite(j));
    if (this.go(h, 'migrate', site, 'Đất kia tốt, lại gần nước — lập làng thôi!')) return;
    this.migrate(h, h.colonist ? `Đoàn người từ ${h.origin} đi tìm đất mới` : 'Lang thang tìm đất lành');
  }

  private found(h: Human) {
    const w = this.world;
    const id = this.villages.length;
    const x = Math.floor(h.x);
    const y = Math.floor(h.y);
    const terrain = surveyTerrain(w, x, y);
    const counts = new Map<string, number>();
    for (const o of this.villages) if (o.alive) counts.set(o.culture.id, (counts.get(o.culture.id) ?? 0) + 1);
    const native = cultureForTerrain(terrain, counts);
    // Settlers may keep their ancestors' ways, or be reshaped by the new land.
    const inherited = h.culture ? cultureById(h.culture) : null;
    // A nation's settlers found one of its cities (keeping its ways more often than free bands do).
    const mother = h.colonyOf >= 0 ? this.villages[h.colonyOf]?.capital : null;
    const nationCity = mother?.alive ? mother : null;
    // People a god sets down in a civilised world belong to their age: they break away from (or flee)
    // the nearest nation, and take its ways with them.
    let kin: Village | null = null;
    if (!nationCity && h.godMade && this.maxEra >= 1) {
      let bd = 400;
      for (const n of this.nations()) {
        const dd = Math.min(...this.citiesOf(n).map((c) => Math.hypot(c.cx - x, c.cy - y)));
        if (dd < bd) {
          bd = dd;
          kin = n;
        }
      }
    }
    const culture = kin ? kin.culture : inherited && rand() < (nationCity ? 0.8 : 0.5) ? inherited : native;
    const used = new Set(this.villages.map((v) => v.base));
    const base = culture.places.find((p) => !used.has(p)) ?? `${pick(culture.places)} ${['Mới', 'II', 'III', 'Hạ', 'Thượng'][id % 5]}`;
    const sameCulture = this.villages.filter((v) => v.culture.id === culture.id).length;
    void sameCulture;
    const color = this.distinctColor();
    const v = new Village(id, base, culture, color, x, y, w.seaLevel + 0.03);
    // The god who made most of the founders is their creator; in 'halves', the god of that continent.
    const votes = [0, 0];
    for (const o of this.humans) if (o.village < 0 && Math.hypot(o.x - h.x, o.y - h.y) < 5 && o.god >= 0) votes[o.god]++;
    v.homeGod = votes[0] + votes[1] ? (votes[1] > votes[0] ? 1 : 0) : w.layout === 'halves' ? (x < W / 2 ? 0 : 1) : -1;
    if (v.homeGod >= 0) v.faiths[v.homeGod] += 10;
    // The first people a god's own creations found becomes the people that god follows.
    const maker = votes[0] + votes[1] ? (votes[1] > votes[0] ? 1 : 0) : -1;
    if (maker >= 0 && this.chosen[maker] < 0 && !nationCity) {
      this.chosen[maker] = id;
      this.toasts.push({ icon: '🌟', title: 'Dân tộc của bạn', text: `${base} — mở thẻ 👑 để dẫn dắt họ` });
    }
    v.founder = h.culture === culture.id ? h.name : pick(culture.names);
    v.foundYear = this.year;
    v.parentName = h.origin;
    v.terrain = terrain;
    if (nationCity) {
      v.nation = nationCity.id;
      v.era = nationCity.era;
      v.tech = nationCity.tech;
      v.patron = nationCity.patron;
      v.faiths = [...nationCity.faiths];
      v.homeGod = nationCity.homeGod;
      v.food = 20;
      v.wood = 12;
    }
    let story: 'secede' | 'revolt' | 'refuge' | 'frontier' | null = null;
    if (kin) {
      // Born into the age of their kin, a little behind the homeland.
      v.era = Math.max(0, kin.era - (rand() < 0.4 ? 1 : 0));
      v.tech = Math.max(ERAS[v.era].tech, Math.min(kin.tech, ERAS[v.era].tech + (ERAS[Math.min(MAX_ERA, v.era + 1)].tech - ERAS[v.era].tech) * 0.5));
      v.food = 30 + v.era * 10;
      v.wood = 20 + v.era * 6;
      v.patron = kin.patron;
      v.faiths = [...kin.faiths];
      const roll = rand();
      story = kin.enemies.size || kin.trauma > 0.4 ? (roll < 0.6 ? 'refuge' : 'revolt') : roll < 0.35 ? 'secede' : roll < 0.6 ? 'revolt' : roll < 0.8 ? 'frontier' : 'refuge';
      const op = story === 'revolt' ? -75 : story === 'secede' ? -45 : story === 'refuge' ? 20 : 5;
      v.opinion.set(kin.id, op);
      kin.opinion.set(v.id, op);
    }
    this.villages.push(v);

    let n = 0;
    const band = h.band;
    for (const o of this.humans) {
      const together = band >= 0 ? o.band === band : o.band < 0 && Math.hypot(o.x - h.x, o.y - h.y) < 5;
      if (o.village < 0 && together) {
        o.band = -1;
        if (o.culture !== culture.id) o.name = pick(culture.names); // they take names in the new tongue
        o.village = id;
        o.culture = culture.id;
        o.colonist = false;
        n++;
      }
    }
    v.pop = n;
    const origin = h.origin ? `rời ${h.origin}` : 'du mục';
    const adapted = inherited && culture !== inherited ? ` Vùng đất mới dần biến họ từ ${inherited.name} thành ${culture.name}.` : '';
    if (nationCity) {
      const cities = this.citiesOf(nationCity).length;
      this.chronicle(nationCity, `🏙️ ${nationCity.name} lập thành phố mới ${v.base} — giờ có ${cities} thành phố.`);
      v.history.push({ year: this.year, text: `🏙️ ${h.name} dẫn người dân ${origin} lập nên ${v.base}, một thành phố của ${nationCity.name}.` });
    } else if (kin && story) {
      const k = kin.name;
      const text = {
        secede: `🔥 Bất bình với triều đình ${k}, ${h.name} cùng ${n - 1} người ly khai, dựng cờ lập nên ${v.name}.`,
        revolt: `⚔️ ${h.name} giương cờ khởi nghĩa chống lại ${k}! ${n} nghĩa quân lập nên ${v.name}.`,
        refuge: `🧳 Chạy trốn ${kin.enemies.size ? 'chiến tranh' : 'thiên tai và đói khổ'} ở ${k}, ${n} lưu dân theo ${h.name} lập nên ${v.name}.`,
        frontier: `🧭 ${h.name} dẫn ${n - 1} người dân ${k} đi khai hoang miền đất mới, lập nên ${v.name} — tự trị, không còn thần phục ${k}.`,
      }[story];
      this.chronicle(v, text);
      this.chronicle(kin, text, false);
      this.toasts.push({ icon: text.slice(0, 2), title: { secede: 'Ly khai!', revolt: 'Khởi nghĩa!', refuge: 'Lưu dân lập nước', frontier: 'Khai hoang' }[story], text: `${v.name} (${ERAS[v.era].name})` });
      // Rebels take up arms at once if they are strong enough to dare.
      if (story === 'revolt' && n >= 4 && !kin.enemies.has(v.id)) this.declareWar(v, kin, 'để giành độc lập');
    } else this.chronicle(v, `🏕️ ${h.name} cùng ${Math.max(0, n - 1)} người ${origin} dừng chân ở ${culture.homeland}, lập nên ${v.name}.${adapted}`);
    this.stay(h, 'idle', `Lập nên ${v.name}`);
    this.refreshJobs(v);
  }

  private migrate(h: Human, thought: string) {
    const w = this.world;
    for (let tries = 0; tries < 4; tries++) {
      const t = w.findNearest(clampX(h.x + Math.cos(h.heading) * 15), clampY(h.y + Math.sin(h.heading) * 15), 4, (j) =>
        w.canWalk(j),
      );
      if (this.go(h, 'migrate', t, thought)) return;
      h.heading = rand() * Math.PI * 2;
    }
    this.stay(h, 'idle', thought);
  }

  /** Dry, buildable land outside any city. */
  private fairSite(i: number) {
    const w = this.world;
    if (w.cover[i] !== Cover.NONE || w.isWater(i) || w.height[i] < w.seaLevel + 0.03 || w.height[i] >= HILL_MAX || w.snow[i] > 0.5) return false;
    const x = cx(i);
    const y = cy(i);
    for (const v of this.villages) if (v.alive && Math.hypot(v.cx - x, v.cy - y) < v.radius + 6) return false;
    return true;
  }

  /** Fertile, dry, unclaimed land with both water and forest close by, away from other villages. */
  private goodSite(i: number) {
    const w = this.world;
    if (w.cover[i] !== Cover.NONE || !w.isFertile(i) || w.height[i] < w.seaLevel + 0.04 || w.snow[i] > 0.3) return false;
    const x = cx(i);
    const y = cy(i);
    for (const v of this.villages) if (v.alive && Math.hypot(v.cx - x, v.cy - y) < v.radius + 12) return false;
    let water = false;
    let forest = false;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const r of [3, 6]) {
        const xx = Math.round(x + Math.cos(a) * r);
        const yy = Math.round(y + Math.sin(a) * r);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = idx(xx, yy);
        if (w.isWater(j)) water = true;
        else if (w.cover[j] === Cover.FOREST) forest = true;
      }
    }
    // Fresh water is a must; a nearby forest is a bonus (for wood and game), not a requirement.
    void forest;
    return water;
  }

  private transferBuilding(i: number, from: Village, to: Village) {
    if (from.houses.delete(i)) to.houses.add(i);
    const k = from.buildings.get(i);
    if (k !== undefined) {
      from.buildings.delete(i);
      to.buildings.set(i, k);
    }
  }

  /** The next civic building this nation lacks, if any. */
  /**
   * The next civic building this city should raise. Buildings cost gold from the treasury. A guided
   * people builds what its god ordered (the queue); others — and guided ones on 'auto' — build what
   * they need, one of a kind per city unless the city is large.
   */
  private missingSpecial(v: Village): Kind | null {
    const cap = v.capital;
    if (cap.gold < civicGold(v.era)) return null;
    const ordered = cap.queue.find((k) => {
      const s = SPECIALS.find((x) => x.kind === k);
      return s && v.era >= s.era && !(k === 'dock' && !v.jobs.fish.length);
    });
    if (ordered) return ordered as Kind;
    if (this.guided(cap) && !cap.autoBuild) return null;
    for (const s of SPECIALS) {
      if (v.era < s.era) continue;
      if (s.kind === 'dock' && (!v.jobs.fish.length || v.has('dock'))) continue;
      // Needs, not whims: no barracks in peacetime unless expansionist, no market without trade in mind.
      if (s.kind === 'barracks' && !v.enemies.size && cap.stance !== 'expand') continue;
      if (s.kind === 'market' && !cap.openTrade) continue;
      const want = s.per ? 1 + Math.floor(v.pop / (s.per * 1.8)) : 1;
      if (v.count(s.kind) < want) return s.kind;
    }
    return null;
  }

  /** What to raise on this plot: a home if people need one, else the civic building that is due. */
  private nextBuilding(v: Village, t: number): Kind | null {
    if (v.cap < v.pop + 2 || v.ruins.includes(t)) return 'house';
    const k = this.missingSpecial(v);
    if (k === 'dock' && !this.isShore(t)) return null;
    return k;
  }

  /** Where the next civic building should go: docks on the shore, the rest on ordinary plots. */
  private civicSite(v: Village, h: Human, kind: Kind) {
    const w = this.world;
    if (kind === 'dock') return this.pickJob(v.jobs.fish, h, (j) => w.cover[j] === Cover.NONE && !w.isWater(j) && !w.road[j]);
    return this.pickJob(v.jobs.houseSites, h, (j) => this.validHouseSite(j, v), true);
  }

  /** Lay a road from a building back to the village square (L-shaped, avoiding farms and forest). */
  private carveRoad(v: Village, from: number) {
    const tier = roadTier(v.era);
    const path: number[] = [];
    let x = cx(from);
    let y = cy(from);
    const horizontalFirst = (from & 1) === 0;
    for (let step = 0; step < 80; step++) {
      const dx = v.cx - x;
      const dy = v.cy - y;
      if (dx === 0 && dy === 0) break;
      if ((horizontalFirst && dx !== 0) || dy === 0) x += Math.sign(dx);
      else y += Math.sign(dy);
      if (Math.abs(x - v.cx) <= 1 && Math.abs(y - v.cy) <= 1) break;
      path.push(idx(x, y));
    }
    this.pave(path, tier, v.era, false);
  }

  /** A highway between two trading partners' squares. */
  private carveHighway(a: Village, b: Village) {
    const n = Math.max(Math.abs(b.cx - a.cx), Math.abs(b.cy - a.cy));
    const path: number[] = [];
    let lx = -1;
    let ly = -1;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(a.cx + ((b.cx - a.cx) * k) / n);
      const y = Math.round(a.cy + ((b.cy - a.cy) * k) / n);
      if (x === lx && y === ly) continue;
      // A diagonal step gets a connecting cell, so roads and bridges are joined edge to edge.
      if (lx >= 0 && x !== lx && y !== ly) path.push(idx(x, ly));
      path.push(idx(x, y));
      lx = x;
      ly = y;
    }
    this.pave(path, roadTier(Math.min(a.era, b.era)), Math.min(a.era, b.era), true);
  }

  /**
   * Pave a path: open ground becomes road; from the iron age a narrow stretch of water (a river,
   * a strait of up to 5 cells) gets a bridge. Farms, forest and buildings are stepped around.
   */
  private pave(path: number[], tier: number, era: number, highway: boolean) {
    const w = this.world;
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      if (w.isWater(i)) {
        let end = k;
        while (end < path.length && w.isWater(path[end])) end++;
        const span = end - k;
        // Engineering reaches further each age: river bridges, then viaducts, then sea bridges —
        // but only highways get long bridges, and never one beside another.
        const maxSpan = highway ? [0, 0, 5, 8, 24, 45, 80][Math.min(6, era)] : era >= 2 ? 3 : 0;
        if (span <= maxSpan && end < path.length && !path.slice(k, end).some((c) => w.road[c])) {
          const mid = path[(k + end) >> 1];
          const near = span > 3 && this.bridgeNear(cx(mid), cy(mid), Math.max(8, span * 0.4), path);
          if (!near) {
            for (let j = k; j < end; j++) {
              if (w.road[path[j]] < tier) w.road[path[j]] = tier;
              w.bridge[path[j]] = 1;
            }
          }
        }
        k = end - 1;
        continue;
      }
      if (w.cover[i] !== Cover.NONE) continue;
      if (w.road[i] < tier) w.road[i] = tier;
    }
  }

  /** Is there already a bridge within r cells of (x, y), other than on this path? */
  private bridgeNear(x: number, y: number, r: number, path: number[]) {
    const w = this.world;
    const own = new Set(path);
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        if (w.bridge[i] && !own.has(i)) return true;
      }
    }
    return false;
  }

  private nearestHouse(h: Human, v: Village | null) {
    if (!v) return -1;
    let best = -1;
    let bd = Infinity;
    for (const i of v.houses) {
      const d = (cx(i) - h.x) ** 2 + (cy(i) - h.y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private nearHouse(i: number, v: Village, r: number) {
    const w = this.world;
    const x = cx(i);
    const y = cy(i);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = idx(xx, yy);
        if (w.cover[j] === Cover.HOUSE && w.owner[j] === v.id) return true;
      }
    }
    return false;
  }

  /** What food, if any, can be gathered standing on cell i. */
  private foodAt(i: number): FoodKind | null {
    const w = this.world;
    if (w.isWater(i)) return null;
    const c = w.cover[i];
    if (c === Cover.FARM) return w.timer[i] >= 0.8 ? 'farm' : null;
    if (c === Cover.FOREST) return 'forest';
    if (c !== Cover.NONE) return null;
    return this.isShore(i) ? 'fish' : null;
  }

  private act(h: Human, dt: number) {
    if (h.action === 'fight') return this.fightStep(h, dt);
    if (h.action === 'hunt') return this.huntStep(h, dt);
    if (!h.hasTarget) return;
    const dx = h.tx - h.x;
    const dy = h.ty - h.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.35) return this.move(h, dx / d, dy / d, dt, d);

    const w = this.world;
    const t = h.targetIdx;
    const v = h.village >= 0 ? this.villages[h.village] : null;
    const era = v ? ERAS[v.era] : ERAS[0];
    const done = () => {
      h.hasTarget = false;
      h.think = 0;
    };

    switch (h.action) {
      case 'rest':
      case 'retreat':
        // Arrived: stay inside the house, or by the village campfire.
        if (w.cover[t] !== Cover.HOUSE && !(v && t === idx(v.cx, v.cy))) return done();
        h.hasTarget = false;
        if (v && h.hunger > 0.5 && v.food >= 1) {
          v.food -= 1;
          h.hunger = Math.max(0, h.hunger - 0.5);
        }
        return;
      case 'pray':
        h.hasTarget = false;
        return;
      case 'eat':
        if (v && v.food >= 1) {
          v.food -= 1;
          h.hunger = Math.max(0, h.hunger - 0.6);
          h.thought = 'Ăn no rồi!';
        }
        return done();
      case 'harvest': {
        h.work += dt;
        if (h.work < 1.2) return;
        const c = w.cover[t];
        const traits = v?.culture.traits;
        if (c === Cover.FARM && w.timer[t] >= 0.8) {
          w.timer[t] = 0;
          const civic = v ? (v.has('mill') ? 1.25 : 1) * (v.has('granary') ? 1.1 : 1) * (v.has('factory') ? 1.3 : 1) : 1;
          const gain = Math.max(1, Math.round(4 * era.yield * (traits?.farm ?? 1) * civic * (1 - 0.5 * (v?.trauma ?? 0))));
          if (h.hunger > 0.5) {
            h.hunger -= 0.5;
            h.carryFood += gain - 1;
          } else h.carryFood += gain;
        } else if (c === Cover.FOREST || this.foodAt(t) === 'fish') {
          const k = c === Cover.FOREST ? (traits?.hunt ?? 1) : (traits?.fish ?? 1) * (v?.has('dock') ? 1.5 : 1);
          if (h.hunger > 0.5) h.hunger -= 0.4;
          else h.carryFood += Math.max(1, Math.round(k * era.yield * 0.8));
          if (c === Cover.FOREST && rand() < 0.2) w.cover[t] = Cover.NONE;
        }
        return done();
      }
      case 'chop':
        h.work += dt;
        if (h.work < 1.5) return;
        if (w.cover[t] === Cover.FOREST) {
          w.cover[t] = Cover.NONE;
          h.carryWood += 2 + Math.floor(v ? v.era / 2 : 0) + (v?.has('factory') ? 2 : 0);
        }
        return done();
      case 'farm':
        h.work += dt;
        if (h.work < 1.5) return;
        if (v && w.cover[t] === Cover.NONE && !w.isWater(t)) {
          w.cover[t] = Cover.FARM;
          w.owner[t] = v.id;
          w.timer[t] = 0;
          v.farms.add(t);
        }
        return done();
      case 'build':
        h.work += dt;
        if (h.work < 2.5) return;
        if (v && v.wood >= era.houseWood && w.cover[t] === Cover.NONE && !w.isWater(t)) {
          const kind = this.nextBuilding(v, t);
          const cost = kind === 'house' ? era.houseWood : era.houseWood * 2;
          if (kind && v.wood >= cost) {
            w.cover[t] = Cover.HOUSE;
            w.owner[t] = v.id;
            w.timer[t] = v.era; // buildings remember the era they were built in
            w.building[t] = kindIndex(kind);
            w.road[t] = 0;
            if (kind === 'house') v.houses.add(t);
            else {
              v.buildings.set(t, kindIndex(kind));
              const cap = v.capital;
              cap.gold = Math.max(0, cap.gold - civicGold(v.era));
              const q = cap.queue.indexOf(kind);
              if (q >= 0) cap.queue.splice(q, 1);
              this.chronicle(v, `🏗️ ${v.name} xây ${SPECIAL_LABEL[kind]}.`, false);
            }
            v.wood -= cost;
            this.carveRoad(v, t);
          }
        }
        return done();
      case 'raid': {
        h.work += dt;
        if (h.work < 1.5) return;
        const owner = w.owner[t];
        const enemy = owner >= 0 ? this.villages[owner] : null;
        if (v && enemy && v.hostileTo(enemy.id) && w.cover[t] === Cover.HOUSE) {
          const loot = Math.min(enemy.food, 5);
          enemy.food -= loot;
          v.food += loot;
          if (v.era >= 3) {
            w.owner[t] = v.id;
            this.transferBuilding(t, enemy, v);
          } else w.ignite(t);
        }
        return done();
      }
      case 'deliver':
        if (v) {
          v.food += h.carryFood;
          v.wood += h.carryWood;
        }
        h.carryFood = 0;
        h.carryWood = 0;
        return done();
      case 'flee':
      case 'swim':
        h.hasTarget = false;
        h.think = 0.1;
        return;
      default:
        return done();
    }
  }

  private fightStep(h: Human, dt: number) {
    const f = h.foe;
    if (!f || f.dead || f.inside) {
      h.foe = null;
      h.hasTarget = false;
      h.action = 'idle';
      h.think = 0;
      return;
    }
    const dx = f.x - h.x;
    const dy = f.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > 14) {
      h.foe = null;
      h.action = 'idle';
      h.think = 0;
      return;
    }
    const v = h.village >= 0 ? this.villages[h.village] : null;
    const era = ERAS[v?.era ?? 0];
    const unit = h.role === 'soldier' ? UNITS[h.unit] : null;
    const range = unit?.range || era.range;
    if (d > range * 0.9) {
      h.tx = f.x;
      h.ty = f.y;
      this.move(h, dx / d, dy / d, dt, d - range * 0.8);
      return;
    }
    h.attackCd -= dt;
    if (h.attackCd > 0) return;
    h.attackCd = 0.8 + rand() * 0.5;
    const fv = f.village >= 0 ? this.villages[f.village] : null;
    const atk = era.attack * (v?.culture.traits.attack ?? 1) * (h.role === 'soldier' ? 1.2 : 0.8) * (v && v.blessWar > 0 ? 1.5 : 1) * (v?.has('smithy') ? 1.15 : 1);
    const home = fv && Math.hypot(f.x - fv.cx, f.y - fv.cy) < fv.radius ? 1.2 : 1;
    const arm = ERAS[fv?.era ?? 0].armor * (fv?.culture.traits.defense ?? 1) * home * (fv?.has('barracks') ? 1.1 : 1);
    const toughness = f.role === 'soldier' ? UNITS[f.unit].hp : 1;
    f.health -= (0.11 * (atk * (unit?.atk ?? 1)) / (arm * toughness)) * (0.6 + rand() * 0.8);
    f.harm = 'tử trận';
    f.lastHitBy = h.village;
    if (range > 1.5) this.shots.push({ x1: h.x, y1: h.y, x2: f.x, y2: f.y, t: 0.15 });
    else this.clashes.push({ x: (h.x + f.x) / 2, y: (h.y + f.y) / 2, t: 0.25 });
    if (f.action !== 'fight' && f.age >= ADULT && f.health > 0.3) {
      f.foe = h;
      this.chase(f, 'fight', h.x, h.y, 'Bị tấn công! Đánh trả!');
    }
  }

  private huntStep(h: Human, dt: number) {
    const a = h.prey;
    if (!a || a.dead) {
      h.prey = null;
      h.action = 'idle';
      h.hasTarget = false;
      h.think = 0;
      return;
    }
    const dx = a.x - h.x;
    const dy = a.y - h.y;
    const d = Math.hypot(dx, dy);
    h.stuck += dt;
    if (d > 18 || h.stuck > 14) {
      h.prey = null;
      h.action = 'idle';
      h.think = 0;
      h.thought = 'Con thú chạy mất rồi...';
      return;
    }
    if (d > 1.1) {
      h.tx = a.x;
      h.ty = a.y;
      this.move(h, dx / d, dy / d, dt, d - 0.8, false);
      return;
    }
    h.attackCd -= dt;
    if (h.attackCd > 0) return;
    h.attackCd = 0.8;
    const v = h.village >= 0 ? this.villages[h.village] : null;
    a.hp -= 0.4 * ERAS[v?.era ?? 0].attack * (v?.culture.traits.hunt ?? 1);
    if (a.hp > 0) return;
    a.dead = true;
    this.stats.hunted++;
    const meat = Math.round((a.kind === 'deer' ? 5 : 2) * ERAS[v?.era ?? 0].yield * (v?.culture.traits.hunt ?? 1));
    if (h.hunger > 0.5) {
      h.hunger = Math.max(0, h.hunger - 0.6);
      h.carryFood += meat - 2;
    } else h.carryFood += meat;
    h.thought = a.kind === 'deer' ? 'Săn được hươu rồi!' : 'Đuổi được sói rồi!';
    h.prey = null;
    h.action = 'idle';
    h.think = 0;
  }

  private move(h: Human, nx: number, ny: number, dt: number, dist: number, trackStuck = true) {
    const w = this.world;
    const ci = idx(Math.floor(h.x), Math.floor(h.y));
    const swimming = w.isWater(ci) && !w.isIce(ci) && !w.road[ci];
    const v = h.village >= 0 ? this.villages[h.village] : null;
    let speed = 2.6 * (v?.culture.traits.speed ?? 1) * (v && v.era >= 4 ? 1.25 : 1);
    if (w.height[ci] > HILL_MAX) speed *= 0.5;
    if (w.snow[ci] > 0.5) speed *= 0.6;
    if (swimming) speed *= 0.6;
    if (h.action === 'flee' || h.action === 'swim' || h.action === 'fight' || h.action === 'hunt') speed *= 1.4;
    if (h.role === 'soldier') speed *= UNITS[h.unit].speed;
    const step = Math.min(speed * dt, Math.max(0, dist));
    const base = Math.atan2(ny, nx);

    for (const off of OFFSETS) {
      const a = base + off * h.turn;
      const px = h.x + Math.cos(a) * step;
      const py = h.y + Math.sin(a) * step;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const j = idx(Math.floor(px), Math.floor(py));
      if (j !== ci && w.isDanger(j)) continue;
      if (w.isWater(j) && !w.isIce(j) && !w.road[j] && !swimming && j !== ci) continue;
      h.x = px;
      h.y = py;
      break;
    }

    if (!trackStuck) return;
    if (dist < h.lastDist - 0.05) {
      h.lastDist = dist;
      h.stuck = 0;
    } else {
      h.stuck += dt;
      if (h.stuck > 2.5) h.turn = -h.turn;
      if (h.stuck > 5) {
        h.avoid = h.targetIdx;
        h.avoidUntil = w.time + 30;
        h.hasTarget = false;
        if (h.action === 'fight') h.action = 'idle';
        h.think = 0;
        h.stuck = 0;
        h.heading = rand() * Math.PI * 2;
      }
    }
  }

  // ---------- Save / load ----------

  /** Everything needed to rebuild this world, as JSON-safe data (typed arrays separately). */
  snapshot() {
    const w = this.world;
    return {
      version: 1,
      sim: {
        godNames: this.godNames,
        gods: this.gods,
        humans: this.humans.map((h) => ({ ...h, foe: undefined, prey: undefined, foeId: h.foe?.id ?? -1, preyId: h.prey?.id ?? -1 })),
        claims: [...this.claims].filter(([, h]) => !h.dead).map(([c, h]) => [c, h.id]),
        villages: this.villages,
        wars: this.wars,
        wishes: this.wishes,
        nextWishAt: this.nextWishAt,
        log: this.log,
        milestones: this.milestones,
        achieved: this.achieved,
        stats: this.stats,
        voyages: this.voyages,
        airstrikes: this.airstrikes,
        fleets: this.fleets,
        chosen: this.chosen,
        airId: this.airId,
        nextId: this.nextId,
        wishId: this.wishId,
        startTime: this.startTime,
        nextBand: this.nextBand,
        stepNo: this.stepNo,
        seed: this.seed,
        randState: randomState(),
        acc: this.acc,
        slowTimer: this.slowTimer,
      },
      world: {
        seaLevel: w.seaLevel,
        temperature: w.temperature,
        weather: w.weather,
        autoWeather: w.autoWeather,
        weatherTimer: w.weatherTimer,
        regionTemp: [...w.regionTemp],
        systems: w.systems,
        time: w.time,
        dayLength: w.dayLength,
        phase: w.phase,
        vents: w.vents,
        grows: w.grows,
        reach: w.reach,
        origin: w.origin,
        landUp: w.landUp,
        landDist: w.landDist,
        rising: w.rising,
      },
      animals: this.animals.list.map((a) => ({
        ...a,
        prey: undefined,
        preyId: a.prey ? (a.prey as unknown as { id: number }).id : -1,
        preyIsAnimal: a.prey instanceof Animal,
      })),
      arrays: {
        height: w.height,
        cover: w.cover,
        snow: w.snow,
        timer: w.timer,
        owner: w.owner,
        jitter: w.jitter,
        latChill: w.latChill,
        regionClimate: w.regionClimate,
        building: w.building,
        road: w.road,
        bridge: w.bridge,
        // A growing world remembers the lands still under the sea.
        ...(w.grows ? { targetH: w.targetH, landId: w.landId } : {}),
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  restore(data: any) {
    const w = this.world;
    for (const [k, arr] of Object.entries(data.arrays as Record<string, ArrayLike<number>>)) {
      (w as unknown as Record<string, { set(a: ArrayLike<number>): void }>)[k].set(arr);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { regionTemp, regionTimer, regionWeather, systems, ...rest } = data.world;
    Object.assign(w, rest);
    if (regionTemp) w.regionTemp.set(regionTemp);
    w.systems = (systems ?? []).map((o: object) => ({ ...o }));
    if (!rest.grows) {
      w.grows = false;
      w.landUp = [];
      w.rising = [];
    } else w.indexLands();
    w.rebuildWeather();
    w.events.length = 0;
    const d = data.sim;
    this.godNames = d.godNames ?? [d.godName ?? 'Đấng Sáng Thế', 'Đấng Hắc Nguyệt'];
    this.gods = d.gods ?? 1;
    this.villages = d.villages.map((o: Record<string, unknown>) => {
      // Older saves had a single faith value.
      if ('faith' in o) {
        o.faiths = [o.faith as number, 15];
        o.patron = o.religion === 'god' ? 0 : -1;
        delete o.faith;
        delete o.religion;
      }
      // Saves from before nations had cities.
      if ('color' in o) {
        o.hue = o.color;
        delete o.color;
      }
      if ('enemies' in o) {
        o.warSet = o.enemies;
        delete o.enemies;
      }
      return Object.assign(Object.create(Village.prototype), { nation: o.id, allies: new Set(), pacts: new Set(), reach: 0, siegeT: 0, toll: 0, rebuilt: 0, armyPath: [], armyPathFor: -1, gov: 'council', tax: 1, stance: 'defend', openTrade: true, faithPolicy: 'ancestral', queue: [], autoBuild: true, gold: 30, mood: 60, policyT: 30, ideology: '', econ: 1, econT: 0, ruins: [], navyCd: 40, trauma: 0, warSet: new Set() }, o, {
        culture: cultureById(o.culture as string),
        jobs: o.jobs ?? { ripe: [], farmSites: [], houseSites: [], trees: [], firebreak: [], fish: [] },
      });
    });
    Village.all = this.villages;
    // Older worlds gave kindred nations near-identical colours: repaint any that clash.
    const seen: Village[] = [];
    for (const n of this.nations()) {
      const clash = seen.some((o) => Math.abs(((o.hue >> 16) & 255) - ((n.hue >> 16) & 255)) + Math.abs(((o.hue >> 8) & 255) - ((n.hue >> 8) & 255)) + Math.abs((o.hue & 255) - (n.hue & 255)) < 70);
      if (clash) n.hue = this.distinctColor(n);
      seen.push(n);
    }
    this.humans = d.humans.map((o: Record<string, unknown>) => Object.assign(Object.create(Human.prototype), o, { foe: null, prey: null }));
    this.animals.list = data.animals.map((o: Record<string, unknown>) => Object.assign(Object.create(Animal.prototype), o, { prey: null }));
    // Re-link who was fighting, hunting or chasing whom.
    const people = new Map(this.humans.map((h) => [h.id, h]));
    const beasts = new Map(this.animals.list.map((a) => [a.id, a]));
    for (const h of this.humans as (Human & { foeId?: number; preyId?: number })[]) {
      h.foe = people.get(h.foeId ?? -1) ?? null;
      h.prey = beasts.get(h.preyId ?? -1) ?? null;
    }
    for (const a of this.animals.list as (Animal & { preyId?: number; preyIsAnimal?: boolean })[]) {
      a.prey = (a.preyIsAnimal ? beasts.get(a.preyId ?? -1) : people.get(a.preyId ?? -1)) ?? null;
    }
    this.animals.resume(Math.max(0, ...this.animals.list.map((a) => a.id)) + 1);
    this.wars = d.wars;
    this.wishes = d.wishes;
    this.nextWishAt = d.nextWishAt ?? 0;
    this.log = d.log;
    this.milestones = d.milestones;
    this.achieved = d.achieved;
    Object.assign(this.stats, d.stats);
    this.voyages = d.voyages ?? [];
    this.airstrikes = d.airstrikes ?? [];
    this.fleets = d.fleets ?? [];
    this.chosen = d.chosen ?? [-1, -1];
    this.airId = d.airId ?? 1;
    this.nextId = d.nextId;
    this.wishId = d.wishId;
    this.startTime = d.startTime;
    this.nextBand = d.nextBand;
    this.stepNo = d.stepNo ?? 0;
    this.seed = d.seed ?? 0;
    this.acc = 0;
    this.slowTimer = d.slowTimer ?? 0;
    if (d.randState !== undefined) seedRandom(d.randState);
    this.pending.clear();
    this.byId = new Map(this.humans.map((h) => [h.id, h]));
    this.claims = new Map(((d.claims ?? []) as [number, number][]).filter(([, id]) => people.has(id)).map(([c, id]) => [c, people.get(id)!]));
    this.throttle.clear();
    this.strikes = [];
    this.shots = [];
    this.clashes = [];
    this.impacts = [];
    this.toasts = [];
    this.selectedHuman = null;
    this.selectedVillage = null;
    this.warFrom = null;
    this.peaceFrom = null;
    this.generation++; // the renderer redraws everything
  }

  // ---------- Queries for the UI ----------

  pick(x: number, y: number) {
    const best = this.humanGrid.nearest(x, y, 2.5, () => true);
    this.selectedHuman = best;
    if (best) {
      this.selectedVillage = best.village >= 0 ? this.villages[best.village] : null;
      return;
    }
    const i = idx(Math.floor(x), Math.floor(y));
    const owner = this.world.owner[i];
    if (owner >= 0 && this.villages[owner]?.alive) {
      this.selectedVillage = this.villages[owner];
      return;
    }
    this.selectedVillage = this.villageNear(x, y, 20);
  }
}
