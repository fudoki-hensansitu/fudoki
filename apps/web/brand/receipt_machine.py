"""ホームのうちのまちの札の下に置くレシートプリンタの立体を Blender で組み、glb に書き出す。

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python apps/web/brand/receipt_machine.py -- [--render <dir>]

起動中の Blender（Blender MCP など）でも同じ形を組める。そのときは collection `receipt_machine` の中だけを作り直し、
他の object には触らない（書き出しは background のときか、引数に --export を付けたときだけ）。

店のレジ横にある感熱式のレシートプリンタに見える、背が低く奥行きの深いずんぐりした筐体にする（実在の製品の形やロゴはなぞらない）。
単位は px 相当。幅 520・高さ 150（足を含む）・奥行き 260。

向き: glTF では前面が +z、上が +y（Blender では前面が -Y、上が +Z で組み、書き出しで glTF の向きへ直る）。
原点（glTF の座標の 0）は差し出し口の中心（前面の外側の面で、紙が出てくる点）。
three.js は model を一様に拡大縮小するだけで、伸ばさない。

object:
- body: 筐体・底の段・ゴムの足・差し出し口・刃・蝶番・側面の放熱スリット。原点は差し出し口の中心
- cover: 天板の奥半分の、紙のロールを収めた丸く膨らんだ蓋（手前に指かけのくぼみ）。原点は蝶番の軸の中心（x=0）
- btn: 紙送りのキー（天板の手前の右）。原点はキーの底面の中心。押し込みは glTF の -y（下）へ沈める
- lamp: 通電の灯（キーの左）。原点は灯の底面の中心

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
LIVE_SCENE = "printer-v3"  # 起動中の Blender ではこの scene だけを作り直す

# 大きさ（Blender の座標。組むあいだは底を z=0、前面を y=-D/2 に置き、最後に原点へ移す）
W = 520.0
D = 260.0
H = 150.0
FRONT = -D / 2

FOOT_H = 6.0  # ゴムの足
FOOT_R = 13.0
FEET = [(sx * 214.0, sy * 98.0) for sx in (-1, 1) for sy in (-1, 1)]
PLINTH_Z = 16.0  # 底の段の上端
PLINTH_IN = 9.0  # 底の段の引っ込み
SHELL_TOP = 100.0  # 筐体の天板（手前半分の低い段）
SHELL_R = 26.0  # 筐体の平面の角の丸み
SHELL_EDGE = 14.0  # 天板の縁の丸み
FRONT_LEAN = 14.0  # 前面の上端を奥へ倒す量（前面を少し上向きにする）
SEAM_Z = 76.0  # 上下の筐体の合わせ目の溝
POCKET = 3.0  # 蓋の周りの隙間

# 差し出し口と刃（前面の下寄り）
SLOT_W = 440.0
SLOT_H = 12.0
SLOT_Z = 44.0  # 底からの高さ（紙が出てくる点）
PANEL_W = 476.0  # 差し出し口の周りの浅い彫り込み
PANEL_H = 50.0
PANEL_DEPTH = 4.0
LIP_W = 452.0  # 差し出し口の下で紙を受ける庇
LIP_OUT = 11.0
LIP_T = 4.0
BLADE_W = 452.0
BLADE_H = 5.0

# 蓋（天板の奥半分）
COVER_W = 492.0
COVER_Y0 = -6.0  # 蓋の手前の縁（筐体の中心からの y）
COVER_Y1 = 118.0  # 蓋の奥の縁
COVER_EXP = 2.6  # 断面の膨らみ（2 で楕円、大きいほど肩が張る）
HINGE_R = 7.0

# 紙送りのキーと灯（天板の手前の右）
KEY = (200.0, -84.0)
KEY_SIZE = 32.0
KEY_R = 7.0
KEY_H = 8.0
LAMP = (156.0, -84.0)
LAMP_SIZE = (16.0, 5.0)
LAMP_H = 1.6

# 側面の放熱スリット
VENT_N = 5
VENT_Y = (22.0, 104.0)
VENT_Z0 = 40.0
VENT_STEP = 12.0
VENT_H = 4.5


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


def body() -> bpy.types.Object:
    parts = []
    # 筐体: 平面の角を丸めた箱。天板の縁を丸める
    shell = prism("shell_main", rrect(W, D, SHELL_R, 8), PLINTH_Z - 2, SHELL_TOP, "shell")
    bevel(shell, SHELL_EDGE, 3)
    bake(shell)
    # 差し出し口の周りの浅い彫り込みと、差し出し口
    panel = prism("cut_panel", rrect(PANEL_W, PANEL_H, 8, 4), FRONT - 20, FRONT + PANEL_DEPTH, "shell", axis="Y")
    move(panel, (0, 0, SLOT_Z))
    slot = prism("cut_slot", rrect(SLOT_W, SLOT_H, 3, 3), FRONT - 20, FRONT + 40, "slot", axis="Y")
    move(slot, (0, 0, SLOT_Z))
    for ob in (slot, panel):
        cut(shell, ob)
    # 上下の筐体の合わせ目の溝（外周をめぐる細い溝）
    ring = prism("cut_seam", rrect(W + 20, D + 20, SHELL_R + 10, 8), SEAM_Z - 1.5, SEAM_Z + 1.5, "slot")
    inner = prism("cut_seam_in", rrect(W - 6, D - 6, SHELL_R - 3, 8), SEAM_Z - 3, SEAM_Z + 3, "slot")
    cut(ring, inner)
    bake(ring)
    cut(shell, ring)
    # 蓋の周りの隙間（蓋が筐体の凹みに収まって見えるように）
    pocket = prism("cut_pocket", rrect(COVER_W + 2 * POCKET, COVER_Y1 - COVER_Y0 + 2 * POCKET, 14, 6), SHELL_TOP - 4, SHELL_TOP + 40, "slot")
    move(pocket, (0, (COVER_Y0 + COVER_Y1) / 2, 0))
    cut(shell, pocket)
    # キーの周りの浅いくぼみ
    bezel = prism("cut_bezel", rrect(KEY_SIZE + 8, KEY_SIZE + 8, KEY_R + 4, 5), SHELL_TOP - 2, SHELL_TOP + 20, "shell")
    move(bezel, (KEY[0], KEY[1], 0))
    cut(shell, bezel)
    # 側面の放熱スリット（左右）
    for i in range(VENT_N):
        z = VENT_Z0 + i * VENT_STEP
        for sx in (-1, 1):
            v = prism(f"cut_vent{i}{sx}", rrect(VENT_Y[1] - VENT_Y[0], VENT_H, VENT_H / 2, 3), sx * W / 2 - 10, sx * W / 2 + 10, "slot", axis="X")
            move(v, (0, (VENT_Y[0] + VENT_Y[1]) / 2, z))
            cut(shell, v)
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

    # 蝶番（蓋の奥の縁、二つの節）
    for i, sx in enumerate((-1, 1)):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=HINGE_R, radius2=HINGE_R, depth=70)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(sx * 150, COVER_Y1 - 2, SHELL_TOP + 2))
        parts.append(new_object(f"hinge{i}", bm, ["shell"]))
    ob = join("body", parts)
    lean(ob)
    return ob


def lean(ob: bpy.types.Object) -> None:
    """前面を上ほど奥へ倒す。前面の近くの頂点を高さに比例して奥へずらし、天板は水平のまま"""
    for v in ob.data.vertices:
        t = min(1.0, max(0.0, (FRONT + 44 - v.co.y) / 24))
        h = min(1.0, max(0.0, (v.co.z - PLINTH_Z) / (SHELL_TOP - PLINTH_Z)))
        v.co.y += FRONT_LEAN * t * h


def cover() -> bpy.types.Object:
    """紙のロールを収めた丸く膨らんだ蓋。断面は奥行き方向の超楕円の上半分"""
    ry = (COVER_Y1 - COVER_Y0) / 2
    yc = COVER_Y0 + ry
    rz = H - SHELL_TOP + 4
    n = 24
    prof = []
    for i in range(n + 1):
        a = math.pi * i / n  # 0: 奥 → π: 手前
        c, s = math.cos(a), math.sin(a)
        y = yc + ry * math.copysign(abs(c) ** (2 / COVER_EXP), c)
        z = rz * abs(s) ** (2 / COVER_EXP)
        prof.append((y, SHELL_TOP - 4 + z))
    ob = prism("cover_raw", prof, -COVER_W / 2, COVER_W / 2, "cover", axis="X")
    bevel(ob, 12.0, 4, angle=30)
    bake(ob)
    # 手前の指かけのくぼみ
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    bmesh.ops.scale(bm, vec=(34, 9, 9), verts=bm.verts)
    finger = new_object("cut_finger", bm, ["cover"])
    move(finger, (0, COVER_Y0 - 3, SHELL_TOP + 15))
    cut(ob, finger)
    bake(ob)
    remove(finger)
    ob.name = "cover"
    ob.data.name = "cover"
    return ob


def rounded_cap(name: str, size: tuple, r: float, h: float, edge: float, mat: str, at: tuple, base: float = SHELL_TOP) -> bpy.types.Object:
    ob = prism(name, rrect(size[0], size[1], r, 4), 0, h, mat)
    bevel(ob, edge, 2)
    bake(ob)
    move(ob, (at[0], at[1], base))
    return ob


def build() -> list:
    global COL
    COL = reset()
    materials()
    objs = [
        body(),
        cover(),
        rounded_cap("btn", (KEY_SIZE, KEY_SIZE), KEY_R, KEY_H, 2.5, "knob", KEY, SHELL_TOP - 2),
        rounded_cap("lamp", LAMP_SIZE, LAMP_SIZE[1] / 2, LAMP_H, 0.8, "led", LAMP),
    ]
    # 原点を差し出し口の中心へ移す。cover は蝶番の軸、btn・lamp は底面の中心を原点にする
    # 前面は上ほど奥へ倒してあるので、差し出し口の高さでの前面の位置を原点にする
    front_at_slot = FRONT + FRONT_LEAN * (SLOT_Z - PLINTH_Z) / (SHELL_TOP - PLINTH_Z)
    shift = Matrix.Translation((0, -front_at_slot, -SLOT_Z))
    pivots = {
        "body": Vector((0, front_at_slot, SLOT_Z)),
        "cover": Vector((0, COVER_Y1 - 2, SHELL_TOP + 2)),
        "btn": Vector((KEY[0], KEY[1], SHELL_TOP - 2)),
        "lamp": Vector((LAMP[0], LAMP[1], SHELL_TOP)),
    }
    for ob in objs:
        ob.data.transform(shift)
        p = shift @ pivots[ob.name]
        ob.data.transform(Matrix.Translation(-p))
        ob.matrix_world = Matrix.Translation(p)
        smooth(ob)
        ob.data.name = ob.name
    return objs


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
    """確かめるための絵。床と柔らかい光で、正面やや上と斜め上から撮る"""
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    except (TypeError, AttributeError):
        pass
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.92, 0.9, 0.86, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, -SLOT_Z))
    floor = bpy.context.object
    floor.data.materials.append(material("floor", srgb("#f3f0ea"), 0.9))
    for loc, energy, angle in (((-500, -700, 900), 2.6, 25), ((800, -300, 500), 0.9, 40), ((0, 600, 800), 0.6, 40)):
        bpy.ops.object.light_add(type="SUN", location=loc)
        light = bpy.context.object
        light.data.energy = energy
        light.data.angle = math.radians(angle)
        light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 70
    cam.data.clip_start = 10
    cam.data.clip_end = 20000
    scene.camera = cam
    dir_.mkdir(parents=True, exist_ok=True)
    target = Vector((0, D / 2, 20))
    for name, down, side in (("front", 20, 0), ("angle", 32, -38)):
        dv = Vector((0, -1, 0))
        dv.rotate(Matrix.Rotation(math.radians(side), 3, "Z"))
        dv = (dv * math.cos(math.radians(down)) + Vector((0, 0, math.sin(math.radians(down))))) * 2200
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


main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
