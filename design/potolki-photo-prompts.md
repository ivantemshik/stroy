# Промпты для ChatGPT: фото страницы «Натяжные потолки и стены»

Все кадры 15 ноября сгенерированы в ChatGPT одним чатом, по одному промпту на кадр (1536×1024, вертикальные 1024×1536). Исходники лежат в `design/sources/potolki/`, на сайт их режет `node scripts/prepare-potolki.mjs` (результат в `public/images/potolki/`). На сайте у всех кадров в описании картинки стоит «Визуализация»: это не фото работ компании. Когда появятся настоящие фото объектов, их нужно поставить на место этих кадров.

Как перегенерировать кадр: открыть новый чат, вставить промпт целиком, при необходимости написать «ещё вариант» или поправить словами, скачать и положить файл в `design/sources/potolki/` под тем же именем, затем запустить скрипт.

## `hero`: первый экран

```
Create an image. Landscape 3:2 photo. A spacious bright living room of a modern country house near Moscow, the hero of the picture is a seamless matte white stretch ceiling: perfectly flat, a thin shadow gap where it meets the walls, two slim recessed LED light lines running across the ceiling and a few small flush spotlights. The camera is slightly low so the ceiling fills the upper half of the frame. Warm-white plastered walls, wide-plank natural oak floor, a low linen sofa and an oak coffee table, large black-framed floor-to-ceiling windows with pine trees outside, soft daylight. The left third of the frame is calm and uncluttered (plain wall and soft window light) because a website headline will sit there; furniture is in the centre and right. Photorealistic editorial interior photography, true-to-life colours, realistic materials and small imperfections, full-frame camera, 20 mm lens, straight verticals. No people, no text, no logos, no watermark, no collage, no fisheye, no CGI or render look.
```

## `hero-mobile`: первый экран на телефоне (в том же чате, сразу после `hero`)

```
Great. Now create the same living room as a vertical 2:3 photo for a phone screen: the same matte white stretch ceiling with the two recessed LED light lines and small spotlights, the same oak floor, linen sofa and pine trees in the window. The ceiling with the light lines fills the upper half of the frame and stays calm and uncluttered there, because a headline will sit over it; the sofa, coffee table and window are in the lower half. Same photographic style, same light, same colours. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## `matovyy`: карточка «Матовый»

```
Next image, a new room, same photographic style. Landscape 3:2 photo. A calm bedroom in a country house near Moscow with a seamless matte white stretch ceiling that looks like a perfectly painted flat ceiling: no reflections, a thin shadow gap along the walls, four small flush recessed spotlights. A bed with natural linen bedding, an oak bedside table with a ceramic lamp, warm-white plastered walls, a large window with soft daylight and pine trees outside. The camera is slightly low so the ceiling takes the upper half of the frame. Photorealistic editorial interior photography, true-to-life colours, full-frame camera, 20 mm lens, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## `paryashchiy`: карточка «Парящий»

```
Next image, a new room, same photographic style. Landscape 3:2 photo. Evening in the living room of a modern country house: a floating white stretch ceiling, a continuous warm LED strip hidden in a recess along the whole perimeter of the ceiling makes it look as if the ceiling floats in the air, soft warm glow on the upper part of the walls, no chandelier. A large linen sofa, an oak sideboard, a wool rug, big black-framed windows with blue dusk and dark pine trees outside. The ceiling and its glowing edge take the upper half of the frame. Photorealistic editorial interior photography, warm natural tones, realistic low-light exposure, full-frame camera, 20 mm lens, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## `linii`: карточка «Со световыми линиями»

```
Next image, a new room, same photographic style. Landscape 3:2 photo. A kitchen and dining area of a modern country house with a matte white stretch ceiling with built-in geometric LED light lines: several thin straight light lines set flush into the ceiling, forming a clean rectangular pattern above the dining table, plus one long line above the kitchen island. A natural oak kitchen with an island and a light stone countertop, an oak dining table with chairs, a large black-framed window with daylight and pine trees outside. The camera is slightly low so the ceiling and its light pattern fill the upper half of the frame. Photorealistic editorial interior photography, true-to-life colours, full-frame camera, 20 mm lens, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## `tkanevyy`: карточка «Тканевый»

```
Next image, same photographic style. Landscape 3:2 photo. A glazed covered veranda of a country house near Moscow in late autumn with a seamless fabric stretch ceiling: a fine matte woven textile texture in warm white, perfectly flat, with a few small flush spotlights. Large frameless glass walls with a view of pine trees and the garden, an oak lounge sofa with linen cushions, a wool throw, a low wooden table with a teapot, natural stone floor tiles. The ceiling takes the upper half of the frame. Photorealistic editorial architectural photography, soft overcast daylight, true-to-life colours, full-frame camera, 20 mm lens, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## `stena`: блок «Натяжные стены»

```
Next image, same photographic style. Landscape 3:2 photo. A spacious bathroom of a modern country house with a backlit stretch wall: the whole wall behind a freestanding white stone bathtub is a seamless translucent white stretch membrane evenly lit from behind, glowing softly like a light box, no visible seams, no bright spots. Warm-white microcement on the other walls, an oak vanity with a stone basin, a large window with frosted lower part and pine trees above, soft evening light. The glowing wall takes the left half of the frame. Photorealistic editorial interior photography, true-to-life colours, full-frame camera, 24 mm lens, eye level, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## `faq`: плитка «Не нашли ответ?» у вопросов, вертикальный кадр

```
Last image, same photographic style. Vertical 2:3 photo. A close architectural detail looking up at the corner of a room in a country house: a perfectly flat matte white stretch ceiling meets a warm-white plastered wall with a thin, crisp shadow gap, a slim recessed LED light line runs along the ceiling parallel to the wall, one small flush spotlight, and the top of a large black-framed window with pine branches outside at the side. Calm minimal composition with a lot of clean ceiling surface; the lower third of the frame is a plain calm wall because text will sit over it. Soft daylight, photorealistic editorial architectural photography, true-to-life colours, full-frame camera, 24 mm lens. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```
