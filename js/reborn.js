'use strict';

// 転生選手：名選手をもとにした選手が、毎年だいたい 1 人ドラフト候補として現れる（いま球界にいる人は出ない。引退したらまた出られる）
// リストは家族の合言葉で暗号化してある（js/reborn.enc.json）。合言葉を入れた端末でだけ読めて、転生選手が出る
// リストの元は _private/reborn.json（Git に入れない）。直したら python tools/reborn_lock.py で暗号化し直す
//   name ：ゲームに出る名前 ／ team：元の所属球団の地名 ／ note：どんな選手か
//   kind ：高校 / 大学 / 社会人 / 高卒社会人 ／ peak：ピーク時の能力 ／ traj：弾道 ／ weight：選ばれやすさ（ふつう 1）
//   投手は peak に velo（km/h でよい）・control・stamina・breaking、role（先発 / 中継 / 抑え）、apt（{ sp, rp }：0△ 1〇 2◎。書かなければ role から）
//   二刀流は twoWay: true にして、peak に投打の両方を書く（pos2：野手のときの守備位置）
//   type：成長型（書かなければ晩成） ／ retireAge：この年齢までは引退しない（衰えもゆるやか）
//   出身地は team の本拠地。才能は ★5。天才肌になる確率はふつうの選手と同じ。出身校は「？？？」
let REBORN = [];
const REBORN_PASS_KEY = 'pennant-family-pass';

function rebornPass() { try { return localStorage.getItem(REBORN_PASS_KEY) || ''; } catch (e) { return ''; } }

// 合言葉でリストを開く。合わなければ null
async function unlockReborn(pass) {
  try {
    const box = await (await fetch('js/reborn.enc.json', { cache: 'no-cache' })).json();
    const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(box.salt), iterations: box.iter }, base, 512));
    const hk = raw => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const encKey = await hk(bits.slice(0, 32)), macKey = await hk(bits.slice(32));
    const nonce = b64(box.nonce), ct = b64(box.ct), want = b64(box.tag);
    const tag = new Uint8Array(await crypto.subtle.sign('HMAC', macKey, cat(nonce, ct)));
    if (tag.length !== want.length || tag.some((x, i) => x !== want[i])) return null;
    const out = new Uint8Array(ct.length);
    for (let i = 0; i * 32 < ct.length; i++) {
      const ctr = new Uint8Array(4);
      new DataView(ctr.buffer).setUint32(0, i);
      const ks = new Uint8Array(await crypto.subtle.sign('HMAC', encKey, cat(nonce, ctr)));
      for (let j = 0; j < 32 && i * 32 + j < ct.length; j++) out[i * 32 + j] = ct[i * 32 + j] ^ ks[j];
    }
    return JSON.parse(new TextDecoder().decode(out));
  } catch (e) {
    return null;
  }
}

// 開くときに、覚えている合言葉で読んでおく
const rebornReady = (async () => {
  const pass = rebornPass();
  if (!pass) return;
  const list = await unlockReborn(pass);
  if (list) REBORN = list;
})();
