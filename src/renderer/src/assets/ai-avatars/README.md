# AI co-author avatars

Official product marks retrieved on 2026-09-20:

- Claude: https://claude.ai/favicon.svg
- OpenAI / ChatGPT / Codex: https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg
- Gemini: https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg
  (favicon linked by https://gemini.google.com/)

The SVG paths and Gemini gradients are preserved. The OpenAI favicon's
system-theme stylesheet is replaced with its black fill, since the avatar
uses a fixed white background. `utils/aiAvatars.ts` adds that background and
padding around all three marks so they also fit circular graph avatars.

These assets identify commit authors; the respective brands retain ownership
of their trademarks. They are bundled locally, with no runtime CDN request.
GitHub identities such as Copilot continue through the normal avatar resolver.
