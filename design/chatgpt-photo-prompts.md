# Промпты для ChatGPT: фото «Отделки» и «О компании»

Сейчас на сайте стоят кадры, которые 14 ноября сгенерировал Codex этими же промптами (1536×1024, вертикальный 1024×1536). Больше по пикселям ChatGPT не даст, у него тот же предел размера. Смысл перегенерировать только в том, чтобы выбрать более удачные варианты.

Как пользоваться:

1. В ChatGPT открыть новый чат, вставить один промпт целиком, дождаться картинки.
2. Если кадр не нравится, написать «ещё вариант» или поправить словами («меньше мебели», «светлее», «без людей»).
3. Скачать понравившийся вариант и назвать файл как в заголовке промпта, например `gostinaya.png`.
4. Прислать файлы (можно архивом). Они встают на сайт одной командой: `node scripts/prepare-otdelka.mjs` режет все размеры, подпись «Визуализация» остаётся. Если меняется `korobka.png`, номера на фото расставляются заново под новый кадр.

## 1. `gostinaya.png`: первый экран «Отделки», большая плитка

```
Landscape 3:2 photo. A bright spacious living room of a country house near Moscow right after the finishing works: wide-plank natural oak floor, warm-white plastered walls, built-in oak shelving with a few books and ceramics, a low linen sofa with cushions, an oak coffee table, a wool rug, floor-to-ceiling windows with soft daylight and pine trees outside. The left third of the frame is calm and uncluttered (plain wall and window light) because a website headline will sit there; the sofa, table and shelving are in the centre and right. Photorealistic editorial interior photography, warm natural oak, soft diffused daylight, true-to-life colours, realistic materials and small imperfections, full-frame camera, 24 mm lens, eye level, straight verticals. No people, no text, no logos, no watermark, no collage, no fisheye, no CGI or render look.
```

## 2. `materialy.png`: плитка «Детали по чертежам»

```
Landscape 3:2 photo. Still life of finishing material samples on a light oak table near a window in a country house: oak parquet planks, a travertine tile, a decorative plaster sample board, a linen fabric swatch, a brushed brass cabinet handle and a fan of warm neutral paint swatches. Soft side daylight, shallow depth of field. The samples fill the upper two thirds of the frame; the lower third is calm table surface because a caption will sit there. Photorealistic editorial product photography, true-to-life colours, realistic textures. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## 3. `chernovaya.png`: состав работ, черновая отделка

```
Landscape 3:2 photo. Rough finishing inside the bare shell of a new country house near Moscow: freshly levelled cement floor screed, smooth grey gypsum plaster on the walls with metal plaster beacons, a metal plasterboard partition frame in progress, a laser level on a tripod projecting a thin red line on the wall, clean and orderly construction site, daylight from large window openings with pine trees outside. Photorealistic architectural photography, true-to-life colours, full-frame camera, 24 mm lens, eye level, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## 4. `inzheneriya.png`: состав работ, инженерия

```
Landscape 3:2 photo. Engineering works before the walls are closed in a country house: neat red and blue PEX water pipes and grey corrugated electrical conduits fixed in parallel along a plastered wall and the floor, an open electrical distribution panel with neatly labelled cables and breakers, a heating manifold with valves in a wall niche, everything tidy and professional, soft daylight from a window. Photorealistic architectural photography, true-to-life colours, full-frame camera, 28 mm lens, eye level, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## 5. `chistovaya.png`: состав работ, чистовая отделка

```
Landscape 3:2 photo. Finishing works in a bright room of a country house: a craftsman seen from behind, kneeling, laying oak parquet in a herringbone pattern; a paint roller and tray on a protective sheet in the foreground; freshly painted warm-white walls; large windows with soft daylight. The craftsman's face is not visible. Photorealistic editorial interior photography, warm natural oak, true-to-life colours, full-frame camera, 28 mm lens, eye level. No text, no logos, no watermark, no collage, no CGI or render look.
```

## 6. `mebel.png`: состав работ, мебель и свет

```
Landscape 3:2 photo. A kitchen made of natural oak in a country house near Moscow: tall built-in oak cabinets with integrated appliances, an island with a light stone countertop and two bar stools, warm LED strip lighting under the wall cabinets, two pendant lamps above the island, a large black-framed window with daylight and pine trees outside. Photorealistic editorial interior photography, warm natural oak, soft diffused daylight mixed with warm lamp light, true-to-life colours, full-frame camera, 24 mm lens, eye level, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## 7. `nadzor.png`: состав работ, авторский надзор

```
Landscape 3:2 photo. Designer supervision on site: a designer seen from behind, face not visible, holding large printed interior drawings and comparing them with a finished built-in oak wall niche with shelves and warm LED lighting in a light room of a country house; a tape measure and a tablet showing the same drawing lie on a wooden trestle table nearby; large windows with soft daylight. Photorealistic editorial interior photography, warm natural oak, true-to-life colours, full-frame camera, 28 mm lens, eye level. No text, no logos, no watermark, no collage, no CGI or render look.
```

## 8. `korobka.png`: «Что проверяем в доме до старта», вертикальное фото

```
Vertical 2:3 photo. Inside the shell of a newly built country house near Moscow before finishing: grey plastered walls, a ceiling with exposed timber joists, a raw cement floor screed, electrical cables and red and blue pipe stubs coming out of the lower part of the left wall, and one clearly visible window opening with unfinished plaster reveals on the right wall with pine trees outside. A laser distance meter lies on the floor. Keep clearly separate zones: the wall and ceiling junction in the upper third, the window opening in the middle right, cables and pipe stubs at the lower left, an empty area of floor screed at the bottom centre (numbered markers will be placed on these zones). Photorealistic architectural photography, soft daylight, true-to-life colours, full-frame camera, 24 mm lens, straight verticals. No people, no text, no logos, no watermark, no collage, no CGI or render look.
```

## 9. `about-team-placeholder.png`: «О компании» на главной, временная иллюстрация

На сайте подписывается «Иллюстрация», до запуска на рабочем домене её нужно заменить настоящим фото команды или офиса.

```
Landscape 3:2 photo. A small construction and design team of five people inside a country house under finishing, gathered around a light oak trestle table with large printed architectural drawings, a tablet and material samples (oak parquet plank, plaster sample, stone tile). Two of them point at the drawings. Light plastered walls, a large window opening with soft warm daylight and pine trees outside, a stepladder and neatly stacked materials in the background. Work clothes, casual shirts and neutral jackets, no uniforms, no logos. Faces generic, natural and not resembling any real or famous person; most people in three-quarter view or from the side, engaged with the drawings, nobody looking at the camera. Photorealistic editorial photography, realistic hands and faces, true-to-life skin tones, full-frame camera, 35 mm lens, eye level. No text, no logos, no watermark, no collage, no CGI or render look.
```

## Другие промпты

- Ночное фото первого экрана главной для компьютера: [design/hero-night-prompts.md](hero-night-prompts.md).
- Промпт целиком для Codex (все 8 кадров «Отделки» одним заданием): [design/otdelka-photo-prompts.md](otdelka-photo-prompts.md).
