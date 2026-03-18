import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import type { Controller, PatternSpec, ScoreUpdate } from "./controller";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function addCueCards(
  trial: TrialBuilder["unit"] extends (...args: any) => infer R ? R : never,
  stimBank: StimBank,
  cards: [number, number, number, number],
  cardLabels: string[],
  onLabel: string,
  offLabel: string
): void {
  const positions: Array<[number, number]> = [
    [-390, 70],
    [-130, 70],
    [130, 70],
    [390, 70]
  ];
  cards.forEach((state, index) => {
    const cardLabel = cardLabels[index] ?? `Card ${index + 1}`;
    const stateLabel = state === 1 ? onLabel : offLabel;
    const cardColor = state === 1 ? "#f7e074" : "#a8a8a8";
    trial.addStim(
      stimBank.rebuild("cue_card_template", {
        text: `${cardLabel}\n${stateLabel}`,
        pos: positions[index],
        color: cardColor
      })
    );
  });
}

function scorePreview(controller: Controller, currentScore: number, isCorrect: boolean | null): ScoreUpdate {
  const delta =
    isCorrect == null ? controller.timeout_delta : isCorrect === true ? controller.correct_delta : controller.incorrect_delta;
  return {
    score_before: currentScore,
    score_after: currentScore + delta,
    score_delta: delta
  };
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    controller: Controller;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, controller, block_id, block_idx } = context;
  const conditionName = String(condition).trim().toLowerCase();
  const trialId = controller.next_trial_id();
  const pattern: PatternSpec = controller.draw_pattern();
  const actualWeather = controller.sample_weather(pattern);
  const cards = pattern.cards;
  const cardCode = cards.map((value) => String(value)).join("");

  const sunKey = String(settings.sun_key ?? "f").trim().toLowerCase();
  const rainKey = String(settings.rain_key ?? "j").trim().toLowerCase();
  const responseKeys = [sunKey, rainKey];

  const weatherLabels = asRecord(settings.weather_labels);
  const sunLabel = String(weatherLabels.sun ?? "sun");
  const rainLabel = String(weatherLabels.rain ?? "rain");
  const actualWeatherLabel = actualWeather === "sun" ? sunLabel : rainLabel;

  const cardLabelsRaw = asArray(settings.card_labels).map((value) => String(value));
  const cardLabels = cardLabelsRaw.length >= 4 ? cardLabelsRaw : ["Card 1", "Card 2", "Card 3", "Card 4"];
  const cardStateLabels = asRecord(settings.card_state_labels);
  const onLabel = String(cardStateLabels.on ?? "on");
  const offLabel = String(cardStateLabels.off ?? "off");

  const fixationDuration = controller.sample_duration(settings.fixation_duration, 0.45);
  const cueDuration = Number(settings.cue_duration ?? 0.8);
  const decisionDeadline = Number(settings.decision_deadline ?? 2.5);
  const feedbackDuration = Number(settings.feedback_duration ?? 1.0);
  const itiDuration = controller.sample_duration(settings.iti_duration, 0.45);
  const currentScore = Number(controller.current_score);

  const fixation = trial.unit("fixation").addStim(stimBank.get("fixation"));
  set_trial_context(fixation, {
    trial_id: trialId,
    phase: "fixation",
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "fixation",
      pattern_id: pattern.pattern_id,
      cards: [...cards],
      sun_probability: pattern.sun_probability,
      block_idx
    },
    stim_id: "fixation"
  });
  fixation.show({ duration: fixationDuration }).to_dict();

  const cue = trial
    .unit("cue")
    .addStim(stimBank.get("cue_title"))
    .addStim(stimBank.get_and_format("score_text", { current_score: currentScore }));
  addCueCards(cue, stimBank, cards, cardLabels, onLabel, offLabel);
  cue.addStim(stimBank.get("cue_hint"));
  set_trial_context(cue, {
    trial_id: trialId,
    phase: "cue",
    deadline_s: cueDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "cue",
      pattern_id: pattern.pattern_id,
      cards: [...cards],
      sun_probability: pattern.sun_probability,
      current_score: currentScore,
      block_idx
    },
    stim_id: "cue_title+score_text+cue_card_template*4+cue_hint"
  });
  cue.show({ duration: cueDuration }).to_dict();

  const decision = trial
    .unit("decision")
    .addStim(stimBank.get_and_format("score_text", { current_score: currentScore }));
  addCueCards(decision, stimBank, cards, cardLabels, onLabel, offLabel);
  decision
    .addStim(stimBank.get("decision_prompt"))
    .addStim(
      stimBank.get_and_format("key_hint", {
        sun_key: sunKey.toUpperCase(),
        rain_key: rainKey.toUpperCase(),
        sun_label: sunLabel,
        rain_label: rainLabel
      })
    );
  set_trial_context(decision, {
    trial_id: trialId,
    phase: "decision",
    deadline_s: decisionDeadline,
    valid_keys: responseKeys,
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "decision",
      pattern_id: pattern.pattern_id,
      cards: [...cards],
      sun_probability: pattern.sun_probability,
      sun_key: sunKey,
      rain_key: rainKey,
      block_idx
    },
    stim_id: "score_text+cue_card_template*4+decision_prompt+key_hint"
  });
  decision
    .captureResponse({
      keys: responseKeys,
      correct_keys: [sunKey, rainKey],
      duration: decisionDeadline
    })
    .set_state({
      response_key: (snapshot: TrialSnapshot) => String(snapshot.units.decision?.response ?? "").trim().toLowerCase(),
      timed_out: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        return key !== sunKey && key !== rainKey;
      },
      predicted_weather: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        if (key === sunKey) {
          return "sun";
        }
        if (key === rainKey) {
          return "rain";
        }
        return "none";
      },
      predicted_weather_cn: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        if (key === sunKey) {
          return sunLabel;
        }
        if (key === rainKey) {
          return rainLabel;
        }
        return "none";
      },
      is_correct: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        if (key !== sunKey && key !== rainKey) {
          return null;
        }
        const predicted = key === sunKey ? "sun" : "rain";
        return predicted === actualWeather;
      },
      score_preview: (snapshot: TrialSnapshot) => {
        const isCorrectRaw = snapshot.units.decision?.is_correct;
        const isCorrect = isCorrectRaw == null ? null : Boolean(isCorrectRaw);
        return scorePreview(controller, currentScore, isCorrect);
      }
    })
    .to_dict();

  const feedback = trial.unit("feedback").addStim((snapshot: TrialSnapshot) => {
    const timedOut = Boolean(snapshot.units.decision?.timed_out ?? true);
    const preview = (snapshot.units.decision?.score_preview as ScoreUpdate | undefined) ?? scorePreview(controller, currentScore, null);
    if (timedOut) {
      return stimBank.get_and_format("feedback_timeout", {
        actual_weather_cn: actualWeatherLabel,
        score_after: preview.score_after
      });
    }
    const isCorrect = Boolean(snapshot.units.decision?.is_correct ?? false);
    const feedbackStimId = isCorrect ? "feedback_correct" : "feedback_incorrect";
    return stimBank.get_and_format(feedbackStimId, {
      predicted_weather_cn: String(snapshot.units.decision?.predicted_weather_cn ?? "none"),
      actual_weather_cn: actualWeatherLabel,
      score_delta_signed: signed(preview.score_delta),
      score_after: preview.score_after
    });
  });
  set_trial_context(feedback, {
    trial_id: trialId,
    phase: "feedback",
    deadline_s: feedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "feedback",
      pattern_id: pattern.pattern_id,
      actual_weather: actualWeather,
      block_idx
    },
    stim_id: "feedback"
  });
  feedback.show({ duration: feedbackDuration }).to_dict();

  const iti = trial.unit("inter_trial_interval").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trialId,
    phase: "inter_trial_interval",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "inter_trial_interval",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const responseKey = String(snapshot.units.decision?.response_key ?? "").trim().toLowerCase();
    const timedOut = Boolean(snapshot.units.decision?.timed_out ?? true);
    const predictedWeather = String(snapshot.units.decision?.predicted_weather ?? "none");
    const predictedWeatherCn = String(snapshot.units.decision?.predicted_weather_cn ?? "none");
    const isCorrectRaw = snapshot.units.decision?.is_correct;
    const isCorrect = isCorrectRaw == null ? null : Boolean(isCorrectRaw);
    const scoreUpdate = controller.apply_score(isCorrect);
    const rt = snapshot.units.decision?.rt;
    const keyPress = snapshot.units.decision?.key_press;

    helpers.setTrialState("condition", conditionName);
    helpers.setTrialState("trial_id", trialId);
    helpers.setTrialState("block_id", block_id);
    helpers.setTrialState("block_idx", block_idx);
    helpers.setTrialState("pattern_id", pattern.pattern_id);
    helpers.setTrialState("pattern_cards", cardCode);
    helpers.setTrialState("card_1", cards[0]);
    helpers.setTrialState("card_2", cards[1]);
    helpers.setTrialState("card_3", cards[2]);
    helpers.setTrialState("card_4", cards[3]);
    helpers.setTrialState("sun_probability", pattern.sun_probability);
    helpers.setTrialState("actual_weather", actualWeather);
    helpers.setTrialState("actual_weather_cn", actualWeatherLabel);

    helpers.setTrialState("response_key", timedOut ? "" : responseKey);
    helpers.setTrialState("decision_response", timedOut ? "" : responseKey);
    helpers.setTrialState("decision_key_press", typeof keyPress === "boolean" ? keyPress : !timedOut);
    helpers.setTrialState("decision_rt", typeof rt === "number" ? rt : null);
    helpers.setTrialState("decision_rt_s", typeof rt === "number" ? rt : null);
    helpers.setTrialState("decision_timed_out", timedOut);
    helpers.setTrialState("predicted_weather", predictedWeather);
    helpers.setTrialState("predicted_weather_cn", predictedWeatherCn);
    helpers.setTrialState("is_correct", isCorrect);
    helpers.setTrialState("score_before", scoreUpdate.score_before);
    helpers.setTrialState("score_after", scoreUpdate.score_after);
    helpers.setTrialState("score_delta", scoreUpdate.score_delta);
    helpers.setTrialState("score_delta_signed", signed(scoreUpdate.score_delta));

    controller.record_trial({
      condition: conditionName,
      trial_id: trialId,
      block_id,
      block_idx,
      pattern_id: pattern.pattern_id,
      pattern_cards: cardCode,
      card_1: cards[0],
      card_2: cards[1],
      card_3: cards[2],
      card_4: cards[3],
      sun_probability: pattern.sun_probability,
      actual_weather: actualWeather,
      actual_weather_cn: actualWeatherLabel,
      response_key: timedOut ? "" : responseKey,
      decision_response: timedOut ? "" : responseKey,
      decision_key_press: typeof keyPress === "boolean" ? keyPress : !timedOut,
      decision_rt: typeof rt === "number" ? rt : null,
      decision_rt_s: typeof rt === "number" ? rt : null,
      decision_timed_out: timedOut,
      predicted_weather: predictedWeather,
      predicted_weather_cn: predictedWeatherCn,
      is_correct: isCorrect,
      score_before: scoreUpdate.score_before,
      score_after: scoreUpdate.score_after,
      score_delta: scoreUpdate.score_delta
    });
  });

  return trial;
}
