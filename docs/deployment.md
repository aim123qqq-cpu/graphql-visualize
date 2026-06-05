# Деплой, домен и HTTPS

Проект размещается через GitHub Pages.

Текущий домен:

https://graphql-visual.ru/

## Общая схема деплоя

1. Файлы сайта лежат в репозитории GitHub.
2. GitHub Pages публикует статический сайт.
3. Домен `graphql-visual.ru` указывает на GitHub Pages.
4. HTTPS включен в настройках GitHub Pages.

## DNS для GitHub Pages

Для apex-домена `graphql-visual.ru` обычно используются A-записи GitHub Pages:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Для `www.graphql-visual.ru` используется CNAME:

```text
aim123qqq-cpu.github.io
```

В репозитории должен быть файл `CNAME`:

```text
graphql-visual.ru
```

## HTTPS

После настройки DNS в GitHub Pages нужно включить:

- Custom domain: `graphql-visual.ru`
- Enforce HTTPS: включено

Если GitHub пишет `InvalidDNSError`, значит DNS еще не обновился или записи настроены неверно.

## Кэш GitHub Pages

GitHub Pages и браузер могут некоторое время отдавать старые JS/HTML-файлы. Для этого в проекте у скриптов используются версии в query string:

```html
<script src="field-edge-patch.js?v=6ce692a"></script>
```

Если обновление не видно сразу:

1. Подождите 1-3 минуты.
2. Выполните `Ctrl+F5`.
3. Проверьте прямой URL JS-файла с версией.
