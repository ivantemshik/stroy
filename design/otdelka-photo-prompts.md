# Фото для страницы «Отделка»

Сейчас на странице стоят настоящие фото объектов компании из `public/images/objects/` (Променад, Малаховка, Богородское). Это сильнее сгенерированных кадров: посетитель видит реальную работу. Сгенерированные кадры ниже нужны только там, где реального фото подходящего сюжета нет. В первую очередь это «Инженерия» (сейчас там каркас потолка, а не трубы и электрика) и «Черновая отделка» (фото потолка нерезкое).

Куда сохранять исходники: `design/sources/otdelka/` под именами из таблицы, PNG. Размеры для сайта собирает `node scripts/prepare-otdelka.mjs`, результат в `public/images/otdelka/`. Метку версии в адрес картинки сборка сайта ставит сама.

Каждый сгенерированный кадр на странице подписывается «Визуализация» (так принято в проекте), реальные фото подписываются посёлком.

| Блок | Файл исходника | Что сейчас на сайте | Размеры после сборки |
|---|---|---|---|
| Первый экран, большая плитка | `gostinaya.png` | `otdelka-gostinaya` (Променад, реальное) | 1600×1200, телефон 800×1000 |
| Первый экран, плитка-деталь | `materialy.png` | `otdelka-shkafy` (Малаховка, реальное) | 1000×780 |
| Состав: черновая отделка | `chernovaya.png` | `otdelka-chernovaya` (реальное, нерезкое) | 1400×1040 и миниатюра 112×112 |
| Состав: инженерия | `inzheneriya.png` | `otdelka-karkas` (каркас потолка) | 1400×1040 и миниатюра |
| Состав: чистовая отделка | `chistovaya.png` | `otdelka-vannaya` (Променад, реальное) | 1400×1040 и миниатюра |
| Состав: мебель и свет | `mebel.png` | `otdelka-kuhnya` (Променад, реальное) | 1400×1040 и миниатюра |
| Состав: авторский надзор | `nadzor.png` | `otdelka-stolovaya-2` (Малаховка, реальное) | 1400×1040 и миниатюра |
| Что проверяем до старта | `korobka.png` | `garazh-otdelka` (Богородское, реальное) | 1200×1600 |

Общий стиль для всех кадров, дописывается в конец каждого промпта:

```
Style: photorealistic interior photography of a country house near Moscow, warm natural oak, light plastered walls, soft diffused daylight from large windows, calm and premium, consistent with an editorial real estate catalogue. People only from behind or without visible faces. No text, no logos, no brand names, no watermark, no UI, no collage, no fisheye.
```

## Первый экран, большая плитка (`gostinaya.png`, горизонталь 3:2)

```
A bright living room of a country house right after finishing works: natural oak floor, light plastered walls, built-in oak shelving, a low linen sofa, large floor-to-ceiling windows with soft daylight and pine trees outside. The left 40 percent of the frame is calm and uncluttered (plain wall and window light), the furniture and the most interesting details sit in the right half.
```

## Плитка-деталь (`materialy.png`, горизонталь 4:3)

```
Close-up of finishing material samples laid out on a light oak table: oak parquet planks, a travertine tile, a decorative plaster sample board, a linen fabric swatch, a brass handle. Soft side daylight, shallow depth of field, the lower third of the frame is calm for a caption.
```

## Состав работ (`chernovaya.png`, `inzheneriya.png`, `chistovaya.png`, `mebel.png`, `nadzor.png`, горизонталь 4:3)

```
chernovaya: Inside the bare shell of a new country house: freshly levelled cement floor screed, smooth grey gypsum plaster on the walls, plaster beacons along a wall, a laser level on a tripod, clean and orderly site, daylight from window openings.
```

```
inzheneriya: Engineering works before closing the walls in a country house: neat red and blue PEX water pipes and grey corrugated electrical conduits fixed along a plastered wall and floor, an open electrical panel with labelled cables, a heating manifold, everything tidy and parallel, daylight.
```

```
chistovaya: Finishing works in progress in a bright room: a craftsman seen from behind laying oak parquet in a herringbone pattern, paint roller and tray on a protective sheet, freshly painted warm white walls, soft daylight.
```

```
mebel: A kitchen made of natural oak with built-in under-cabinet LED lighting, a stone countertop and integrated appliances in a country house, warm evening light mixed with daylight from a large window.
```

```
nadzor: A designer seen from behind or in profile without a visible face, holding printed interior drawings and comparing them with the finished wall niche and built-in shelving in a light room, a tape measure on the drawings, daylight.
```

## Что проверяем до старта (`korobka.png`, вертикаль 3:4)

```
Inside the shell of a newly built country house before finishing, vertical frame: plastered walls, a raw cement floor screed, cable runs and pipe stubs coming out of the wall, one window opening with unfinished reveals, a laser distance meter lying on the floor. Clear separate zones for the wall, the floor, the cables and the window so numbered markers can be placed on them.
```

После замены этого кадра поправьте места номеров в `otdelka/index.html`: в блоке `otd-check-dots` у каждой метки координаты `--x` и `--y` в процентах от фото (1 стены и потолки, 2 стяжка, 3 сети). Если в кадре есть окно, добавьте четвёртую метку для «Окна и откосы».

## Как заменить фото на странице

1. Положить PNG в `design/sources/otdelka/` и запустить `node scripts/prepare-otdelka.mjs`.
2. В `otdelka/index.html` заменить путь нужного кадра на `/images/otdelka/<имя>-<ширина>.webp`, миниатюру на `/images/otdelka/<имя>-thumb.webp`.
3. Под сгенерированным кадром поставить подпись «Визуализация».
4. Собрать сайт и прогнать `npm run check`.
