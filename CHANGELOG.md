# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Model capability awareness for strict JSON Schema output. The node knows that Alibaba
  documents `response_format: json_schema` only for the `qwen3.7-plus`, `qwen3.7-max` and
  `qwen3.8-max` series, and surfaces that in the UI (`genericFunctions.ts`).
- `extractJsonPayload()` — a balanced-brace scanner that pulls the JSON value out of a reply
  carrying prose around it, so thinking models that leak reasoning into `message.content` no
  longer fail to parse (`requestBody.ts`).
- Explicit error when a response carries no content, naming the actual cause:
  `finish_reason=content_filter`, `finish_reason=length`, or an answer that landed in
  `reasoning_content` instead of `content` (`extractItem.ts`).
- Explicit error when the model returns a non-object at the top level (array, string, null),
  pointing at the **Output Key Name** option instead of silently spreading it into the item.
- Execution hint for 400s mentioning `json_schema` / `response_format`, telling the user which
  models actually accept strict schema output (`executionHints.ts`).
- `engines.node: ">=22.16"` and an `.nvmrc` pinning `22.18.0`. Node < 22.12 makes
  `n8n-node build/lint/dev` fail with `ERR_REQUIRE_ESM`.
- Full README covering setup, parameters, output shape, Qwen-specific tuning notes
  (prefix caching, no `max_tokens`, strict-mode recommendations) and a troubleshooting table.

### Changed

- The `/models` dropdown now sorts JSON Schema-capable models first, annotates every entry as
  either "Supports strict JSON Schema output" or "may reject this node with a 400", and hides
  ids that cannot serve a `chat/completions` call (embedding, rerank, image, speech, OCR, video).
- Fallback model list replaced `qwen-plus` / `qwen-turbo` / `qwen-max` with `qwen3.7-plus`,
  `qwen3.7-max` and `qwen3.8-max` — the older aliases are not documented for JSON Schema mode
  and answer this node with a 400.
- **Model Name or ID** description now states the JSON Schema requirement up front.
- Credential `documentationUrl` points at the English Model Studio docs instead of the Chinese
  `help.aliyun.com` page.
- `@n8n/node-cli` pinned to `^0.43.4` (was `*`).

### Fixed

- Trace metadata no longer overwrites an extracted field named `meta`. With
  **Include Execution Trace** on, the trace moves to `_meta` (then `_meta2`, …) when the key is
  already taken by the schema output.
- An empty or whitespace-only `content` used to be parsed as `{}` and returned as a successful
  empty item; it now raises an error.

## [0.1.0] - 2026-08-14

### Added

- Initial **Qwen Structured Data Extractor** node: extracts structured data from conversation
  transcripts and free text using Qwen with `response_format: {"type": "json_schema",
  "strict": true}`.
- `Qwen Structured Extractor API` credential (type `qwenStructuredExtractorApi`) with API key
  and base URL, defaulting to `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, and a
  `GET /models` credential test.
- Live model dropdown loaded from the credential's `/models` endpoint, with a built-in fallback
  list when the endpoint does not implement that route.
- Pre-flight validation of input, model selection and JSON Schema, so bad configuration fails
  before any tokens are spent.
- Execution tracer with per-step durations and a token summary (prompt / completion / cached)
  in the output pane.
- Options: Auto Ensure JSON Keyword, Disable Thinking Mode (`enable_thinking: false`, required
  by DashScope for non-streaming Qwen3 reasoning calls), Include Execution Trace, Include Raw
  Request/Response, Output Key Name, Schema Name, Temperature.
- Execution hints translating common DashScope 400s (`enable_thinking`, missing "json" keyword)
  into actionable messages.
- Jest test suite covering request-body construction, generic functions, the execution tracer
  and end-to-end node execution.

[Unreleased]: https://github.com/aibus-dev/n8n-qwen-extractor-node/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aibus-dev/n8n-qwen-extractor-node/releases/tag/v0.1.0
