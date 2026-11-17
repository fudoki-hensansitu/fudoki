"""ホームのうちのまちの札の下に置くレシートの機械の立体を Blender で組み、glb に書き出す。

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python apps/web/brand/receipt_machine.py -- [--render <dir>]

起動中の Blender で組んで見るときは、Blender MCP の execute_blender_code からこの file を exec する。
利用者の scene には触れず、専用の scene（receipt-machine）に組む。glb は名前が利用者の data と重ならない背景の実行で書き出す。

店のレジ横にある感熱式のレシートプリンタに見える形にする（実在の製品の形やロゴはなぞらない）。
背が低く奥行きの深い筐体で、天板の奥半分は紙のロールを収めた丸く膨らんだ蓋、手前半分は一段低い天板。
前面の下寄りに紙の幅（DOM の .rc-print の最大幅 440）の差し出し口と刃の帯があり、紙（DOM のレシート）はそこから手前下へ出る。
紙送りのキーと灯は前面の右上。側面に放熱のスリット、底に一段引っ込んだ台座とゴムの足。大きな窓・液晶・天板の丸いボタンは置かない。

three.js は伸ばさずに一様に拡大縮小するだけ。単位は px 相当（幅 520・高さ 150・奥行き 260）。
glTF では前面が +z、上が +y で、原点は差し出し口の中心（紙が出てくる点）。three.js はこの点を DOM の紙の上端に合わせる。
body・btn・lamp の原点はこの点。cover の原点は蝶番の軸の中心で、蓋を開ける回転はこの点の x 軸回りになる。
btn は前面から手前（+z）に出ていて、押すと -z へ沈む。

色は塗り分けの目安だけ（three.js で DESIGN.md の token の色に置き換える）。material は名前で引く。
アニメーションは付けない（three.js の AnimationClip で付ける）。
書き出した receipt-machine.raw.glb は gltf-transform の dedup だけをかけて receipt-machine.glb にし、raw は消す。
draco・meshopt は three.js 側で decoder が要るので使わない。quantize は元に戻す拡大と移動を node に載せて原点がずれるので使わない。
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public/home/receipt-machine.raw.glb"

# 筐体の寸法（組み立ての座標：底面 y=0、前面 z=+D/2、左右の中心 x=0）
W = 520.0
D = 260.0
FRONT = D / 2
BASE_H = 12.0  # 一段引っ込んだ台座の高さ
BASE_INSET = 8.0
STEP_Y = 100.0  # 手前半分の天板の高さ
BODY_R = 14.0  # 筐体の角の丸み

# 紙のロールの蓋（天板の奥半分）。断面は楕円の半分
LID_FRONT = -2.0
LID_BACK = -D / 2 + 2.0
LID_TOP = 150.0
LID_W = W - 16.0

# 差し出し口と刃の帯（前面の下寄り）
SLOT_W = 440.0
SLOT_H = 12.0
SLOT_Y = 46.0
SLOT_DEPTH = 18.0

# 紙送りのキーと灯（前面の右上）
KEY_W = 30.0
KEY_H = 14.0
KEY_OUT = 4.0
KEY = (200.0, 78.0)
LAMP_R = 3.0
LAMP = (168.0, 78.0)

# 側面の放熱のスリット
VENT_YS = (42.0, 52.0, 62.0, 72.0)
VENT_LEN = 96.0
VENT_Z = 26.0

FEET = [(sx * (W / 2 - 50), sz * (D / 2 - 40)) for sx in (-1, 1) for sz in (-1, 1)]
FOOT_R = 12.0
FOOT_H = 4.0

# 原点にする点（差し出し口の中心）と蝶番の軸
ORIGIN = (0.0, SLOT_Y, FRONT)
HINGE = (0.0, STEP_Y + 4.0, LID_BACK)


def gl(x: float, y: float, z: float) -> Vector:
    """glTF の座標（前面 +z、上 +y）を Blender の座標へ"""
    return Vector((x, -z, y))


LIVE = not bpy.app.background
SCENE = "receipt-machine"
TAG = "receipt_machine"


def reset() -> None:
    """背景で動かすときは空の状態から組む。起動中の Blender（Blender MCP から実行）では、
    利用者の scene と object に触れず、専用の scene を作り直し、前回この script が作ったものだけを消す"""
    if not LIVE:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    old = bpy.data.scenes.get(SCENE)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for idb in [i for i in coll if i.get(TAG)]:
            coll.remove(idb)
    if old:
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene


def srgb(hex_: str) -> tuple:
    v = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in v)


def material(name: str, hex_: str, rough: float, metal: float = 0.0, emit: float = 0.0):
    m = bpy.data.materials.new(name)
    m[TAG] = True
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    color = srgb(hex_)
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = 0.0
    p.inputs["Specular IOR Level"].default_value = 0.35
    if emit:
        p.inputs["Emission Color"].default_value = (*color, 1.0)
        p.inputs["Emission Strength"].default_value = emit
    return m


MAT = {}


def materials() -> None:
    # 目安の色。shell は --brand の緑、cover は少し明るい緑、knob は生成り
    MAT["shell"] = material("shell", "#2f5d43", 0.8)
    MAT["cover"] = material("cover", "#3f7356", 0.78)
    MAT["slot"] = material("slot", "#121714", 0.9)
    MAT["blade"] = material("blade", "#a3a8a4", 0.4, metal=0.7)
    MAT["knob"] = material("knob", "#f8f5ee", 0.85)
    MAT["led"] = material("led", "#cfe6d6", 0.5, emit=0.6)
    MAT["rubber"] = material("rubber", "#2b2b2b", 0.95)


def new_object(name: str, bm: bmesh.types.BMesh, mats: list) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(MAT[m])
    ob = bpy.data.objects.new(name, me)
    ob[TAG] = me[TAG] = True
    bpy.context.scene.collection.objects.link(ob)
    return ob


def select_only(ob: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)


def apply_all(ob: bpy.types.Object) -> None:
    """modifier と回転・拡大を mesh に焼き込む"""
    select_only(ob)
    for mod in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def bevel(ob: bpy.types.Object, width: float, segments: int = 4, angle: float | None = None) -> None:
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    if angle is None:
        mod.limit_method = "NONE"
    else:
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(angle)
    apply_all(ob)


def box(name: str, x0, x1, y0, y1, z0, z1, mats: list) -> bpy.types.Object:
    """組み立ての座標（glTF の向き）で、範囲を指定した箱"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    ob = new_object(name, bm, mats)
    ob.scale = (x1 - x0, z1 - z0, y1 - y0)
    ob.location = gl((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    apply_all(ob)
    ob.location = (0, 0, 0)
    me = ob.data
    c = gl((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    for v in me.vertices:
        v.co += c
    return ob


def cut(target: bpy.types.Object, cutter: bpy.types.Object) -> None:
    """target から cutter を差し引く。切り口の面は cutter の material になる"""
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"
    apply_all(target)
    bpy.data.objects.remove(cutter)


def join(target: bpy.types.Object, parts: list) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(o is target or o in parts)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()


def smooth(ob: bpy.types.Object, angle: float = 35.0) -> None:
    """角の丸みは滑らかに、平らな面どうしの折れ目は立てる"""
    select_only(ob)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))


def body() -> bpy.types.Object:
    """筐体。台座・本体・差し出し口・刃の帯・下の唇・蝶番・放熱のスリット"""
    main = box("body", -W / 2, W / 2, BASE_H - 2, STEP_Y + 6, -D / 2, D / 2, ["shell", "slot", "blade"])
    bevel(main, BODY_R, 5)

    # 差し出し口：前面から奥へ彫る溝（中は暗い）
    groove = box("groove", -SLOT_W / 2, SLOT_W / 2, SLOT_Y - SLOT_H / 2, SLOT_Y + SLOT_H / 2, FRONT - SLOT_DEPTH, FRONT + 10, ["slot"])
    bevel(groove, 3.0, 2)
    cut(main, groove)

    # 側面の放熱のスリット（左右）
    for sx in (-1, 1):
        for y in VENT_YS:
            v = box("vent", sx * W / 2 - 10, sx * W / 2 + 10, y - 1.8, y + 1.8, VENT_Z - VENT_LEN / 2, VENT_Z + VENT_LEN / 2, ["slot"])
            bevel(v, 1.5, 2)
            cut(main, v)

    parts = []
    # 一段引っ込んだ台座
    base = box("base", -W / 2 + BASE_INSET, W / 2 - BASE_INSET, 0, BASE_H + 2, -D / 2 + BASE_INSET, D / 2 - BASE_INSET, ["shell"])
    bevel(base, 4.0, 3)
    parts.append(base)

    # 差し出し口の下の唇（紙が乗って手前へ出る、わずかに張り出した段）
    lip = box("lip", -SLOT_W / 2 - 14, SLOT_W / 2 + 14, SLOT_Y - SLOT_H / 2 - 12, SLOT_Y - SLOT_H / 2, FRONT - 4, FRONT + 5, ["shell"])
    bevel(lip, 2.5, 3)
    parts.append(lip)

    # 刃の帯：溝の上の縁に金属の棒と、下向きのぎざぎざ
    y_bar = SLOT_Y + SLOT_H / 2
    bar = box("bar", -SLOT_W / 2 - 4, SLOT_W / 2 + 4, y_bar, y_bar + 4, FRONT - 1, FRONT + 2, ["blade"])
    bevel(bar, 0.8, 2)
    parts.append(bar)
    bm = bmesh.new()
    teeth = 88
    pitch = SLOT_W / teeth
    for i in range(teeth):
        x0 = -SLOT_W / 2 + i * pitch
        a = bm.verts.new(gl(x0, y_bar, FRONT + 1.6))
        b = bm.verts.new(gl(x0 + pitch, y_bar, FRONT + 1.6))
        c = bm.verts.new(gl(x0 + pitch / 2, y_bar - 3.2, FRONT + 1.6))
        bm.faces.new((a, c, b))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.y > 0:  # Blender の -Y が前
            f.normal_flip()
    parts.append(new_object("teeth", bm, ["blade"]))

    # 蝶番（蓋の奥の辺の左右）
    for sx in (-1, 1):
        k = bmesh.new()
        bmesh.ops.create_cone(k, cap_ends=True, segments=20, radius1=5.0, radius2=5.0, depth=44)
        bmesh.ops.rotate(k, verts=k.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
        bmesh.ops.translate(k, verts=k.verts, vec=gl(sx * 150, HINGE[1], HINGE[2]))
        parts.append(new_object("hinge", k, ["shell"]))

    join(main, parts)
    smooth(main)
    return main


def cover() -> bpy.types.Object:
    """紙のロールの蓋。半楕円の断面を x に押し出し、左右の端を丸め、手前に指かけのくぼみ"""
    a = (LID_FRONT - LID_BACK) / 2  # z の半径
    cz = (LID_FRONT + LID_BACK) / 2
    b = LID_TOP - STEP_Y  # y の半径
    seg = 32
    bm = bmesh.new()
    rings = []
    for sx in (-1, 1):
        ring = []
        for i in range(seg + 1):
            t = math.pi * i / seg
            ring.append(bm.verts.new(gl(sx * LID_W / 2, STEP_Y + b * math.sin(t), cz + a * math.cos(t))))
        rings.append(ring)
    left, right = rings
    for i in range(seg):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    bm.faces.new((left[0], left[-1], right[-1], right[0]))  # 底
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object("cover", bm, ["cover"])
    bevel(ob, 9.0, 5, angle=50)

    # 指かけのくぼみ（蓋の手前の中央）
    s = bmesh.new()
    bmesh.ops.create_uvsphere(s, u_segments=32, v_segments=16, radius=1.0)
    notch = new_object("notch", s, ["cover"])
    notch.scale = (34, 10, 9)
    notch.location = gl(0, STEP_Y + 14, LID_FRONT + 3)
    apply_all(notch)
    cut(ob, notch)
    smooth(ob, 45)
    return ob


def btn() -> bpy.types.Object:
    """紙送りのキー。角の丸い四角が前面から手前に出る（押すと -z へ沈む）"""
    k = box("btn", KEY[0] - KEY_W / 2, KEY[0] + KEY_W / 2, KEY[1] - KEY_H / 2, KEY[1] + KEY_H / 2, FRONT - 2, FRONT + KEY_OUT, ["knob"])
    bevel(k, 2.5, 4)
    smooth(k)
    return k


def lamp() -> bpy.types.Object:
    """通電の灯。前面に半分埋まった小さな球"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=LAMP_R)
    bmesh.ops.translate(bm, verts=bm.verts, vec=gl(LAMP[0], LAMP[1], FRONT))
    ob = new_object("lamp", bm, ["led"])
    smooth(ob, 80)
    return ob


def feet() -> bpy.types.Object:
    bm = bmesh.new()
    for fx, fz in FEET:
        one = bmesh.new()
        bmesh.ops.create_cone(one, cap_ends=True, segments=24, radius1=FOOT_R - 1.5, radius2=FOOT_R, depth=FOOT_H)
        bmesh.ops.translate(one, verts=one.verts, vec=gl(fx, -FOOT_H / 2 + 0.01, fz))
        me = bpy.data.meshes.new("foot")
        one.to_mesh(me)
        one.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    ob = new_object("feet", bm, ["rubber"])
    smooth(ob)
    return ob


def place_origins(objs: dict) -> None:
    """原点を差し出し口の中心へ移す（cover は蝶番の軸）。全体を、差し出し口の中心が世界の原点になるよう動かす"""
    shift = gl(*ORIGIN)
    for ob in objs.values():
        for v in ob.data.vertices:
            v.co -= shift
    hinge = gl(*HINGE) - shift
    for v in objs["cover"].data.vertices:
        v.co -= hinge
    objs["cover"].location = hinge


def build() -> dict:
    reset()
    materials()
    objs = {"body": body(), "cover": cover(), "btn": btn(), "lamp": lamp(), "feet": feet()}
    # 足は筐体の一部として body に含める（three.js で別に動かさない）
    join(objs["body"], [objs.pop("feet")])
    place_origins(objs)
    return objs


def export(objs: dict) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs.values())
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
    )


def render(dir_: Path) -> None:
    """確かめるための絵。床と柔らかい光で、斜め上と正面やや上から撮る"""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.92, 0.9, 0.86, 1)
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world
    floor_z = gl(0, -FOOT_H, 0).z - gl(*ORIGIN).z
    bpy.ops.mesh.primitive_plane_add(size=8000, location=(0, 0, floor_z))
    bpy.context.object.data.materials.append(material("floor", "#f3f0ea", 0.9))
    # 単位が大きい（1 px = 1 m）ので、減衰しない太陽光を角度を広げて柔らかく当てる
    for loc, energy, ang in (((-500, -700, 900), 2.6, 25), ((800, -300, 500), 0.9, 40), ((0, 600, 800), 0.6, 40)):
        bpy.ops.object.light_add(type="SUN", location=loc)
        light = bpy.context.object
        light.data.energy = energy
        light.data.angle = math.radians(ang)
        light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 70
    cam.data.clip_start = 10
    cam.data.clip_end = 20000
    scene.camera = cam
    target = gl(0, 70, 0) - gl(*ORIGIN)
    dir_.mkdir(parents=True, exist_ok=True)
    for name, az, el, dist in (("angle", -35, 30, 1700), ("front", 0, 20, 1700)):
        a, e = math.radians(az), math.radians(el)
        offset = Vector((dist * math.cos(e) * math.sin(a), -dist * math.cos(e) * math.cos(a), dist * math.sin(e)))
        cam.location = target + offset
        cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(dir_ / f"receipt-machine-{name}.png")
        bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    objs = build()
    if LIVE:
        # 起動中の Blender では見せるだけ。名前が利用者の data と重なると変わるので、glb は背景で動かして書き出す
        print("built in scene", SCENE, [o.name for o in objs.values()])
        return
    export(objs)
    if "--render" in argv:
        render(Path(argv[argv.index("--render") + 1]))


main()
