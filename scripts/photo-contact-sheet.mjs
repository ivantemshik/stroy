import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve('photos');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const tiles=[];
const width=1600,cellWidth=320,cellHeight=244;
for(const [row,category] of manifest.services.entries()){
 for(const [column,asset] of category.assets.entries()){
  const file=path.join(root,category.slug,asset.file);
  try{await fs.access(file);}catch{continue;}
  const photo=await sharp(file).resize(312,208,{fit:'cover'}).jpeg({quality:85}).toBuffer();
  tiles.push({input:photo,left:column*cellWidth+4,top:row*cellHeight+4});
  const label=Buffer.from(`<svg width="312" height="28"><rect width="312" height="28" fill="#f7f7f5"/><text x="6" y="19" font-family="Arial" font-size="12" fill="#202420">${row+1}.${column+1} ${asset.file.replace('.png','')}</text></svg>`);
  tiles.push({input:label,left:column*cellWidth+4,top:row*cellHeight+212});
 }
}
await sharp({create:{width,height:manifest.services.length*cellHeight,channels:3,background:'#f7f7f5'}}).composite(tiles).jpeg({quality:88}).toFile(path.join(root,'overview.jpg'));
console.log('photos/overview.jpg');
