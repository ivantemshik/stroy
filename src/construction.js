import {openModal} from './main.js';

const form=document.querySelector('#building-form');
const typeInput=document.querySelector('#building-type');
document.querySelectorAll('[data-building-type]').forEach(link=>link.addEventListener('click',()=>{
  typeInput.value=link.dataset.buildingType;
  document.querySelector('#request-object-label').textContent=`Ваш объект: ${link.dataset.buildingType.toLocaleLowerCase('ru-RU')}`;
}));
form.addEventListener('submit',event=>{
  event.preventDefault();
  const name=document.querySelector('#building-name');
  const contact=document.querySelector('#building-contact');
  const value=contact.value.trim();
  const valid=value.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : value.replace(/\D/g,'').length>=10;
  contact.setCustomValidity(valid?'':'Укажите e-mail или номер телефона с кодом города.');
  if(!form.reportValidity())return;
  const body=`Здравствуйте! Хочу обсудить строительство с «Дом Мира».\n\nИмя: ${name.value.trim()}\nОбъект: ${typeInput.value}\nКонтакт: ${value}\n\nУчасток, площадь и пожелания: [добавьте информацию о вашем проекте]`;
  window.location.href=`mailto:info@gkvesmir.ru?subject=${encodeURIComponent('Дом Мира — расчет строительства')}&body=${encodeURIComponent(body)}`;
});
document.querySelector('#building-contact').addEventListener('input',event=>event.target.setCustomValidity(''));

const gallery=[...document.querySelectorAll('[data-gallery-index]')];
const lightbox=document.querySelector('#building-lightbox');
let imageIndex=0;
function setImage(index){
  imageIndex=(index+gallery.length)%gallery.length;
  const entry=gallery[imageIndex];
  document.querySelector('#lightbox-image').src=entry.dataset.galleryImage;
  document.querySelector('#lightbox-image').alt=entry.dataset.galleryTitle;
  document.querySelector('#lightbox-title').textContent=entry.dataset.galleryTitle;
}
gallery.forEach((button,index)=>button.addEventListener('click',()=>{setImage(index);openModal(lightbox);}));
document.querySelector('#lightbox-prev').addEventListener('click',()=>setImage(imageIndex-1));
document.querySelector('#lightbox-next').addEventListener('click',()=>setImage(imageIndex+1));
lightbox.addEventListener('keydown',event=>{
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
    event.preventDefault();setImage(imageIndex+(event.key==='ArrowRight'?1:-1));
  }
});
