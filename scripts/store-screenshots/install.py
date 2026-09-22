#!/usr/bin/env python3
"""캡처 결과를 저장소의 스토어 자산 경로로 배치하고 config 를 맞춘다.

- app-store: 6.9형 원본을 두고 6.5형은 여기서 리사이즈해 파생한다.
- play-store: 폰은 8개 로케일, 태블릿은 ko-KR/en-US 만 쓴다.
- assets(루트) 세트는 두 스토어의 기본 언어인 ko-KR 캡처를 그대로 쓴다.
"""
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build/store-screenshots/shots"

LOCALES = ["ko-KR", "en-US", "ja", "zh-Hans", "zh-Hant", "de", "fr", "es"]
TABLET_LOCALES = ["ko-KR", "en-US"]
SCENES = ["1-initial", "2-harvest", "3-return", "4-grown"]
DEFAULT_LOCALE = "ko-KR"  # 두 스토어의 기본 언어(primaryLanguage/defaultLanguage)

IPHONE_65_SIZE = (1284, 2778)

# Play 의 7형/10형 태블릿 슬롯은 같은 1440x2560 캡처를 공유한다. 기존 자산도 두
# 슬롯이 동일 파일이었고, Play 는 슬롯별로 다른 기기를 요구하지 않는다.
TABLET_SOURCE = "tablet-7"
TABLET_SLOTS = (("sevenInchTabletScreenshots", "tablet-7"), ("tenInchTabletScreenshots", "tablet-10"))


def copy(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)
    return dest


def resize(src, dest, size):
    dest.parent.mkdir(parents=True, exist_ok=True)
    width, height = size
    subprocess.run(
        ["sips", "--resampleHeightWidth", str(height), str(width), str(src), "--out", str(dest)],
        check=True, capture_output=True,
    )
    return dest


def relative(path):
    return str(path.relative_to(ROOT))


def place_app_store():
    localized = {}
    for locale in LOCALES:
        entry = {"iphone69": [], "iphone65": [], "ipad13": []}
        for index, scene in enumerate(SCENES, start=1):
            source69 = SHOTS / locale / "iphone-6.9" / f"{scene}.png"
            dest69 = copy(source69, ROOT / "app-store/screenshots" / locale / "iphone-6.9" / f"iphone-{index}.png")
            dest65 = resize(
                source69,
                ROOT / "app-store/screenshots" / locale / "iphone-6.5" / f"iphone-{index}.png",
                IPHONE_65_SIZE,
            )
            dest13 = copy(
                SHOTS / locale / "ipad-13" / f"{scene}.png",
                ROOT / "app-store/screenshots" / locale / "ipad-13" / f"ipad-{index}.png",
            )
            entry["iphone69"].append(relative(dest69))
            entry["iphone65"].append(relative(dest65))
            entry["ipad13"].append(relative(dest13))
        localized[locale] = entry

    # assets(루트) 세트 = 기본 언어 캡처.
    assets = {"iphoneScreenshots69": [], "iphoneScreenshots65": [], "ipadScreenshots13": []}
    for index, scene in enumerate(SCENES, start=1):
        source69 = SHOTS / DEFAULT_LOCALE / "iphone-6.9" / f"{scene}.png"
        assets["iphoneScreenshots69"].append(
            relative(copy(source69, ROOT / "app-store/screenshots/iphone-6.9" / f"iphone-{index}.png"))
        )
        assets["iphoneScreenshots65"].append(
            relative(resize(source69, ROOT / "app-store/screenshots/iphone-6.5" / f"iphone-{index}.png", IPHONE_65_SIZE))
        )
        assets["ipadScreenshots13"].append(
            relative(copy(
                SHOTS / DEFAULT_LOCALE / "ipad-13" / f"{scene}.png",
                ROOT / "app-store/screenshots/ipad-13" / f"ipad-{index}.png",
            ))
        )
    return localized, assets


def place_play_store():
    localized = {}
    for locale in LOCALES:
        entry = {}
        if locale in TABLET_LOCALES:
            entry["featureGraphic"] = f"play-store/assets/{locale}/feature-graphic-1024x500.png"
        entry["phoneScreenshots"] = []
        for index, scene in enumerate(SCENES, start=1):
            entry["phoneScreenshots"].append(relative(copy(
                SHOTS / locale / "phone" / f"{scene}.png",
                ROOT / "play-store/screenshots" / locale / "phone" / f"phone-{index}.png",
            )))
        if locale in TABLET_LOCALES:
            for field, stem in TABLET_SLOTS:
                paths = []
                for index, scene in enumerate(SCENES, start=1):
                    paths.append(relative(copy(
                        SHOTS / locale / TABLET_SOURCE / f"{scene}.png",
                        ROOT / "play-store/screenshots" / locale / stem / f"{stem}-{index}.png",
                    )))
                entry[field] = paths
        localized[locale] = entry

    assets = {"phoneScreenshots": [], "sevenInchTabletScreenshots": [], "tenInchTabletScreenshots": []}
    for index, scene in enumerate(SCENES, start=1):
        assets["phoneScreenshots"].append(relative(copy(
            SHOTS / DEFAULT_LOCALE / "phone" / f"{scene}.png",
            ROOT / "play-store/screenshots/phone" / f"phone-{index}.png",
        )))
        for field, stem in TABLET_SLOTS:
            assets[field].append(relative(copy(
                SHOTS / DEFAULT_LOCALE / TABLET_SOURCE / f"{scene}.png",
                ROOT / "play-store/screenshots" / stem / f"{stem}-{index}.png",
            )))
    return localized, assets


def update_json(path, mutate):
    with path.open(encoding="utf-8") as file:
        config = json.load(file)
    mutate(config)
    with path.open("w", encoding="utf-8") as file:
        json.dump(config, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main():
    app_localized, app_assets = place_app_store()
    play_localized, play_assets = place_play_store()

    def mutate_app(config):
        config["localizedScreenshots"] = app_localized
        config["assets"].update(app_assets)
        captured_at = datetime.now().strftime("%Y-%m-%d")
        config["screenshotRequirements"]["iphone"]["capturedAt"] = captured_at
        config["screenshotRequirements"]["ipad"]["capturedAt"] = captured_at

    def mutate_play(config):
        config["localizedAssets"] = play_localized
        config["assets"].update(play_assets)

    update_json(ROOT / "app-store/app-store.config.json", mutate_app)
    update_json(ROOT / "play-store/google-play.config.json", mutate_play)
    print("배치 완료")


if __name__ == "__main__":
    main()
