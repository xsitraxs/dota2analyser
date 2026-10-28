#!/usr/bin/env python3
"""Проверки безопасности tools/build-data.py без сети.

Запуск: python3 tools/check-build-data.py

Проверяет:
  * источники закреплены на коммитах, а не на ветках (refs/heads/master);
  * распаковка отклоняет path traversal ('../'), символические ссылки
    и снимает бит исполнения с распакованных файлов;
  * пустой или «битый» архив приводит к понятной ошибке, а не к мусору в src/data.
"""
from __future__ import annotations

import importlib.util
import io
import os
import sys
import tarfile
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("build_data", HERE / "build-data.py")
build_data = importlib.util.module_from_spec(SPEC)
sys.modules["build_data"] = build_data
SPEC.loader.exec_module(build_data)

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print("ok    %s" % name)
    else:
        print("FAIL  %s%s" % (name, (" — " + detail) if detail else ""))
        failures.append(name)


# 1. Источники закреплены
sources = getattr(build_data, "SOURCES", {})
check(
    "источники закреплены на коммитах",
    bool(sources)
    and all("/tar.gz/" in url and "refs/heads" not in url for url, _sha in sources.values()),
    str(sources),
)

# 2. Распаковка безопасна
def make_tar(entries):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, data, typ, link in entries:
            info = tarfile.TarInfo(name)
            info.type = typ
            info.linkname = link
            if data is not None:
                info.size = len(data)
            tar.addfile(info, io.BytesIO(data) if data is not None else None)
    buf.seek(0)
    return buf


with tempfile.TemporaryDirectory() as tmp:
    tmp_path = Path(tmp)
    payload = make_tar(
        [
            ("repo/ok.json", b"{}", tarfile.REGTYPE, ""),
            ("repo/../../evil.json", b"pwned", tarfile.REGTYPE, ""),
            ("repo/link", b"", tarfile.SYMTYPE, "/etc/passwd"),
            ("repo/run.sh", b"#!/bin/sh\necho hi\n", tarfile.REGTYPE, ""),
        ]
    )
    with tarfile.open(fileobj=payload, mode="r:gz") as tar:
        members = list(build_data._safe_members(tar, str(tmp_path)))
        try:
            tar.extractall(str(tmp_path), members=members, filter="data")
        except TypeError:
            tar.extractall(str(tmp_path), members=members)

    files = {str(p.relative_to(tmp_path)): p for p in tmp_path.rglob("*") if p.is_file()}
    check("path traversal отброшен", "evil.json" not in files and not (tmp_path.parent / "evil.json").exists())
    check("символическая ссылка отброшена", "repo/link" not in files, str(sorted(files)))
    mode = files.get("repo/run.sh")
    check(
        "бит исполнения снят",
        mode is None or not (mode.stat().st_mode & 0o111),
        oct(mode.stat().st_mode) if mode else "файл не найден",
    )

# 3. Пустой архив — понятная ошибка
with tempfile.TemporaryDirectory() as tmp:
    empty = make_tar([])
    path = Path(tmp) / "empty.tar.gz"
    path.write_bytes(empty.getvalue())
    try:
        build_data.extract(str(path), "empty-repo")
        check("пустой архив останавливает сборку", False, "extract() завершился без ошибки")
    except SystemExit as error:
        check("пустой архив останавливает сборку", "пуст" in str(error).lower(), str(error))

print()
if failures:
    print("Есть ошибки: %s" % ", ".join(failures))
    sys.exit(1)
print("Все проверки build-data.py пройдены.")
