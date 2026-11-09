# Строительство домов — отдельная страница

Адрес: `/stroitelstvo-domov/`.

Референс Canva: https://www.canva.com/design/DAHaJDSnZgc/edit. Canva не изменялась: транзакция чтения закрыта без сохранения. Сохранены расположение дома справа в первом экране, типы объектов, полоса полного цикла с фотографией слева, три изображения проектов, темный блок преимуществ и компактная форма.

Страница использует общие шрифты, палитру, CSS компонентов, навигацию и расчет главного сайта. Реализована как отдельная HTML-страница с общей логикой модальных окон, собственными метаданными и прямыми ссылками с главной. Сборка Vite содержит обе страницы.

Все цены и направления основаны на исходном отчете компании. 70 000 ₽/м² — ориентир за работу, без материалов. Изображения являются архитектурными визуализациями, что отмечено в галерее. Имена клиентов, реализованные адреса объектов и рейтинги не выдумывались.

Форма не отправляет данные на сервер: формирует письмо в почтовой программе посетителя. Галерея раскрывается в модальном просмотре с клавиатурной навигацией. Стрелки — SVG.

## Фотографии

Созданы встроенным image_gen. Оригиналы — `design/sources/construction-hero.png`, `construction-villa.png`, `construction-commercial.png`, `construction-facade.png`. WebP для сайта — `public/images/construction-hero.webp`, `construction-hero-mobile.webp`, `construction-villa.webp`, `construction-commercial.webp`, `construction-facade.webp`.

### construction-hero

Use case: photorealistic-natural. Asset type: wide hero architectural photograph for a premium Russian home construction company. Landscape 1792x1024. A beautiful modern two-storey Scandinavian gable house with warm pale natural oak vertical cladding, huge full-height glass gable facade framed in black, black metal roof, a low side wing and planted garden around it. The entire house is visible, placed on the RIGHT 58 percent of the image, peak around x=75%, front three-quarter view, eye-level 28mm architectural lens. Quiet early evening daylight with warm interior light, rich but understated natural garden. The LEFT 42 percent is empty softly misty pale dusty blue sky and smooth atmospheric blue haze with only a subtle indistinct tree at far edge, reserved for website headline added in HTML. Left half should not contain any buildings or hard details. Professional architectural photograph with credible real materials, premium estate style, sophisticated restrained palette of dusty blue, warm wood, black metal and muted green. No text, no UI, no logos, no watermarks, no collage.

### construction-villa

Use case: photorealistic-natural. Asset type: architectural photograph for a house building services website. Landscape 1536x1024. A sophisticated single-storey modern country villa in the Moscow countryside. Low flat black roof with broad thin eaves, warm vertical cedar cladding, dark stone accent wall and wide floor-to-ceiling glass walls with soft warm interior light. Front three-quarter view of the full house from a lush landscaped garden, low ornamental grasses and large pale stone paving, a few birch and conifer trees. Soft late afternoon light before sunset, pale muted blue sky, calm architecture magazine photography. Realistic construction and material detail, no dramatic mountains or tropical trees. House fills middle frame with whole roof visible. No people, no text, no logo, no watermark, no UI or collage.

### construction-commercial

Use case: photorealistic-natural. Asset type: architectural photograph for a construction services website. Landscape 1536x1024. A compact premium TWO-STOREY modern commercial building suitable for a boutique business center or small hotel in Moscow region. Long elegant rectangular volume, black slender metal mullions and dark metal roofline, large clear glass walls, warm timber soffits, warm interior lighting revealing tasteful public spaces. Front three-quarter perspective at ground level showing the whole structure, stone entrance walkway, simple ornamental grasses and a few local birch trees around it. Blue hour just before evening, pale soft blue sky, harmonious warm amber windows and restrained green landscape. Professional realistic architectural photograph, sharp glazing and material details. No business names, no signs, no logos, no text, no people, no watermark, no UI or collage.

### construction-facade

Use case: photorealistic-natural. Asset type: portrait architectural detail photograph for a home construction services page. Portrait 1024x1536. Looking upward at the precise corner of a contemporary Scandinavian house: flawless light honey-colored vertical timber slats rise toward a sharply detailed black standing-seam metal gable roof. Strong quiet geometric composition, the roof ridge peaks near upper center, natural warm cedar texture with subtle knots and grain. Light dusty blue clear sky occupies upper left and around the roof. Side angle with building filling lower two thirds. Natural calm daylight, clean credible craftsmanship details, architectural magazine editorial photography. No people, no hands, no tools, no text, no logos, no watermarks, no collage.

