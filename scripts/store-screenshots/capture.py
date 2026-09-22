#!/usr/bin/env python3
"""스토어 스크린샷 캡처 오케스트레이터.

장면 시드(make-seeds.mjs 산출)를 실제 앱의 AsyncStorage 에 심고, 로케일별로
앱을 띄워 캡처한다. iOS 는 simctl, Android 는 adb 를 쓴다.
"""
import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SAVE_KEY = "farmTycoonSave"
LAST_SEEN_KEY = "farmTycoonSave.lastSeen"
SETTINGS_KEY = "happy-farm:settings:v1"
INLINE_THRESHOLD = 1024  # RCTInlineValueThreshold

LOCALES = ["ko-KR", "en-US", "ja", "zh-Hans", "zh-Hant", "de", "fr", "es"]
SCENES = ["1-initial", "2-harvest", "3-return", "4-grown"]


def run(cmd, check=True, **kwargs):
    return subprocess.run(cmd, check=check, capture_output=True, text=True, **kwargs)


def settings_payload(locale):
    return {
        "locale": locale,
        "soundEffectsEnabled": True,
        "backgroundMusicEnabled": False,
        "hapticsEnabled": True,
        "weatherEffectsEnabled": True,
        "harvestNotificationsEnabled": False,
        "comebackRemindersEnabled": False,
    }


def rebase_timestamps(save, now_ms):
    """시드가 담은 '지금으로부터의 오프셋(ms)' 을 이번 캡처의 현재 시각으로 환산한다.

    캡처는 로케일 × 장면마다 수십 분 동안 돌기 때문에, 생성 시각을 굳혀 두면 뒤쪽
    캡처에서 성장 중이던 밭이 전부 익어 화면이 달라진다.
    """
    for plot in save["plots"]:
        if plot["state"] == 1 and plot["startTime"] is not None and plot["startTime"] <= 0:
            plot["startTime"] = now_ms + plot["startTime"]
    save["dailyBonusState"]["lastClaimedAt"] = now_ms
    save["wheelState"]["lastFreeSpinAt"] = now_ms
    return save


def storage_entries(seed_path, locale, now_ms):
    scene = json.loads(seed_path.read_text(encoding="utf-8"))
    save = rebase_timestamps(scene["save"], now_ms)
    return {
        SAVE_KEY: json.dumps(save, separators=(",", ":")),
        LAST_SEEN_KEY: str(now_ms + scene["lastSeenOffsetMs"]),
        SETTINGS_KEY: json.dumps(settings_payload(locale), separators=(",", ":")),
    }


# ── iOS ────────────────────────────────────────────────────────────
def ios_storage_dir(udid, bundle_id):
    container = run(["xcrun", "simctl", "get_app_container", udid, bundle_id, "data"]).stdout.strip()
    return Path(container) / "Library" / "Application Support" / bundle_id / "RCTAsyncLocalStorage_V1"


def ios_seed(udid, bundle_id, entries):
    directory = ios_storage_dir(udid, bundle_id)
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for key, value in entries.items():
        if len(value.encode("utf-8")) <= INLINE_THRESHOLD:
            manifest[key] = value
        else:
            manifest[key] = None
            (directory / hashlib.md5(key.encode("utf-8")).hexdigest()).write_text(value, encoding="utf-8")
    (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def ios_capture(udid, bundle_id, out_path, settle, taps):
    run(["xcrun", "simctl", "terminate", udid, bundle_id], check=False)
    time.sleep(1)
    run(["xcrun", "simctl", "launch", udid, bundle_id])
    time.sleep(settle)
    for x, y, pause in taps:
        subprocess.run(
            [IDB, "ui", "tap", "--udid", udid, str(x), str(y)],
            check=True, capture_output=True, text=True,
        )
        time.sleep(pause)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # 헤드리스 시뮬레이터의 screenshot 은 간헐적으로 exit 60 으로 실패한다. 몇 초
    # 두었다 다시 찍으면 통과하므로, 한 장 때문에 캡처 전체가 멈추지 않게 한다.
    for attempt in range(4):
        result = run(["xcrun", "simctl", "io", udid, "screenshot", "--type=png", str(out_path)], check=False)
        if result.returncode == 0:
            return
        time.sleep(3)
    raise RuntimeError(f"스크린샷 실패: {out_path} ({result.stderr.strip()[:200]})")


# ── Android ────────────────────────────────────────────────────────
def adb(serial, *args, **kwargs):
    return run(["adb", "-s", serial, *args], **kwargs)


def android_seed(serial, package, entries):
    """RKStorage(SQLite) 를 내려받아 값을 갈아끼우고 다시 올린다."""
    db_remote = f"/data/data/{package}/databases/RKStorage"
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / "RKStorage"
        pulled = subprocess.run(
            ["adb", "-s", serial, "exec-out", f"run-as {package} cat {db_remote}"],
            capture_output=True,
        )
        if pulled.returncode != 0 or not pulled.stdout:
            raise RuntimeError(f"RKStorage 를 가져오지 못했습니다: {pulled.stderr.decode()[:200]}")
        local.write_bytes(pulled.stdout)

        connection = sqlite3.connect(local)
        connection.execute(
            "CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        for key, value in entries.items():
            connection.execute(
                "INSERT OR REPLACE INTO catalystLocalStorage (key, value) VALUES (?, ?)", (key, value)
            )
        connection.commit()
        connection.close()

        adb(serial, "push", str(local), "/data/local/tmp/RKStorage")
        adb(serial, "shell", f"run-as {package} cp /data/local/tmp/RKStorage {db_remote}")
        for suffix in ("-wal", "-shm"):
            adb(serial, "shell", f"run-as {package} rm -f {db_remote}{suffix}", check=False)
        adb(serial, "shell", "rm -f /data/local/tmp/RKStorage")


def android_capture(serial, package, activity, out_path, settle, taps):
    # adb 데몬이 재시작되면 reverse 가 사라져 debug 빌드가 Metro 를 잃는다. 앱을
    # 띄울 때마다 다시 걸어 둔다(이미 걸려 있으면 무해).
    adb(serial, "reverse", "tcp:8081", "tcp:8081", check=False)
    adb(serial, "shell", f"am force-stop {package}")
    time.sleep(1)
    adb(serial, "shell", f"am start -n {package}/{activity}")
    time.sleep(settle)
    for x, y, pause in taps:
        adb(serial, "shell", f"input tap {x} {y}")
        time.sleep(pause)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    captured = subprocess.run(["adb", "-s", serial, "exec-out", "screencap", "-p"], capture_output=True)
    if captured.returncode != 0 or not captured.stdout:
        raise RuntimeError("screencap 실패")
    out_path.write_bytes(captured.stdout)


IDB = os.path.expanduser("~/.local/share/seorilabs/idb/venv/bin/idb")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", choices=["ios", "android"])
    parser.add_argument("--udid", default=None)
    parser.add_argument("--serial", default=None)
    parser.add_argument("--bundle-id", default="com.seorilabs.happyfarm")
    parser.add_argument("--package", default="com.seorilabs.happyfarm.debug")
    parser.add_argument("--activity", default="com.seorilabs.happyfarm.MainActivity")
    parser.add_argument("--seeds", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--label", required=True, help="출력 하위 폴더 이름(예: iphone-6.9)")
    parser.add_argument("--locales", nargs="*", default=LOCALES)
    parser.add_argument("--scenes", nargs="*", default=SCENES)
    parser.add_argument("--settle", type=float, default=9.0)
    parser.add_argument("--taps", default=None, help='장면별 탭 JSON: {"3-sheet": [[x,y,대기초]]}')
    args = parser.parse_args()

    seeds_dir = Path(args.seeds)
    out_root = Path(args.out)
    taps_by_scene = json.loads(args.taps) if args.taps else {}

    for locale in args.locales:
        for scene in args.scenes:
            seed = seeds_dir / f"{scene}.json"
            entries = storage_entries(seed, locale, int(time.time() * 1000))
            out_path = out_root / locale / args.label / f"{scene}.png"
            taps = taps_by_scene.get(scene, [])
            if args.platform == "ios":
                ios_seed(args.udid, args.bundle_id, entries)
                ios_capture(args.udid, args.bundle_id, out_path, args.settle, taps)
            else:
                android_seed(args.serial, args.package, entries)
                android_capture(args.serial, args.package, args.activity, out_path, args.settle, taps)
            print(f"{locale}/{args.label}/{scene}.png", flush=True)


if __name__ == "__main__":
    sys.exit(main())
