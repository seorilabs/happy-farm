#!/usr/bin/env python3
"""디스플레이 서체(Baloo 2 ExtraBold) 부분 집합을 만든다(#606).

숫자, 라틴 문자, 기본 기호만 남겨 100KB 이하로 줄인다. 한중일 문자는 시스템 굵은 글씨를 쓴다.
원본: https://github.com/google/fonts/tree/main/ofl/baloo2 의 Baloo2[wght].ttf (SIL OFL 1.1)

사용: python3 scripts/build-display-font.py <Baloo2-wght.ttf> [출력 경로]
iOS(PostScript 이름)와 Android(assets/fonts 파일 이름)가 같은 fontFamily로 찾도록 이름을
Baloo2-ExtraBold로 고정한다.
"""
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

POSTSCRIPT_NAME = "Baloo2-ExtraBold"
FAMILY_NAME = "Baloo 2 ExtraBold"
UNICODES = (
    list(range(0x20, 0x7F))  # 기본 라틴, 숫자, 기호
    + list(range(0xA0, 0x100))  # 라틴-1 보충(독일어, 프랑스어, 스페인어 악센트)
    + list(range(0x100, 0x180))  # 라틴 확장-A
    + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x00D7, 0x2212, 0x20AC]
)


def main() -> None:
    source = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("assets/fonts") / f"{POSTSCRIPT_NAME}.ttf"
    font = TTFont(source)
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": 800}, updateFontNames=False)
    options = Options()
    options.layout_features = ["kern", "liga", "calt", "tnum", "lnum"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.notdef_outline = True
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    names = font["name"]
    for record in list(names.names):
        if record.nameID in (16, 17):
            names.removeNames(nameID=record.nameID)
    names.setName(FAMILY_NAME, 1, 3, 1, 0x409)
    names.setName("Regular", 2, 3, 1, 0x409)
    names.setName(FAMILY_NAME, 4, 3, 1, 0x409)
    names.setName(POSTSCRIPT_NAME, 6, 3, 1, 0x409)
    names.setName(f"{POSTSCRIPT_NAME};subset", 3, 3, 1, 0x409)
    font["OS/2"].usWeightClass = 400
    out.parent.mkdir(parents=True, exist_ok=True)
    font.save(out)
    print(f"{out}: {out.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
