// Перебор числа для защиты формы: ищем n, при котором SHA-256(salt + n) совпадает с challenge.
const encoder = new TextEncoder();

async function sha256(text) {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async event => {
  const {challenge, salt, maxnumber} = event.data;
  for (let n = 0; n <= maxnumber; n += 1) {
    if (await sha256(`${salt}${n}`) === challenge) {
      self.postMessage({number: n});
      return;
    }
  }
  self.postMessage({number: null});
};
