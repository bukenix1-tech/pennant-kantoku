# 転生選手の編集画面（このパソコンの中だけで動く）
# 使い方：「転生選手を編集.bat」をダブルクリック（または baseball フォルダで python tools/reborn_edit.py）
# 画面で直して保存すると、_private/reborn.json に書き、合言葉で js/reborn.enc.json に暗号化し直す
# 保存の前に、いまの js/reborn.enc.json がその合言葉で開けるか確かめる（打ち間違いで家族が開けなくなるのを防ぐ）
import json, os, shutil, sys, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reborn_lock

PORT = 8770
here = reborn_lock.here
page = os.path.join(here, 'tools', 'reborn_edit.html')
src, bak = reborn_lock.src, os.path.join(here, '_private', 'reborn.bak.json')


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        data = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        if self.path == '/':
            self._send(200, open(page, 'rb').read(), 'text/html; charset=utf-8')
        elif self.path == '/api/list':
            self._json(200, json.load(open(src, encoding='utf-8')) if os.path.exists(src) else [])
        else:
            self._send(404, 'not found', 'text/plain')

    def do_POST(self):
        if self.path != '/api/save':
            return self._send(404, 'not found', 'text/plain')
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8'))
        players, pw = body.get('players'), body.get('pass') or ''
        if not isinstance(players, list) or not pw:
            return self._json(400, {'msg': '中身か合言葉がありません'})
        ids = [p.get('id') for p in players]
        if any(not i for i in ids) or len(set(ids)) != len(ids):
            return self._json(400, {'msg': 'id が空か、重なっている選手がいます'})
        if os.path.exists(reborn_lock.dst) and reborn_lock.unlock(pw) is None:
            return self._json(403, {'msg': '合言葉が、いまの暗号化ファイルと合いません。保存していません'})
        if os.path.exists(src):
            shutil.copyfile(src, bak)  # 1 つ前の版を残す
        with open(src, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(players, f, ensure_ascii=False, indent=2)
            f.write('\n')
        reborn_lock.lock(players, pw)
        self._json(200, {'msg': f'{len(players)} 人分を保存して、暗号化し直しました'})

    def log_message(self, *a):
        pass  # 黒い画面に通信の記録を出さない


if __name__ == '__main__':
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)  # このパソコンからだけ開ける
    url = f'http://127.0.0.1:{PORT}/'
    print(f'転生選手の編集画面：{url}')
    print('やめるときは、この黒い画面を閉じてください。')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    srv.serve_forever()
