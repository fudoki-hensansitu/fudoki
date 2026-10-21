"""評価資料を頁ごとの PDF にして AI Search の索引へ登録する（dd.md「索引の登録 script と宣言」）。

    bun run --cwd pipeline evaluation:index            # 計画の表示だけ（R2 と索引は読むだけ）
    bun run --cwd pipeline evaluation:index --write    # 登録して、確認できた出典の記録を instance.json に書く

ネットワークと `cf` を使うので sandbox の外で手動実行し、CI では回さない。分割した PDF は保存しない。
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import pypdfium2 as pdfium

from evaluation_search import plan

NAMESPACE = 'default'
CACHE = plan.PIPELINE / '.cache/evaluation-search/origins'
PER_PAGE = 50  # items list の上限
POLL_SECONDS = 15
# 未完了の item を待つ期限。取り込みは 1 頁あたり数十秒〜数分で、246 頁は 10 分前後で終わる見込み
DEFAULT_TIMEOUT_MINUTES = 30
PENDING = {'queued', 'running'}
FAILED = {'error', 'skipped', 'outdated'}
# 手元で読める文字がこれ以上ある頁を、取り込み後の本文が空でないかの見本にする
MIN_PROBE_CHARS = 50
# 取り込み後の本文が手元の 1/10 未満なら読めていないとみなす（墨田区の2023年度は 1,000 字超が 1〜2 字になった）
READABLE_RATIO = 10


def log(message: str) -> None:
    print(message, flush=True)


def cf(*args: str, parse: bool = True):
    """cf を呼ぶ。一時的な失敗に備えて 3 回まで試し、尽きたら止める。混雑の 429 は待ちを延ばして 6 回まで試す（続けての delete で出る）。"""
    last = ''
    attempt = 0
    while True:
        result = subprocess.run(['cf', *args], capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout) if parse and result.stdout.strip() else None
        last = (result.stderr or result.stdout).strip()[-300:]
        busy = '429' in last
        attempt += 1
        if attempt >= (6 if busy else 3):
            break
        time.sleep(15 * attempt if busy else 2 * attempt)
    raise RuntimeError(f'cf {" ".join(args[:3])} が失敗: {last}')


def search_cf(instance_name: str, *args: str, parse: bool = True):
    return cf('ai-search', *args, '--name', NAMESPACE, '--id', instance_name, parse=parse)


# --- 出典 -------------------------------------------------------------------

def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def fetch_origin(origin: plan.Origin) -> Path:
    """R2 の出典をローカルの cache に置く。選定の sha256 と違えば止める（cache が壊れていれば取り直す）。"""
    path = CACHE / f'{origin.sha256}.pdf'
    if path.exists() and sha256_of(path) == origin.sha256:
        return path
    CACHE.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=CACHE, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            for attempt in range(3):  # cf() と同じ。途中まで書いた分は捨てて取り直す
                stream.seek(0)
                stream.truncate()
                try:
                    subprocess.run(['cf', 'r2', 'objects', 'get', origin.r2_key, '--bucket-name', origin.bucket, '--quiet'],
                                   stdout=stream, check=True)
                    break
                except subprocess.CalledProcessError:
                    if attempt == 2:
                        raise
                    time.sleep(2 * (attempt + 1))
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    if sha256_of(temporary) != origin.sha256:
        temporary.unlink(missing_ok=True)
        raise ValueError(f'R2 の出典の sha256 が選定と違う: {origin.r2_key}')
    temporary.replace(path)
    return path


def split_page(document, page: int) -> bytes:
    """出典の 1 頁（1 始まり）だけの PDF。4MiB を超えれば止める。pdfium は thread safe ではないので主 thread で呼ぶ。"""
    single = pdfium.PdfDocument.new()
    buffer = io.BytesIO()
    try:
        single.import_pages(document, [page - 1])
        single.save(buffer)
    finally:
        single.close()
    data = buffer.getvalue()
    if len(data) > plan.MAX_ITEM_BYTES:
        raise ValueError(f'{page} 頁の PDF が {len(data)} byte で、上限 {plan.MAX_ITEM_BYTES} byte を超える')
    return data


def page_text(document, page: int) -> str:
    """pdfium で抜き出した頁（1 始まり）の文字。文字の item の本文で、改行は LF にそろえる。頁と textpage は都度閉じる（数万頁を回すため）。"""
    pdf_page = document[page - 1]
    try:
        textpage = pdf_page.get_textpage()
        try:
            text = textpage.get_text_range()
        finally:
            textpage.close()
    finally:
        pdf_page.close()
    return text.replace('\r\n', '\n').replace('\r', '\n')


def text_chars(document, page: int) -> int:
    """手元の pdfium で読める、空白を除いた文字数。"""
    return len(''.join(page_text(document, page).split()))


def text_item(document, page: int) -> bytes:
    """文字の item（`.md`）の本文。文字が無い頁も item を保つため、空なら改行 1 つにする（頁の数と catalog の範囲を崩さない）。4MiB を超えれば止める。"""
    data = (page_text(document, page).rstrip('\n') + '\n').encode('utf-8')
    if len(data) > plan.MAX_ITEM_BYTES:
        raise ValueError(f'{page} 頁の文字が {len(data)} byte で、上限 {plan.MAX_ITEM_BYTES} byte を超える')
    return data


def item_bytes(document, page: int, fmt: str) -> bytes:
    return text_item(document, page) if fmt == 'md' else split_page(document, page)


def converted_chars(chunks: list[dict]) -> int:
    """取り込み後の chunk の本文の文字数。変換が付ける見出し（## Contents まで と ### Page N）は数えない。"""
    body = ''.join(chunk['text'].split('## Contents', 1)[-1] for chunk in chunks)
    return len(''.join(line for line in body.splitlines() if not line.startswith('### Page')).replace(' ', '').replace('\u3000', ''))


# --- 索引 -------------------------------------------------------------------

def check_instance(config: dict) -> None:
    """索引の設定が instance.json と合っていることを確かめる。合わなければ登録しない。"""
    actual = cf('ai-search', 'get', config['name'], '--name', NAMESPACE)
    expected = {
        'embedding_model': config['embedding_model'],
        'chunk_size': config['chunk_size'],
        'chunk_overlap': config['chunk_overlap'],
        'keyword_tokenizer': config['keyword_tokenizer'],
        'use_ocr': config['use_ocr'],
        'public_endpoint': config['public_endpoint'],
        'custom_metadata': sorted(config['custom_metadata'], key=lambda f: f['field_name']),
    }
    found = {
        'embedding_model': actual['embedding_model'],
        'chunk_size': actual['chunk_size'],
        'chunk_overlap': actual['chunk_overlap'],
        'keyword_tokenizer': actual['indexing_options']['keyword_tokenizer'],
        'use_ocr': actual['indexing_options']['use_ocr'],
        'public_endpoint': bool(actual['public_endpoint_params']['enabled']),
        'custom_metadata': sorted(actual['custom_metadata'], key=lambda f: f['field_name']),
    }
    if actual.get('public_endpoint_id'):
        found['public_endpoint'] = True
    if found != expected:
        raise SystemExit(f'索引の設定が instance.json と違う:\n  期待 {expected}\n  実際 {found}')


def list_items(instance_name: str) -> list[dict]:
    items: dict[str, dict] = {}
    page = 1
    while True:
        rows = search_cf(instance_name, 'items', 'list', '--per-page', str(PER_PAGE), '--page', str(page))
        for row in rows:
            items[row['id']] = row
        if len(rows) < PER_PAGE:
            return list(items.values())
        page += 1


def metadata_matches(item: dict, expected: dict) -> bool:
    actual = item.get('metadata') or {}
    return all(actual.get(name) == value for name, value in expected.items())


@dataclass
class OriginPlan:
    origin: plan.Origin
    page_count: int
    items: list[dict]
    fingerprint: str
    pages: list[int]
    recorded: bool  # 登録の記録が今の計画の指紋と一致する
    fmt: str = 'pdf'                                     # 登録の形。pdf は頁の PDF、md は抜き出した文字
    add: list[dict] = field(default_factory=list)       # 索引に無い
    delete: list[dict] = field(default_factory=list)    # metadata が違う索引の item。消して add で登録し直す
    waiting: int = 0                                     # 正しいが完了していない
    ok: int = 0
    probe_page: int = 0                                  # 手元の文字が最も多い頁。取り込み後の本文が空でないかを見る
    probe_chars: int = 0

    @property
    def dirty(self) -> bool:
        return bool(self.add or self.delete or self.waiting or not self.recorded)


def compare(origin_plan: OriginPlan, indexed: dict[str, dict]) -> None:
    for item in origin_plan.items:
        found = indexed.get(item['key'])
        if found is None:
            origin_plan.add.append(item)
        elif found['status'] != 'completed' and found['status'] not in FAILED:
            origin_plan.waiting += 1  # 取り込み中の metadata は null で返る。未知の状態も待ちに寄せ、完了後に確かめる
        elif found['status'] in FAILED:
            origin_plan.add.append(item)  # 同じ key の upload は item を取り込み直す。失敗した item の delete は 429・timeout になることがある
        elif not metadata_matches(found, item['metadata']):
            origin_plan.delete.append(found)
            origin_plan.add.append(item)
        else:
            origin_plan.ok += 1


def build_plans(instance: dict, origins: list[plan.Origin]) -> tuple[list[OriginPlan], list[dict], dict]:
    """出典を取って頁に分け、索引の item と比べる。分割した PDF の大きさもここで確かめる（保存はしない）。"""
    config = instance['config']
    indexed = {item['key']: item for item in list_items(config['name'])}
    plans: list[OriginPlan] = []
    for origin in origins:
        path = fetch_origin(origin)
        document = pdfium.PdfDocument(str(path))
        try:
            page_count = len(document)
            pages = plan.selected_pages(origin, page_count)
            chars = {}
            fmt = plan.item_format(config, origin)
            for page in pages:
                item_bytes(document, page, fmt)
                chars[page] = text_chars(document, page)
        finally:
            document.close()
        items = plan.plan_items(origin, page_count, fmt)
        origin_plan = OriginPlan(origin, page_count, items, plan.fingerprint(config, items, fmt), pages,
                                 recorded=False, fmt=fmt)
        origin_plan.probe_page = max(pages, key=lambda page: chars[page])
        origin_plan.probe_chars = chars[origin_plan.probe_page]
        record = plan.registration(instance, origin)
        origin_plan.recorded = (record is not None and record['page_count'] == page_count
                                and record['plan_fingerprint'] == origin_plan.fingerprint)
        compare(origin_plan, indexed)
        plans.append(origin_plan)
    planned = {item['key'] for p in plans for item in p.items}
    strays = [item for key, item in indexed.items() if key not in planned]
    return plans, strays, indexed


def describe(plans: list[OriginPlan], strays: list[dict]) -> None:
    for p in plans:
        o = p.origin
        state = '記録あり' if p.recorded else '記録なし'
        log(f'{o.jurisdiction} {o.fiscal_year} {o.sha256[:12]} 出典{p.page_count}頁 → 登録{len(p.pages)}頁 {p.fmt} '
            f'[{state}] 登録済み{p.ok} 待ち{p.waiting} 追加{len(p.add)} 削除{len(p.delete)}')
    log(f'計画に無い item: {len(strays)}')


# --- 書き込み ---------------------------------------------------------------

def save_instance(instance: dict) -> None:
    plan.INSTANCE_PATH.write_text(plan.render_instance(instance), encoding='utf-8')


def drop_record(instance: dict, origin: plan.Origin) -> None:
    before = len(instance['registrations'])
    instance['registrations'] = [r for r in instance['registrations'] if r['origin_sha256'] != origin.sha256]
    if len(instance['registrations']) != before:
        save_instance(instance)


def upload_all(instance_name: str, jobs: list[tuple[dict, Path]], workers: int) -> None:
    def upload(job: tuple[dict, Path]) -> None:
        item, path = job
        metadata = {k: str(v) for k, v in item['metadata'].items()}
        cf('ai-search', 'items', 'upload', instance_name, '--name', NAMESPACE, '--file', str(path),
           '--metadata', json.dumps(metadata), parse=False)

    with ThreadPoolExecutor(workers) as pool:
        for count, _ in enumerate(pool.map(upload, jobs), 1):
            if count % 20 == 0 or count == len(jobs):
                log(f'  登録 {count}/{len(jobs)}')


def apply(instance: dict, plans: list[OriginPlan], strays: list[dict], workers: int) -> None:
    name = instance['config']['name']
    planned = {p.origin.sha256 for p in plans}
    instance['registrations'] = [r for r in instance['registrations'] if r['origin_sha256'] in planned]
    for p in plans:
        if p.dirty:
            drop_record(instance, p.origin)  # 書く前に記録を消す。確認できるまで catalog に載せない
    # 削除は続けると 429・timeout になる。失敗しても止めずに登録へ進む。消し残した item は確認で「余分」になり、
    # その出典の記録を書かないので catalog に載らない。次の実行で消し直す
    failed = 0
    for item in [*strays, *(i for p in plans for i in p.delete)]:
        try:
            search_cf(name, 'items', 'delete', item['id'], '--force', parse=False)
        except RuntimeError as error:
            failed += 1
            log(f'{item["key"]}: 削除できず、次の実行で消し直す: {str(error)[-80:]}')
    if strays or any(p.delete for p in plans):
        log(f'削除 {len(strays) + sum(len(p.delete) for p in plans) - failed}（失敗 {failed}）')
    with tempfile.TemporaryDirectory(prefix='evaluation-index-') as directory:
        jobs: list[tuple[dict, Path]] = []
        for p in plans:
            if not p.add:
                continue
            document = pdfium.PdfDocument(str(CACHE / f'{p.origin.sha256}.pdf'))
            try:
                for item in p.add:
                    page = item['metadata']['page']
                    path = Path(directory) / item['key']
                    path.write_bytes(item_bytes(document, page, p.fmt))
                    jobs.append((item, path))
            finally:
                document.close()
        log(f'登録する item: {len(jobs)}')
        upload_all(name, jobs, workers)


def readable(name: str, p: OriginPlan, indexed: dict[str, dict]) -> bool:
    """手元で文字が読める頁の本文が、取り込み後に空になっていないか。

    埋め込みの無い CID フォントで ToUnicode の無い PDF（UniJIS-UCS2-HW-H・UniJIS-UTF16-H など）は、
    pdfium では読めても AI Search の変換では本文がほぼ空になり、completed のまま検索に出ない。
    """
    if p.probe_chars < MIN_PROBE_CHARS:
        return True
    key = next(item['key'] for item in p.items if item['metadata']['page'] == p.probe_page)
    try:
        chunks = search_cf(name, 'items', 'chunks', indexed[key]['id']) or []
    except RuntimeError as error:  # 一時的な失敗では止めず、記録しないまま次の出典へ。再実行で確かめ直す
        log(f'{p.origin.sha256[:12]}: chunk を取れず、本文を確かめられない: {error}')
        return False
    converted = converted_chars(chunks)
    if converted * READABLE_RATIO >= p.probe_chars:
        return True
    log(f'{p.origin.sha256[:12]}: {p.probe_page} 頁は手元で {p.probe_chars} 文字読めるが、取り込み後は {converted} 文字')
    return False


def wait_and_confirm(instance: dict, plans: list[OriginPlan], timeout_minutes: int) -> bool:
    """全 item が completed になり、数と metadata が計画と一致した出典だけ記録を書く。"""
    name = instance['config']['name']
    targets = [p for p in plans if p.dirty]
    deadline = time.time() + timeout_minutes * 60
    results: dict[str, str] = {}
    while True:
        try:
            indexed = {item['key']: item for item in list_items(name)}
        except RuntimeError as error:  # 待ちは数時間に及ぶので、一覧の一時的な失敗では止めずに次の回で取り直す
            if time.time() > deadline:
                raise
            log(f'  一覧の取得に失敗。{POLL_SECONDS} 秒後に取り直す: {error}')
            time.sleep(POLL_SECONDS)
            continue
        pending = 0
        for p in targets:
            problems = []
            for item in p.items:
                found = indexed.get(item['key'])
                if found is None:
                    problems.append('missing')
                elif found['status'] in PENDING:
                    problems.append('pending')
                elif found['status'] in FAILED:
                    problems.append(found['status'])
                elif found['status'] != 'completed':
                    problems.append('pending')
                elif not metadata_matches(found, item['metadata']):
                    problems.append('metadata')
            results[p.origin.sha256] = ','.join(sorted(set(problems)))
            pending += sum(1 for x in problems if x in ('pending', 'missing'))
        statuses = {}
        for item in indexed.values():
            statuses[item['status']] = statuses.get(item['status'], 0) + 1
        log(f'  待ち {pending} / 状態 {statuses}')
        if pending == 0 or time.time() > deadline:
            break
        time.sleep(POLL_SECONDS)
    # 数の一致: 索引にあるこの出典の item が計画と同数
    ok = True
    for p in targets:
        extra = [k for k in indexed if k.startswith(p.origin.sha256 + '_') and k not in {i['key'] for i in p.items}]
        if not results[p.origin.sha256] and not extra and not readable(name, p, indexed):
            results[p.origin.sha256] = 'unreadable'
        if results[p.origin.sha256] or extra:
            log(f'{p.origin.sha256[:12]}: 確認できない（{results[p.origin.sha256] or "extra"}, 余分{len(extra)}）。記録は消したまま')
            ok = False
            continue
        instance['registrations'].append({
            'origin_sha256': p.origin.sha256, 'page_count': p.page_count, 'plan_fingerprint': p.fingerprint,
            'confirmed_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')})
        log(f'{p.origin.sha256[:12]}: 登録 {len(p.items)} 頁を確認')
    order = {p.origin.sha256: i for i, p in enumerate(plans)}
    instance['registrations'].sort(key=lambda r: order.get(r['origin_sha256'], len(order)))
    save_instance(instance)
    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--write', action='store_true', help='索引へ書き込み、確認できた出典の記録を instance.json に書く')
    parser.add_argument('--workers', type=int, default=3, help='cf の同時実行数（既定 3）')
    parser.add_argument('--timeout-minutes', type=int, default=DEFAULT_TIMEOUT_MINUTES, help='取り込みを待つ期限')
    args = parser.parse_args(argv)

    instance = plan.load_instance()
    origins = plan.load_origins(use_ocr=instance['config']['use_ocr'])
    check_instance(instance['config'])
    plans, strays, _ = build_plans(instance, origins)
    describe(plans, strays)
    if not args.write:
        log('計画の表示だけ。書き込むには --write')
        return 0
    apply(instance, plans, strays, args.workers)
    return 0 if wait_and_confirm(instance, plans, args.timeout_minutes) else 1


if __name__ == '__main__':
    sys.exit(main())
