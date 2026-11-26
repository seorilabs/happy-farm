#!/usr/bin/env python3
"""게임 UI 스킨과 아이콘을 실행용 크기로 만든다(#606).

원본(assets/art/ui/ui_skin_*.png, ui_icon_*.png)은 생성 해상도라 크다. 스킨은 높이를 줄인 뒤
왼쪽 끝, 늘어나는 가운데 한 줄, 오른쪽 끝 세 조각으로 자르고, 아이콘은 정사각 크기를 줄인다.
결과는 assets/art/ui/runtime/에 쓰고, scripts/generate-ui-art.mjs가 mobile 자산과 AIT base64로
옮긴다. 원본이 바뀌면 이 스크립트와 generate-ui-art.mjs를 차례로 다시 돌린다.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/art/ui"
OUT = SOURCE / "runtime"
SKIN_HEIGHT = 120
CENTER_WIDTH = 4
ICON_SIZE = 96
# 끝 조각 폭(높이 대비). 알약 모양은 둥근 끝 전체, 패널은 모서리만 담는다.
SKINS = {
    "primary": ("ui_skin_primary_normal.png", 0.56),
    "secondary": ("ui_skin_secondary_normal.png", 0.56),
    "chip": ("ui_skin_chip.png", 0.56),
    "panel": ("ui_skin_panel.png", 0.22),
}
ICONS = ["coin", "star", "more", "daily", "goal", "shop", "missions", "harvest", "ranch", "kitchen", "settings", "wheel", "pointer"]


def save(image: Image.Image, path: Path) -> int:
    # 팔레트 PNG로 줄인다. 반투명 가장자리가 있어 알파를 유지하는 FASTOCTREE를 쓴다.
    image.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)
    return path.stat().st_size


def average_column(image: Image.Image, start: int, end: int) -> Image.Image:
    band = image.crop((start + (end - start) // 4, 0, end - (end - start) // 4, image.height))
    return band.resize((1, image.height), Image.Resampling.BOX)


def feather(cap: Image.Image, column: Image.Image, toward_right: bool, ratio: float = 0.45) -> Image.Image:
    # 안쪽 가장자리 쪽 ratio 구간에서 가운데 열과 선형으로 섞는다.
    width, height = cap.size
    blend_width = max(1, round(width * ratio))
    target = column.resize((width, height))
    out = cap.copy()
    for offset in range(blend_width):
        x = width - 1 - offset if toward_right else offset
        weight = 1 - offset / blend_width
        a = cap.crop((x, 0, x + 1, height))
        b = target.crop((x, 0, x + 1, height))
        out.paste(Image.blend(a, b, weight), (x, 0))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"skins": {}, "icons": ICONS, "skinHeight": SKIN_HEIGHT, "iconSize": ICON_SIZE}
    total = 0
    for key, (file, cap_ratio) in SKINS.items():
        source = Image.open(SOURCE / file).convert("RGBA")
        width = round(source.width * SKIN_HEIGHT / source.height)
        scaled = source.resize((width, SKIN_HEIGHT), Image.Resampling.LANCZOS)
        cap = round(SKIN_HEIGHT * cap_ratio)
        # 조명이 가로로 조금씩 달라 가운데 한 줄과 끝 조각 안쪽 가장자리가 어긋나 보인다.
        # 가운데 구간의 평균 열을 늘어나는 조각으로 쓰고, 끝 조각 안쪽을 그 열로 서서히 맞춘다.
        column = average_column(scaled, cap, width - cap)
        left = feather(scaled.crop((0, 0, cap, SKIN_HEIGHT)), column, toward_right=True)
        right = feather(scaled.crop((width - cap, 0, width, SKIN_HEIGHT)), column, toward_right=False)
        pieces = {
            "left": left,
            "center": column.resize((CENTER_WIDTH, SKIN_HEIGHT)),
            "right": right,
        }
        for part, image in pieces.items():
            total += save(image, OUT / f"ui_skin_{key}_{part}.png")
        manifest["skins"][key] = {"capRatio": round(cap / SKIN_HEIGHT, 4)}
    for key in ICONS:
        source = Image.open(SOURCE / f"ui_icon_{key}.png").convert("RGBA")
        total += save(source.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS), OUT / f"ui_icon_{key}.png")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"runtime UI art: {total // 1024}KB")


if __name__ == "__main__":
    main()
