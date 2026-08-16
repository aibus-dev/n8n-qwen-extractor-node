# n8n-nodes-qwen-extractor

An [n8n](https://n8n.io) community node that extracts structured data from conversation transcripts and free text using **Qwen** with **strict JSON Schema** output.

## Features

- **Any schema** — paste any JSON Schema (orders, leads, invoices, tickets…). The model is forced to match it via `response_format: json_schema` with `strict: true`.
- **Live model dropdown** — loaded from the credential's `/models` endpoint, with JSON Schema-capable models listed first and the rest clearly flagged. Falls back to a built-in list when the endpoint has no such route.
- **Fails before it spends tokens** — empty input, missing model, and malformed schemas are rejected before the API call.
- **No silent empty results** — an empty response, a content-filter block, or a reply that landed in `reasoning_content` raises a clear error instead of returning `{}`.
- **Token and duration tracking** — a summary line in the output pane, including cached tokens.
- **Clean output** — only the fields in your schema, flat at the root.

## Requirements

- Node.js **>= 22.16** (required by `@n8n/node-cli` — see `.nvmrc`).
- An API key from Alibaba Cloud Model Studio (DashScope), or any OpenAI-compatible gateway serving Qwen.

## Installation

Follow the [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and enter the package name `n8n-nodes-qwen-structured-extractor`.

## Credentials

This node uses the **Qwen Structured Extractor API** credential owned by this package (type `qwenStructuredExtractorApi`). It is **not shared** with the `qwenApi` credential from `n8n-nodes-azbot-qwen-model` — both packages can be installed on the same n8n instance without interfering.

| Field | Description |
| --- | --- |
| API Key | Your `sk-...` key from Alibaba Cloud Model Studio (DashScope) or another OpenAI-compatible gateway |
| Base URL | Defaults to `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |

The credential's **Test** button calls `GET /models`.

## Choosing a model — IMPORTANT

This node **always** sends `response_format: {"type": "json_schema", "strict": true}`. Per the [Alibaba documentation](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output), JSON Schema mode is supported only by:

- the `qwen3.7-plus` series
- the `qwen3.7-max` series
- the `qwen3.8-max` series

Every other model (`qwen-turbo`, `qwen-plus`, `qwen-max`, and the older aliases) supports `json_object` at best and will answer this node with a **400**. The dropdown still lists them, marked *"may reject"*; embedding, image, and speech models are hidden entirely because they cannot serve a `chat/completions` call.

## Usage

Drag the **Qwen Structured Data Extractor** node onto the canvas, attach the credential, then fill in the parameters below.

## Parameters

- **Model Name or ID** — loaded from `/models`. Switch the field to Expression mode to use an ID that isn't listed.
- **System Prompt** — what you want the model to do.
- **User Input / Conversation History** — an expression pointing at the conversation, e.g. `{{ $json.chat_log }}`.
- **JSON Schema Output** — the schema the output must conform to.

### Options

| Option | Default | Effect |
| --- | --- | --- |
| Auto Ensure JSON Keyword | `true` | Appends the word "JSON" to the system prompt. Required by `json_object` mode; `json_schema` mode does not need it. |
| Disable Thinking Mode | `true` | Sends `enable_thinking: false`. DashScope **rejects** non-streaming calls to Qwen3 reasoning models without it, and thinking mode makes JSON output less reliable. Turn off only if a model rejects the parameter. |
| Include Execution Trace | `false` | Adds a `meta` key with per-step durations and the token breakdown. If your schema already has a `meta` field, the trace moves to `_meta` instead of overwriting it. |
| Include Raw Request/Response | `false` | Adds the outgoing payload and raw response to `meta`. Only applies when Include Execution Trace is on. |
| Output Key Name | *(empty)* | Wraps the extracted data in a single key instead of emitting it flat. **Required** if your schema's root is an array. |
| Schema Name | `extracted_data` | Identifier for the schema inside the API payload. |
| Temperature | `0` | Keep at 0 for consistent extraction. |

## Output

By default, exactly the fields in your schema:

```json
{ "amount": 2, "size": "L", "phone": "0900..." }
```

Token counts are deliberately **kept out** of the output so the item shape stays valid under `additionalProperties: false`. Read them from the output pane summary instead:

```
2/2 items in 2.4s | ~1087 tokens (prompt 912 / completion 175) | 640 cached
```

Turn on **Include Execution Trace** to get `meta.tokens` for cost accounting.

## Qwen-specific tuning notes

- **Don't put per-item expressions in the System Prompt.** DashScope's implicit context cache matches on a shared *prefix* (≥1024 tokens, ~2000 for Qwen3.7) and bills cache hits at 10%. The system prompt must be identical across items for the cache to hit — everything that varies belongs in User Input.
- **The node never sends `max_tokens`.** Alibaba's docs state it truncates the JSON mid-output when structured output is on. This is deliberate — don't add it.
- **Strict mode:** Alibaba *recommends* `additionalProperties: false` and listing fields in `required`. The node warns when they're absent but still runs.
- **Thinking models can leak reasoning into `content`.** The node strips prose around the JSON automatically, but leaving **Disable Thinking Mode** on is the reliable fix.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| 400 mentioning `enable_thinking` | The model requires this parameter on non-streaming calls. Turn on **Disable Thinking Mode**. |
| 400 mentioning `response_format` / `json_schema` | The model does not support strict JSON Schema. Switch to `qwen3.7-plus`, `qwen3.7-max`, or `qwen3.8-max`. |
| 400 `messages must contain the word json` | The system prompt lacks the word "json". Turn on **Auto Ensure JSON Keyword**. |
| `Qwen returned no content` | Empty response — a content filter, or the model replied in `reasoning_content`. The error message names the cause. |
| `Qwen returned an array at the top level` | Your schema's root is an array. Set **Output Key Name** to wrap it. |
| `"User Input / Conversation History" is empty` | The expression doesn't point at the field holding the conversation. |
| `No model selected` | Open the dropdown and pick a model — the node ships no default. |
| JSON parse failure with `finish_reason=length` | The output was cut off. Shorten the input or simplify the schema. |
| Credential doesn't appear | Restart n8n after updating the package. |

## Development

```bash
nvm use                # Node >= 22.16, see .nvmrc
npm install
npm run dev            # n8n at http://localhost:5678, hot reload
npm run build
npm test
npm run lint
```

> Node < 22.12 makes `n8n-node build/lint/dev` fail with `ERR_REQUIRE_ESM` — that's why `engines` and `.nvmrc` exist.

## License

[MIT](LICENSE)
