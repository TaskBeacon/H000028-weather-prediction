import type { ReducedTrialRow } from "psyflow-web";

export interface WeatherSummary {
  total_trials: number;
  accuracy: string;
  timeout_count: number;
  mean_rt_ms: number;
  response_count: number;
  sun_prediction_rate: string;
  score_end: number;
  net_score: number;
  net_score_signed: string;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function asFloat(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asInt(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function decisionRtS(row: ReducedTrialRow): number | null {
  const rtS = asFloat(row.decision_rt_s);
  if (rtS != null) {
    return rtS;
  }
  return asFloat(row.decision_rt);
}

function summarizeRows(rows: ReducedTrialRow[], fallbackScore = 0): WeatherSummary {
  if (rows.length === 0) {
    return {
      total_trials: 0,
      accuracy: "0.0%",
      timeout_count: 0,
      mean_rt_ms: 0,
      response_count: 0,
      sun_prediction_rate: "0.0%",
      score_end: fallbackScore,
      net_score: 0,
      net_score_signed: "0"
    };
  }

  const timeoutCount = rows.filter((row) => asBool(row.decision_timed_out)).length;
  const responseCount = rows.length - timeoutCount;
  const correctValues = rows
    .map((row) => row.is_correct)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => asBool(value));
  const accuracy = correctValues.length > 0 ? correctValues.filter(Boolean).length / correctValues.length : 0;

  const rtValues = rows.map((row) => decisionRtS(row)).filter((value): value is number => value != null);
  const meanRtMs = rtValues.length > 0 ? mean(rtValues) * 1000 : 0;

  const predictedValues = rows
    .map((row) => String(row.predicted_weather ?? "").trim().toLowerCase())
    .filter((value) => value === "sun" || value === "rain");
  const sunPredictionRate =
    predictedValues.length > 0 ? predictedValues.filter((value) => value === "sun").length / predictedValues.length : 0;

  let scoreEnd = fallbackScore;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].score_after != null) {
      scoreEnd = asInt(rows[index].score_after, fallbackScore);
      break;
    }
  }
  const netScore = rows.reduce((sum, row) => sum + asInt(row.score_delta, 0), 0);

  return {
    total_trials: rows.length,
    accuracy: `${(accuracy * 100).toFixed(1)}%`,
    timeout_count: timeoutCount,
    mean_rt_ms: Number(meanRtMs.toFixed(1)),
    response_count: responseCount,
    sun_prediction_rate: `${(sunPredictionRate * 100).toFixed(1)}%`,
    score_end: scoreEnd,
    net_score: netScore,
    net_score_signed: signed(netScore)
  };
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string, fallbackScore = 0): WeatherSummary {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  return summarizeRows(blockRows, fallbackScore);
}

export function summarizeOverall(rows: ReducedTrialRow[], fallbackScore = 0): WeatherSummary {
  return summarizeRows(rows, fallbackScore);
}
