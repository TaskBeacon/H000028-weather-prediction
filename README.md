# H000028 Weather Prediction Task

HTML/browser preview of the probabilistic Weather Prediction task built with `psyflow-web`.
Cue-pattern sampling, probabilistic weather outcomes (`sun/rain`), response/timeout scoring, and block-level summaries are aligned to local `T000028-weather-prediction`.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/controller.ts`: pattern sampling and scoring controller
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: block/overall summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000028-weather-prediction
```
