// Готовит фото реальных объектов компании для сайта: скачивает оригиналы с gkvesmir.ru
// и сохраняет WebP нужных ширин в public/images/objects. Запуск: node scripts/prepare-objects.mjs
import {mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const cache = `${root}.cache/objects/`;
const out = `${root}public/images/objects/`;
const U = path => `https://gkvesmir.ru/upload/iblock/${path}`;

// id: имя файла, src: оригинал, w: ширины, pos: точка кадрирования для узких экранов (не используется sharp, только для справки)
export const OBJECTS = [
  {id: 'promenad-zima', src: U('fcb/f9imaybwq03dkgurzci95q5tjt99b46n.jpg'), w: [1800, 1200, 800]},
  {id: 'promenad-vecher', src: U('790/qkt249oidomtakxmxaltwzpc3fm4j8pk.jpg'), w: [1600, 800]},
  {id: 'promenad-noch', src: U('fd4/m9tpa9lwvj1kryqnjv9v68yhzmjitsoi.jpg'), w: [1600]},
  {id: 'promenad-basseyn', src: U('eee/b9l9kp8le9rzfnrctv3zi6rd7k8zdmch.jpg'), w: [1600, 800]},
  {id: 'promenad-lestnica', src: U('b0f/0k99mffd3ag5cpufswr6nkgwvmf5il5h.jpg'), w: [1100, 600]},
  {id: 'malakhovka', src: U('51a/sf3kw68l0m9rbezsul5vqoacr3mkvwbw.JPG'), w: [1536, 800]},
  {id: 'malakhovka-fasad', src: U('cb7/x5abhngw8ojrix4a0fz78rc7veipz644.JPG'), w: [1536]},
  {id: 'malakhovka-vhod', src: U('f35/1f0jy2vdeiir3k17kladoo1aukt3pbde.JPG'), w: [1536]},
  {id: 'malakhovka-do', src: U('7e2/oc0qgqiqlf6xvh0ltx6wj5io3lhg9rm0.JPG'), w: [1536]},
  {id: 'nikolina-gora', src: U('9c4/ocusxuxulub762657v05h6qz5ph1nc3z.JPG'), w: [1600, 800]},
  {id: 'nikolina-gora-vhod', src: U('320/zpsr6odm5t9cqetevh6tgo1tvy7rbzij.JPG'), w: [1024]},
  {id: 'nikolina-gora-ugol', src: U('2c4/d33luzudo0lk18a93tc1t82f21c3h319.JPG'), w: [1600]},
  {id: 'timurkino', src: U('7ed/lxegaf81gcxpzqxzml0qznfvutxbj8yl.jpg'), w: [1600, 800]},
  {id: 'timurkino-fasad', src: U('158/2az31bpgx6pe4mdn6r59rcyrid2s7h1l.jpg'), w: [1600]},
  {id: 'timurkino-plita', src: U('fd2/191i0rpkqj8j5qd42r6kehc1v7u8uykf.jpg'), w: [1600, 800]},
  {id: 'timurkino-monolit', src: U('0f6/ucp1xg8jomb19d337asgex25byqy5cm5.jpg'), w: [1600]},
  {id: 'timurkino-uteplenie', src: U('2ba/w0vynnsauwz28ez8cve3g7he1lab6r21.jpg'), w: [1000, 600]},
  {id: 'timurkino-gotov', src: U('180/zmoi6cww2h0j0xu4070wuv9t3ug6lxwd.jpg'), w: [1600]},
  {id: 'peshkovo', src: U('9d8/xxgs54uyjssklf7funkg2yquck8tp6y9.jpg'), w: [1200, 700]},
  {id: 'peshkovo-etap-uchastok', src: U('de1/0c2pcj471qt4qejomksns06hczjjkn16.jpg'), w: [1200, 700]},
  {id: 'peshkovo-etap-plita', src: U('1c9/afgbo5wgp93q4qv4ymm5yq7m31if3tq9.jpg'), w: [1200, 700]},
  {id: 'peshkovo-etap-steny', src: U('22d/9ey7q84yaev1ahwxs7gas11n1l8nnrm8.jpg'), w: [1200, 700]},
  {id: 'peshkovo-etap-beton', src: U('65d/f3tg6gfrscc86udc30yumleviy68qtq9.jpg'), w: [1200]},
  {id: 'peshkovo-etap-krovlya', src: U('f90/p5e5co52ceu4zr0q8sjaoijwjqw0ppkj.jpg'), w: [1200, 700]},
  {id: 'peshkovo-etap-fasad', src: U('a5d/zz43mwgn0q9e7008p6gbhn158a7xn19l.jpg'), w: [1200, 700]},
  {id: 'peshkovo-gotov', src: U('b42/59tkqhmq8edu4utjnizb41wg9u3582ag.jpg'), w: [1200, 700]},
  {id: 'peshkovo-gotov-2', src: U('733/d0bumu3bftayfypba4jo3g9cf4g4pe5w.jpg'), w: [1200]},
  {id: 'peshkovo-gotov-3', src: U('ea4/duz8tzfy78ahtqff4hc82acrwxhh3bk4.jpg'), w: [1200]},
  {id: 'banya', src: U('fbf/vj4e1rto8m6bh958xc3ba3x9fodvwpsq.jpg'), w: [1200, 700]},
  {id: 'banya-2', src: U('0a0/0dctamgcti1fiy104h2wr3gmlcp9hbiv.jpg'), w: [1200]},
  {id: 'garazh', src: U('330/kkz2lvq8jbkvtzf79qhwm3y2yt1pkd2c.jpg'), w: [1200, 700]},
  {id: 'garazh-2', src: U('cbe/axafcwpxy5w0bu613inq3h8hp7sk95ix.jpg'), w: [1200]},
  {id: 'garazh-3', src: U('4f6/tu0e092fjihovwm59ar4y3fh3cfvkud9.jpg'), w: [1200]},
  {id: 'garazh-potolok', src: U('684/t7khor0ynlwkji529i2wnn6l55gn9xkn.jpg'), w: [960]},
  {id: 'garazh-otdelka', src: U('8bb/y3enhn9507j2fxv9p5ruecl33i2zu2eu.jpg'), w: [960]},
  {id: 'otdelka-gostinaya', src: U('e79/bgbcxfs59m43w40kc9h09bd2ab0o7bci.jpg'), w: [1472, 1100, 800]},
  {id: 'otdelka-stolovaya', src: U('cfb/ig30cabzwdncx52nso1wp380ufq42zro.jpg'), w: [1467, 800]},
  {id: 'otdelka-gostinaya-2', src: U('eb5/3lq357qbwq0rummyg1g444aszdmh1b9p.jpg'), w: [1446, 800]},
  {id: 'otdelka-kamin', src: U('eb1/wgy52zh9rj0ilax5aejjnfjd5mikldq1.jpg'), w: [1463, 800]},
  {id: 'otdelka-spalnya', src: U('ecf/ixs4pw61rxrfkvhxtb35yg91jdjjdnps.jpg'), w: [1449, 800]},
  {id: 'otdelka-vannaya', src: U('ca9/yk321gf1zhyi7256i8t1wxzk9flzuj3g.jpg'), w: [1063, 600]},
  {id: 'otdelka-kuhnya', src: U('8d6/9vb0xluegoo5gsb6pafb958q8foq7jc1.jpg'), w: [1098, 600]},
  {id: 'otdelka-stolovaya-2', src: U('b72/e8042g1raeyd70hf9hwyg4kdzdcfuk1v.jpg'), w: [1600, 800]},
  {id: 'otdelka-shkafy', src: U('493/4q55stuiwv3canq8qcy3n5nxjtt9cfn7.jpg'), w: [1600, 800]},
  {id: 'otdelka-lestnica', src: U('6ef/pfwk6pbdt6brtlq01eqh0n1qmyph8ddz.jpg'), w: [1100, 600]},
  {id: 'otdelka-chernovaya', src: U('38e/1y0f0p8dmco61ndgtu2ajgbprcoof205.jpg'), w: [867, 600]},
  {id: 'otdelka-karkas', src: U('944/wg5yvldaxcp49vmn6ap0undxxi1s3ayi.jpg'), w: [867, 600]},
  {id: 'rekonstrukciya', src: U('984/v7lx2i3v63gpojkeyfv87o1wuksn8qga.JPG'), w: [1100, 600]}
];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function source(item) {
  const file = `${cache}${item.id}.${item.src.split('.').pop().toLowerCase()}`;
  if (!await exists(file)) {
    const response = await fetch(item.src, {headers: {'user-agent': 'Mozilla/5.0 (site build)'}});
    if (!response.ok) throw new Error(`${item.id}: HTTP ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  return readFile(file);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(cache, {recursive: true});
  await mkdir(out, {recursive: true});
  const manifest = {};
  for (const item of OBJECTS) {
    const input = await source(item);
    const meta = await sharp(input).rotate().metadata();
    const rotated = meta.orientation >= 5;
    const width0 = rotated ? meta.height : meta.width;
    const height0 = rotated ? meta.width : meta.height;
    const widths = [...new Set(item.w.map(w => Math.min(w, width0)))];
    manifest[item.id] = {width: width0, height: height0, widths};
    for (const width of widths) {
      await sharp(input).rotate().resize({width}).webp({quality: width >= 1400 ? 74 : 72, effort: 5})
        .toFile(`${out}${item.id}-${width}.webp`);
    }
    console.log(item.id, widths.join(','));
  }
  await writeFile(`${out}manifest.json`, `${JSON.stringify(manifest, null, 1)}\n`);
}
