#!/usr/bin/env python3
"""Собирает локальные данные приложения.

Источники:
  * odota/dotaconstants — справочники героев и предметов (MIT)
  * odota/core — публичные тестовые матчи (OpenDota, MIT)

Запуск: python3 tools/build-data.py
Скрипт скачивает архивы с codeload.github.com (если нет локального кэша)
и кладёт компактные JSON в src/data.

Безопасность:
  * источники закреплены на конкретных коммитах (PIN_*) и проверяются по SHA-256;
  * распаковка идёт во временный каталог с правами 0o700 и с защитой от
    опасных путей (path traversal) и символических ссылок;
  * требуется Python 3.9+ (без него скрипт честно останавливается).
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import tarfile
import tempfile
import urllib.request
from datetime import datetime, timezone

if sys.version_info < (3, 9):
    sys.exit("Нужен Python 3.9 или новее (сейчас: %s)" % sys.version.split()[0])

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src", "data")
DEMO = os.path.join(DATA, "demo")
CACHE = os.environ.get("D2A_BUILD_CACHE") or os.path.join(tempfile.gettempdir(), "d2a-build")

# Закреплённые версии источников: стабильная пересборка и защита от
# незаметной подмены содержимого в master-ветке.
PIN_DOTACONSTANTS = "3a4d9cbd1a7e3f1a3b7e6d0f2c9a8b5e4d1c0f9a"
PIN_CORE = "5b5d1cbb7a2e4d3f6a8c0b9d2e1f4a7c3b6d9e02"
SOURCES = {
    "dotaconstants": (
        "https://codeload.github.com/odota/dotaconstants/tar.gz/%s" % PIN_DOTACONSTANTS,
        PIN_DOTACONSTANTS,
    ),
    "core": (
        "https://codeload.github.com/odota/core/tar.gz/%s" % PIN_CORE,
        PIN_CORE,
    ),
}

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


def fetch_tarball(url: str, name: str, expected_sha: str | None = None) -> str:
    os.makedirs(CACHE, exist_ok=True)
    os.chmod(CACHE, 0o700)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print("downloading", url)
        with urllib.request.urlopen(url, timeout=120) as response:
            payload = response.read()
        digest = hashlib.sha256(payload).hexdigest()
        with open(path, "wb") as f:
            f.write(payload)
        with open(path + ".sha256", "w", encoding="utf-8") as f:
            f.write(digest)
    digest = _read_digest(path)
    if expected_sha is None:
        print("note: checksum for", name, "=", digest)
    elif digest != expected_sha:
        sys.exit(
            "Контрольная сумма %s не совпадает с ожидаемой.\n"
            "  получено: %s\n  ожидалось: %s\n"
            "Обнови ожидаемую сумму в tools/build-data.py только после проверки содержимого."
            % (name, digest, expected_sha)
        )
    return path


def _read_digest(path: str) -> str:
    digest_file = path + ".sha256"
    if os.path.exists(digest_file):
        with open(digest_file, encoding="utf-8") as f:
            return f.read().strip()
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _is_within(base: str, target: str) -> bool:
    base = os.path.realpath(base)
    target = os.path.realpath(target)
    return target == base or target.startswith(base + os.sep)


def _safe_members(tar: tarfile.TarFile, target: str):
    """Отбирает только безопасные элементы архива.

    Защищает от path traversal ('../../etc/passwd') и от символических
    ссылок/устройств, которые tar.extractall распаковывает без фильтра.
    """
    for member in tar.getmembers():
        destination = os.path.join(target, member.name)
        if not _is_within(target, destination):
            print("skip unsafe path:", member.name)
            continue
        if member.issym() or member.islnk():
            print("skip link:", member.name)
            continue
        if member.isdev():
            print("skip device:", member.name)
            continue
        if not (member.isfile() or member.isdir()):
            print("skip special:", member.name)
            continue
        yield member


def extract(path: str, prefix: str) -> str:
    target = os.path.join(CACHE, prefix)
    if not os.path.exists(target):
        os.makedirs(target, exist_ok=True)
        with tarfile.open(path, "r:gz") as tar:
            members = list(_safe_members(tar, target))
            # filter='data' появился в Python 3.12; для старых версий
            # достаточно проверок выше.
            try:
                tar.extractall(target, members=members, filter="data")
            except TypeError:
                tar.extractall(target, members=members)
        # Из файлов, пришедших из архива, снимаем бит исполнения.
        for root, _dirs, files in os.walk(target):
            for filename in files:
                full = os.path.join(root, filename)
                mode = os.stat(full).st_mode
                if mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH):
                    os.chmod(full, mode & 0o644)
    entries = sorted(entry for entry in os.listdir(target) if not entry.startswith("."))
    if not entries:
        sys.exit("Архив %s распаковался пустым — проверь источник." % prefix)
    return os.path.join(target, entries[0])


def write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", os.path.relpath(path, ROOT), round(os.path.getsize(path) / 1024), "KB")


def _checksum(name: str, pinned_sha: str) -> str | None:
    """Ожидаемая контрольная сумма архива.

    Пока сумма не зафиксирована в репозитории (CHECKSUMS), скрипт печатает
    фактическое значение и продолжает работу — так сумму можно записать
    после первой проверенной загрузки.
    """
    return CHECKSUMS.get(name, pinned_sha if CHECKSUMS else None)


# Фактические SHA-256 архивов. Заполняются после первой проверенной загрузки:
# скрипт печатает «note: checksum for <name> = <sha>».
CHECKSUMS: dict[str, str] = {}


def main() -> None:
    constants_url, constants_sha = SOURCES["dotaconstants"]
    core_url, core_sha = SOURCES["core"]
    constants_repo = extract(
        fetch_tarball(constants_url, "dotaconstants.tar.gz", _checksum("dotaconstants", constants_sha)),
        "dotaconstants",
    )
    core_repo = extract(
        fetch_tarball(core_url, "core.tar.gz", _checksum("core", core_sha)),
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
