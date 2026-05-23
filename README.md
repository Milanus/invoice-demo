# Invoice Demo

Small Next.js aggregator for the RunPod GLM + Qwen invoice demo.

## Environment

Copy `.env.example` to `.env.local` and set:

- `DEMO_ACCESS_PASSWORD`
- `RUNPOD_API_KEY`
- `RUNPOD_GLM_RUNSYNC_URL`
- `RUNPOD_QWEN_RUNSYNC_URL`
- optional `RUNPOD_TIMEOUT_MS`

`RUNPOD_API_KEY` must stay server-side only. Do not expose it through
`NEXT_PUBLIC_*` variables or client-side code.
`DEMO_ACCESS_PASSWORD` is also server-side only and is used for the login gate.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and upload a PDF, PNG, or JPG invoice.

## Tests

```bash
npm test
```

The test suite covers the merge policy and UI-state classification without
needing the full Next.js runtime.

## Build

```bash
npm run build
```

The production build is expected to pass without external font downloads.

## Vercel Notes

Set these environment variables only in the Vercel project server runtime:

- `DEMO_ACCESS_PASSWORD`
- `RUNPOD_API_KEY`
- `RUNPOD_GLM_RUNSYNC_URL`
- `RUNPOD_QWEN_RUNSYNC_URL`
- `RUNPOD_TIMEOUT_MS`

Before demo use, run one warm extraction against the deployed URL and verify the
response includes the expected verified, conflict, fallback, and failure states.
