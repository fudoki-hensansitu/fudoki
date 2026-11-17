"""ホームのうちのまちの札（レシートの機械）の立体を Blender で組み、glb に書き出す。

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python apps/web/brand/receipt_machine.py -- [--render <dir>]

店のレジ横にある感熱式のレシートプリンタに見える形にする（実在の製品の形やロゴはなぞらない）。
単位は px 相当。基準の大きさは幅 600・前面の高さ 420・奥行き 165。glTF では前面が +z、上が +y、原点は本体の中心
（Blender では前面が -Y、上が +Z で組み、書き出しで glTF の向きへ直る）。

three.js は前面の幅と高さを画面ごとに 9 分割で伸ばす（中心から一定の距離より外の頂点を平行に動かす）。
そのため |x|<200・|y|<110 の帯には頂点を置かず、平らな面だけにする。ボタン・灯・足・蓋・差し出し口は別の object にする。
差し出し口（slot）は紙の幅（DOM の .rc-print、最大 440）に合わせて x を一様に縮めて使う前提で、帯の決まりの外に置く。

色は塗り分けの目安だけ（three.js で DESIGN.md の token の色に置き換える）。material は名前で引く。
アニメーションは付けない（three.js の AnimationClip で付ける）。
書き出した receipt-machine.raw.glb は gltf-transform の dedup だけをかけて receipt-machine.glb にし、raw は消す。
draco・meshopt は three.js 側で decoder が要るので使わない。quantize は頂点を int16 にして元に戻す拡大と移動を node に載せるため、
原点（各部品の据わる点）がずれ、three.js が頂点の座標を直接動かす 9 分割の伸ばし方とも合わないので使わない。
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public/home/receipt-machine.raw.glb"

# 基準の大きさ
W = 600.0
H = 420.0
D = 165.0
# 本体の角の丸み。9 分割の帯（|x|<200、|y|<110）にかからない大きさにする
R = 30.0
TOP = H / 2
FRONT = -D / 2  # Blender の前面の y

# 表示窓（前面に彫り込む）。四隅は帯の外
WIN_X = 262.0
WIN_TOP = 124.0
WIN_BOTTOM = -122.0
WIN_R = 18.0
WIN_DEPTH = 4.0
WIN_RIM = 5.0  # 窓の周りの縁の幅

# 差し出し口（前面の下）
SLOT_W = 440.0
SLOT_H = 14.0
SLOT_Y = -H / 2 + 26.0
SLOT_OUT = 3.0

# 紙送りのボタンと通電の灯（天板の右手前）
BTN = (244.0, 34.0)  # (x, 手前への距離 z)
BTN_R = 15.0
LAMP = (207.0, 34.0)
LAMP_R = 4.5

# 紙のロールの蓋（天板の奥、幅いっぱい）。天板の平らなところ（|z|<D/2-R）に収める
COVER_W = 520.0
COVER_FRONT = 12.0  # 蓋の手前の辺の z（glTF）
COVER_BACK = -50.0
COVER_T = 3.5
COVER_LIFT = 0.8  # 天板から浮かせる段

FEET = [(sx * 250.0, sz * 52.0) for sx in (-1, 1) for sz in (-1, 1)]
FOOT_R = 14.0
FOOT_H = 5.0


def gl(x: float, y: float, z: float) -> Vector:
    """glTF の座標（前面 +z、上 +y）を Blender の座標へ"""
    return Vector((x, -z, y))


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple, rough: float, metal: float = 0.0, emit: float = 0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = 0.0
    p.inputs["Specular IOR Level"].default_value = 0.35
    if emit:
        p.inputs["Emission Color"].default_value = (*color, 1.0)
        p.inputs["Emission Strength"].default_value = emit
    return m


def srgb(hex_: str) -> tuple:
    v = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in v)


MAT = {}


def materials() -> None:
    # 目安の色。shell・cover は --brand の緑、panel は窓の暗い緑、knob は --brand-fill-hover の生成り
    MAT["shell"] = material("shell", srgb("#2f5d43"), 0.8)
    MAT["cover"] = material("cover", srgb("#3a6a4f"), 0.82)
    MAT["panel"] = material("panel", srgb("#1f3d2c"), 0.72)
    MAT["knob"] = material("knob", srgb("#f8f5ee"), 0.88)
    MAT["led"] = material("led", srgb("#cfe6d6"), 0.5, emit=0.6)
    MAT["slot"] = material("slot", srgb("#141a16"), 0.9)
    MAT["blade"] = material("blade", srgb("#9aa09c"), 0.45, metal=0.6)
    MAT["rubber"] = material("rubber", srgb("#2b2b2b"), 0.95)


def mesh_object(name: str, bm: bmesh.types.BMesh, mats: list) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(MAT[m])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def apply_modifiers(ob: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    for mod in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def smooth(ob: bpy.types.Object, angle: float = 40.0) -> None:
    """角の丸みは滑らかに、平らな面どうしの折れ目は立てる"""
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))


def rounded_rect(bm, cx, cy, hw, hh, r, z, seg=6):
    """xy 平面に角の丸い長方形の輪郭（頂点の列）を作る"""
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (hw - r), cy + qy * (hh - r)
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append(bm.verts.new((ox + r * math.cos(a), oy + r * math.sin(a), z)))
    return pts


def rounded_slab(hw, hh, depth, r, bevel, seg=6, bevel_seg=3):
    """角の丸い板（xy の輪郭、z に厚み）。上の縁だけ丸める。原点は底面の中心"""
    bm = bmesh.new()
    ring = rounded_rect(bm, 0, 0, hw, hh, r, 0, seg)
    bottom = bm.faces.new(ring)
    ext = bmesh.ops.extrude_face_region(bm, geom=[bottom])
    top_verts = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top_verts, vec=(0, 0, depth))
    bottom.normal_flip()
    bm.normal_update()
    top_face = next(f for f in bm.faces if all(v in top_verts for v in f.verts))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(top_face.edges), offset=bevel, segments=bevel_seg, profile=0.5, affect="EDGES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def body() -> bpy.types.Object:
    """筐体。角の丸い箱に表示窓を彫り込み、窓の周りに縁を付ける"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(W, D, H), verts=bm.verts)
    ob = mesh_object("body", bm, ["shell", "panel"])
    bev = ob.modifiers.new("bevel", "BEVEL")
    bev.width = R
    bev.segments = 6
    bev.limit_method = "NONE"
    apply_modifiers(ob)

    # 窓の彫り込み（角の丸い板で前面から差し引く）
    hw, hh = WIN_X, (WIN_TOP - WIN_BOTTOM) / 2
    cy = (WIN_TOP + WIN_BOTTOM) / 2
    cut_bm = rounded_slab(hw, hh, 40.0, WIN_R, 0, seg=8)
    cut = mesh_object("cut", cut_bm, ["panel"])
    cut.matrix_world = Matrix.Translation(gl(0, cy, D / 2 - WIN_DEPTH)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    boo = ob.modifiers.new("window", "BOOLEAN")
    boo.operation = "DIFFERENCE"
    boo.solver = "EXACT"
    boo.object = cut
    boo.material_mode = "TRANSFER"
    apply_modifiers(ob)
    bpy.data.objects.remove(cut)

    # 窓の周りの縁（わずかに出る輪）
    rim = bmesh.new()
    outer = rounded_rect(rim, 0, 0, hw + WIN_RIM, hh + WIN_RIM, WIN_R + WIN_RIM, 0, 8)
    inner = rounded_rect(rim, 0, 0, hw, hh, WIN_R, 0, 8)
    n = len(outer)
    faces = [rim.faces.new((outer[i], outer[(i + 1) % n], inner[(i + 1) % n], inner[i])) for i in range(n)]
    ext = bmesh.ops.extrude_face_region(rim, geom=faces)
    up = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(rim, verts=up, vec=(0, 0, 1.5))
    bmesh.ops.recalc_face_normals(rim, faces=rim.faces)
    for f in rim.faces:
        f.material_index = 1
    rim_ob = mesh_object("rim", rim, ["shell", "panel"])
    rim_ob.matrix_world = Matrix.Translation(gl(0, cy, D / 2)) @ Matrix.Rotation(math.pi / 2, 4, "X")

    # 紙送りのボタンの台座の縁（天板に少し沈んだ輪）。帯の外に置き、本体と一緒に伸びる
    seat = bmesh.new()
    bmesh.ops.create_cone(seat, cap_ends=True, segments=40, radius1=BTN_R + 5, radius2=BTN_R + 4, depth=2.0)
    bmesh.ops.translate(seat, verts=seat.verts, vec=(0, 0, 1.0))
    for f in seat.faces:
        f.material_index = 1
    seat_ob = mesh_object("seat", seat, ["shell", "panel"])
    seat_ob.location = gl(BTN[0], TOP, BTN[1])

    # 天板と蓋の境の溝（蓋の周りにわずかに暗い受け）
    well = rounded_slab(COVER_W / 2 + 4, (COVER_FRONT - COVER_BACK) / 2 + 4, 0.6, 12, 0)
    for f in well.faces:
        f.material_index = 1
    well_ob = mesh_object("well", well, ["shell", "panel"])
    well_ob.location = gl(0, TOP, (COVER_FRONT + COVER_BACK) / 2)

    for o in (rim_ob, seat_ob, well_ob):
        o.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    smooth(ob)
    return ob


def cover() -> bpy.types.Object:
    """紙のロールの蓋。天板の幅いっぱいの薄い板が少しだけ浮き、奥に蝶番の線と左右の蝶番。
    9 分割で伸ばせるよう、角・蝶番の端は |x|>200 に置く"""
    depth = COVER_FRONT - COVER_BACK
    bm = rounded_slab(COVER_W / 2, depth / 2, COVER_T, 14, 2.0, bevel_seg=3)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, COVER_LIFT))

    def add(part: bmesh.types.BMesh) -> None:
        me = bpy.data.meshes.new("part")
        part.to_mesh(me)
        part.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    # 蝶番の線（奥の辺の近くを横切る細い段）
    line = rounded_slab(COVER_W / 2 - 22, 1.2, 0.8, 1.0, 0)
    bmesh.ops.translate(line, verts=line.verts, vec=(0, depth / 2 - 12, COVER_LIFT + COVER_T))
    add(line)
    # 左右の蝶番（奥の辺の外に、横向きの短い円柱）
    for sx in (-1, 1):
        k = bmesh.new()
        bmesh.ops.create_cone(k, cap_ends=True, segments=16, radius1=2.8, radius2=2.8, depth=44)
        bmesh.ops.rotate(k, verts=k.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
        bmesh.ops.translate(k, verts=k.verts, vec=(sx * (COVER_W / 2 - 40), depth / 2 - 0.5, COVER_LIFT + 1.2))
        add(k)
    ob = mesh_object("cover", bm, ["cover"])
    ob.location = gl(0, TOP, (COVER_FRONT + COVER_BACK) / 2)
    smooth(ob)
    return ob


def btn() -> bpy.types.Object:
    """紙送りのボタン。上の縁を丸めた円柱。原点は底面の中心（天板の高さ）"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=BTN_R + 0.5, radius2=BTN_R, depth=7.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 3.5))
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    bmesh.ops.bevel(bm, geom=list(top.edges), offset=2.5, segments=4, profile=0.5, affect="EDGES")
    ob = mesh_object("btn", bm, ["knob"])
    ob.location = gl(BTN[0], TOP, BTN[1])
    smooth(ob)
    return ob


def lamp() -> bpy.types.Object:
    """通電の灯。半球。原点は底面の中心"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=LAMP_R)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
    ob = mesh_object("lamp", bm, ["led"])
    ob.location = gl(LAMP[0], TOP, LAMP[1])
    smooth(ob, 80)
    return ob


def slot() -> bpy.types.Object:
    """差し出し口。前面に貼る縁取りと暗い溝、上の唇に刃の帯（ぎざぎざ）。原点は前面に接する裏の中心。
    紙の幅に合わせて x を一様に縮めて使う"""
    bm = bmesh.new()
    hw, hh = SLOT_W / 2, SLOT_H / 2
    frame = 7.0
    outer = rounded_rect(bm, 0, 0, hw + frame, hh + frame, hh + frame - 0.01, 0, 8)
    inner = rounded_rect(bm, 0, 0, hw, hh, 3.0, 0, 8)
    n = len(outer)
    faces = [bm.faces.new((outer[i], outer[(i + 1) % n], inner[(i + 1) % n], inner[i])) for i in range(n)]
    ext = bmesh.ops.extrude_face_region(bm, geom=faces)
    up = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(0, 0, SLOT_OUT))
    # 溝の奥（暗い面、前面より少し奥）
    back = rounded_rect(bm, 0, 0, hw, hh, 3.0, -3.0, 8)
    f = bm.faces.new(back)
    f.material_index = 1
    # 溝の内壁
    for i in range(n):
        w = bm.faces.new((inner[i], inner[(i + 1) % n], back[(i + 1) % n], back[i]))
        w.material_index = 1
    # 刃の帯：上の唇の下側に、下向きのぎざぎざ
    teeth = 88
    pitch = (SLOT_W - 8) / teeth
    y0 = hh - 0.5
    for i in range(teeth):
        x0 = -hw + 4 + i * pitch
        a = bm.verts.new((x0, y0, SLOT_OUT - 0.4))
        b = bm.verts.new((x0 + pitch, y0, SLOT_OUT - 0.4))
        c = bm.verts.new((x0 + pitch / 2, y0 - 3.0, SLOT_OUT - 0.4))
        t = bm.faces.new((a, c, b))
        t.material_index = 2
    strip = [
        bm.verts.new((-hw + 4, y0, SLOT_OUT - 0.4)),
        bm.verts.new((-hw + 4, y0 + 1.6, SLOT_OUT - 0.4)),
        bm.verts.new((hw - 4, y0 + 1.6, SLOT_OUT - 0.4)),
        bm.verts.new((hw - 4, y0, SLOT_OUT - 0.4)),
    ]
    s = bm.faces.new(list(reversed(strip)))
    s.material_index = 2
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index == 0])
    for f in bm.faces:
        if f.material_index == 2 and f.normal.z < 0:
            f.normal_flip()
    ob = mesh_object("slot", bm, ["shell", "slot", "blade"])
    ob.matrix_world = Matrix.Translation(gl(0, SLOT_Y, D / 2)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    smooth(ob, 50)
    return ob


def feet() -> bpy.types.Object:
    """床に接するゴムの足 4 つ。原点は本体の底面の中心"""
    bm = bmesh.new()
    for fx, fz in FEET:
        one = bmesh.new()
        bmesh.ops.create_cone(one, cap_ends=True, segments=24, radius1=FOOT_R - 1.5, radius2=FOOT_R, depth=FOOT_H)
        bmesh.ops.translate(one, verts=one.verts, vec=(fx, -fz, -FOOT_H / 2))
        me = bpy.data.meshes.new("foot")
        one.to_mesh(me)
        one.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    ob = mesh_object("feet", bm, ["rubber"])
    ob.location = gl(0, -TOP, 0)
    smooth(ob)
    return ob


def build() -> list:
    reset()
    materials()
    return [body(), cover(), btn(), lamp(), slot(), feet()]


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
    )


def render(dir_: Path) -> None:
    """確かめるための絵。床と柔らかい光で、正面やや上と斜めから撮る"""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.92, 0.9, 0.86, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 0, -TOP - FOOT_H))
    floor = bpy.context.object
    floor.data.materials.append(material("floor", srgb("#f3f0ea"), 0.9))
    # 単位が大きい（1 px = 1 m）ので、減衰しない太陽光を角度を広げて柔らかく当てる
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
    for name, loc in (("front", (0, -2300, 900)), ("angle", (-1500, -1800, 1000)), ("top", (700, -1300, 1700))):
        cam.location = loc
        cam.rotation_euler = (Vector((0, 0, -20)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(dir_ / f"receipt-machine-{name}.png")
        bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    objs = build()
    export(objs)
    if "--render" in argv:
        render(Path(argv[argv.index("--render") + 1]))


main()
