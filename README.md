# n8n-nodes-qwen-structured-extractor

n8n community node trích xuất dữ liệu có cấu trúc từ lịch sử hội thoại/văn bản bằng **Qwen** và **JSON Schema strict**.

## Tính năng

- **Schema tuỳ ý** — dán bất kỳ JSON Schema nào (đơn hàng, lead, hoá đơn, vé...), model bị ép trả đúng cấu trúc bằng `response_format: json_schema` với `strict: true`.
- **Dropdown model động** — nạp trực tiếp từ endpoint `/models` của credential, model mới của Qwen tự xuất hiện. Endpoint không hỗ trợ route đó thì rơi về danh sách mặc định.
- **Chặn trước khi tốn token** — input rỗng, thiếu model hay schema hỏng bị báo lỗi trước khi gọi API.
- **Theo dõi token & thời lượng** — dòng tóm tắt hiện ngay ở output pane, kèm số token được cache.
- **Output sạch** — chỉ đúng các field trong schema, trải phẳng ở root.

## Cài đặt

Theo [hướng dẫn cài community node](https://docs.n8n.io/integrations/community-nodes/installation/), nhập tên package `n8n-nodes-qwen-structured-extractor`.

## Credentials

Node dùng credential **Qwen Structured Extractor API** do chính package này sở hữu (type `qwenStructuredExtractorApi`). Nó **không dùng chung** với credential `qwenApi` của `n8n-nodes-azbot-qwen-model` — hai package cài cùng một instance n8n vẫn độc lập.

| Trường | Mô tả |
| --- | --- |
| API Key | API key `sk-...` của Alibaba Cloud Model Studio (DashScope) hoặc gateway OpenAI-compatible khác |
| Base URL | Mặc định `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |

Nút **Test** của credential gọi `GET /models` để kiểm tra ngay.

## Sử dụng

Kéo node **Qwen Structured Data Extractor** ra canvas, gắn credential, rồi điền các tham số dưới đây.

## Tham số

- **Model Name or ID** — nạp động từ `/models`. Cần model ngoài danh sách thì chuyển ô sang Expression.
- **System Prompt** — nhiệm vụ của AI.
- **User Input / Conversation History** — expression chứa hội thoại, ví dụ `{{ $json.chat_log }}`.
- **JSON Schema Output** — schema kỳ vọng.

### Options

| Option | Mặc định | Tác dụng |
| --- | --- | --- |
| Auto Ensure JSON Keyword | `true` | Tự chèn từ khoá "JSON" vào system prompt. Qwen trả 400 nếu messages thiếu từ này. |
| Disable Thinking Mode | `true` | Gửi `enable_thinking: false`. DashScope **từ chối** lời gọi non-streaming tới model Qwen3 reasoning nếu thiếu, và thinking mode làm JSON kém tin cậy. Chỉ tắt khi model từ chối tham số này. |
| Include Execution Trace | `false` | Thêm key `meta` chứa thời lượng từng bước và breakdown token. |
| Include Raw Request/Response | `false` | Thêm payload gửi đi + phản hồi thô vào `meta`. Chỉ có tác dụng khi đã bật trace. |
| Output Key Name | *(trống)* | Bọc dữ liệu vào 1 key thay vì trải phẳng ở root. |
| Schema Name | `extracted_data` | Tên định danh schema trong payload API. |
| Temperature | `0` | Để 0 cho kết quả nhất quán. |

## Đầu ra

Mặc định chỉ đúng các field trong schema:

```json
{ "amount": 2, "size": "L", "phone": "0900..." }
```

Token cố ý **không** nằm trong output để schema giữ nguyên hình dạng khi đặt `additionalProperties: false`. Xem token ở dòng tóm tắt trên output pane:

```
2/2 items in 2.4s | ~1087 tokens (prompt 912 / completion 175) | 640 cached
```

Bật **Include Execution Trace** để lấy `meta.tokens` dùng cho việc tính chi phí.

## Lưu ý tối ưu cho Qwen

- **Đừng nhét expression theo item vào System Prompt.** Context cache ngầm của DashScope khớp theo *prefix* chung (≥1024 token, ~2000 với Qwen3.7) và tính token hit chỉ 10% giá. System prompt phải bất biến giữa các item thì cache mới ăn; phần thay đổi phải nằm ở User Input.
- **Node không bao giờ gửi `max_tokens`** — doc Alibaba ghi rõ nó cắt JSON giữa chừng khi bật structured output. Đây là chủ ý, đừng thêm vào.
- **Strict mode** yêu cầu schema có `additionalProperties: false` và `required` liệt kê **mọi** field. Thiếu thì node vẫn chạy nhưng cảnh báo.

## Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân |
| --- | --- |
| 400 nhắc `enable_thinking` | Model yêu cầu tham số này khi gọi non-streaming. Bật **Disable Thinking Mode**. |
| 400 `messages must contain the word json` | System prompt thiếu từ "json". Bật **Auto Ensure JSON Keyword**. |
| `"User Input / Conversation History" is empty` | Expression không trỏ đúng field chứa hội thoại. |
| `No model selected` | Mở dropdown chọn một model — node không ghim model mặc định. |
| JSON parse hỏng, `finish_reason=length` | Kết quả bị cắt. Rút gọn input hoặc đơn giản hoá schema. |
| Credential không hiện | Khởi động lại n8n sau khi cập nhật package. |

## Phát triển

```bash
npm install
npm run dev            # n8n ở http://localhost:5678, hot reload
npm run build
npm test
npm run lint
```

> `npm run lint` quét cả các thư mục công cụ dev nằm ngoài package published và báo lỗi ở đó. Tiêu chí đánh giá là **sạch trong `nodes/`, `credentials/`, `test/`**.

## License

[MIT](LICENSE)
