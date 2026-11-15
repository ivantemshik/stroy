# Ночная версия фото главной страницы (переключатель «день и ночь»)

Главная страница это исходный лендинг «Твой дом, твой мир». Его фото: `public/images/hero.webp` (1660×948) и мобильная версия `public/images/hero-mobile.webp` (800×1000). Ночную версию делаем правкой этих файлов, а не новой сценой: так при переключении дневное фото плавно перетекает в ночное по той же картинке.

Куда сохранять: `design/sources/hero-night/`. Выбранный вариант сохраните как `hero-night.png` и `hero-night-mobile.png` (или пришлите архив, переложу сам). Размеры для сайта собирает `node scripts/prepare-hero.mjs`, пока ночного фото нет, на сайте стоит временная версия.

## Промпт 1. Компьютер, горизонтальное фото

Задание для Codex:

> Открой `public/images/hero.webp` и отредактируй его встроенной генерацией изображений в режиме правки исходника (не новая сцена). Сделай 3 варианта, горизонталь 1536×1024, PNG. Сохрани в `design/sources/hero-night/hero-night-1.png`, `-2.png`, `-3.png`. Промпт ниже.

```
Use case: photorealistic image edit. Edit the attached architectural photograph. Keep the exact same camera position, framing, perspective, lens and composition, and the same house: a wood-clad gable house with vertical warm oak cladding, a huge full-height black-framed glass gable, a black standing-seam metal roof, a wooden terrace deck with two lounge chairs, a small side table and a large potted olive tree, the same interior seen through the glass. The edited image must crossfade with the original almost pixel to pixel.
Change only the time of day: a clear, calm summer night in the Moscow countryside. The empty sky on the left 45 percent of the frame becomes a deep indigo-navy night sky with a dense field of fine natural stars of different brightness and a faint soft Milky Way band rising diagonally from the lower left toward the roof; the far left stays darker and calmer, reserved for a white website headline. Warm 2700K light glowing from all the windows and the glass gable, revealing the cosy interior with the pendant lamps lit; soft warm light spilling onto the deck, the chairs and the olive tree; a cool moonlight rim on the roof edge and the wooden cladding.
Realistic exposure of a professional long-exposure architectural night photograph: no blown highlights, no lens flare, no moon in frame, no aurora, no neon or fantasy colours, no added or removed objects. Premium, calm, editorial real estate photography. No people, no text, no logos, no watermark, no UI, no collage.
```

## Промпт 2. Телефон, вертикальное фото

> Открой `public/images/hero-mobile.webp` и отредактируй так же, 3 варианта, вертикаль 1024×1280, PNG. Сохрани в `design/sources/hero-night/hero-night-mobile-1.png`, `-2.png`, `-3.png`. Промпт ниже.

```
Use case: photorealistic image edit. Edit the attached vertical architectural photograph. Keep the exact same camera position, framing, perspective and composition, the same wood-clad gable house with the full-height black-framed glass gable, black metal roof, wooden terrace with lounge chairs and the potted olive tree, so the edited image can crossfade with the original almost pixel to pixel.
Change only the time of day: a clear, calm summer night in the Moscow countryside. The sky becomes a deep indigo-navy night sky with a dense field of fine natural stars and a faint soft Milky Way band; the upper part of the sky stays darker and calmer, reserved for a white website headline. Warm 2700K light glowing from the windows and the glass gable, pendant lamps lit inside, soft warm light on the deck and the chairs, a cool moonlight rim on the roof edge.
Realistic long-exposure architectural night photograph: no blown highlights, no lens flare, no moon in frame, no aurora, no neon or fantasy colours, no added or removed objects. No people, no text, no logos, no watermark, no UI, no collage.
```

## Как выбрать вариант

Положите дневное и ночное фото друг на друга: дом, окна, крыша, терраса и кресла должны совпасть. Если дом «поплыл» (другая форма окон или крыши), такой вариант не подойдёт для плавной смены, берите следующий.

## Раньше

Первая версия промптов была для фото старой страницы стройки (`construction-hero.webp`). Её ночной вариант лежит в `design/sources/hero-night/construction-hero-night*.webp`, на сайте сейчас не используется.
