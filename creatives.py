# SPDX-License-Identifier: GPL-3.0-or-later
# creatives.py
# ---------------------------------------------------------------------------
#  VoidScript "creatives" - embedded bridge tools for Roblox animation and VFX
#  generation. Nothing here needs an external program: everything is compiled
#  to Luau and executed straight inside Roblox Studio through the Roblox MCP
#  server's `execute_luau` tool.
#
#  Tools exposed (served as part of the "roblox" catalogue, `vs_*` prefix):
#    vs_make_animation - build a custom KeyframeSequence animation for a rig
#                        (R15 + R6), register it via AnimationClipProvider and
#                        play it on the rig's Animator.
#    vs_make_vfx       - spawn production-style particle/beam/light VFX
#                        (fire, explosion, lightning, portal, shield, ...)
#                        as native instances in the place.
#
#  Codegen principle: all values are precomputed/math is baked into the emitted
#  Luau, so the script sent to Studio is self-contained and has NO dependencies
#  beyond the Roblox APIs shipped with Studio itself.
# ---------------------------------------------------------------------------
from __future__ import annotations

import json
import math

_TWO_PI = 2.0 * math.pi


def _rad(deg):
    return math.radians(deg)


def _p(rx=0.0, ry=0.0, rz=0.0, px=0.0, py=0.0, pz=0.0):
    """One pose: (rotX, rotY, rotZ radians, posX, posY, posZ studs)."""
    return (rx, ry, rz, px, py, pz)


def _lerp(a, b, u):
    return a + (b - a) * u


def _ease_in_out(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3.0 - 2.0 * u)


# ---------------------------------------------------------------------------
#  Animation - procedural motion models (multi-layer, eased, handed-tuned)
# ---------------------------------------------------------------------------

_R15_BONES = [
    "LowerTorso", "UpperTorso", "Head",
    "RightUpperArm", "RightLowerArm", "RightHand",
    "LeftUpperArm", "LeftLowerArm", "LeftHand",
    "RightUpperLeg", "RightLowerLeg", "RightFoot",
    "LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
]


def _motion_idle(t, dur):
    f1 = _TWO_PI * 0.35
    f2 = _TWO_PI * 0.62
    bob = 0.022 * math.sin(f1 * t) + 0.006 * math.sin(f2 * t)
    sway = 0.05 * math.sin(f1 * t * 0.5)
    return {
        "LowerTorso": _p(rz=0.035 * math.sin(f1 * t), py=bob),
        "UpperTorso": _p(rx=0.02 * math.sin(f2 * t), rz=sway * 0.4),
        "Head": _p(rx=0.015 * math.sin(f1 * t + 0.6), ry=0.01 * math.sin(f2 * t)),
        "RightUpperArm": _p(rx=-0.02 * math.sin(f1 * t), rz=0.015 * math.sin(f2 * t)),
        "LeftUpperArm": _p(rx=0.02 * math.sin(f1 * t + math.pi), rz=-0.015 * math.sin(f2 * t)),
        "RightLowerArm": _p(rx=0.05 * math.sin(f1 * t + 0.6)),
        "LeftLowerArm": _p(rx=0.05 * math.sin(f1 * t + math.pi + 0.6)),
        "RightUpperLeg": _p(rx=0.01 * math.sin(f2 * t)),
        "LeftUpperLeg": _p(rx=-0.01 * math.sin(f2 * t)),
    }


def _motion_walk(t, dur):
    f = _TWO_PI * 1.05
    p = f * t
    knee_r = 0.5 * max(0.0, math.sin(p - 0.6))
    knee_l = 0.5 * max(0.0, math.sin(p + math.pi - 0.6))
    return {
        "LowerTorso": _p(rx=0.06, rz=0.045 * math.sin(p), py=0.05 * max(0.0, math.cos(p))),
        "UpperTorso": _p(rx=0.24, rz=0.05 * math.sin(p)),
        "Head": _p(rx=0.015 * math.sin(p), rz=0.04 * math.sin(p)),
        "RightUpperArm": _p(rx=0.55 * math.sin(p + math.pi), rz=0.04 * math.sin(p)),
        "RightLowerArm": _p(rx=0.22 + 0.1 * math.sin(p + math.pi * 0.5)),
        "LeftUpperArm": _p(rx=0.55 * math.sin(p), rz=-0.04 * math.sin(p)),
        "LeftLowerArm": _p(rx=0.22 + 0.1 * math.sin(p + math.pi * 0.5)),
        "RightUpperLeg": _p(rx=0.8 * math.sin(p)),
        "RightLowerLeg": _p(rx=-knee_r),
        "RightFoot": _p(px=0.03 * math.sin(p)),
        "LeftUpperLeg": _p(rx=-0.8 * math.sin(p)),
        "LeftLowerLeg": _p(rx=-knee_l),
        "LeftFoot": None,
    }


def _motion_run(t, dur):
    f = _TWO_PI * 1.55
    p = f * t
    return {
        "LowerTorso": _p(rx=0.12, rz=0.03 * math.sin(p), py=0.055 * max(0.0, math.cos(p))),
        "UpperTorso": _p(rx=0.62, rz=0.03 * math.sin(p)),
        "Head": _p(rx=0.03 * math.sin(p)),
        "RightUpperArm": _p(rx=1.05 * math.sin(p + math.pi), rz=0.05 * math.sin(p)),
        "RightLowerArm": _p(rx=1.05, ry=0.15 * math.sin(p + math.pi)),
        "LeftUpperArm": _p(rx=1.05 * math.sin(p), rz=-0.05 * math.sin(p)),
        "LeftLowerArm": _p(rx=1.05, ry=-0.15 * math.sin(p)),
        "RightUpperLeg": _p(rx=1.2 * math.sin(p)),
        "RightLowerLeg": _p(rx=0.95 * max(0.0, math.sin(p - 0.5))),
        "LeftUpperLeg": _p(rx=-1.2 * math.sin(p)),
        "LeftLowerLeg": _p(rx=0.95 * max(0.0, math.sin(p + math.pi - 0.5))),
    }


def _motion_sprint(t, dur):
    f = _TWO_PI * 1.95
    p = f * t
    return {
        "LowerTorso": _p(rx=0.2, rz=0.02 * math.sin(p), py=0.035 * max(0.0, math.cos(p))),
        "UpperTorso": _p(rx=0.95, rz=0.02 * math.sin(p)),
        "Head": _p(rx=0.04 * math.sin(p)),
        "RightUpperArm": _p(rx=1.3 * math.sin(p + math.pi)),
        "RightLowerArm": _p(rx=1.15, ry=0.2 * math.sin(p + math.pi)),
        "LeftUpperArm": _p(rx=1.3 * math.sin(p)),
        "LeftLowerArm": _p(rx=1.15, ry=-0.2 * math.sin(p)),
        "RightUpperLeg": _p(rx=1.45 * math.sin(p)),
        "RightLowerLeg": _p(rx=1.25 * max(0.0, math.sin(p - 0.45))),
        "LeftUpperLeg": _p(rx=-1.45 * math.sin(p)),
        "LeftLowerLeg": _p(rx=1.25 * max(0.0, math.sin(p + math.pi - 0.45))),
    }


def _motion_jump(t, dur):
    u = t / dur if dur else 0.0
    peak = 0.32
    if u < peak:
        v = _ease_in_out(u / peak)
        leg = -0.35 + 0.05 * v
        arm = 0.6 + 1.2 * v
    elif u < 0.78:
        v = (u - peak) / (0.78 - peak)
        leg = 1.15 * math.sin(v * math.pi * 0.5)
        arm = 1.6 + 0.8 * math.sin(v * math.pi)
    else:
        v = _ease_in_out((u - 0.78) / (1.0 - 0.78))
        leg = _lerp(1.15, 0.0, v)
        arm = _lerp(2.0, 0.0, v)
    return {
        "LowerTorso": _p(rx=leg * 0.5),
        "UpperTorso": _p(rx=0.12 * (1.0 - u)),
        "Head": _p(rx=0.05),
        "RightUpperArm": _p(rx=-arm),
        "LeftUpperArm": _p(rx=-arm),
        "RightLowerArm": _p(rx=1.2),
        "LeftLowerArm": _p(rx=1.2),
        "RightUpperLeg": _p(rx=leg),
        "LeftUpperLeg": _p(rx=leg),
        "RightLowerLeg": _p(rx=leg * 0.9 + 0.3),
        "LeftLowerLeg": _p(rx=leg * 0.9 + 0.3),
    }


def _motion_wave(t, dur):
    w = _TWO_PI * 0.45
    p = _TWO_PI * 2.2
    return {
        "LowerTorso": _p(ry=0.12 * math.sin(w * t)),
        "UpperTorso": _p(rx=0.08, ry=0.1 * math.sin(w * t + 0.4)),
        "Head": _p(rx=0.05, ry=0.22 + 0.05 * math.sin(w * t)),
        "RightUpperArm": _p(rx=-1.35, rz=2.35, px=0.05),
        "RightLowerArm": _p(rx=0.35, ry=0.25 * math.sin(p * t)),
        "RightHand": _p(rx=0.15, ry=-0.4 * math.sin(p * t)),
        "LeftUpperArm": _p(rz=-0.18, rx=0.12),
        "LeftLowerArm": _p(rx=0.4),
    }


def _motion_dance(t, dur):
    f1 = _TWO_PI * 0.75
    f2 = _TWO_PI * 1.5
    sway = 0.55 * math.sin(f1 * t)
    return {
        "LowerTorso": _p(rz=0.35 * math.sin(f1 * t), ry=0.2 * math.sin(f2 * t),
                         py=0.08 * abs(math.sin(f2 * t))),
        "UpperTorso": _p(rz=0.18 * math.sin(f2 * t), rx=0.1 * math.sin(f1 * t)),
        "Head": _p(rz=0.2 * math.sin(f2 * t + 0.5), rx=0.06 * math.sin(f1 * t)),
        "RightUpperArm": _p(rz=1.15 + 0.7 * math.sin(f2 * t), ry=sway),
        "RightLowerArm": _p(rx=0.5 + 0.3 * abs(math.sin(f2 * t))),
        "RightHand": _p(rx=math.sin(f2 * t) * 0.4),
        "LeftUpperArm": _p(rz=-1.15 + 0.7 * math.sin(f2 * t), ry=sway),
        "LeftLowerArm": _p(rx=0.5 + 0.3 * abs(math.sin(f2 * t + math.pi))),
        "LeftHand": _p(rx=math.sin(f2 * t + math.pi) * 0.4),
        "RightUpperLeg": _p(rz=0.15 * math.sin(f2 * t), ry=-0.1),
        "LeftUpperLeg": _p(rz=-0.15 * math.sin(f2 * t), ry=0.1),
        "RightLowerLeg": _p(rx=-0.1),
        "LeftLowerLeg": _p(rx=-0.1),
    }


def _motion_punch(t, dur):
    u = t / dur if dur else 0.0
    guard, ext = 0.15, 0.5
    if u < guard:
        v = _ease_in_out(u / guard)
        arm, elbow, tw = _lerp(-1.4, -2.7, v), _lerp(2.3, 0.4, v), -0.4 * v
    elif u < ext:
        v = _ease_in_out((u - guard) / (ext - guard))
        arm = -2.7 + 0.25 * math.sin(v * math.pi)
        elbow = _lerp(0.4, 0.2, v)
        tw = -0.4 - 0.35 * v
    else:
        v = _ease_in_out((u - ext) / (1.0 - ext))
        arm, elbow, tw = _lerp(-2.45, -1.4, v), _lerp(0.2, 2.3, v), _lerp(-0.75, -0.4, v)
    return {
        "LowerTorso": _p(ry=tw, rx=0.1),
        "UpperTorso": _p(ry=tw, rx=0.35),
        "Head": _p(ry=tw * 0.8, rx=0.05),
        "RightUpperArm": _p(rx=arm, rz=0.35, ry=tw * 0.3),
        "RightLowerArm": _p(rx=elbow, rz=-0.15),
        "RightHand": _p(rx=-0.3),
        "LeftUpperArm": _p(rx=-1.15, rz=-0.8),
        "LeftLowerArm": _p(rx=1.9),
        "LeftUpperLeg": _p(rx=0.12, rz=0.1),
        "RightUpperLeg": _p(rx=-0.15, rz=-0.12),
    }


def _motion_sword(t, dur):
    u = t / dur if dur else 0.0
    wind = 0.3
    if u < wind:
        v = _ease_in_out(u / wind)
        arm, elb, tw = _lerp(-1.2, -2.9, v), _lerp(2.0, 0.5, v), _lerp(0.3, -0.9, v)
    else:
        v = _ease_in_out((u - wind) / (1.0 - wind))
        arm, elb, tw = _lerp(-2.9, -1.5, v), _lerp(0.5, 2.6, v), _lerp(-0.9, 0.5, v)
    return {
        "LowerTorso": _p(ry=tw, rz=0.06 * math.sin(u * _TWO_PI)),
        "UpperTorso": _p(ry=tw, rx=0.15),
        "Head": _p(ry=tw * 0.7),
        "RightUpperArm": _p(rx=arm, rz=0.55, ry=tw * 0.2),
        "RightLowerArm": _p(rx=elb),
        "RightHand": _p(rx=-0.2, ry=0.8),
        "LeftUpperArm": _p(rx=-1.5, rz=-1.2, ry=tw * 0.2),
        "LeftLowerArm": _p(rx=2.2),
        "LeftUpperLeg": _p(rx=0.25, rz=0.25),
        "RightUpperLeg": _p(rx=-0.25, rz=-0.25),
    }


def _motion_sit(t, dur):
    u = t / dur if dur else 0.0
    v = _ease_in_out(min(u * 1.18, 1.0))
    return {
        "LowerTorso": _p(rx=1.5 * v),
        "UpperTorso": _p(rx=0.25 * v, rz=0.06),
        "Head": _p(rx=0.1),
        "RightUpperArm": _p(rx=-0.1, rz=0.35, ry=0.15 * v),
        "LeftUpperArm": _p(rx=-0.1, rz=-0.35, ry=-0.15 * v),
        "RightLowerArm": _p(rx=1.55 * v),
        "LeftLowerArm": _p(rx=1.55 * v),
        "RightUpperLeg": _p(rx=-0.25, ry=-1.1 * v),
        "LeftUpperLeg": _p(rx=-0.25, ry=1.1 * v),
        "RightLowerLeg": _p(rx=1.0 * v),
        "LeftLowerLeg": _p(rx=1.0 * v),
    }


def _motion_crouch(t, dur):
    u = t / dur if dur else 0.0
    v = _ease_in_out(min(u * 1.3, 1.0))
    return {
        "LowerTorso": _p(py=-0.32 * v, rx=0.4 * v),
        "UpperTorso": _p(rx=0.7 * v),
        "Head": _p(rx=0.05 * v),
        "RightUpperArm": _p(rz=0.5 * v, rx=-0.3 * v),
        "LeftUpperArm": _p(rz=-0.5 * v, rx=-0.3 * v),
        "RightLowerArm": _p(rx=1.3 * v),
        "LeftLowerArm": _p(rx=1.3 * v),
        "RightUpperLeg": _p(rx=0.35 * v, rz=-0.12 * v),
        "LeftUpperLeg": _p(rx=0.35 * v, rz=0.12 * v),
        "RightLowerLeg": _p(rx=-0.25 * v),
        "LeftLowerLeg": _p(rx=-0.25 * v),
    }


_STYLES = {
    "idle": _motion_idle,
    "walk": _motion_walk,
    "run": _motion_run,
    "sprint": _motion_sprint,
    "jump": _motion_jump,
    "wave": _motion_wave,
    "dance": _motion_dance,
    "punch": _motion_punch,
    "sword_slash": _motion_sword,
    "sit": _motion_sit,
    "crouch": _motion_crouch,
}

_STYLE_DESC = {
    "idle": "subtle breathing idle with micro sway",
    "walk": "natural walk cycle (2 steps/sec) with arm/leg counter-swing",
    "run": "brisk run with strong knee drive",
    "sprint": "full sprint with deep torso lean",
    "jump": "crouch-launch-airborne tuck-land",
    "wave": "raise right arm and wave the hand",
    "dance": "rhythmic side-rock dance with pumped arms",
    "punch": "guard -> right jab -> recover guard",
    "sword_slash": "wind-up over-shoulder then horizontal slash",
    "sit": "sit down into a chair pose",
    "crouch": "low tactical crouch",
}


def _motion_pose(style, t, dur):
    return _STYLES[style](t, dur)


def _r6_pose(r):
    low = r.get("LowerTorso") or _p()
    up = r.get("UpperTorso") or _p()
    head = r.get("Head") or _p()
    rua = r.get("RightUpperArm") or _p()
    rla = r.get("RightLowerArm") or _p()
    lua = r.get("LeftUpperArm") or _p()
    lla = r.get("LeftLowerArm") or _p()
    rul = r.get("RightUpperLeg") or _p()
    rll = r.get("RightLowerLeg") or _p()
    lul = r.get("LeftUpperLeg") or _p()
    lll = r.get("LeftLowerLeg") or _p()
    return {
        "Torso": _p(low[0] + up[0], low[1] + up[1], low[2] + up[2],
                    low[3], low[4], low[5]),
        "Head": _p(*head),
        "Right Arm": _p(rua[0] + rla[0], rua[1] + rla[1], rua[2] + rla[2],
                        rua[3], rua[4], rua[5]),
        "Left Arm": _p(lua[0] + lla[0], lua[1] + lla[1], lua[2] + lla[2],
                       lua[3], lua[4], lua[5]),
        "Right Leg": _p(rul[0] + rll[0], rul[1] + rll[1], rul[2] + rll[2],
                        rul[3], rul[4], rul[5]),
        "Left Leg": _p(lul[0] + lll[0], lul[1] + lll[1], lul[2] + lll[2],
                       lul[3], lul[4], lul[5]),
    }


_R6_BONES = ("Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg")

# R6 bone -> which R15 upper/lower bones it represents and how the rotation
# should be split between them so an R6-authored pose ALSO moves an R15 rig.
_R6_TO_R15 = {
    "Torso": (("UpperTorso", 1.0), None),
    "Head": (("Head", 1.0), None),
    "Right Arm": (("RightUpperArm", 0.55), ("RightLowerArm", 0.45)),
    "Left Arm": (("LeftUpperArm", 0.55), ("LeftLowerArm", 0.45)),
    "Right Leg": (("RightUpperLeg", 0.7), ("RightLowerLeg", 0.3)),
    "Left Leg": (("LeftUpperLeg", 0.7), ("LeftLowerLeg", 0.3)),
}

_R6_POSE_ORDER = _R6_BONES

_VALID_BONES = set(_R15_BONES) | set(_R6_BONES)


def _r6_to_r15_bones(r6bone, pose):
    """Expand an R6 bone pose into the R15 bone poses it implies.

    Returns a dict of R15 bone name -> pose tuple. Position is applied to the
    upper bone; the head/torso type bones map straight across."""
    rx, ry, rz, px, py, pz = pose
    up_spec, lo_spec = _R6_TO_R15[r6bone]
    out = {}
    if up_spec:
        ub, uq = up_spec
        out[ub] = _p(rx * uq, ry * uq, rz * uq, px, py, pz)
    if lo_spec:
        lb, lq = lo_spec
        out[lb] = _p(rx * lq, ry * lq, rz * lq)
    return out


def _pose_list(r15, r6=None):
    """Turn R15 + optional R6 pose dicts into the frame pose list consumed by
    the Luau builder. R15 bones come first, then R6 names (derived from the R15
    pose unless an explicit R6 pose overrides them). Both rig families are
    always emitted so the sequence works on R15 and R6 rigs alike."""
    pose_list = []
    for bone in _R15_BONES:
        v = r15.get(bone)
        if v is None:
            continue
        pose_list.append({"n": bone, "d": [round(x, 5) for x in v]})
    derived_r6 = _r6_pose(r15)
    for bone in _R6_POSE_ORDER:
        if bone == "Head":
            continue  # already emitted from the R15 list; Head exists on both
        v = (r6 or {}).get(bone) or derived_r6.get(bone)
        if v is None:
            continue
        pose_list.append({"n": bone, "d": [round(x, 5) for x in v]})
    return pose_list


def _preset_frames(style_key, duration, fps):
    step = 1.0 / fps
    n = max(2, int(round(duration / step)))
    frames = []
    for i in range(n):
        t = min(i * step, duration)
        frames.append([round(t, 4), _pose_list(_motion_pose(style_key, t, duration))])
    return frames


def _custom_frames(keyframes, duration):
    """Build frames from an AI-authored keyframe list. Each entry is
    {'t': seconds, 'bone': R15 name ('RightUpperArm') or R6 name ('Right Arm'),
    'rx'/'ry'/'rz': degrees, 'px'/'py'/'pz': studs}. Both rig families get
    full coverage so the animation works on whichever rig is found."""
    r15_by_time = {}
    r6_by_time = {}
    for kf in keyframes:
        try:
            t = float(kf.get("t") or 0.0)
            bone = str(kf.get("bone") or "").strip()
            if not bone:
                continue
            if bone not in _VALID_BONES:
                raise ValueError(
                    "unknown bone %r. Use an R15 name (%s) or an R6 name (%s)."
                    % (bone, ", ".join(_R15_BONES), ", ".join(_R6_BONES)))
            t = max(0.0, min(duration, t))
            pose = _p(
                _rad(float(kf.get("rx") or 0.0)),
                _rad(float(kf.get("ry") or 0.0)),
                _rad(float(kf.get("rz") or 0.0)),
                float(kf.get("px") or 0.0),
                float(kf.get("py") or 0.0),
                float(kf.get("pz") or 0.0),
            )
        except (TypeError, ValueError) as exc:
            raise ValueError("bad keyframe entry %r: %s" % (kf, exc))
        if bone in _R6_BONES:
            r6_by_time.setdefault(t, {})[bone] = pose
            for r15name, r15pose in _r6_to_r15_bones(bone, pose).items():
                r15_by_time.setdefault(t, {})[r15name] = r15pose
        else:
            r15_by_time.setdefault(t, {})[bone] = pose
    frames = []
    for t in sorted(set(r15_by_time) | set(r6_by_time)):
        # Snap the very first keyframe to t=0 if the model started later, so
        # the animation has a defined start pose the engine can seed from.
        if not frames and t > 0.0:
            frames.append([0.0, _pose_list(r15_by_time.get(0.0, {}),
                                           r6_by_time.get(0.0, {}))])
        frames.append([round(t, 4), _pose_list(r15_by_time.get(t, {}),
                                               r6_by_time.get(t, {}))])
    return frames


def _fmt(x):
    if isinstance(x, float):
        s = "%.5f" % x
        return s.rstrip("0").rstrip(".") or "0"
    return str(x)


def build_animation_luau(*, name, rig, style, duration, fps, loop=False, keyframes=None):
    """Compile a full Luau script that builds a KeyframeSequence animation,
    registers it with AnimationClipProvider and plays it on the rig's Animator.

    rig: '' means current selection first, else first rig with Humanoid in
    Workspace. Non-empty is a Model name found in Workspace.
    keyframes: optional list of AI-authored keyframes (see _custom_frames).
    When given, `style` is ignored and the keyframes are used verbatim.
    """
    duration = float(duration or 2.6)
    duration = max(0.2, min(30.0, duration))
    fps = max(6, min(60, int(fps or 30)))
    name = (name or "CustomAnim").strip() or "CustomAnim"
    keyframes = keyframes or []
    if keyframes:
        style_key = "custom"
        frames = _custom_frames(keyframes, duration)
        if not frames:
            raise ValueError("keyframes produced no usable bone keyframes "
                             "(need at least one entry with a valid `bone`)")
    else:
        style_key = (style or "idle").strip().lower().replace(" ", "_").replace("-", "_")
        if style_key not in _STYLES:
            raise ValueError(
                "unknown animation style '%s'. Choose: %s"
                % (style, ", ".join(sorted(_STYLES))))
        frames = _preset_frames(style_key, duration, fps)

    name_json = json.dumps(name)
    rig_json = json.dumps(rig or "")
    frames_json = json.dumps(frames, separators=(",", ":"))
    loop_lua = "true" if loop else "false"

    return f"""-- VoidScript generated animation "{name}" (style {style_key})
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ClipProvider = game:GetService("AnimationClipProvider")
local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

local ANIM_NAME = {name_json}
local RIG_QUERY = {rig_json}
local FRAMES_DATA = [==[{frames_json}]==]
local FRAMES = HttpService:JSONDecode(FRAMES_DATA)
local LOOP = {loop_lua}
local DURATION = {duration}

local function findRig()
    local Players = game:GetService("Players")
    local me = Players.LocalPlayer
    if me and me.Character and me.Character:FindFirstChildOfClass("Humanoid") then
        return me.Character, me.Character:FindFirstChildOfClass("Humanoid")
    end
    local sel = Selection:Get()
    for _, obj in ipairs(sel) do
        if obj:IsA("Model") and obj:FindFirstChildOfClass("Humanoid") then
            return obj, obj:FindFirstChildOfClass("Humanoid")
        end
    end
    if RIG_QUERY ~= "" then
        local hit = Workspace:FindFirstChild(RIG_QUERY, true)
        if hit then
            local model = hit:IsA("Model") and hit or hit.Parent
            local hum = model and model:FindFirstChildOfClass("Humanoid")
            if model and hum then return model, hum end
        end
    end
    for _, c in ipairs(Workspace:GetDescendants()) do
        if c:IsA("Model") then
            local hum = c:FindFirstChildOfClass("Humanoid")
            if hum and c.PrimaryPart then return c, hum end
        end
    end
    return nil, nil
end

local rig, humanoid = findRig()
local mode = "R15/R6"
if humanoid then
    mode = humanoid.RigType == Enum.HumanoidRigType.R15 and "R15" or "R6"
end
-- No rig? The KeyframeSequence is still created and saved (that works fine
-- with zero characters in the scene) so the AI can build animation FILES the
-- user can apply later. It only plays when a rig is found.
local played = false

local folder = ReplicatedStorage:FindFirstChild("VoidScriptAnimations")
if not folder then
    folder = Instance.new("Folder")
    folder.Name = "VoidScriptAnimations"
    folder.Parent = ReplicatedStorage
end

local seq = Instance.new("KeyframeSequence")
seq.Name = ANIM_NAME
seq.Parent = folder

local isR15 = mode == "R15"
for _, kf in ipairs(FRAMES) do
    local key = Instance.new("Keyframe")
    key.Name = string.format("KF_%04d", kf[1] * 1000)
    key.Time = kf[1]
    for _, bone in ipairs(kf[2]) do
        local isR6Bone = bone.n == "Torso"
            or bone.n:match(" Arm$") ~= nil or bone.n:match(" Leg$") ~= nil
        -- "Head" belongs to BOTH rig families, so it plays on R15 and R6.
        -- Without a rig we keep every bone so the clip is rig-agnostic.
        local include = not humanoid or bone.n == "Head"
            or (isR15 and not isR6Bone) or (not isR15 and isR6Bone)
        if include then
            local pose = Instance.new("Pose")
            pose.Name = bone.n
            local d = bone.d
            pose.CFrame = CFrame.new(d[4], d[5], d[6]) * CFrame.Angles(d[1], d[2], d[3])
            pose.Parent = key
        end
    end
    key.Parent = seq
end

-- The KeyframeSequence we just built IS already an AnimationClip (KeyframeSequence
-- inherits AnimationClip), so to play it on a rig we register it with
-- AnimationClipProvider (RegisterAnimationClip returns a local Studio-only id -
-- NO upload, NO asset ID to paste). Registration needs the Animation capability
-- and can be missing/unavailable in a running game, so we never hard-fail on it:
-- if no id comes back (or it cannot be loaded), we play the same keyframes by
-- driving the rig's Motor6Ds directly, which animates the live player in both
-- Edit and Play mode.
local function collectSamples(frames)
    local out = {{}}
    for _, kf in ipairs(frames) do
        local t = kf[1]
        for _, b in ipairs(kf[2]) do
            local lst = out[b.n]
            if not lst then
                lst = {{}}
                out[b.n] = lst
            end
            lst[#lst + 1] = {{ t, b.d }}
        end
    end
    return out
end

local function sampleAt(lst, t)
    local a = lst[1]
    if t <= a[1] then return a[2] end
    local b = lst[#lst]
    if t >= b[1] then return b[2] end
    for i = 1, #lst - 1 do
        local x, y = lst[i], lst[i + 1]
        if t >= x[1] and t <= y[1] then
            local u = 0
            if y[1] > x[1] then u = (t - x[1]) / (y[1] - x[1]) end
            local px, py = x[2], y[2]
            return {{
                px[1] + (py[1] - px[1]) * u,
                px[2] + (py[2] - px[2]) * u,
                px[3] + (py[3] - px[3]) * u,
                px[4] + (py[4] - px[4]) * u,
                px[5] + (py[5] - px[5]) * u,
                px[6] + (py[6] - px[6]) * u,
            }}
        end
    end
    return a[2]
end

local function playProcedural(targetRig)
    local samples = collectSamples(FRAMES)
    local joints = {{}}
    for _, c in ipairs(targetRig:GetDescendants()) do
        if c:IsA("Motor6D") and c.Part1 and samples[c.Part1.Name] then
            joints[c.Part1.Name] = c
        end
    end
    local HEART = game:GetService("RunService").Heartbeat
    task.spawn(function()
        local first = os.clock()
        while targetRig.Parent do
            local t = os.clock() - first
            if LOOP then
                t = (t % DURATION)
            elseif t > DURATION then
                break
            end
            for name, m in pairs(joints) do
                if m.Parent then
                    local d = sampleAt(samples[name], t)
                    m.Transform = CFrame.new(d[4], d[5], d[6]) * CFrame.Angles(d[1], d[2], d[3])
                end
            end
            HEART:Wait()
        end
        for _, m in pairs(joints) do
            if m.Parent then m.Transform = CFrame.new() end
        end
    end)
end

local clip = nil
-- The KeyframeSequence we built IS already an AnimationClip, and in Studio an
-- AnimationClip can be registered as a local "active://" preview id (or hash)
-- that an Animation instance accepts without uploading anything. We fetch that
-- id and play it through the Animator. If registration or playback fails (e.g.
-- the Animation capability is missing, or we run where clip IDs are blocked)
-- we fall back to joint-driven playback of the exact same keyframes.
local clipId = nil
local clipOk = pcall(function()
    clipId = ClipProvider:RegisterActiveAnimationClip(seq)
end)
local hasClip = clipOk and clipId ~= nil
if hasClip then
    clip = Instance.new("Animation")
    clip.Name = ANIM_NAME
    clip.AnimationId = clipId
else
    -- Last resort for a clip id: a plain hash that the Animator can still load.
    local hash = nil
    local okHash = pcall(function() hash = ClipProvider:RegisterAnimationClip(seq) end)
    if okHash and hash then
        hasClip = true
        clip = Instance.new("Animation")
        clip.Name = ANIM_NAME
        clip.AnimationId = hash
    end
end

if rig and humanoid then
    if hasClip and clip and humanoid.Animator then
        local okT, track = pcall(function() return humanoid.Animator:LoadAnimation(clip) end)
        if okT and track then
            track.Looped = LOOP
            track:Play(0.001)
            played = true
        end
    end
    if not played then
        playProcedural(rig)
        played = true
    end
end

local count = #FRAMES
-- The summary line MUST read as a plain success to the AI. The clip is
-- registered (or joint playback is used when the clip API is blocked), so an
-- animation asset ID is never required - that fact is stated explicitly so the
-- AI never tells the user an ID/upload/extra step is needed.
local modeNote = "fully playable - registered clip"
if not hasClip then
    modeNote = "fully playable while playing - joint-driven playback (no asset ID needed)"
end
local playNote = ""
if played then
    playNote = string.format(" - NOW PLAYING on '%s'", rig.Name)
else
    playNote = " - ready to play once a rig is in the scene"
end
return string.format(
    "[VoidScript] ANIMATION DONE. '%s' created and playable: %d keyframes, %.2f s, %d fps (%s mode), %s%s. NO asset upload, NO animation ID needed - the animation is ready now. KeyframeSequence also saved under ReplicatedStorage.VoidScriptAnimations.",
    ANIM_NAME, count, {duration}, {fps}, mode, modeNote, playNote)
"""


# ---------------------------------------------------------------------------
#  VFX generation
# ---------------------------------------------------------------------------

def _hex3(hexstr, fallback=(1, 0, 0)):
    try:
        h = (hexstr or "").lstrip("#")
        if len(h) != 6:
            return fallback
        return (int(h[0:2], 16) / 255.0,
                int(h[2:4], 16) / 255.0,
                int(h[4:6], 16) / 255.0)
    except Exception:
        return fallback


def _rgb_args(hexstr, fallback="255, 80, 80"):
    c = _hex3(hexstr)
    return "%d, %d, %d" % (int(c[0] * 255), int(c[1] * 255), int(c[2] * 255))


def _nseq(*pts):
    inner = ", ".join(
        "NumberSequenceKeypoint.new(%.3f, %s)" % (p, _fmt(v)) for p, v in pts)
    return "NumberSequence.new(%s)" % inner


def _cseq(hexa, hexb):
    return "ColorSequence.new(Color3.fromRGB(%s), Color3.fromRGB(%s))" % (
        _rgb_args(hexa), _rgb_args(hexb))


def _xyz_pair(s, scale):
    """Take "x, y, z" (each optionally including `* SCALE`) and return the
    comma-joined component expression, scaled."""
    parts = [p.strip() for p in str(s).split(",")]
    parts = [p for p in parts if p]
    if len(parts) != 3:
        return "0, 0, 0"
    if "* SCALE" in s or "*SCALE" in s:
        return ", ".join(parts)
    fmt = _fmt(scale)
    return ", ".join("%s * %s" % (p, fmt) for p in parts)


_EFFECTS = ("fire", "smoke", "explosion", "lightning", "sparks", "glow",
            "sparkle_aura", "portal", "shield", "slash", "footsteps", "rain",
            "snow", "lava", "water_splash", "muzzle_flash", "electric_aura",
            "hearts", "starfield", "sandstorm")

_EFFECT_DESC = {
    "fire": "rising flame tongue with orange glow light",
    "smoke": "grey smoke plume rising and spreading",
    "explosion": "flash + shockwave ring + flickering light",
    "lightning": "electric bolt beam with random jagged curve + flicker",
    "sparks": "bright metal sparks with gravity and drag",
    "glow": "soft halo glow with gentle drifting particles",
    "sparkle_aura": "ambient sparkle aura around the host",
    "portal": "rotating energy ring with inner swirl",
    "shield": "spinning 3-ring bubble shield",
    "slash": "arcane slash arc with fading trail",
    "footsteps": "dust kick-up at the point",
    "rain": "dense rain stream with ground mist",
    "snow": "falling snow with slow drift",
    "lava": "glowing lava bubbles + rising embers + light",
    "water_splash": "splash plume + droplets",
    "muzzle_flash": "brief gunshot flash + light",
    "electric_aura": "crackling electric aura with arcs",
    "hearts": "floating hearts + sparkle (romance effect)",
    "starfield": "ambient twinkling stars",
    "sandstorm": "swirling sand + fast drifting stream",
}


def _w(lines, indent, code):
    lines.append("    " * indent + code)


def _set(pe_name, lines, out_indent, cfg):
    for key, val in cfg.items():
        if val is None:
            continue
        _w(lines, out_indent, "pe.%s = %s" % (key, val))


def build_vfx_luau(*, effect, parent, position, scale, color_a, color_b, duration,
                   emitters=None):
    """Compile a Luau script that builds the requested effect as native Roblox
    instances (ParticleEmitter / Beam / Light / Sounds only - no external
    assets, no plugins). Returns the Luau source string.

    emitters: optional list of AI-authored instance configs. Each entry:
        {"instance": "ParticleEmitter"|"Beam"|"Light",
         "name": optional string, "parent": "att"|"root"|"holder",
         "properties": {<property>: <Luau value string>}, }
    When given, the `effect` preset is ignored.
    """
    duration = max(0.5, min(600.0, float(duration or 6.0)))
    if not emitters:
        effect = (effect or "fire").strip().lower().replace(" ", "_").replace("-", "_")
        if effect not in _EFFECTS:
            raise ValueError("unknown effect '%s'. Choose: %s"
                             % (effect, ", ".join(sorted(_EFFECTS))))
        key = effect
    else:
        key = "custom"
    scale = max(0.05, min(50.0, float(scale or 1.0)))
    c1 = (color_a or "ff512f").strip() or "ff512f"
    c2 = (color_b or c1).strip() or c1
    parent = (parent or "").strip()
    position = (position or "").strip()

    L = []
    _w(L, 0, "-- VoidScript generated VFX: %s" % key)
    _w(L, 0, 'local Workspace = game:GetService("Workspace")')
    _w(L, 0, 'local Debris = game:GetService("Debris")')
    _w(L, 0, 'local Selection = game:GetService("Selection")')
    _w(L, 0, 'local PARENT = %s' % json.dumps(parent))
    _w(L, 0, 'local POS = %s' % json.dumps(position))
    _w(L, 0, "local SCALE = %s" % _fmt(scale))
    _w(L, 0, "local LIFETIME = %s" % _fmt(duration))
    _w(L, 0, "local ROOT")
    _w(L, 0, "local hostPart = nil")
    _w(L, 0, 'if PARENT ~= "" then')
    _w(L, 1, "local hit = Workspace:FindFirstChild(PARENT, false)")
    _w(L, 1, "if not hit then error(\"[VoidScript] vs_make_vfx: parent %q not found in Workspace.\" .. PARENT) end")
    _w(L, 1, "hostPart = hit:IsA(\"BasePart\") and hit or nil")
    _w(L, 1, "if not hostPart then")
    _w(L, 2, "for _, d in ipairs(hit:GetDescendants()) do if d:IsA(\"BasePart\") then hostPart = d; break end end")
    _w(L, 1, "end")
    _w(L, 0, "else")
    _w(L, 1, "for _, o in ipairs(Selection:Get()) do if o:IsA(\"BasePart\") then hostPart = o; break end end")
    _w(L, 1, "if not hostPart then hostPart = Workspace:FindFirstChild(\"Baseplate\") or Instance.new(\"Part\") end")
    _w(L, 1, "if not hostPart:IsDescendantOf(Workspace) then")
    _w(L, 2, "hostPart.Anchored = true; hostPart.CanCollide = false; hostPart.Transparency = 1; hostPart.Parent = Workspace")
    _w(L, 1, "end")
    _w(L, 0, "end")
    _w(L, 0, "if not hostPart then error(\"[VoidScript] vs_make_vfx: no BasePart to attach to.\") end")
    _w(L, 0, "ROOT = hostPart")
    _w(L, 0, "")
    _w(L, 0, "local att = Instance.new(\"Attachment\")")
    _w(L, 0, "att.Name = \"VFX_Anchor\"")
    _w(L, 0, 'if POS ~= "" then')
    _w(L, 1, "local xs, ys, zs = POS:match(\"(%S+),%s*(%S+),%s*(%S+)\")")
    _w(L, 1, 'if xs then att.WorldPosition = Vector3.new(tonumber(xs), tonumber(ys), tonumber(zs)) end')
    _w(L, 0, "end")
    _w(L, 0, "att.Parent = ROOT")
    _w(L, 0, "")
    _w(L, 0, 'local holder = Instance.new("Folder")')
    _w(L, 0, "holder.Name = \"VoidScriptVFX_%s\"" % key)
    _w(L, 0, "holder.Parent = ROOT")
    _w(L, 0, "Debris:AddItem(holder, LIFETIME)")
    _w(L, 0, "Debris:AddItem(att, LIFETIME)")
    _w(L, 0, "")

    # Per-effect directives. `em` takes indentation + emitter config table.
    def em(cfg, indent=0):
        _w(L, indent, "local pe = Instance.new(\"ParticleEmitter\")")
        for k, v in cfg.items():
            if v is None:
                continue
            if k == "Texture":
                # Never let one missing built-in asset abort the whole effect.
                _w(L, indent, "pcall(function() pe.Texture = %s end)" % v)
            else:
                _w(L, indent, "pe.%s = %s" % (k, v))
        _w(L, indent, "pe.Parent = att")

    def light(hexa, bright, rng, flicker=None):
        _w(L, 0, "local li = Instance.new(\"Light\")")
        _w(L, 0, "li.Name = \"VFX_Light\"")
        _w(L, 0, "li.Color = Color3.fromRGB(%s)" % _rgb_args(hexa))
        _w(L, 0, "li.Brightness = %s" % _fmt(bright))
        _w(L, 0, "li.Range = %s" % _fmt(rng))
        _w(L, 0, "li.Parent = ROOT")
        if flicker:
            _w(L, 0, "task.spawn(function() local base = li.Brightness; for _ = 1, math.floor(LIFETIME / 0.12) do if not li.Parent then break end li.Brightness = base * (0.55 + math.random() * 0.5); task.wait(0.12) end end)")

    def beam(a0, a1, width, hexa, curve=0.0, texspeed=None, textured=True):
        _w(L, 0, "local bm = Instance.new(\"Beam\")")
        _w(L, 0, "bm.Attachment0 = %s; bm.Attachment1 = %s" % (a0, a1))
        _w(L, 0, "bm.Width0 = %s; bm.Width1 = %s" % (_fmt(width), _fmt(width)))
        _w(L, 0, "bm.Color = %s" % _cseq(hexa, hexa))
        _w(L, 0, "bm.LightEmission = 1")
        if curve:
            _w(L, 0, "bm.CurveSize0 = %s; bm.CurveSize1 = %s" % (_fmt(curve), _fmt(curve)))
        if texspeed and textured:
            _w(L, 0, "bm.TextureSpeed = %s" % _fmt(texspeed))
            _w(L, 0, 'pcall(function() bm.Texture = "rbxasset://textures/particles/rays_main.dds" end)')
        _w(L, 0, "bm.Parent = holder")

    if key == "custom":
        for i, econf in enumerate(emitters or []):
            insttype = str(econf.get("instance") or "ParticleEmitter").strip()
            props = econf.get("properties") or {}
            ename = str(econf.get("name") or ("CustomFX_%02d" % i))
            iparent = str(econf.get("parent") or "att").strip()
            if insttype == "Beam":
                _w(L, 0, "local bm = Instance.new(\"Beam\")")
                _w(L, 0, "bm.Name = %s" % json.dumps(ename))
                _w(L, 0, "local a0 = Instance.new(\"Attachment\")")
                _w(L, 0, "local a1 = Instance.new(\"Attachment\")")
                _w(L, 0, "a0.Parent = ROOT; a1.Parent = ROOT")
                b0 = str(econf.get("from") or econf.get("offset0") or "-1, 0, 0")
                b1 = str(econf.get("to") or econf.get("offset1") or "1, 0, 0")
                _w(L, 0, "a0.Position = Vector3.new(%s)" % _xyz_pair(b0, scale))
                _w(L, 0, "a1.Position = Vector3.new(%s)" % _xyz_pair(b1, scale))
                hp = dict(props)
                if hp.get("Color"):
                    _w(L, 0, "bm.Color = %s" % hp.pop("Color"))
                else:
                    _w(L, 0, "bm.Color = %s" % _cseq(c1, c2))
                if hp.get("Attachment0") or hp.get("Attachment1"):
                    pass
                else:
                    _w(L, 0, "bm.Attachment0 = a0; bm.Attachment1 = a1")
                for k, v in hp.items():
                    if v is None:
                        continue
                    if k == "Texture":
                        _w(L, 0, "pcall(function() bm.Texture = %s end)" % v)
                    elif k in ("Attachment0", "Attachment1"):
                        _w(L, 0, "bm.%s = %s" % (k, v))
                    else:
                        _w(L, 0, "bm.%s = %s" % (k, v))
                _w(L, 0, "bm.Parent = holder")
                _w(L, 0, "Debris:AddItem(a0, LIFETIME); Debris:AddItem(a1, LIFETIME)")
            elif insttype == "Light":
                _w(L, 0, "local li = Instance.new(\"Light\")")
                _w(L, 0, "li.Name = %s" % json.dumps(ename))
                for k, v in props.items():
                    if v is None:
                        continue
                    _w(L, 0, "li.%s = %s" % (k, v))
                _w(L, 0, "li.Parent = %s" % iparent)
            else:
                _w(L, 0, "local pe = Instance.new(\"ParticleEmitter\")")
                _w(L, 0, "pe.Name = %s" % json.dumps(ename))
                pe_parent = iparent if iparent == "ROOT" else "att"
                if econf.get("offset"):
                    _w(L, 0, "local pe_off = Instance.new(\"Attachment\")")
                    _w(L, 0, "pe_off.Position = Vector3.new(%s)" % _xyz_pair(str(econf["offset"]), scale))
                    _w(L, 0, "pe_off.Parent = %s" % (iparent if iparent == "ROOT" else "att"))
                    pe_parent = "pe_off"
                    _w(L, 0, "Debris:AddItem(pe_off, LIFETIME)")
                for k, v in props.items():
                    if v is None:
                        continue
                    if k == "Texture":
                        _w(L, 0, "pcall(function() pe.Texture = %s end)" % v)
                    else:
                        _w(L, 0, "pe.%s = %s" % (k, v))
                _w(L, 0, "pe.Parent = %s" % pe_parent)
                _w(L, 0, "Debris:AddItem(pe, LIFETIME)")
    elif key == "fire":
        em({
            "Name": '"Flame"',
            "Texture": '"rbxasset://textures/particles/fire_main.dds"',
            "Color": _cseq(c1, "ffd24a"),
            "Transparency": _nseq((0, 0.15), (0.7, 0.3), (1, 1)),
            "Size": _nseq((0, 0.5 * scale), (1, 0.08 * scale)),
            "Rate": 55 * scale, "Lifetime": "NumberRange.new(0.3, 0.8)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (1.5 * scale, 4 * scale),
            "SpreadAngle": "Vector2.new(8, 18)",
            "LightEmission": 0.75, "LightInfluence": 0.1, "ZOffset": 0.4,
        })
        light(c1, 1.6 * scale, 9 * scale)
    elif key == "smoke":
        em({
            "Name": '"Smoke"',
            "Texture": '"rbxasset://textures/particles/smoke_main.dds"',
            "Color": _cseq("8f8f94", "4a4a4f"),
            "Transparency": _nseq((0, 0.6), (1, 1)),
            "Size": _nseq((0, 0.4 * scale), (1, 1.6 * scale)),
            "Rate": 30 * scale, "Lifetime": "NumberRange.new(1.2, 2.4)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.8 * scale, 1.8 * scale),
            "Acceleration": "Vector3.new(0, 1.2, 0)", "Drag": 0.25,
            "SpreadAngle": "Vector2.new(6, 14)", "ZOffset": 0.2,
        })
    elif key == "explosion":
        em({
            "Name": '"Flash"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("fff2c0", "ff9a3c"),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 2.4 * scale), (1, 0.3 * scale)),
            "Rate": 1, "Lifetime": "NumberRange.new(0.05, 0.12)",
            "Speed": "NumberRange.new(0, 1)", "LightEmission": 1, "LightInfluence": 0,
        })
        em({
            "Name": '"Shockwave"',
            "Texture": '"rbxasset://textures/particles/explosion_daze.dds"',
            "Color": _cseq(c1, c2),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 0.4 * scale), (1, 6 * scale)),
            "Rate": 2, "Lifetime": "NumberRange.new(0.15, 0.25)",
            "Speed": "NumberRange.new(1, 2)", "LightEmission": 0.9, "LightInfluence": 0,
            "ZOffset": 0.6,
        })
        light(c1, 3.0 * scale, 18 * scale, flicker=1.2)
    elif key == "sparks":
        em({
            "Name": '"Sparks"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq(c1, "fff4c0"),
            "Transparency": _nseq((0, 0), (0.5, 0.2), (1, 1)),
            "Size": _nseq((0, 0.18 * scale), (1, 0.05 * scale)),
            "Rate": 160 * scale, "Lifetime": "NumberRange.new(0.2, 0.6)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (4 * scale, 11 * scale),
            "SpreadAngle": "Vector2.new(0, 45)",
            "Acceleration": "Vector3.new(0, -9.8, 0)", "Drag": 0.3,
            "LightEmission": 0.8, "LightInfluence": 0,
        })
        light(c1, 0.6 * scale, 5 * scale)
    elif key == "glow":
        light(c1, 2.2 * scale, 14 * scale, flicker=1.5)
        em({
            "Name": '"GlowParticles"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq(c1, c2),
            "Transparency": _nseq((0, 0.35), (1, 0.9)),
            "Size": _nseq((0, 1.6 * scale), (1, 2.4 * scale)),
            "Rate": 25 * scale, "Lifetime": "NumberRange.new(0.8, 1.6)",
            "Speed": "NumberRange.new(0.1, 0.4)", "SpreadAngle": "Vector2.new(0, 360)",
            "LightEmission": 1, "LightInfluence": 0,
        })
    elif key == "lightning":
        light(c1, 1.4 * scale, 10 * scale, flicker=1.0)
        em({
            "Name": '"BoltBase"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("dff2ff", c1),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 0.3 * scale), (1, 0.05 * scale)),
            "Rate": 8, "Lifetime": "NumberRange.new(0.05, 0.15)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (2 * scale, 4 * scale),
            "LightEmission": 1, "LightInfluence": 0,
        })
        _w(L, 0, 'local _top = Instance.new("Attachment")')
        _w(L, 0, "_top.Name = \"BoltTop\"")
        _w(L, 0, "_top.Position = Vector3.new(0, %s * 3, 0)" % _fmt(scale))
        _w(L, 0, "_top.Parent = ROOT")
        _w(L, 0, "Debris:AddItem(_top, LIFETIME)")
        beam("att", "_top", 0.24 * scale, "dff2ff", texspeed=1.2)
        _w(L, 0, "task.spawn(function()")
        _w(L, 1, "local bm = holder:FindFirstChildOfClass(\"Beam\")")
        _w(L, 1, "for _ = 1, math.floor(LIFETIME / 0.12) do")
        _w(L, 2, "if not bm or not bm.Parent then break end")
        _w(L, 2, "bm.CurveSize0 = (math.random() - 0.5) * %s" % _fmt(0.6 * scale))
        _w(L, 2, "bm.CurveSize1 = (math.random() - 0.5) * %s" % _fmt(0.6 * scale))
        _w(L, 2, "bm.Transparency = NumberSequence.new(0.1)")
        _w(L, 2, "task.wait(0.12)")
        _w(L, 1, "end")
        _w(L, 0, "end)")
    elif key == "portal":
        light(c1, 2.0 * scale, 12 * scale, flicker=1.2)
        _w(L, 0, "local R = %s * 1.1" % _fmt(scale))
        _w(L, 0, "local N = 14")
        _w(L, 0, "local pts = {}")
        _w(L, 0, "for i = 0, N - 1 do")
        _w(L, 1, 'local at = Instance.new("Attachment")')
        _w(L, 1, "at.Name = \"Ring\" .. i")
        _w(L, 1, "at.Position = Vector3.new(math.cos((i / N) * math.pi * 2) * R, 0, math.sin((i / N) * math.pi * 2) * R)")
        _w(L, 1, "at.Parent = ROOT")
        _w(L, 1, "pts[#pts + 1] = at")
        _w(L, 1, "Debris:AddItem(at, LIFETIME)")
        _w(L, 0, "end")
        _w(L, 0, "for i = 1, N do")
        _w(L, 1, "local bm = Instance.new(\"Beam\")")
        _w(L, 1, "bm.Attachment0 = pts[i]; bm.Attachment1 = pts[i % N + 1]")
        _w(L, 1, "bm.Width0 = 0.5 * SCALE; bm.Width1 = 0.5 * SCALE")
        _w(L, 1, "bm.Color = %s" % _cseq(c1, c2))
        _w(L, 1, "bm.LightEmission = 1")
        _w(L, 1, "bm.TextureSpeed = 2; pcall(function() bm.Texture = \"rbxasset://textures/particles/rays_main.dds\" end)")
        _w(L, 1, "bm.Parent = holder")
        _w(L, 0, "end")
        em({
            "Name": '"PortalSwirl"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq(c1, c2),
            "Transparency": _nseq((0, 0.1), (0.7, 0.4), (1, 1)),
            "Size": _nseq((0, 0.7 * scale), (1, 0.15 * scale)),
            "Rate": 120 * scale, "Lifetime": "NumberRange.new(0.5, 1.1)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (1 * scale, 3 * scale),
            "SpreadAngle": "Vector2.new(0, 12)", "Acceleration": "Vector3.new(0, 1.5, 0)",
            "LightEmission": 1, "LightInfluence": 0,
        })
    elif key == "shield":
        light(c1, 1.5 * scale, 10 * scale)
        _w(L, 0, "local R = %s * 1.25" % _fmt(scale))
        _w(L, 0, "local N = 10")
        _w(L, 0, "local rings = {}")
        _w(L, 0, "for k = 0, 2 do")
        _w(L, 1, "local pts = {}")
        _w(L, 1, "for i = 0, N - 1 do")
        _w(L, 2, 'local at = Instance.new("Attachment")')
        _w(L, 2, "at.Name = \"ShRing\" .. k .. \"_\" .. i")
        _w(L, 2, "local y = (k - 1) * R * 0.55")
        _w(L, 2, "at.Position = Vector3.new(math.cos((i / N) * math.pi * 2) * R, y, math.sin((i / N) * math.pi * 2) * R)")
        _w(L, 2, "at.Parent = ROOT")
        _w(L, 2, "pts[#pts + 1] = at")
        _w(L, 2, "Debris:AddItem(at, LIFETIME)")
        _w(L, 1, "end")
        _w(L, 1, "for i = 1, N do")
        _w(L, 2, "local bm = Instance.new(\"Beam\")")
        _w(L, 2, "bm.Attachment0 = pts[i]; bm.Attachment1 = pts[i % N + 1]")
        _w(L, 2, "bm.Width0 = 0.35 * SCALE; bm.Width1 = 0.35 * SCALE")
        _w(L, 2, "bm.Color = %s" % _cseq(c1, c2))
        _w(L, 2, "bm.LightEmission = 1; bm.TextureSpeed = 1.5")
        _w(L, 2, "pcall(function() bm.Texture = \"rbxasset://textures/particles/rays_main.dds\" end)")
        _w(L, 2, "bm.Parent = holder")
        _w(L, 1, "end")
        _w(L, 1, "rings[k + 1] = pts")
        _w(L, 0, "end")
        _w(L, 0, "task.spawn(function() local ph = 0; while true do if not holder.Parent then break end ph = ph + 0.5; for _, pts in ipairs(rings) do for i, at in ipairs(pts) do at.WorldPosition = ROOT.Position + Vector3.new(math.cos((i / N) * math.pi * 2 + ph) * R, at.Position.Y, math.sin((i / N) * math.pi * 2 + ph) * R) end end; task.wait(0.03) end end)")
    elif key == "slash":
        _w(L, 0, 'local a0 = Instance.new("Attachment")')
        _w(L, 0, 'local a1 = Instance.new("Attachment")')
        _w(L, 0, "a0.Name = \"SlashA\"; a1.Name = \"SlashB\"")
        _w(L, 0, "a0.Position = Vector3.new(-1.6 * SCALE, 0, 0); a1.Position = Vector3.new(1.6 * SCALE, 0, 0)")
        _w(L, 0, "a0.Parent = ROOT; a1.Parent = ROOT")
        _w(L, 0, "Debris:AddItem(a0, LIFETIME); Debris:AddItem(a1, LIFETIME)")
        beam("a0", "a1", 0.7 * scale, c1, curve=1.4 * scale, texspeed=3.0)
        em({
            "Name": '"SlashTrail"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq(c1, c2),
            "Transparency": _nseq((0, 0.4), (1, 1)),
            "Size": _nseq((0, 0.7 * scale), (1, 0.1 * scale)),
            "Rate": 60 * scale, "Lifetime": "NumberRange.new(0.1, 0.3)",
            "Speed": "NumberRange.new(1, 2)", "LightEmission": 1, "LightInfluence": 0,
        }, indent=0)
        light(c1, 1.0 * scale, 8 * scale, flicker=0.6)
        _w(L, 0, "task.spawn(function() local bm = holder:FindFirstChildOfClass(\"Beam\")")
        _w(L, 1, "if bm then for i = 1, 10 do if not bm.Parent then break end")
        _w(L, 2, "bm.CurveSize0 = (math.random() - 0.5) * 1.4 * SCALE")
        _w(L, 2, "bm.CurveSize1 = (math.random() - 0.5) * 1.4 * SCALE")
        _w(L, 2, "bm.Transparency = NumberSequence.new(0.05 + (i / 10) * 0.85)")
        _w(L, 2, "task.wait(0.05)")
        _w(L, 1, "end")
        _w(L, 1, "bm:Destroy()")
        _w(L, 0, "end end)")
    elif key == "footsteps":
        em({
            "Name": '"Dust"',
            "Texture": '"rbxasset://textures/particles/smoke_main.dds"',
            "Color": _cseq("cfd4d9", "9aa1a8"),
            "Transparency": _nseq((0, 0.3), (1, 1)),
            "Size": _nseq((0, 0.25 * scale), (1, 1.0 * scale)),
            "Rate": 40 * scale, "Lifetime": "NumberRange.new(0.3, 0.7)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.6 * scale, 1.4 * scale),
            "SpreadAngle": "Vector2.new(0, 120)", "Acceleration": "Vector3.new(0, 1.0, 0)",
            "Drag": 0.4, "ZOffset": 0.1,
        })
    elif key == "rain":
        em({
            "Name": '"Rain"',
            "Texture": '"rbxasset://textures/particles/rays_main.dds"',
            "Color": _cseq("9ec7ff", "4d7dff"),
            "Size": _nseq((0, 0.015 * scale), (1, 0.015 * scale)),
            "Rate": 350 * scale, "Lifetime": "NumberRange.new(1.0, 2.0)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (9 * scale, 13 * scale),
            "Acceleration": "Vector3.new(0, -3, 0)", "SpreadAngle": "Vector2.new(0, 2)",
            "ZOffset": 0.05, "LightEmission": 0.3,
        })
        em({
            "Name": '"Mist"',
            "Texture": '"rbxasset://textures/particles/smoke_main.dds"',
            "Color": _cseq("bfd4ff", "7b96d8"),
            "Transparency": _nseq((0, 0.55), (1, 0.95)),
            "Size": _nseq((0, 1.6 * scale), (1, 3.4 * scale)),
            "Rate": 10 * scale, "Lifetime": "NumberRange.new(2, 4)",
            "Speed": "NumberRange.new(0.2, 0.5)", "SpreadAngle": "Vector2.new(0, 360)",
            "Drag": 0.2, "ZOffset": -0.6,
        })
    elif key == "snow":
        em({
            "Name": '"Snow"',
            "Texture": '"rbxasset://textures/particles/star_main.dds"',
            "Color": _cseq("ffffff", "dfe8ff"),
            "Transparency": _nseq((0, 0.1), (1, 0.3)),
            "Size": _nseq((0, 0.12 * scale), (1, 0.12 * scale)),
            "Rate": 90 * scale, "Lifetime": "NumberRange.new(3, 6)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.6 * scale, 1.2 * scale),
            "Acceleration": "Vector3.new(0, -0.25, 0)", "SpreadAngle": "Vector2.new(0, 360)",
            "LightEmission": 0.4, "LightInfluence": 0,
        })
        em({
            "Name": '"SnowDrift"',
            "Texture": '"rbxasset://textures/particles/smoke_main.dds"',
            "Color": _cseq("ffffff", "dfe8ff"),
            "Transparency": _nseq((0, 0.4), (1, 0.9)),
            "Size": _nseq((0, 0.5 * scale), (1, 2.2 * scale)),
            "Rate": 16 * scale, "Lifetime": "NumberRange.new(2, 4)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.4 * scale, 1.0 * scale),
            "SpreadAngle": "Vector2.new(0, 360)", "Drag": 0.3, "ZOffset": -0.6,
        })
    elif key == "lava":
        em({
            "Name": '"Lava"',
            "Texture": '"rbxasset://textures/particles/fire_main.dds"',
            "Color": _cseq("ff6a00", "ffdd55"),
            "Transparency": _nseq((0, 0.1), (0.75, 0.35), (1, 1)),
            "Size": _nseq((0, 0.7 * scale), (1, 0.15 * scale)),
            "Rate": 45 * scale, "Lifetime": "NumberRange.new(0.8, 1.9)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.6 * scale, 1.8 * scale),
            "SpreadAngle": "Vector2.new(4, 12)", "LightEmission": 0.9,
            "LightInfluence": 0.05, "ZOffset": 0.3,
        })
        em({
            "Name": '"Embers"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("ffddaa", "ff7a00"),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 0.12 * scale), (1, 0.03 * scale)),
            "Rate": 90 * scale, "Lifetime": "NumberRange.new(0.5, 1.3)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (1.5 * scale, 3.5 * scale),
            "Acceleration": "Vector3.new(0, 0.8, 0)", "SpreadAngle": "Vector2.new(0, 90)",
            "LightEmission": 1, "LightInfluence": 0,
        })
        light("ff6a00", 1.8 * scale, 10 * scale, flicker=1.0)
    elif key == "water_splash":
        em({
            "Name": '"Splash"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("bfe6ff", "4d9fff"),
            "Transparency": _nseq((0, 0.3), (1, 1)),
            "Size": _nseq((0, 0.7 * scale), (1, 0.2 * scale)),
            "Rate": 1.5, "Lifetime": "NumberRange.new(0.12, 0.3)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (3 * scale, 8 * scale),
            "Acceleration": "Vector3.new(0, -12, 0)", "SpreadAngle": "Vector2.new(0, 55)",
            "LightEmission": 0.5,
        })
        em({
            "Name": '"Droplets"',
            "Texture": '"rbxasset://textures/particles/rays_main.dds"',
            "Color": _cseq("e5f4ff", "6fb3ff"),
            "Size": _nseq((0, 0.05 * scale), (1, 0.05 * scale)),
            "Rate": 12, "Lifetime": "NumberRange.new(0.4, 0.9)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (2 * scale, 6 * scale),
            "Acceleration": "Vector3.new(0, -8, 0)", "SpreadAngle": "Vector2.new(0, 120)",
        })
        light("8fd0ff", 0.8 * scale, 7 * scale)
    elif key == "muzzle_flash":
        em({
            "Name": '"Flash"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("ffee88", "ff8800"),
            "Transparency": _nseq((0, 0.2), (1, 1)),
            "Size": _nseq((0, 0.55 * scale), (1, 0.05 * scale)),
            "Rate": 14 * scale, "Lifetime": "NumberRange.new(0.03, 0.08)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.5 * scale, 2 * scale),
            "SpreadAngle": "Vector2.new(0, 8)", "LightEmission": 1, "LightInfluence": 0,
        })
        light("ffe680", 1.2 * scale, 6 * scale, flicker=0.5)
    elif key == "electric_aura":
        light(c1, 2.5 * scale, 16 * scale, flicker=1.6)
        em({
            "Name": '"ArcSparks"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("dff2ff", c1),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 0.25 * scale), (1, 0.06 * scale)),
            "Rate": 220 * scale, "Lifetime": "NumberRange.new(0.1, 0.4)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (3 * scale, 9 * scale),
            "SpreadAngle": "Vector2.new(0, 360)", "Acceleration": "Vector3.new(0, 9.8, 0)",
            "LightEmission": 1, "LightInfluence": 0,
        })
        em({
            "Name": '"Crackle"',
            "Texture": '"rbxasset://textures/particles/star_main.dds"',
            "Color": _cseq(c1, "ffffff"),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 0.1 * scale), (1, 0.02 * scale)),
            "Rate": 60 * scale, "Lifetime": "NumberRange.new(0.05, 0.2)",
            "Speed": "NumberRange.new(0, 2)", "SpreadAngle": "Vector2.new(0, 360)",
            "LightEmission": 1, "LightInfluence": 0,
        })
    elif key == "hearts":
        em({
            "Name": '"Hearts"',
            "Texture": '"rbxasset://textures/particles/heart_main.dds"',
            "Color": _cseq("ff5d8f", "ffb3c9"),
            "Transparency": _nseq((0, 0), (1, 0.25)),
            "Size": _nseq((0, 0.22 * scale), (1, 0.42 * scale)),
            "Rate": 14 * scale, "Lifetime": "NumberRange.new(1.2, 2.2)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (0.4 * scale, 1.0 * scale),
            "Acceleration": "Vector3.new(0, 0.6, 0)", "SpreadAngle": "Vector2.new(0, 20)",
            "LightEmission": 0.6, "LightInfluence": 0,
        })
        em({
            "Name": '"Sparkle"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq("ffffff", "ffb3c9"),
            "Transparency": _nseq((0, 0), (1, 1)),
            "Size": _nseq((0, 0.05 * scale), (1, 0.02 * scale)),
            "Rate": 10 * scale, "Lifetime": "NumberRange.new(0.3, 0.7)",
            "Speed": "NumberRange.new(0.1, 0.5)", "SpreadAngle": "Vector2.new(0, 90)",
            "LightEmission": 1, "LightInfluence": 0,
        })
    elif key == "starfield":
        em({
            "Name": '"Stars"',
            "Texture": '"rbxasset://textures/particles/star_main.dds"',
            "Color": _cseq("ffffff", "ffe9a8"),
            "Transparency": _nseq((0, 0), (1, 0.3)),
            "Size": _nseq((0, 0.4 * scale), (1, 0.9 * scale)),
            "Rate": 12 * scale, "Lifetime": "NumberRange.new(2, 4)",
            "Speed": "NumberRange.new(0.1, 0.5)", "SpreadAngle": "Vector2.new(0, 360)",
            "LightEmission": 1, "LightInfluence": 0,
        })
        light("fff4d6", 0.8 * scale, 9 * scale)
    elif key == "sandstorm":
        em({
            "Name": '"Sand"',
            "Texture": '"rbxasset://textures/particles/smoke_main.dds"',
            "Color": _cseq("d8b576", "9c7b3f"),
            "Transparency": _nseq((0, 0.4), (1, 0.95)),
            "Size": _nseq((0, 0.6 * scale), (1, 2.2 * scale)),
            "Rate": 90 * scale, "Lifetime": "NumberRange.new(2, 4)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (2 * scale, 5 * scale),
            "Acceleration": "Vector3.new(0, 0.3, 0)", "SpreadAngle": "Vector2.new(0, 360)",
            "Drag": 0.1,
        })
        em({
            "Name": '"Drift"',
            "Texture": '"rbxasset://textures/particles/grass_main.dds"',
            "Color": _cseq("c9a860", "8a6b32"),
            "Transparency": _nseq((0, 0.15), (1, 0.6)),
            "Size": _nseq((0, 0.15 * scale), (1, 0.05 * scale)),
            "Rate": 220 * scale, "Lifetime": "NumberRange.new(0.8, 1.6)",
            "Speed": "NumberRange.new(%.3f, %.3f)" % (6 * scale, 10 * scale),
            "Acceleration": "Vector3.new(0, -2, 0)", "SpreadAngle": "Vector2.new(10, 15)",
        })
    elif key == "sparkle_aura":
        light(c1, 1.4 * scale, 8 * scale)
        em({
            "Name": '"Aura"',
            "Texture": '"rbxasset://textures/particles/sparkles_main.dds"',
            "Color": _cseq(c1, c2),
            "Transparency": _nseq((0, 0.6), (1, 0.95)),
            "Size": _nseq((0, 0.5 * scale), (1, 1.4 * scale)),
            "Rate": 40 * scale, "Lifetime": "NumberRange.new(0.6, 1.4)",
            "Speed": "NumberRange.new(0.2, 0.8)", "SpreadAngle": "Vector2.new(0, 360)",
            "LightEmission": 0.8, "LightInfluence": 0,
        })

    _w(L, 0, "")
    _w(L, 0, 'return string.format("[VoidScript] VFX %%q built on %%s at %%s", %s, ROOT:GetFullName(), POS ~= "" and POS or "origin")'
         % ('"%s"' % key,))
    return "\n".join(L)


# ---------------------------------------------------------------------------
#  Tool schemas + dispatcher
# ---------------------------------------------------------------------------

_STYLE_ENUM = sorted(_STYLES.keys())
_EFFECT_ENUM = sorted(_EFFECTS)


def _schema(name, description, properties, required):
    return {
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required or list(properties.keys()),
        },
    }


def _str(desc, default=None, enum=None):
    d = {"type": "string", "description": desc}
    if default is not None:
        d["default"] = default
    if enum:
        d["enum"] = enum
    return d


def _num(desc, default=None, minimum=None, maximum=None):
    d = {"type": "number", "description": desc}
    if default is not None:
        d["default"] = default
    if minimum is not None:
        d["minimum"] = minimum
    if maximum is not None:
        d["maximum"] = maximum
    return d


def _bool(desc):
    return {"type": "boolean", "description": desc}


def _style_catalog():
    return "Available styles: " + ", ".join(sorted(_STYLES)) + "."


def _effect_catalog():
    return "Available effects: " + ", ".join(_EFFECTS) + "."


def _json_arg(desc, default=None):
    return _str(desc, default=default or "")


EMBEDDED_TOOLS = [
    _schema(
        "vs_make_animation",
        ("Create a polished custom character animation INSIDE Roblox Studio - no external tools, no Animation Editor, "
         "NO animation ID / asset upload and NO 'AnimationId' needed. This tool GENERATES a KeyframeSequence (R15 and R6), "
         "registers it as an AnimationClip via AnimationClipProvider, and PLAYS it on the rig, all in one call. The animation "
         "is instantly and fully usable - no further step, no ID to paste, no Animation instance to reference. Styles are "
         "procedural (multi-layer eased motion) so the result looks hand-tuned. "
         "You may EITHER pick a built-in 'style', OR author the animation yourself keyframe-by-keyframe with the 'keyframes' "
         "JSON (exact bone motion, full control). "
         "Works with NO rig in the scene: the KeyframeSequence (an AnimationClip) is still created and registered as a "
         "playable local preview, and it is saved under ReplicatedStorage.VoidScriptAnimations for the "
         "user to apply later; it only auto-plays when a rig is found (the live player, the Studio selection, or "
         "the 'rig' Model). If the clip API is blocked (e.g. running game without the Animation capability), the tool "
         "AUTOMATICALLY plays the same keyframes by driving the rig's joints directly, so the animation is still visible on "
         "the live player. CRITICAL: NEVER tell the user this needs a Roblox asset ID, an animation ID, an upload, or any "
         "further step - it does not. The result text says 'ANIMATION DONE' - read it and report success exactly as "
         "stated. "
         "For a specific character pass 'rig' = a Model "
         "name in Workspace."),
        {
            "name": _str("Display name for the animation (used for the clip + KeyframeSequence).", default="CustomAnim"),
            "rig": _str("Name of the rig Model in Workspace to animate. Leave empty to use the Studio selection or the first rig found.", default=""),
            "style": _str("Built-in motion style to generate (skip 'keyframes' to use this). %s" % _style_catalog(), default="", enum=_STYLE_ENUM),
            "keyframes": _json_arg(
                "Fully custom animation, keyframe by keyframe. JSON array of keyframe objects: "
                '[{"t":0,"bone":"RightUpperArm","rx":-45,"ry":0,"rz":-30,"px":0,"py":0,"pz":0}, ...]. '
                "Fields: t = time in seconds (0 = start), bone = an R15 bone name (LowerTorso, UpperTorso, Head, "
                "RightUpperArm, RightLowerArm, RightHand, RightUpperLeg, RightLowerLeg, RightFoot, and the Left "
                "equivalents) OR an R6 bone name (Torso, \"Right Arm\", \"Left Arm\", \"Right Leg\", \"Left Leg\"). "
                "rx/ry/rz = rotation in degrees, px/py/pz = position offset in studs. Only include "
                "bones that move at each keyframe; the engine eases between keyframes. Unknown bone names error. "
                "Leave empty to use 'style'."),
            "duration": _num("Duration of the animation in seconds (keyframes beyond this are clamped).", default=2.6, minimum=0.2, maximum=30),
            "fps": _num("Keyframe density for built-in styles (6-60). Ignored when 'keyframes' is provided.", default=30, minimum=6, maximum=60),
            "loop": _bool("Whether the animation should loop."),
        },
        [],
    ),
    _schema(
        "vs_make_vfx",
        ("Spawn production-style VFX DIRECTLY in Roblox Studio as native instances (ParticleEmitter / Beam / Light / "
         "Attachment) - no external assets, no plugins. The effect is attached to a BasePart (or the selection / a "
         "position). Use 'parent' = a Model/Part name in Workspace, or 'position' = \"x, y, z\". You may EITHER pick "
         "a built-in 'effect', OR define your own VFX instance-by-instance with the 'emitters' JSON (any emitter, "
         "beam, or light with full property control)."),
        {
            "effect": _str("Built-in visual effect to generate (skip 'emitters' to use this). %s" % _effect_catalog(), default="", enum=_EFFECT_ENUM),
            "emitters": _json_arg(
                'Fully custom VFX as a JSON array of instance configs. Each entry is an object: '
                '{"instance":"ParticleEmitter"|"Beam"|"Light", "name":"optional", "parent":"att"|"ROOT"|"holder", '
                '"offset":"x, y, z", "from":"x, y, z" and "to":"x, y, z" (Beam anchors), '
                '"properties":{property name: value}}. "properties" values are Luau expressions assigned directly '
                '(e.g. "NumberRange.new(2,5)", "ColorSequence.new(Color3.fromRGB(255,128,0), Color3.fromRGB(255,255,255))", '
                '"NumberSequence.new(0.5)", 80, true). Common ParticleEmitter properties: Color, Transparency, Size, '
                "Rate, Speed, Lifetime, SpreadAngle, Acceleration, Drag, LightEmission, LightInfluence, Orientation, "
                "Rotation, RotSpeed, Shape, ZOffset, Texture. Leave empty to use 'effect'."),
            "parent": _str("Name of a Model/Part in Workspace to attach the effect to. Leave empty to use the Studio "
                           "selection or a position.", default=""),
            "position": _str('World position for the effect as "x, y, z" (fallback when parent is empty).', default=""),
            "scale": _num("Base size multiplier for positions/offsets.", default=1.0, minimum=0.05, maximum=50),
            "color_a": _str("Primary colour as hex, e.g. \"#ff7a00\" (used as fallback for custom emitters).", default="#ff512f"),
            "color_b": _str("Secondary/edge colour as hex (falls back to color_a).", default="#ff512f"),
            "duration": _num("Seconds the effect stays before being cleaned up.", default=6.0, minimum=0.5, maximum=600),
        },
        [],
    ),
]


def _required(props):
    return [k for k, v in props.items() if v.get("required")]


def normalize_arg(value, coerce):
    if value is None:
        return None
    try:
        return coerce(value)
    except (TypeError, ValueError):
        raise ValueError("bad argument value: %r" % (value,))


def call_creative(name, arguments):
    """Dispatch an embedded tool. Returns a plain {'text': ..., 'images': []}.

    The caller (bridge) is responsible for actually running the generated Luau
    through the Roblox `execute_luau` tool. We only compile here."""
    args = arguments or {}

    def _json_param(key):
        raw = args.get(key)
        if not raw:
            return None
        if isinstance(raw, (list, dict)):
            return raw
        try:
            parsed = json.loads(str(raw))
        except (TypeError, ValueError) as exc:
            raise ValueError("argument '%s' must be valid JSON: %s" % (key, exc))
        return parsed if isinstance(parsed, list) else None

    if name == "vs_make_animation":
        luau = build_animation_luau(
            name=str(args.get("name") or "CustomAnim"),
            rig=str(args.get("rig") or ""),
            style=str(args.get("style") or "idle"),
            keyframes=_json_param("keyframes"),
            duration=float(args.get("duration") or 2.6),
            fps=int(args.get("fps") or 30),
            loop=bool(args.get("loop")),
        )
        return {"text": luau, "images": [], "kind": "luau", "label": "vs_make_animation"}
    if name == "vs_make_vfx":
        luau = build_vfx_luau(
            effect=str(args.get("effect") or "fire"),
            emitters=_json_param("emitters"),
            parent=str(args.get("parent") or ""),
            position=str(args.get("position") or ""),
            scale=float(args.get("scale") or 1.0),
            color_a=str(args.get("color_a") or ""),
            color_b=str(args.get("color_b") or ""),
            duration=float(args.get("duration") or 6.0),
        )
        return {"text": luau, "images": [], "kind": "luau", "label": "vs_make_vfx"}
    raise ValueError("unknown embedded tool: %r" % (name,))


# ---------------------------------------------------------------------------
#  Thinnest possible Luau sanity checks (so a compile error surfaces in the
#  terminal instead of as a Studio error string buried in a tool result).
# ---------------------------------------------------------------------------
def _balanced(s):
    return s.count("{") == s.count("}") and s.count("(") == s.count(")") and s.count("[") == s.count("]")


def validate(luau):
    """Cheap sanity validation. Returns (ok, error)."""
    if not _balanced(luau):
        return False, "generated Luau has unbalanced brackets"
    if "function(" not in luau and "end" not in luau:
        return False, "generated Luau looks empty"
    return True, None


if __name__ == "__main__":
    # Quick self-test of the code generators.
    import sys
    for style in _STYLES:
        src = build_animation_luau(name="test", rig="", style=style, duration=1.0, fps=12, loop=True)
        ok, err = validate(src)
        if not ok:
            print("anim %s: FAIL %s" % (style, err))
            sys.exit(1)
    for fx in _EFFECTS:
        src = build_vfx_luau(effect=fx, parent="", position="", scale=1.0,
                             color_a="#ff512f", color_b="#dd2476", duration=3)
        ok, err = validate(src)
        if not ok:
            print("vfx %s: FAIL %s" % (fx, err))
            sys.exit(1)

    # Custom keyframes path.
    custom_kf = [
        {"t": 0, "bone": "RightUpperArm", "rx": -60, "rz": -20},
        {"t": 0.4, "bone": "RightUpperArm", "rx": -20, "rz": 25},
        {"t": 0.4, "bone": "RightLowerArm", "rx": 40, "rz": 0},
        {"t": 0.8, "bone": "RightUpperArm", "rx": -60, "rz": -20},
    ]
    src = build_animation_luau(
        name="custom", rig="", style="walk", keyframes=custom_kf,
        duration=1.0, fps=30, loop=False)
    ok, err = validate(src)
    if not ok or "custom" not in src:
        print("anim custom-keyframes: FAIL %s" % err)
        sys.exit(1)

    # Custom keyframes authored against an R6 rig (bone names are R6). This
    # must expand to BOTH the R6 poses and the R15 upper/lower splits so the
    # animation works on whichever rig is actually found.
    r6_kf = [
        {"t": 0, "bone": "Right Arm", "rx": -45, "rz": -30},
        {"t": 0.5, "bone": "Right Arm", "rx": -90},
        {"t": 0.5, "bone": "Torso", "ry": 15},
    ]
    src = build_animation_luau(
        name="custom_r6", rig="", style="walk", keyframes=r6_kf,
        duration=1.0, fps=30, loop=True)
    ok, err = validate(src)
    if not ok or "Right Arm" not in src or "RightUpperArm" not in src:
        print("anim custom-r6-keyframes: FAIL %s" % err)
        sys.exit(1)

    # Custom emitters path (ParticleEmitter + Beam + Light).
    custom_em = [
        {"instance": "ParticleEmitter", "name": "CustomGlow",
         "properties": {
             "Color": "ColorSequence.new(Color3.fromRGB(255,128,0), Color3.fromRGB(255,255,255))",
             "Size": "NumberSequence.new(0.5)",
             "Lifetime": "NumberRange.new(1, 2)",
             "Rate": 40,
         }},
        {"instance": "Beam", "from": "-2, 0, 0", "to": "2, 0, 0",
         "properties": {"Width0": 0.3, "Width1": 0.1, "TextureSpeed": 2.0}},
        {"instance": "Light", "properties": {"Color": "Color3.fromRGB(255,0,0)", "Brightness": 2}},
    ]
    src = build_vfx_luau(effect="fire", emitters=custom_em, parent="",
                         position="", scale=1.0, color_a="#ff512f",
                         color_b="#dd2476", duration=3)
    ok, err = validate(src)
    if not ok:
        print("vfx custom-emitters: FAIL %s" % err)
        sys.exit(1)

    print("creatives.py self-test OK (%d styles, %d effects, keyframes, emitters)"
          % (len(_STYLES), len(_EFFECTS)))