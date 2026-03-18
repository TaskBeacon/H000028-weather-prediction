export interface PatternSpec {
  pattern_id: string;
  cards: [number, number, number, number];
  sun_probability: number;
  weight: number;
}

export interface ScoreUpdate {
  score_before: number;
  score_after: number;
  score_delta: number;
}

const DEFAULT_PATTERNS: PatternSpec[] = [
  { pattern_id: "P01", cards: [1, 0, 0, 0], sun_probability: 0.76, weight: 1 },
  { pattern_id: "P02", cards: [0, 1, 0, 0], sun_probability: 0.57, weight: 1 },
  { pattern_id: "P03", cards: [0, 0, 1, 0], sun_probability: 0.43, weight: 1 },
  { pattern_id: "P04", cards: [0, 0, 0, 1], sun_probability: 0.2, weight: 1 },
  { pattern_id: "P05", cards: [1, 1, 0, 0], sun_probability: 0.67, weight: 1 },
  { pattern_id: "P06", cards: [1, 0, 1, 0], sun_probability: 0.6, weight: 1 },
  { pattern_id: "P07", cards: [1, 0, 0, 1], sun_probability: 0.48, weight: 1 },
  { pattern_id: "P08", cards: [0, 1, 1, 0], sun_probability: 0.5, weight: 1 },
  { pattern_id: "P09", cards: [0, 1, 0, 1], sun_probability: 0.38, weight: 1 },
  { pattern_id: "P10", cards: [0, 0, 1, 1], sun_probability: 0.32, weight: 1 },
  { pattern_id: "P11", cards: [1, 1, 1, 0], sun_probability: 0.59, weight: 1 },
  { pattern_id: "P12", cards: [1, 1, 0, 1], sun_probability: 0.51, weight: 1 },
  { pattern_id: "P13", cards: [1, 0, 1, 1], sun_probability: 0.46, weight: 1 },
  { pattern_id: "P14", cards: [0, 1, 1, 1], sun_probability: 0.4, weight: 1 }
];

export class Controller {
  readonly patterns: PatternSpec[];
  readonly initial_score: number;
  readonly correct_delta: number;
  readonly incorrect_delta: number;
  readonly timeout_delta: number;
  readonly random_seed: number | null;
  readonly enable_logging: boolean;

  current_score: number;
  trial_count_total: number;
  trial_count_block: number;
  block_idx: number;
  histories: Array<Record<string, unknown>>;

  private readonly rng: () => number;
  private readonly pattern_weight_sum: number;

  constructor(args: {
    patterns?: PatternSpec[];
    initial_score?: number;
    correct_delta?: number;
    incorrect_delta?: number;
    timeout_delta?: number;
    random_seed?: number | null;
    enable_logging?: boolean;
  }) {
    this.patterns = args.patterns && args.patterns.length > 0 ? args.patterns : [...DEFAULT_PATTERNS];
    this.pattern_weight_sum = this.patterns.reduce((sum, item) => sum + Math.max(1e-6, Number(item.weight ?? 1)), 0);
    this.initial_score = Number(args.initial_score ?? 0);
    this.correct_delta = Number(args.correct_delta ?? 1);
    this.incorrect_delta = Number(args.incorrect_delta ?? -1);
    this.timeout_delta = Number(args.timeout_delta ?? 0);
    this.random_seed = Number.isFinite(Number(args.random_seed)) ? Number(args.random_seed) : null;
    this.enable_logging = args.enable_logging !== false;
    this.rng = this.random_seed == null ? () => Math.random() : makeSeededRandom(this.random_seed);

    this.current_score = this.initial_score;
    this.trial_count_total = 0;
    this.trial_count_block = 0;
    this.block_idx = -1;
    this.histories = [];
  }

  static from_dict(config: Record<string, unknown>): Controller {
    return new Controller({
      patterns: parse_patterns(config.patterns),
      initial_score: safeInt(config.initial_score, 0),
      correct_delta: safeInt(config.correct_delta, 1),
      incorrect_delta: safeInt(config.incorrect_delta, -1),
      timeout_delta: safeInt(config.timeout_delta, 0),
      random_seed:
        config.random_seed == null || config.random_seed === ""
          ? null
          : Number.isFinite(Number(config.random_seed))
            ? Number(config.random_seed)
            : null,
      enable_logging: Boolean(config.enable_logging ?? true)
    });
  }

  start_block(block_idx: number): void {
    this.block_idx = Number(block_idx);
    this.trial_count_block = 0;
  }

  next_trial_id(): number {
    return this.trial_count_total + 1;
  }

  sample_duration(value: unknown, defaultValue: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (Array.isArray(value) && value.length >= 2) {
      const left = Number(value[0]);
      const right = Number(value[1]);
      if (Number.isFinite(left) && Number.isFinite(right)) {
        const lo = Math.min(left, right);
        const hi = Math.max(left, right);
        return Math.max(0, lo + this.rng() * (hi - lo));
      }
    }
    return Math.max(0, defaultValue);
  }

  draw_pattern(): PatternSpec {
    const token = this.rng() * this.pattern_weight_sum;
    let acc = 0;
    for (const pattern of this.patterns) {
      acc += Math.max(1e-6, Number(pattern.weight ?? 1));
      if (token <= acc) {
        return pattern;
      }
    }
    return this.patterns[this.patterns.length - 1];
  }

  sample_weather(pattern: PatternSpec): "sun" | "rain" {
    return this.rng() < Number(pattern.sun_probability) ? "sun" : "rain";
  }

  apply_score(is_correct: boolean | null): ScoreUpdate {
    const scoreBefore = this.current_score;
    const scoreDelta =
      is_correct == null ? this.timeout_delta : is_correct === true ? this.correct_delta : this.incorrect_delta;
    const scoreAfter = scoreBefore + scoreDelta;
    this.current_score = scoreAfter;
    return {
      score_before: scoreBefore,
      score_after: scoreAfter,
      score_delta: scoreDelta
    };
  }

  record_trial(record: Record<string, unknown>): void {
    this.trial_count_total += 1;
    this.trial_count_block += 1;
    this.histories.push({ ...record });
  }
}

function safeInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function coerceCards(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return null;
  }
  const cards = raw.map((token) => (String(token).trim() === "1" || token === 1 || token === true ? 1 : 0));
  if (cards.reduce<number>((sum, value) => sum + value, 0) <= 0) {
    return null;
  }
  return [cards[0], cards[1], cards[2], cards[3]];
}

function parse_patterns(raw: unknown): PatternSpec[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_PATTERNS];
  }
  const parsed: PatternSpec[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }
    const spec = item as Record<string, unknown>;
    const cards = coerceCards(spec.cards);
    if (cards == null) {
      return;
    }
    const patternId = String(spec.pattern_id ?? `P${String(index + 1).padStart(2, "0")}`).trim();
    parsed.push({
      pattern_id: patternId.length > 0 ? patternId : `P${String(index + 1).padStart(2, "0")}`,
      cards,
      sun_probability: clamp(Number(spec.sun_probability ?? 0.5), 0, 1),
      weight: Math.max(1e-6, Number(spec.weight ?? 1))
    });
  });
  return parsed.length > 0 ? parsed : [...DEFAULT_PATTERNS];
}

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
