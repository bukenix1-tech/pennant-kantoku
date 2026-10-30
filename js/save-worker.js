'use strict';

// セーブの圧縮を、画面とは別の流れでする（大きいセーブでも画面が固まらないように）
importScripts('lz-string.min.js');
onmessage = e => { postMessage({ seq: e.data.seq, out: LZString.compressToUTF16(e.data.json) }); };
