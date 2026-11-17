"""ホームのうちのまちの札を画面に見立てたレジの本体を Blender で組み、glb に書き出す。

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python apps/web/brand/receipt_machine.py -- [--render <dir>]

起動中の Blender（Blender MCP など）でも同じ形を組める。そのときは scene `register-v1` の collection `receipt_machine`
の中だけを作り直し、他の scene・object には触らない（書き出しは background のときか、引数に --export を付けたときだけ）。

店のカウンターにある電子レジに見える形にする（実在の製品の形やロゴはなぞらない）。画面は作らない。
画面はホームの緑の札（DOM）で、支柱の上端の empty `mount` に札の下端の中心が来る。
下に現金の引き出し、その上に紙の差し出し口のある前面の帯、さらに上に手前へ傾いた鍵盤の台、奥の中央に画面の支柱。
単位は px 相当。幅 560・奥行き 300・筐体の高さ 176（足を含む）、支柱の上端まで 286。

向き: glTF では前面が +z、上が +y（Blender では前面が -Y、上が +Z で組み、書き出しで glTF の向きへ直る）。
原点（glTF の座標の 0）は差し出し口の溝の中心（前面の外側の面で、紙が出てくる点）。
three.js は model を一様に拡大縮小するだけで、伸ばさない。

object:
- body: 筐体・底の段・ゴムの足・引き出し（合わせ目と引き手の溝）・差し出し口（彫り込み・溝・刃・庇）・鍵盤の台の板。原点は差し出し口の中心
- keys: 小さな角丸のキーの格子と横長のキー。原点は鍵盤の台の面の中心
- btn: 右手前の大きめの「合計」キー。原点はキーの底面の中心。押し込みは glTF の -y（下）へ沈める
- lamp: 通電の灯（台の奥の左）。原点は灯の底面の中心
- pole: 画面の支柱。原点は支柱の底面の中心
- mount: empty。画面（札）の下端の中心が来る点

色は塗り分けの目安だけ（three.js で DESIGN.md の token の色に置き換える）。material は名前で引く。
アニメーションは付けない。書き出した receipt-machine.raw.glb は gltf-transform の dedup だけをかけて
receipt-machine.glb にし、raw は消す。draco・meshopt・quantize は使わない（three.js 側の decoder と原点を変えないため）。
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent if "__file__" in globals() else Path.cwd() / "apps/web/brand"
OUT = HERE.parent / "public/home/receipt-machine.raw.glb"
COLLECTION = "receipt_machine"
STAGE = "receipt_machine_stage"  # render のための床・光・カメラ（書き出さない）
LIVE_SCENE = "register-v1"  # 起動中の Blender ではこの scene だけを作り直す

# 大きさ（Blender の座標。組むあいだは底を z=0、前面を y=-D/2 に置き、最後に原点へ移す）
W = 560.0
D = 300.0
FRONT = -D / 2
BACK = D / 2

FOOT_H = 6.0  # ゴムの足
FOOT_R = 13.0
FEET = [(sx * 236.0, sy * 116.0) for sx in (-1, 1) for sy in (-1, 1)]
PLINTH_Z = 14.0  # 底の段の上端
PLINTH_IN = 9.0  # 底の段の引っ込み
SHELL_Z = 12.0  # 筐体の下端
SHELL_R = 22.0  # 筐体の平面の角の丸み
SHELL_EDGE = 9.0  # 稜の丸み

# 断面（y, z）: 前面は垂直に DECK_Z0 まで立ち、そこから鍵盤の台が奥へ上がり、DECK_Y1 から奥は水平
DECK_Z0 = 132.0  # 鍵盤の台の手前の縁の高さ
DECK_Y1 = 30.0  # 鍵盤の台の奥の縁
TOP_Z = 176.0  # 奥の水平な天板の高さ

# 現金の引き出し（前面の下）
DRAWER_Z = (20.0, 76.0)
DRAWER_W = W - 36.0
SEAM = 2.0  # 合わせ目の溝の幅
PULL_W = 220.0  # 引き手の溝
PULL_H = 9.0
PULL_Z = 64.0
PULL_DEPTH = 7.0

# 差し出し口と刃（引き出しの上の前面の帯）
SLOT_W = 440.0
SLOT_H = 12.0
SLOT_Z = 102.0  # 底からの高さ（紙が出てくる点）
PANEL_W = 476.0  # 差し出し口の周りの浅い彫り込み
PANEL_H = 38.0
PANEL_DEPTH = 4.0
LIP_W = 452.0  # 差し出し口の下で紙を受ける庇
LIP_OUT = 11.0
LIP_T = 4.0
BLADE_W = 452.0
BLADE_H = 5.0

# 鍵盤の台（傾いた面の上に置く板と、キー）
DECK_PLATE_IN = 22.0  # 台の縁からの板の引っ込み
KEY = 26.0  # 小さなキーの一辺
KEY_H = 7.0
KEY_R = 6.0
PITCH = (36.0, 32.0)  # キーの間隔（横, 斜面に沿う方向）
ROWS = (48.0, 16.0, -16.0, -48.0)  # 台の中心から斜面に沿った各段の位置（奥が正）
SMALL_U = (-212.0, -176.0, -140.0, -104.0)  # 小さなキーの格子の列
WIDE = [(-40.0, 48.0, 64.0), (32.0, 48.0, 64.0), (-40.0, 16.0, 64.0), (32.0, 16.0, 64.0), (-4.0, -16.0, 136.0), (-4.0, -48.0, 136.0)]  # (u, v, 幅)
SIDE_U = 104.0  # 合計キーの左の小さなキーの列
TOTAL = (176.0, -32.0, 84.0, 58.0)  # 合計キー (u, v, 幅, 奥行き)
TOTAL_H = 9.0

# 灯（台の奥の右）と支柱（奥の中央）
LAMP = (204.0, 64.0)
LAMP_SIZE = (18.0, 6.0)
LAMP_H = 1.6
POLE = (0.0, 96.0)
POLE_SIZE = (64.0, 26.0)
POLE_TOP = 286.0
POLE_BASE = (128.0, 70.0, 5.0)  # 支柱の根元の台座


def srgb(hex_: str, a: float = 1.0) -> tuple:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    h = hex_.lstrip("#")
    return tuple(lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)


def material(name: str, color: tuple, rough: float, metal: float = 0.0, emit: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.0
    if emit:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emit
    mat.diffuse_color = color
    mat.use_backface_culling = True  # glTF で片面にする
    return mat


MATS: dict = {}


def materials() -> None:
    # 艶は控えめな樹脂。material は名前で共有されるので、同じ名前を使う他の scene の色を変えないよう前の model の値のままにする
    MATS["shell"] = material("shell", srgb("#2f6b4f"), 0.8)
    MATS["cover"] = material("cover", srgb("#3f8462"), 0.75)
    MATS["slot"] = material("slot", srgb("#16201b"), 0.9)
    MATS["blade"] = material("blade", srgb("#b9bcb8"), 0.45, metal=1.0)
    MATS["knob"] = material("knob", srgb("#efe8d8"), 0.7)
    MATS["led"] = material("led", srgb("#8fe39a"), 0.5, emit=1.5)
    MATS["rubber"] = material("rubber", srgb("#26292a"), 0.9)


def reset() -> bpy.types.Collection:
    if bpy.app.background:
        for ob in list(bpy.data.objects):
            remove(ob)
        scene = bpy.context.scene
    else:
        scene = bpy.data.scenes.get(LIVE_SCENE) or bpy.data.scenes.new(LIVE_SCENE)
        bpy.context.window.scene = scene
    col = bpy.data.collections.get(COLLECTION)
    if col is None:
        col = bpy.data.collections.new(COLLECTION)
    if col.name not in scene.collection.children:
        scene.collection.children.link(col)
    for ob in list(col.objects):
        remove(ob)
    return col


def rrect(w: float, d: float, r: float, seg: int = 6) -> list:
    """角を丸めた長方形の輪郭（反時計回り）"""
    r = min(r, w / 2, d / 2)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def new_object(name: str, bm: bmesh.types.BMesh, mats: list) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(MATS[m] if isinstance(m, str) else m)
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    return ob


def prism(name: str, outline: list, z0: float, z1: float, mat: str, axis: str = "Z") -> bpy.types.Object:
    """輪郭を押し出した柱。axis=Z は (x, y) の輪郭を z へ、Y は (x, z) の輪郭を y へ、X は (y, z) の輪郭を x へ"""
    bm = bmesh.new()
    verts = [bm.verts.new((p[0], p[1], z0)) for p in outline]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, verts=[v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)], vec=(0, 0, z1 - z0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if axis == "Y":
        for v in bm.verts:
            v.co = Vector((v.co.x, v.co.z, v.co.y))
    elif axis == "X":
        for v in bm.verts:
            v.co = Vector((v.co.z, v.co.x, v.co.y))
    # 面の向きを外へ揃える（recalc_face_normals は細長い柱で向きを誤ることがあるので、符号付きの体積で決める）
    bm.normal_update()
    if sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return new_object(name, bm, [mat])


def move(ob: bpy.types.Object, offset: tuple) -> None:
    """mesh の頂点を動かす（matrix_world は depsgraph の更新まで古いので、object の位置は使わない）"""
    ob.data.transform(Matrix.Translation(offset))


def bevel(ob: bpy.types.Object, width: float, seg: int, angle: float = 40.0) -> None:
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = seg
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)


def cut(ob: bpy.types.Object, cutter: bpy.types.Object) -> None:
    mod = ob.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    if hasattr(mod, "material_mode"):
        mod.material_mode = "TRANSFER"
    cutter.display_type = "WIRE"
    cutter.hide_render = True


def bake(ob: bpy.types.Object) -> bpy.types.Object:
    """modifier を適用した mesh に置き換える"""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def remove(ob: bpy.types.Object) -> None:
    me = ob.data if ob.type == "MESH" else None
    bpy.data.objects.remove(ob)
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)


def join(name: str, parts: list) -> bpy.types.Object:
    """複数の object を一つの mesh にまとめる（material は名前で揃える）"""
    bm = bmesh.new()
    slots: list = []
    for ob in parts:
        me = ob.data.copy()
        index = []
        for m in me.materials:
            if m.name not in slots:
                slots.append(m.name)
            index.append(slots.index(m.name))
        for p in me.polygons:
            p.material_index = index[p.material_index] if index else 0
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        remove(ob)
    return new_object(name, bm, [bpy.data.materials[s] for s in slots])


def smooth(ob: bpy.types.Object, angle: float = 35.0) -> None:
    me = ob.data
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(angle))


SLOPE = math.atan2(TOP_Z - DECK_Z0, DECK_Y1 - FRONT)  # 鍵盤の台の傾き
DECK_L = math.hypot(TOP_Z - DECK_Z0, DECK_Y1 - FRONT)
DECK_C = Vector((0.0, (FRONT + DECK_Y1) / 2, (DECK_Z0 + TOP_Z) / 2))
DECK = Matrix.Translation(DECK_C) @ Matrix.Rotation(SLOPE, 4, "X")  # 台の面の座標（u: 横, v: 奥へ上る, n: 面の法線）
PLATE_T = 1.5  # 台の板の面の高さ（n）


def on_deck(ob: bpy.types.Object, u: float, v: float, n: float = 0.0) -> bpy.types.Object:
    ob.data.transform(DECK @ Matrix.Translation((u, v, n)))
    return ob


def cap(name: str, w: float, d: float, r: float, h: float, edge: float, mat: str) -> bpy.types.Object:
    """底面の中心を原点にした角丸の帽子形"""
    ob = prism(name, rrect(w, d, r, 4), 0, h, mat)
    bevel(ob, edge, 2)
    return bake(ob)


def front_cut(name: str, w: float, h: float, r: float, z: float, depth: float, mat: str) -> bpy.types.Object:
    """前面に彫る角丸の穴（(x, z) の輪郭を前面から奥へ）"""
    ob = prism(name, rrect(w, h, r, 4), FRONT - 20, FRONT + depth, mat, axis="Y")
    move(ob, (0, 0, z))
    return ob


def body() -> bpy.types.Object:
    parts = []
    # 筐体: 平面の角を丸めた箱から、鍵盤の台の斜面と奥の天板より上を削る
    shell = prism("shell_main", rrect(W, D, SHELL_R, 8), SHELL_Z, TOP_Z + 60, "shell")
    s = math.tan(SLOPE)
    y0 = FRONT - 30
    top = prism("cut_top", [(y0, DECK_Z0 - 30 * s), (DECK_Y1, TOP_Z), (BACK + 30, TOP_Z), (BACK + 30, TOP_Z + 100), (y0, TOP_Z + 100)], -W, W, "shell", axis="X")
    cut(shell, top)
    bake(shell)
    bevel(shell, SHELL_EDGE, 3, angle=30)
    bake(shell)
    # 差し出し口の周りの浅い彫り込みと、溝
    cuts = [
        front_cut("cut_panel", PANEL_W, PANEL_H, 8, SLOT_Z, PANEL_DEPTH, "shell"),
        front_cut("cut_slot", SLOT_W, SLOT_H, 3, SLOT_Z, 40, "slot"),
        front_cut("cut_pull", PULL_W, PULL_H, PULL_H / 2, PULL_Z, PULL_DEPTH, "slot"),
    ]
    # 引き出しの合わせ目（前面の細い溝の輪）
    dh = DRAWER_Z[1] - DRAWER_Z[0]
    ring = front_cut("cut_seam", DRAWER_W, dh, 8, (DRAWER_Z[0] + DRAWER_Z[1]) / 2, 3, "slot")
    inner = prism("cut_seam_in", rrect(DRAWER_W - 2 * SEAM, dh - 2 * SEAM, 8 - SEAM, 4), FRONT - 30, FRONT + 10, "slot", axis="Y")
    move(inner, (0, 0, (DRAWER_Z[0] + DRAWER_Z[1]) / 2))
    cut(ring, inner)
    bake(ring)
    cuts.append(ring)
    for ob in cuts:
        cut(shell, ob)
    bake(shell)
    for ob in list(COL.objects):
        if ob.name.startswith("cut_"):
            remove(ob)
    parts.append(shell)

    # 底の段
    plinth = prism("plinth", rrect(W - 2 * PLINTH_IN, D - 2 * PLINTH_IN, SHELL_R - PLINTH_IN, 8), FOOT_H, PLINTH_Z, "shell")
    bevel(plinth, 2.5, 2)
    parts.append(bake(plinth))

    # ゴムの足
    for i, (fx, fy) in enumerate(FEET):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=FOOT_R - 2, radius2=FOOT_R, depth=FOOT_H + 1)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(fx, fy, (FOOT_H + 1) / 2))
        parts.append(new_object(f"foot{i}", bm, ["rubber"]))

    # 刃: 差し出し口の上の縁に沿う金属の帯。下の縁はぎざぎざ
    teeth = 64
    outline = [(BLADE_W / 2, BLADE_H), (-BLADE_W / 2, BLADE_H)]
    for i in range(teeth * 2 + 1):
        x = -BLADE_W / 2 + BLADE_W * i / (teeth * 2)
        outline.append((x, 0.0 if i % 2 == 0 else -1.6))
    blade = prism("blade", outline, FRONT + PANEL_DEPTH - 1, FRONT - 0.8, "blade", axis="Y")
    move(blade, (0, 0, SLOT_Z + SLOT_H / 2 + 0.5))
    parts.append(blade)

    # 差し出し口の下の庇（紙を手前下へ受ける）
    y_in = FRONT + PANEL_DEPTH + 1
    zt = SLOT_Z - SLOT_H / 2
    lip = prism("lip", [(y_in, zt), (y_in, zt - LIP_T - 2), (FRONT - LIP_OUT, zt - LIP_T - 1.5), (FRONT - LIP_OUT, zt - 1.5)], -LIP_W / 2, LIP_W / 2, "shell", axis="X")
    bevel(lip, 1.5, 2)
    parts.append(bake(lip))

    # 鍵盤の台の板（斜面に少し埋めた暗い板。キーはこの上に載る）
    plate = cap("deck_plate", W - 2 * DECK_PLATE_IN, DECK_L - 2 * DECK_PLATE_IN + 8, 10, 5, 1.2, "cover")
    parts.append(on_deck(plate, 0, 0, PLATE_T - 5))
    return join("body", parts)


def keys() -> bpy.types.Object:
    parts = []
    for v in ROWS:
        for u in SMALL_U:
            parts.append(on_deck(cap("key", KEY, KEY - 2, KEY_R, KEY_H, 2.0, "knob"), u, v, PLATE_T))
    for u, v, w in WIDE:
        parts.append(on_deck(cap("key", w, KEY - 2, KEY_R, KEY_H, 2.0, "knob"), u, v, PLATE_T))
    for v in ROWS[:2]:
        for u in (SIDE_U, TOTAL[0]):
            parts.append(on_deck(cap("key", KEY, KEY - 2, KEY_R, KEY_H, 2.0, "knob"), u, v, PLATE_T))
    for v in ROWS[2:]:
        parts.append(on_deck(cap("key", KEY, KEY - 2, KEY_R, KEY_H, 2.0, "knob"), SIDE_U, v, PLATE_T))
    return join("keys", parts)


def total_key() -> bpy.types.Object:
    ob = cap("btn", TOTAL[2], TOTAL[3], 9, TOTAL_H, 2.5, "knob")
    return on_deck(ob, TOTAL[0], TOTAL[1], PLATE_T)


def lamp() -> bpy.types.Object:
    ob = cap("lamp", LAMP_SIZE[0], LAMP_SIZE[1], LAMP_SIZE[1] / 2, LAMP_H, 0.8, "led")
    move(ob, (LAMP[0], LAMP[1], TOP_Z))
    return ob


def pole() -> bpy.types.Object:
    """画面の支柱。天板の台座から細い首が立ち、上端に画面を受ける横長の受け"""
    base = cap("pole_base", POLE_BASE[0], POLE_BASE[1], 18, POLE_BASE[2], 2.0, "shell")
    neck = prism("pole_neck", rrect(POLE_SIZE[0], POLE_SIZE[1], 10, 6), 0, POLE_TOP - TOP_Z - 14, "shell")
    bevel(neck, 2.0, 2)
    bake(neck)
    head = cap("pole_head", 104, 32, 12, 16, 3.0, "shell")
    move(head, (0, 0, POLE_TOP - TOP_Z - 16))
    ob = join("pole", [base, neck, head])
    move(ob, (POLE[0], POLE[1], TOP_Z))
    return ob


def build() -> list:
    global COL
    COL = reset()
    materials()
    objs = [body(), keys(), total_key(), lamp(), pole()]
    mount = bpy.data.objects.new("mount", None)
    mount.empty_display_type = "ARROWS"
    mount.empty_display_size = 30
    COL.objects.link(mount)
    # 原点を差し出し口の中心へ移す。他の object はそれぞれの原点へ
    shift = Matrix.Translation((0, -FRONT, -SLOT_Z))
    pivots = {
        "body": Vector((0, FRONT, SLOT_Z)),
        "keys": DECK @ Vector((0, 0, PLATE_T)),
        "btn": DECK @ Vector((TOTAL[0], TOTAL[1], PLATE_T)),
        "lamp": Vector((LAMP[0], LAMP[1], TOP_Z)),
        "pole": Vector((POLE[0], POLE[1], TOP_Z)),
    }
    for ob in objs:
        ob.data.transform(shift)
        p = shift @ pivots[ob.name]
        ob.data.transform(Matrix.Translation(-p))
        ob.matrix_world = Matrix.Translation(p)
        smooth(ob)
        ob.data.name = ob.name
    mount.location = shift @ Vector((POLE[0], POLE[1], POLE_TOP))
    return objs + [mount]


def export(objs: list) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
        export_extras=False,
        use_active_scene=True,
    )


def render(dir_: Path, samples: int = 48) -> None:
    """確かめるための絵。床と柔らかい光で、正面やや上と斜め上から撮る（床・光・カメラは collection STAGE に置く）"""
    scene = bpy.context.scene
    stage = bpy.data.collections.get(STAGE) or bpy.data.collections.new(STAGE)
    if stage.name not in scene.collection.children:
        scene.collection.children.link(stage)
    for ob in list(stage.objects):
        bpy.data.objects.remove(ob)
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    except (TypeError, AttributeError):
        pass
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.get("register_world") or bpy.data.worlds.new("register_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.92, 0.9, 0.86, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    me = bpy.data.meshes.new("stage_floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3000)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -SLOT_Z))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material("floor", srgb("#f3f0ea"), 0.9))
    stage.objects.link(bpy.data.objects.new("stage_floor", me))
    for i, (loc, energy, angle) in enumerate((((-500, -700, 900), 2.6, 25), ((800, -300, 500), 0.9, 40), ((0, 600, 800), 0.6, 40))):
        light = bpy.data.objects.new(f"stage_sun{i}", bpy.data.lights.new(f"stage_sun{i}", "SUN"))
        light.data.energy = energy
        light.data.angle = math.radians(angle)
        light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        stage.objects.link(light)
    cam = bpy.data.objects.new("stage_camera", bpy.data.cameras.new("stage_camera"))
    cam.data.lens = 70
    cam.data.clip_start = 10
    cam.data.clip_end = 20000
    stage.objects.link(cam)
    scene.camera = cam
    dir_.mkdir(parents=True, exist_ok=True)
    target = Vector((0, D / 2, 30))
    for name, down, side in (("front", 14, 0), ("angle", 30, -36)):
        dv = Vector((0, -1, 0))
        dv.rotate(Matrix.Rotation(math.radians(side), 3, "Z"))
        dv = (dv * math.cos(math.radians(down)) + Vector((0, 0, math.sin(math.radians(down))))) * 2300
        cam.location = target + dv
        cam.rotation_euler = (-dv).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(dir_ / f"receipt-machine-{name}.png")
        bpy.ops.render.render(write_still=True)


COL = None


def main(argv: list) -> list:
    objs = build()
    if "--export" in argv or bpy.app.background:
        export(objs)
    if "--render" in argv:
        samples = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 48
        render(Path(argv[argv.index("--render") + 1]), samples)
    return objs


main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else globals().get("ARGV", []))
