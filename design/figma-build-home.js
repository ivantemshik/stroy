// Figma Plugin API task script. Source: the captured, native DOM layer tree.
const capture=await figma.getNodeByIdAsync('4:2');
const page=await figma.getNodeByIdAsync('0:1');
await figma.setCurrentPageAsync(page);
const allSource=[capture,...capture.findAll(()=>true)];
const fontMap=new Map();
for(const node of allSource)if(node.type==='TEXT')for(const segment of node.getStyledTextSegments(['fontName']))fontMap.set(JSON.stringify(segment.fontName),segment.fontName);
await Promise.all([...fontMap.values()].map(font=>figma.loadFontAsync(font)));
if(page.children.some(node=>node.name==='Главная / Desktop 1440'))throw Error('Final homepage already exists; resume by its returned ID.');
page.name='Главная страница';
const createdNodeIds=[],mutatedNodeIds=[page.id],variableIds=[];
const primitives=figma.variables.createVariableCollection('Дом Мира / Исходные цвета');
const semantic=figma.variables.createVariableCollection('Дом Мира / Цвета интерфейса');
const palette=[['blue','#91b2bf'],['paper','#f7f7f5'],['ink','#181918'],['muted','#7a7c79'],['plum','#51435a'],['line','#e2e3df']];
const colorVars=[];
for(const [key,hex] of palette){
 const color={r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255};
 const primitive=figma.variables.createVariable('palette/'+key,primitives,'COLOR');primitive.scopes=[];primitive.setValueForMode(primitives.defaultModeId,color);primitive.setVariableCodeSyntax('WEB','var(--'+key+')');
 const token=figma.variables.createVariable(key,semantic,'COLOR');token.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];token.setValueForMode(semantic.defaultModeId,{type:'VARIABLE_ALIAS',id:primitive.id});token.setVariableCodeSyntax('WEB','var(--'+key+')');
 variableIds.push(primitive.id,token.id);colorVars.push({token,color});
}
const final=capture.clone();page.appendChild(final);final.name='Главная / Desktop 1440';final.x=100;final.y=100;
const cloneMap={};
function mapTree(source,target){cloneMap[source.id]=target.id;createdNodeIds.push(target.id);if('children'in source)source.children.forEach((child,index)=>mapTree(child,target.children[index]));}
mapTree(capture,final);
const allFinal=[final,...final.findAll(()=>true)];
let bindings=0;
for(const node of allFinal){
 for(const field of ['fills','strokes'])if(field in node&&Array.isArray(node[field])){
  node[field]=node[field].map(paint=>{
   if(paint.type!=='SOLID')return paint;
   const match=colorVars.find(({color})=>Math.abs(paint.color.r-color.r)<.002&&Math.abs(paint.color.g-color.g)<.002&&Math.abs(paint.color.b-color.b)<.002);
   if(!match)return paint;bindings++;return figma.variables.setBoundVariableForPaint(paint,'color',match.token);
  });
 }
}
const names={'4:4':'Страница / молочный фон','4:5':'01 / Первый экран','4:11':'Шапка / логотип, навигация, связь','4:42':'Первый экран / заголовок и действие','4:66':'Основное содержание','4:67':'02 / Услуги и подход','4:140':'03 / Продумано до деталей','4:186':'04 / Наши проекты','4:254':'05 / Ваш будущий дом','4:306':'06 / Стоимость','4:351':'07 / Отзывы','4:463':'08 / Вопросы и ответы','4:502':'09 / Контакты и подвал'};
for(const [sourceId,name] of Object.entries(names)){const node=await figma.getNodeByIdAsync(cloneMap[sourceId]);node.name=name;}
const styles=new Map(),textStyleIds=[];
for(const node of allFinal){
 if(node.type!=='TEXT'||typeof node.fontSize!=='number'||typeof node.fontName!=='object'||typeof node.lineHeight!=='object'||typeof node.letterSpacing!=='object')continue;
 const key=JSON.stringify([node.fontName,node.fontSize,node.lineHeight,node.letterSpacing]);
 let style=styles.get(key);
 if(!style){style=figma.createTextStyle();style.name='Дом Мира / '+(node.fontSize>=60?'Display':node.fontSize>=26?'Heading':node.fontSize>=15?'Title':node.fontSize>=11?'Body':'Caption')+' / '+node.fontSize+' / '+node.fontName.style+' / '+styles.size;style.fontName=node.fontName;style.fontSize=node.fontSize;style.lineHeight=node.lineHeight;style.letterSpacing=node.letterSpacing;styles.set(key,style);textStyleIds.push(style.id);}
 node.textStyleId=style.id;
}
const components=figma.createAutoLayout('VERTICAL',{name:'Компоненты / элементы главной',itemSpacing:35});page.appendChild(components);components.x=1800;components.y=100;components.paddingTop=30;components.paddingBottom=30;components.paddingLeft=30;components.paddingRight=30;components.fills=[{type:'SOLID',color:{r:.92,g:.94,b:.91}}];createdNodeIds.push(components.id);
const families=[
 ['Карточка услуги',['4:98','4:112','4:124']],
 ['Карточка направления проектов',['4:208','4:217','4:225','4:233','4:241']],
 ['Карточка дома',['4:270','4:284']],
 ['Карточка стоимости',['4:318','4:328','4:337']],
 ['Карточка отзыва',['4:368','4:394','4:415','4:436']]
];
const componentRecords=[],removedNodeIds=[];
const readProps=['fills','strokes','strokeWeight','strokeAlign','opacity','visible','cornerRadius','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','clipsContent','effects'];
function copyOverrides(source,target){
 target.name=source.name;
 for(const key of readProps)if(key in source&&key in target){const value=source[key];if(typeof value!=='symbol')target[key]=JSON.parse(JSON.stringify(value));}
 if(source.type==='TEXT'&&target.type==='TEXT'){
  target.fontName=source.fontName;target.characters=source.characters;
  const segments=source.getStyledTextSegments(['fontName','fontSize','lineHeight','letterSpacing','fills']);
  for(const s of segments){target.setRangeFontName(s.start,s.end,s.fontName);target.setRangeFontSize(s.start,s.end,s.fontSize);target.setRangeLineHeight(s.start,s.end,s.lineHeight);target.setRangeLetterSpacing(s.start,s.end,s.letterSpacing);target.setRangeFills(s.start,s.end,s.fills);}
  target.textAlignHorizontal=source.textAlignHorizontal;target.textAlignVertical=source.textAlignVertical;target.textAutoResize=source.textAutoResize;
 }
 if('children'in source&&'children'in target){if(source.children.length!==target.children.length)throw Error('Different component structure '+source.id);source.children.forEach((child,index)=>copyOverrides(child,target.children[index]));}
}
for(const [name,sourceIds] of families){
 const base=await figma.getNodeByIdAsync(cloneMap[sourceIds[0]]);
 const baseCopy=base.clone();
 const component=figma.createComponentFromNode(baseCopy);component.name=name;component.description='Повторяющийся элемент главной страницы «Дом Мира». Тексты и фотографии редактируются в экземплярах.';components.appendChild(component);
 createdNodeIds.push(component.id,...component.findAll(()=>true).map(n=>n.id));
 const instanceIds=[];
 for(const sourceId of sourceIds){
  const node=await figma.getNodeByIdAsync(cloneMap[sourceId]);
  const parent=node.parent,index=parent.children.indexOf(node);
  const instance=component.createInstance();parent.insertChild(index,instance);
  copyOverrides(node,instance);
  for(const key of ['layoutAlign','layoutGrow','layoutPositioning'])if(key in node&&key in instance)instance[key]=node[key];
  if('layoutSizingHorizontal'in node){instance.layoutSizingHorizontal=node.layoutSizingHorizontal;instance.layoutSizingVertical=node.layoutSizingVertical;}
  instance.name=name+' / '+(node.findAllWithCriteria({types:['TEXT']}).find(t=>t.characters.length>3)?.characters.replaceAll('\n',' ')||sourceIds.indexOf(sourceId));
  createdNodeIds.push(instance.id,...instance.findAll(()=>true).map(n=>n.id));instanceIds.push(instance.id);
  removedNodeIds.push(node.id,...node.findAll(()=>true).map(n=>n.id));node.remove();cloneMap[sourceId]=instance.id;
 }
 componentRecords.push({name,componentId:component.id,instanceIds});
}
// Quality cards have different image transforms: preserve these as true visual variants.
const qualityIds=['4:150','4:161','4:169','4:177'];
const qualityLabels=['Архитектура','План','Интерьер','Кровля'];
const qualityVariants=[],qualityInstances=[];
for(const [i,sourceId] of qualityIds.entries()){
 const node=await figma.getNodeByIdAsync(cloneMap[sourceId]);
 const parent=node.parent,index=parent.children.indexOf(node);
 const variant=figma.createComponentFromNode(node.clone());variant.name='Вид='+qualityLabels[i];variant.description='Вариант карточки качества с сохранённой композицией фотографии.';qualityVariants.push(variant);
 const instance=variant.createInstance();parent.insertChild(index,instance);instance.name='Карточка качества / '+qualityLabels[i];
 for(const key of ['layoutAlign','layoutGrow','layoutPositioning'])if(key in node&&key in instance)instance[key]=node[key];
 instance.layoutSizingHorizontal=node.layoutSizingHorizontal;instance.layoutSizingVertical=node.layoutSizingVertical;
 createdNodeIds.push(variant.id,...variant.findAll(()=>true).map(n=>n.id),instance.id,...instance.findAll(()=>true).map(n=>n.id));qualityInstances.push(instance.id);
 removedNodeIds.push(node.id,...node.findAll(()=>true).map(n=>n.id));node.remove();cloneMap[sourceId]=instance.id;
}
const qualitySet=figma.combineAsVariants(qualityVariants,components);qualitySet.name='Карточка качества';qualitySet.resize(1332,370);qualityVariants.forEach((v,i)=>{v.x=20+i*323;v.y=20;});createdNodeIds.push(qualitySet.id);componentRecords.push({name:'Карточка качества',componentId:qualitySet.id,variantIds:qualityVariants.map(v=>v.id),instanceIds:qualityInstances});
const sourceNodes=[capture,...capture.findAll(()=>true)].map(n=>n.id);capture.remove();removedNodeIds.push(...sourceNodes);
figma.currentPage.selection=[final];figma.viewport.scrollAndZoomIntoView([final]);
const descendants=final.findAll(()=>true),counts={};for(const n of descendants)counts[n.type]=(counts[n.type]||0)+1;
return {pageId:page.id,rootId:final.id,componentsId:components.id,createdNodeIds:createdNodeIds.filter(id=>!removedNodeIds.includes(id)),mutatedNodeIds,removedNodeIds,cloneMap,collections:[primitives.id,semantic.id],variableIds,textStyleIds,componentRecords,bindings,counts,width:final.width,height:final.height};
