#!/usr/bin/env python3
"""Собирает локальные данные приложения.

Источники:
  * odota/dotaconstants — справочники героев и предметов (MIT)
  * odota/core — публичные тестовые матчи (OpenDota, MIT)

Запуск: python3 tools/build-data.py
Скрипт скачивает архивы с codeload.github.com (если нет локального кэша)
и кладёт компактные JSON в src/data.
"""
from __future__ import annotations

import io
import json
import os
import tarfile
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src", "data")
DEMO = os.path.join(DATA, "demo")
CACHE = "/tmp/d2a-build"

GAME_MODES_RU = {
    0: "Неизвестно",
    1: "All Pick",
    2: "Captains Mode",
    3: "Random Draft",
    4: "Single Draft",
    5: "All Random",
    6: "Intro",
    12: "Least Played",
    15: "Custom",
    16: "Captains Draft",
    17: "Balanced Draft",
    18: "Ability Draft",
    20: "All Random Deathmatch",
    21: "1v1 Mid",
    22: "All Pick",
    23: "Turbo",
    24: "Mutation",
}

LOBBY_TYPES_RU = {
    0: "Обычная",
    1: "Тренировка",
    2: "Турнир",
    3: "Обучение",
    4: "С ботами",
    5: "Рейтинг (команда)",
    6: "Рейтинг (соло)",
    7: "Рейтинг",
    8: "1v1 Mid",
    9: "Battle Cup",
    10: "Локальная с ботами",
    11: "Наблюдатель",
    12: "Событие",
    13: "Gauntlet",
    14: "Новый игрок",
}


def fetch_tarball(url: str, name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print("downloading", url)
        with urllib.request.urlopen(url, timeout=120) as response:
            payload = response.read()
        with open(path, "wb") as f:
            f.write(payload)
    return path


def extract(path: str, prefix: str) -> str:
    target = os.path.join(CACHE, prefix)
    if not os.path.exists(target):
        with tarfile.open(path, "r:gz") as tar:
            tar.extractall(target)
    return os.path.join(target, os.listdir(target)[0])


def write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", os.path.relpath(path, ROOT), round(os.path.getsize(path) / 1024), "KB")


def main() -> None:
    constants_repo = extract(
        fetch_tarball("https://codeload.github.com/odota/dotaconstants/tar.gz/refs/heads/master", "dotaconstants.tar.gz"),
        "dotaconstants",
    )
    core_repo = extract(
        fetch_tarball("https://codeload.github.com/odota/core/tar.gz/refs/heads/master", "core.tar.gz"),
        "core",
    )

    with open(os.path.join(constants_repo, "build", "heroes.json"), encoding="utf-8") as f:
        heroes_raw = json.load(f)
    with open(os.path.join(constants_repo, "build", "items.json"), encoding="utf-8") as f:
        items_raw = json.load(f)
    with open(os.path.join(constants_repo, "build", "game_mode.json"), encoding="utf-8") as f:
        modes_raw = json.load(f)

    heroes = {}
    for hero in heroes_raw.values():
        heroes[hero["id"]] = {
            "id": hero["id"],
            "name": hero["name"],
            "localized_name": hero["localized_name"],
            "primary_attr": hero["primary_attr"],
            "attack_type": hero["attack_type"],
            "roles": hero.get("roles", []),
        }

    items = {}
    for key, item in items_raw.items():
        if "id" not in item or "dname" not in item:
            continue
        if key.startswith("recipe_"):
            continue
        items[item["id"]] = {
            "id": item["id"],
            "key": key,
            "dname": item["dname"],
            "cost": item.get("cost", 0),
            "qual": item.get("qual") or "",
        }

    game_modes = {}
    for mode_id, mode in modes_raw.items():
        game_modes[int(mode_id)] = GAME_MODES_RU.get(
            int(mode_id),
            mode.get("name", "game_mode_unknown").replace("game_mode_", "").replace("_", " ").title(),
        )

    write_json(
        os.path.join(DATA, "constants.json"),
        {
            "heroes": heroes,
            "items": items,
            "gameModes": game_modes,
            "lobbyTypes": LOBBY_TYPES_RU,
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
    )

    demos = [
        {
            "api": "7490235544_api.json",
            "parsed": "7490235544_parsed.json",
            "meta": {
                "title": "47 минут фарма и давления",
                "subtitle": "Lifestealer · 10 / 1 / 10 · 737 GPM",
                "note": "Публичный матч из открытого датасета OpenDota. Полный разбор реплея.",
                "featuredSlot": 0,
                "matchId": 7490235544,
            },
        },
        {
            "api": "1781962623_api.json",
            "parsed": "1781962623_parsed.json",
            "meta": {
                "title": "25 убийств на Templar Assassin",
                "subtitle": "TA · 25 / 2 / 6 · 37 минут",
                "note": "Публичный матч из открытого датасета OpenDota. Смотри, где терялся фарм.",
                "featuredSlot": 3,
                "matchId": 1781962623,
            },
        },
    ]

    for demo in demos:
        with open(os.path.join(core_repo, "json", demo["api"]), encoding="utf-8") as f:
            api = json.load(f)
        with open(os.path.join(core_repo, "json", demo["parsed"]), encoding="utf-8") as f:
            parsed = json.load(f)
        payload = {
            "__demo": {
                **demo["meta"],
                "source": "OpenDota / odota/core",
                "license": "MIT",
            },
            "api": api,
            "parsed": parsed,
        }
        write_json(os.path.join(DEMO, f"{demo['meta']['matchId']}.json"), payload)


if __name__ == "__main__":
    main()
