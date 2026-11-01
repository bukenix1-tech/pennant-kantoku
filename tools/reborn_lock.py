# 転生選手のリスト（_private/reborn.json）を、家族の合言葉で暗号化して js/reborn.enc.json に書く
# 使い方（baseball フォルダで）: python tools/reborn_lock.py
# 合言葉はここで 2 回打つ（画面には出ない）。_private/ は Git に入らない
# 編集の道具（tools/reborn_edit.py）からは lock() と unlock() を使う
import base64, getpass, hashlib, hmac, json, os, sys

ITER = 200000
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(here, '_private', 'reborn.json')
dst = os.path.join(here, 'js', 'reborn.enc.json')


def _keys(pw, salt, it):
    key = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, it, 64)
    return key[:32], key[32:]


def _stream(enc_key, nonce, n):
    return b''.join(hmac.new(enc_key, nonce + i.to_bytes(4, 'big'), 'sha256').digest() for i in range((n + 31) // 32))


def lock(players, pw):
    """リストを暗号化して js/reborn.enc.json に書く"""
    data = json.dumps(players, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    salt, nonce = os.urandom(16), os.urandom(16)
    enc_key, mac_key = _keys(pw, salt, ITER)
    ct = bytes(a ^ b for a, b in zip(data, _stream(enc_key, nonce, len(data))))
    tag = hmac.new(mac_key, nonce + ct, 'sha256').digest()
    b64 = lambda b: base64.b64encode(b).decode('ascii')
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'v': 1, 'iter': ITER, 'salt': b64(salt), 'nonce': b64(nonce), 'ct': b64(ct), 'tag': b64(tag)}, f)
        f.write('\n')


def unlock(pw):
    """いまの js/reborn.enc.json を開く。合言葉が合わなければ None"""
    box = json.load(open(dst, encoding='utf-8'))
    d = lambda k: base64.b64decode(box[k])
    enc_key, mac_key = _keys(pw, d('salt'), box['iter'])
    if not hmac.compare_digest(hmac.new(mac_key, d('nonce') + d('ct'), 'sha256').digest(), d('tag')):
        return None
    ct = d('ct')
    return json.loads(bytes(a ^ b for a, b in zip(ct, _stream(enc_key, d('nonce'), len(ct)))).decode('utf-8'))


if __name__ == '__main__':
    players = json.load(open(src, encoding='utf-8'))
    pw = os.environ.get('REBORN_PASS')  # 試験用。ふだんは打ち込む
    if not pw:
        pw = getpass.getpass('家族の合言葉: ')
        if pw != getpass.getpass('もう一度: '):
            sys.exit('合言葉が一致しません')
    if not pw:
        sys.exit('合言葉が空です')
    lock(players, pw)
    print(f'{len(players)} 人分を暗号化して {os.path.relpath(dst, here)} に書きました')
