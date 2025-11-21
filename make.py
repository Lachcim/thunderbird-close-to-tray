import os
import shutil

root = os.path.dirname(os.path.realpath(__file__))
dist = os.path.join(root, "dist")
src = os.path.join(root, "src")
license = os.path.join(root, "LICENSE")

betterbird_block_files = [
    os.path.join(dist, "closeToTray.js"),
    os.path.join(dist, "ui/error.html")
]

def get_archive_name(betterbird_enabled):
    archive_name = "close-to-tray"

    if betterbird_enabled:
        archive_name += "-betterbird"

    archive_name += ".xpi"
    return os.path.join(root, archive_name)

def remove_betterbird_blocks(path, betterbird_enabled):
    source = ""

    skip = False
    with open(path) as file:
        for line in file:
            if "beginBetterbird" in line or "beginNoBetterbird" in line:
                skip = ("beginBetterbird" in line) != betterbird_enabled
                continue

            if "endBetterbird" in line or "endNoBetterbird" in line:
                skip = False
                continue

            if not skip:
                source += line

    with open(path, "w") as file:
        file.write(source)

for betterbird_enabled in [False, True]:
    shutil.rmtree(dist, ignore_errors=True)
    shutil.copytree(src, dist)
    shutil.copy(license, dist)

    for file in betterbird_block_files:
        remove_betterbird_blocks(file, betterbird_enabled)

    archive_name = get_archive_name(betterbird_enabled)

    archive_name_zip = shutil.make_archive(archive_name, "zip", dist)
    os.rename(archive_name_zip, archive_name)

shutil.rmtree(dist)
