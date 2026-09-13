#!/usr/bin/env python3
"""
Build the SiHalal gallery: copy screenshots into img/ and generate the manifest.

Run from the repo root:   python3 build.py
Re-run any time you add, rename, or delete screenshots.

To customise a step's caption, edit OVERRIDES below (key = output filename).
"""
import hashlib
import json
import os
import re
import shutil
import struct
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# Image types picked up from a source folder. JPEG is here because frames
# extracted from a screen recording come out as .jpg, not .png.
IMAGE_EXTS = (".png", ".jpg", ".jpeg")

# Source folders on this machine. Change these if you move the originals.
SOURCES = {
    "pu":  "/home/trisan/Pictures/sihalal-pu",
    "p3h": "/home/trisan/Pictures/sihalal-p3h",
}

GALLERIES = {
    "pu": {
        "title": "Pendaftaran Pelaku Usaha (PU)",
        "subtitle": "Alur pendaftaran akun dan pengajuan sertifikat halal untuk Pelaku Usaha",
        "dir": "img/pu",
        "page": "sihalal-pu.html",
    },
    "p3h": {
        "title": "Verifikasi P3H",
        "subtitle": "Alur verifikasi dan validasi oleh P3H pada aplikasi SiHalal",
        "dir": "img/p3h",
        "page": "sihalal-p3h.html",
    },
}

# Filenames that were mis-numbered at capture time: {source name: output name}.
# 01-sub5-1.png is the "Bahan" tab of step 10 (sub5), captured just before
# 10-sub5-1a.png -- the "01-" prefix is a typo for "10-".
RENAMES = {
    "pu": {"01-sub5-1.png": "10-sub5-1.png"},
}

# Optional per-image caption overrides, keyed by output filename.
# e.g. OVERRIDES["pu"]["10-sub9-ok.png"] = "Pengajuan berhasil dikirim"
OVERRIDES = {"pu": {}, "p3h": {}}

# Extra cards on the landing page that link to a page hosted elsewhere.
# These are not galleries -- no images are copied and no viewer is opened.
# Add another dict here to add another card.
#
# Currently empty: the "Langkah Verval Pendamping PPH" card used to open
# p3jph.biz.id in a new tab, but that written guide is now one of the two items
# ON verval-p3h.html, so the card points there instead and the landing page
# stays a clean 2x2. An empty list removes these cards entirely.
EXTERNAL_LINKS = []

# Videos hosted in this repo. Each is copied to vid/ under a CONTENT-HASHED
# name, which is what lets _headers give /vid/* a long immutable cache: swap
# the file and the URL changes, so no cache can serve the old one. (The image
# folders use stable step numbers on purpose, so their caches stay short.)
VIDEOS = {
    "nib": {
        "title": "Tutor NIB lewat OSS",
        "subtitle": "Alur perekaman NIB perseorangan pada sistem OSS, "
                    "direkam langsung dari layar.",
        "src": "/home/trisan/Pictures/nib-tutor/igexport-DYORPypS1SA.mp4",
        "poster": "img/vid/nib-poster.jpg",
        "page": "nib-tutor.html",
        "source_url": "https://www.instagram.com/reel/DYORPypS1SA/",
        "site": "instagram.com",
    },
    "p3h": {
        "title": "Verval Pendamping PPH",
        "subtitle": "Proses verval pendampingan PPH: berada di lokasi produksi "
                    "bersama Pelaku Usaha / Penyelia Halal.",
        "src": "/home/trisan/Pictures/sihalal-p3h/verval-p3h-trim.mp4",
        "poster": "img/vid/verval-poster.jpg",
        "page": "verval-p3h.html",
        "source_url": "https://www.youtube.com/watch?v=K9s_9yGcGF4",
        "site": "youtube.com",
        # The written guide this page accompanies. Rendered as the first of the
        # page's two items, above the video.
        "article": {
            "title": "Langkah Verval Pendamping PPH",
            "subtitle": "Panduan tertulis: cara proses verval pendampingan PPH, "
                        "berada di lokasi produksi bersama Pelaku Usaha / "
                        "Penyelia Halal.",
            "url": "https://www.p3jph.biz.id/informasi/cara-verval-p3h",
            "site": "p3jph.biz.id",
        },
    },
}

# Poster frames are cropped stills, committed under img/ rather than generated
# here: the crop is a one-off judgement call, not something to recompute.
# See README if you need to redo one.

# Words that should keep their original casing in generated captions.
ACRONYMS = {
    "pu": "PU", "p3h": "P3H", "p3jph": "P3JPH", "kbli": "KBLI", "oss": "OSS",
    "ovw": "Overview", "verval": "Verval", "dash": "Dashboard", "ok": "OK",
    "sub": "Sub", "profil": "Profil", "datapu": "Data PU", "edit": "Edit",
    "pabrik": "Pabrik", "penyelia": "Penyelia", "questioner": "Kuesioner",
    "update": "Update", "npm": "NPM", "npwp": "NPWP",
}


def digest(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.digest()


def differs(src, dst):
    """True if dst is missing or its bytes differ from src.

    Compares content, not mtime. A re-saved image can end up with an mtime
    older than the copy already in the repo -- restored backups, editors that
    preserve timestamps, rsync -t -- and an mtime check would silently leave a
    stale image committed. Size is compared first since it is free.
    """
    if not os.path.exists(dst):
        return True
    if os.path.getsize(src) != os.path.getsize(dst):
        return True
    return digest(src) != digest(dst)


def natural_key(path):
    """Sort key that orders 2 before 10 and 10-sub3-4 before 10-sub3-4a."""
    stem, ext = os.path.splitext(os.path.basename(path))
    chunks = re.split(r"(\d+)", stem)
    key = [(0, int(c), "") if c.isdigit() else (1, 0, c.lower())
           for c in chunks if c != ""]
    return (key, ext.lower())


def humanize(stem):
    """'10-sub5-2a' -> '10 · Sub 5 · 2a'"""
    parts = [p for p in stem.split("-") if p]
    if not parts:
        return stem
    step, rest = parts[0], parts[1:]
    words = []
    for part in rest:
        m = re.match(r"^([a-z]+)(\d+)([a-z]?)$", part)          # sub5 / profil1 / 2a
        if m:
            base, num, suffix = m.groups()
            word = ACRONYMS.get(base, base.capitalize())
            words.append(f"{word} {num}{suffix}")
        else:
            m = re.match(r"^(\d+)([a-z]?)$", part)               # 4 / 4a
            if m:
                words.append(f"{m.group(1)}{m.group(2)}")
            else:
                words.append(ACRONYMS.get(part, part.capitalize()))
    return " · ".join([step] + words)


def read_atom(fh):
    """(total_size, 4-byte type) for the atom at the cursor, or (None, None)."""
    head = fh.read(8)
    if len(head) < 8:
        return None, None
    size, kind = struct.unpack(">I4s", head)
    if size == 1:                                   # 64-bit "largesize" follows
        size = struct.unpack(">Q", fh.read(8))[0]
    if size < 8:                                    # malformed, or size==0
        return None, None
    return size, kind


def mvhd_seconds(fh, moov_end):
    """Runtime in seconds from the mvhd atom that sits inside moov."""
    while fh.tell() < moov_end:
        pos = fh.tell()
        size, kind = read_atom(fh)
        if size is None:
            return None
        if kind == b"mvhd":
            version = fh.read(1)[0]
            fh.read(3)                              # flags
            if version == 1:
                fh.read(16)                         # created + modified (64-bit)
                timescale = struct.unpack(">I", fh.read(4))[0]
                duration = struct.unpack(">Q", fh.read(8))[0]
            else:
                fh.read(8)                          # created + modified (32-bit)
                timescale = struct.unpack(">I", fh.read(4))[0]
                duration = struct.unpack(">I", fh.read(4))[0]
            return duration / timescale if timescale else None
        fh.seek(pos + size)
    return None


def mp4_duration(path):
    """Runtime in seconds, read out of the MP4 itself.

    Derived rather than configured so a card can never advertise a runtime the
    file no longer has: trim or replace the video and this follows. Returns
    None if the file is not a parseable MP4, and the duration badge is dropped.
    """
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            end = fh.tell()
            fh.seek(0)
            while fh.tell() < end:
                pos = fh.tell()
                size, kind = read_atom(fh)
                if size is None:
                    break
                if kind == b"moov":
                    return mvhd_seconds(fh, pos + size)
                fh.seek(pos + size)
    except (OSError, struct.error):
        return None
    return None


def tkhd_dims(fh, trak_end):
    """(width, height) from the tkhd atom inside one trak, or None.

    tkhd is fixed-layout after the version byte: a creation..duration block
    that is 20 bytes at version 0 and 32 at version 1, then reserved, layer
    and volume, then the 9-entry transform matrix, then width and height as
    16.16 fixed point. Seeking past the matrix is what lands on them.
    """
    while fh.tell() < trak_end:
        pos = fh.tell()
        size, kind = read_atom(fh)
        if size is None:
            return None
        if kind == b"tkhd":
            version = fh.read(1)[0]
            fh.read(3)                                  # flags
            fh.read(32 if version == 1 else 20)         # created..duration
            fh.read(8)                                  # reserved
            fh.read(8)                                  # layer, group, volume
            fh.read(36)                                 # matrix
            w = struct.unpack(">I", fh.read(4))[0] / 65536
            h = struct.unpack(">I", fh.read(4))[0] / 65536
            return w, h
        fh.seek(pos + size)
    return None


def mp4_dims(path):
    """Pixel size of the video track, read from moov/trak/tkhd.

    The <video> element wants these before a byte of media loads, so it can
    reserve a box of the right shape -- a wrong ratio reflows the whole page
    the moment metadata arrives. Audio tracks report 0x0, so the first trak
    with real dimensions wins. None if the file is not a parseable MP4, and
    the caller falls back to a nominal 16:9.
    """
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            end = fh.tell()
            fh.seek(0)
            while fh.tell() < end:
                pos = fh.tell()
                size, kind = read_atom(fh)
                if size is None:
                    break
                if kind == b"moov":
                    moov_end = pos + size
                    while fh.tell() < moov_end:
                        trak = fh.tell()
                        tsize, tkind = read_atom(fh)
                        if tsize is None:
                            return None
                        if tkind == b"trak":
                            dims = tkhd_dims(fh, trak + tsize)
                            if dims and dims[0] and dims[1]:
                                return dims
                        fh.seek(trak + tsize)
                    return None
                fh.seek(pos + size)
    except (OSError, struct.error):
        return None
    return None


def build_video(key, spec):
    src = spec["src"]
    if not os.path.isfile(src):
        print(f"  ! video missing, skipping: {src}", file=sys.stderr)
        return None

    out_dir = os.path.join(ROOT, "vid")
    os.makedirs(out_dir, exist_ok=True)
    ext = os.path.splitext(src)[1].lower() or ".mp4"
    name = f"{key}-{digest(src).hex()[:10]}{ext}"
    dst = os.path.join(out_dir, name)
    if not os.path.exists(dst):
        shutil.copy2(src, dst)

    # An earlier hash of the same video is dead weight: 10 MB in git as well as
    # on the deployed site, and nothing links to it once the manifest moves on.
    removed = 0
    for existing in os.listdir(out_dir):
        if existing.startswith(key + "-") and existing != name:
            os.remove(os.path.join(out_dir, existing))
            removed += 1

    entry = {
        "key": key,
        "title": spec["title"],
        "subtitle": spec["subtitle"],
        "page": spec["page"],
        "poster": spec["poster"],
        "src": f"vid/{name}",
        "source_url": spec["source_url"],
        "site": spec["site"],
    }
    if spec.get("article"):
        entry["article"] = spec["article"]
    secs = mp4_duration(dst)
    if secs:
        entry["duration"] = f"{int(secs) // 60}:{int(secs) % 60:02d}"
    dims = mp4_dims(dst)
    if dims:
        entry["w"], entry["h"] = int(dims[0]), int(dims[1])

    mb = os.path.getsize(dst) / 1e6
    print(f"  {key}: vid/{name} ({mb:.1f} MB, {entry.get('duration', '?')}, "
          f"{removed} stale removed)")
    return entry


def build_gallery(key, spec):
    src_dir = SOURCES[key]
    if not os.path.isdir(src_dir):
        print(f"  ! source missing, skipping: {src_dir}", file=sys.stderr)
        return None

    rename = RENAMES.get(key, {})
    out_dir = os.path.join(ROOT, spec["dir"])
    os.makedirs(out_dir, exist_ok=True)

    sources = sorted(
        (f for f in os.listdir(src_dir) if f.lower().endswith(IMAGE_EXTS)),
        key=natural_key,
    )

    entries, copied = [], 0
    for name in sources:
        out_name = rename.get(name, name)
        dst = os.path.join(out_dir, out_name)
        src = os.path.join(src_dir, name)
        if differs(src, dst):
            shutil.copy2(src, dst)
            copied += 1
        stem = os.path.splitext(out_name)[0]
        entries.append({
            "f": out_name,
            "t": OVERRIDES.get(key, {}).get(out_name, humanize(stem)),
        })

    # Re-sort by output name so a rename lands in the right place.
    entries.sort(key=lambda e: natural_key(e["f"]))

    # Drop stale files that are no longer in the source set.
    keep = {e["f"] for e in entries}
    removed = 0
    for existing in os.listdir(out_dir):
        if existing not in keep:
            os.remove(os.path.join(out_dir, existing))
            removed += 1

    print(f"  {key}: {len(entries)} images ({copied} copied, {removed} stale removed)")
    return {"title": spec["title"], "subtitle": spec["subtitle"],
            "page": spec["page"], "dir": spec["dir"], "images": entries}


def main():
    print("Building SiHalal gallery")
    manifest = {}
    for key, spec in GALLERIES.items():
        result = build_gallery(key, spec)
        if result:
            manifest[key] = result

    videos = [v for v in (build_video(k, s) for k, s in VIDEOS.items()) if v]

    out = os.path.join(ROOT, "assets", "manifest.js")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by build.py -- do not edit by hand. */\n")
        fh.write("window.GALLERIES = ")
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write(";\n\n")
        fh.write("window.VIDEOS = ")
        json.dump(videos, fh, ensure_ascii=False, indent=2)
        fh.write(";\n\n")
        fh.write("window.EXTERNAL_LINKS = ")
        json.dump(EXTERNAL_LINKS, fh, ensure_ascii=False, indent=2)
        fh.write(";\n")
    print(f"  wrote assets/manifest.js ({len(manifest)} galleries, "
          f"{len(videos)} videos, {len(EXTERNAL_LINKS)} external links)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
