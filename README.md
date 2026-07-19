# Semantic Contract Eval Studio

A local, synthetic evaluation studio for testing whether a data agent chooses the correct business
definition, respects permissions, cites evidence, handles freshness, and escalates ambiguity.

## Status

The project starts with a TypeScript API and React review shell. The next tasks add synthetic data,
semantic contracts, deterministic routes, and comparison graders.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

API health is available at `http://127.0.0.1:8787/api/health`; the web shell runs at the Vite URL.

```sh
npm run lint
npm run check
npm test
npm run build
```

All shipped fixtures will be synthetic. The project does not require model credentials or external
business data for its deterministic evaluation workflow.
