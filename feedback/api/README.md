# Backend для обратной связи

Frontend отправляет форму на `/api/feedback`. Так как сайт работает на GitHub Pages, запись в репозиторий нужно делать через отдельный backend, где GitHub token хранится как секрет.

Готовый пример находится в `cloudflare-worker.mjs`.

## Переменные окружения

- `GITHUB_TOKEN` - fine-grained token с правом `Contents: Read and write` для репозитория.
- `GITHUB_OWNER` - `aim123qqq-cpu`.
- `GITHUB_REPO` - `graphql-visualize`.
- `GITHUB_BRANCH` - обычно `main`.
- `CORS_ORIGIN` - `https://graphql-visual.ru`.

## Подключение к сайту

После публикации endpoint нужно направить на `/api/feedback` или задать в HTML до подключения `feedback-patch.js`:

```html
<script>
  window.GRAPHQL_VISUALIZER_FEEDBACK_ENDPOINT = "https://your-worker.example.workers.dev/api/feedback";
</script>
```
