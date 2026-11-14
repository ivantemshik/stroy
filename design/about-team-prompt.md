# Фото для блока «О компании» на главной

Сейчас в блоке стоит настоящее фото объекта компании: дом в посёлке Малаховка (`public/images/objects/malakhovka-vhod-1536.webp`) с подписью «Посёлок Малаховка, дом 805 м², один из объектов компании». Сгенерированную «команду» не ставили: посетитель может принять её за настоящих сотрудников, а реальный объект ничего не выдумывает.

Лучший вариант: настоящее фото команды или офиса от заказчика. Его кладём в `design/sources/about/about-team.jpg`, сжимаем в `.webp` 1400×1000 и 800×1000 и меняем путь и подпись в `index.html` (блок `#about`).

Если заказчик захочет заглушку до своего фото, промпт ниже. Под таким кадром обязательна подпись «Иллюстрация», и до открытия сайта на рабочем домене его нужно заменить настоящим.

Исходник: `design/sources/about/about-team-placeholder.png`, горизонталь 7:5.

```
A small construction and design team of five people on a site of a country house under finishing, standing around a light oak table with printed architectural drawings and material samples, light plastered walls, large window openings with soft warm daylight and pine trees outside. Faces generic and not resembling any real person, natural poses, work clothes and casual shirts, no uniforms with logos. Photorealistic, calm editorial real estate photography. No text, no logos, no brand names, no watermark, no UI, no collage.
```
