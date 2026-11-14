# Фото для страницы «Отделка»

14 ноября 2026 все кадры блоков «Отделки» сгенерированы в Codex (встроенная генерация изображений) вместо фото из портфолио gkvesmir.ru: Иван посчитал те фото чужими, взятыми из интернета. Лента «Наши интерьеры» осталась на фото портфолио.

На странице каждый такой кадр подписан «Визуализация», в описании для незрячих тоже стоит «Визуализация: …». Так принято в проекте: сгенерированный кадр нельзя выдавать за реальный объект.

Исходники: `design/sources/otdelka/*.webp` (сжатые PNG из Codex, 1536×1024 и 1024×1536). Размеры для сайта собирает `node scripts/prepare-otdelka.mjs`, результат в `public/images/otdelka/`. Метку версии в адрес картинки сборка ставит сама.

| Кадр | Где на странице | Файлы на сайте |
|---|---|---|
| `gostinaya` | первый экран, большая плитка | `gostinaya-1536/1100/800.webp` |
| `materialy` | плитка «Детали по чертежам» | `materialy-1200/800.webp` |
| `chernovaya` | состав работ: черновая отделка | `chernovaya-1200.webp`, `chernovaya-thumb.webp` |
| `inzheneriya` | состав работ: инженерия | `inzheneriya-1200.webp`, `inzheneriya-thumb.webp` |
| `chistovaya` | состав работ: чистовая отделка | `chistovaya-1200.webp`, `chistovaya-thumb.webp` |
| `mebel` | состав работ: мебель и свет | `mebel-1200.webp`, `mebel-thumb.webp` |
| `nadzor` | состав работ: авторский надзор | `nadzor-1200.webp`, `nadzor-thumb.webp` |
| `korobka` | «Что проверяем в доме до старта» | `korobka-1024/640.webp` |

Номера на фото коробки стоят в `otdelka/index.html`, блок `otd-check-dots`: у каждой метки координаты `--x` и `--y` в процентах от целого кадра (1 стык стены и потолка, 2 стяжка, 3 выводы труб и кабелей, 4 откос окна). Если кадр заменить, координаты нужно поправить под новый.

## Как заменить кадр

1. Сгенерировать новый вариант промптом ниже (или своим) и положить в `design/sources/otdelka/<имя>.webp` или `.png`.
2. Запустить `node scripts/prepare-otdelka.mjs`, собрать сайт и проверить `npm run check`.
3. Подпись «Визуализация» и описание в `alt` оставить.

## Промпт, которым сделаны кадры

Запуск: `codex exec` из приложения ChatGPT (`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`), задание целиком:

```
Generate 8 photorealistic photos for the "Interior finishing" page of a Moscow-region construction company website.

How to work:
- Use your built-in image generation tool for every image. Do not draw with code, do not use placeholders, do not download images from the internet.
- Generate the images one by one in the order below. After each one, copy the generated file into the current working directory as a PNG with exactly the file name given (Codex keeps generated images under ~/.codex/generated_images or reports the saved path; copy from there).
- Do not create, edit or delete any other files. Do not write scripts.
- When all 8 are saved, reply with one line per file: file name and pixel size.

Common style, apply to every image:
Photorealistic architectural and interior photography of a modern country house near Moscow. Warm natural oak, light warm-white plastered walls, soft diffused daylight from large windows, calm premium editorial real-estate look, true-to-life colours, realistic materials and small imperfections, full-frame camera, 24-35 mm lens, eye level, straight verticals. People only seen from behind or cropped, never a visible face. No text, no logos, no brand names, no watermark, no UI, no collage, no fisheye, no CGI or render look.

1. gostinaya.png, landscape 1536x1024.
A bright spacious living room of a country house right after the finishing works: wide-plank natural oak floor, warm-white plastered walls, built-in oak shelving with a few books and ceramics, a low linen sofa with cushions, an oak coffee table, a wool rug, floor-to-ceiling windows with soft daylight and pine trees outside. The left third of the frame is calm and uncluttered (plain wall and window light); the sofa, table and shelving sit in the centre and right.

2. materialy.png, landscape 1536x1024.
Still life of finishing material samples on a light oak table near a window: oak parquet planks, a travertine tile, a decorative plaster sample board, a linen fabric swatch, a brushed brass handle and a fan of paint swatches. Soft side daylight, shallow depth of field. The samples fill the upper two thirds of the frame; the lower third is calm table surface.

3. chernovaya.png, landscape 1536x1024.
Rough finishing inside the bare shell of a new country house: freshly levelled cement floor screed, smooth grey gypsum plaster on the walls with metal plaster beacons, a plasterboard partition frame in progress, a laser level on a tripod projecting a red line on the wall, clean and orderly site, daylight from window openings.

4. inzheneriya.png, landscape 1536x1024.
Engineering works before the walls are closed in a country house: neat red and blue PEX water pipes and grey corrugated electrical conduits fixed along a plastered wall and the floor, an open electrical distribution panel with neatly labelled cables, a heating manifold with valves, everything tidy and parallel, daylight.

5. chistovaya.png, landscape 1536x1024.
Finishing works in a bright room of a country house: a craftsman seen from behind, kneeling, laying oak parquet in a herringbone pattern; a paint roller and tray on a protective sheet; freshly painted warm-white walls; soft daylight.

6. mebel.png, landscape 1536x1024.
A kitchen made of natural oak in a country house: tall built-in oak cabinets with integrated appliances, an island with a light stone countertop, warm LED strip lighting under the cabinets and two pendant lamps, a large window with daylight and pine trees outside.

7. nadzor.png, landscape 1536x1024.
A designer seen from behind, no face visible, holding large printed interior drawings and comparing them with a finished built-in oak wall niche with shelves and lighting in a light room; a tape measure and a tablet showing the same drawing on a trestle table nearby; daylight.

8. korobka.png, portrait 1024x1536.
Vertical photo inside the shell of a newly built country house before finishing: grey plastered walls, a ceiling with exposed timber joists, a raw cement floor screed, electrical cables and pipe stubs coming out of the lower part of the left wall, and one clearly visible window opening with unfinished plaster reveals on the right wall. A laser distance meter lies on the floor. Keep clearly separate zones: the wall and ceiling junction in the upper third, the window opening in the middle right, cables and pipe stubs at the lower left, an empty area of floor screed at the bottom centre.
```
