# 転生選手のリスト（_private/reborn.json）を、家族の合言葉で暗号化して js/reborn.enc.json に書く
# 使い方（baseball フォルダで）: python tools/reborn_lock.py
# 合言葉はここで 2 回打つ（画面には出ない）。_private/ は Git に入らない
import base64, getpass, hashlib, hmac, json, os, sys

ITER = 200000
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(here, '_private', 'reborn.json')
dst = os.path.join(here, 'js', 'reborn.enc.json')

data = json.dumps(json.load(open(src, encoding='utf-8')), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
pw = os.environ.get('REBORN_PASS')  # 試験用。ふだんは打ち込む
if not pw:
    pw = getpass.getpass('家族の合言葉: ')
    if pw != getpass.getpass('もう一度: '):
        sys.exit('合言葉が一致しません')
if not pw:
    sys.exit('合言葉が空です')

salt, nonce = os.urandom(16), os.urandom(16)
key = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, ITER, 64)
enc_key, mac_key = key[:32], key[32:]
stream = b''.join(hmac.new(enc_key, nonce + i.to_bytes(4, 'big'), 'sha256').digest() for i in range((len(data) + 31) // 32))
ct = bytes(a ^ b for a, b in zip(data, stream))
tag = hmac.new(mac_key, nonce + ct, 'sha256').digest()
b64 = lambda b: base64.b64encode(b).decode('ascii')
with open(dst, 'w', encoding='utf-8', newline='\n') as f:
    json.dump({'v': 1, 'iter': ITER, 'salt': b64(salt), 'nonce': b64(nonce), 'ct': b64(ct), 'tag': b64(tag)}, f)
    f.write('\n')
print(f'{len(json.loads(data))} 人分を暗号化して {os.path.relpath(dst, here)} に書きました')
