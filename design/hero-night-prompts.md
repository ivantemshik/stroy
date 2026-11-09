# Ночная версия главного фото (тёмная тема)

Главное фото берётся со старой страницы «Строительство домов и зданий»: `public/images/construction-hero.webp` (1792×1024) и мобильная версия `public/images/construction-hero-mobile.webp` (800×1100). Ночная версия делается редактированием этих файлов, а не новой сценой: так при смене темы дневное фото плавно перетекает в ночное по одной и той же картинке.

Куда сохранять результат: `design/sources/hero-night/`. Из готового PNG сборка делает WebP в `public/images/` (`construction-hero-night.webp`, `construction-hero-night-mobile.webp`).

## Промпт 1. Компьютер, горизонтальное фото

Задание для Codex:

> Открой `public/images/construction-hero.webp` и отредактируй его встроенной генерацией изображений в режиме правки исходника (не новая сцена). Сделай 3 варианта, горизонталь 1536×1024, PNG. Сохрани в `design/sources/hero-night/construction-hero-night-1.png`, `-2.png`, `-3.png`. Промпт ниже.

```
Use case: photorealistic image edit. Edit the attached architectural photograph. Keep the exact same camera position, framing, perspective, lens and composition, and the same house: a two-storey wood-clad gable house with a full-height black-framed glass gable, a low side wing, black standing-seam metal roof, chimney, terrace with lounge chairs, the same garden, boulders, stone path, lawn and birch tree on the right. The edited image must crossfade with the original almost pixel to pixel.
Change only the time of day: a clear, calm night in the Moscow countryside in late summer. Deep indigo-navy night sky with a dense field of fine natural stars of different brightness and a faint soft Milky Way band rising behind the roof on the right. The left 40 percent of the frame stays darker, smooth and calm, with only small faint stars, reserved for a white website headline. Warm 2700K light glowing from all windows and the glass gable, revealing the cosy interior; warm wall lights on the facade and terrace; soft warm light spilling onto the deck, the path and the lawn; a cool moonlight rim on the roof edges and the birch trunk; light low mist lying over the grass on the far left.
Realistic exposure of a professional long-exposure architectural night photograph: no blown highlights, no lens flare, no moon in frame, no aurora, no neon or fantasy colours, no added or removed objects. Premium, calm, editorial real estate photography. No people, no text, no logos, no watermark, no UI, no collage.
```

## Промпт 2. Телефон, вертикальное фото

> Открой `public/images/construction-hero-mobile.webp` и отредактируй так же, 3 варианта, вертикаль 1024×1536, PNG. Сохрани в `design/sources/hero-night/construction-hero-night-mobile-1.png`, `-2.png`, `-3.png`. Промпт ниже.

```
Use case: photorealistic image edit. Edit the attached vertical architectural photograph. Keep the exact same camera position, framing, perspective and composition, the same wood-clad gable house with the full-height glass gable, black metal roof, terrace, garden and trees, so the edited image can crossfade with the original almost pixel to pixel.
Change only the time of day: a clear, calm night in the Moscow countryside in late summer. Deep indigo-navy night sky with a dense field of fine natural stars and a faint soft Milky Way band. The upper 40 percent of the frame stays darker, smooth and calm, with only small faint stars, reserved for a white website headline. Warm 2700K light glowing from all windows and the glass gable, warm wall lights on the facade and terrace, soft warm light on the deck and lawn, a cool moonlight rim on the roof edges, light low mist over the grass.
Realistic long-exposure architectural night photograph: no blown highlights, no lens flare, no moon in frame, no aurora, no neon or fantasy colours, no added or removed objects. No people, no text, no logos, no watermark, no UI, no collage.
```

## Как выбрать вариант

Положите дневное и ночное фото друг на друга: дом, окна, крыша и деревья должны совпасть. Если дом «поплыл» (другая форма окон, другая крыша), этот вариант не подойдёт для плавной смены, берите следующий.
