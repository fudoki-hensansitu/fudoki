# ADR 0041: 書式の癖は opt-in の quirks に置き、本体は全表に効く直しだけにする

状態: 採用（2026-11-11）。[ADR 0027](0027-refresh-fingerprints-by-table-content.md) の指紋の範囲と、[ADR 0036](0036-shared-coupled-pdf-readings.md) の選択式の部品を、層別の読み方（`generic_text`・`generic_scan`）の木の判定へ広げる。

一つの書式（多くは一つの自治体）のための判定は、`ingestion/generic/patterns/quirks/<名前>.py` に置き、使う変換の workflow で選ぶ。

1. 文書全体に効く癖は `options.workflow.quirks`、内訳の段に効く癖は `options.workflow.hierarchy.breakdown.<段>.quirks` に、名前と値（`true` か、その癖の設定）で書く。
2. 癖のモジュールは `SCOPE`（`document` か `axis`）と、値を検める JSON Schema の `OPTIONS` を持つ。workflow の検査は、場所と値がモジュールの宣言に合わない選択を止める。共通の schema（`workflow.schema.json`・`layout_settings.schema.json`）には癖ごとの項目を足さない。
3. 本体（`tree.py`・`scan.py` など）は `patterns.quirk(settings, 名前)` で選択を引き、選ばれたときだけモジュールの関数を呼ぶ。本体が癖のモジュールを静的に import しないので、癖のコードは選んだ変換の指紋にだけ入る。癖を足す・直すと、それを選んだ表だけが古くなる。
4. 本体を直すのは、全表に効くべき直しと、癖を差し込む場所（呼び出し口）を足すときだけにする。呼び出し口を足すと全表が古くなるので、まとめて足す。
5. 変換は、固定した OCR 観測を読む処理（`lib/ocr_ink.py`）だけを import し、OCR の取得（`lib/scan_ocr.py`・`paddle_ocr.py`・`vlm_ocr.py`）を import しない。観測は SHA で固定してあり、取得のコードを変えても表は変わらない。
6. Python のコードの指紋は、docstring を除いた構文木で取る。コメント・docstring・字配りだけの変更では表は古くならない。構文木の書き出しは Python の版に依存するので、Python を上げると一度だけ全表が古くなる。

2026-11-11 時点で、801 変換のうち 711 が `tree.py`・`scan.py` に依存し、`tree.py` には特定の自治体の資料を挙げた判定が約40か所あった。設定で切り替える判定（`name_column`・`line_starts` など）もコードは本体にあり、ある書式のために直すたびに全表の refresh（1回 1〜2時間）が要った。4区の当初予算の共通 PR では、書式向けの判定を本体の既定の振る舞いに入れたため、refresh のたびに別の表の差が見つかり4回回した。

## Considered Options

- **本体の設定（`layout.options` の項目）で切り替え続ける**: 選ばない表の出力は変わらないが、コードは本体にあるので指紋は全表で変わる。項目を足すたびに共通の schema も変わる。
- **関数単位で指紋を取る**: 本体を分けずに済むが、呼び出しの解決（`load_pattern` の文字列、属性の参照）を静的に辿れず、取りこぼすと表が変わったのに古いと出ない。
- **既存の判定を全部 quirks へ移す**: 本体に残る経験則のうち、どの表で効いているかが分からないものは、移すと選ばなかった表の出力が変わり得る。設定で切り替えていた判定と、使う自治体が明らかな判定から移し、残りは効いている表を測ってから移す。

## Consequences

既存の判定で quirks に移したのは、設定で切り替えていた判定 16 個（`glued_numbers`・`name_column`・`heading_repeated_over_code`・`bracket_line_closes_name`・`line_starts`・`opening_bracket_ink`・`names_end_with_kind_words`・`bracketed_remainder`・`headings`・`rows`・`rows_from`・`name_columns`・`fitted_names`・`sum_levels`・`under`・`unnumbered_shift`）、中央区の出張所の見出し（`office_departments`）、足立区の事業別決算説明書（`explained_projects`）と板橋区の内側の表（`inner_tables`）。使っていた管理 JSON は workflow の `quirks` に書き換えた。`yen_marked`・`bare_amounts`・`amount_brackets` など多くの自治体が使う設定は本体に残す。

移した時点で全表の指紋が一度変わる。中身の差は全表の `ingestion:refresh` で確かめる。
