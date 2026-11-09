import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/images', {recursive:true});
const asset = (source,name,width,height,position='centre') => sharp(source).resize(width,height,{fit:'cover',position}).webp({quality:86}).toFile(`public/images/${name}.webp`);
await Promise.all([
  asset('design/sources/hero.png','hero',1660,948),
  asset('design/sources/hero.png','hero-mobile',800,1000,'east'),
  asset('design/sources/hero.png','house-detail',500,620,'east'),
  asset('design/sources/roof.png','roof',500,750),
  asset('design/sources/interior.png','interior',500,650),
  asset('design/sources/interior.png','interior-thumb',180,180),
  asset('design/sources/interior.png','interior-wide',1000,620),
  asset('design/planning.svg','planning',500,620),
  ...[1,2,3,4].map(index => asset(`design/sources/review-avatar-${index}.png`, `review-avatar-${index}`,160,160)),
  ...['landscape','lighting','furniture'].map(name => asset(`design/sources/project-${name}.png`, `project-${name}`,600,900)),
  asset('design/sources/construction-hero.png','construction-hero',1792,1024),
  asset('design/sources/construction-hero.png','construction-hero-mobile',800,1100,'east'),
  asset('design/sources/construction-villa.png','construction-villa',1200,800),
  asset('design/sources/construction-commercial.png','construction-commercial',1200,800),
  asset('design/sources/construction-facade.png','construction-facade',700,900)
]);
console.log('Prepared 20 optimized WebP assets.');
