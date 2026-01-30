import json
import os
import re
import shutil

root = os.path.dirname(os.path.realpath(__file__))
dist = os.path.join(root, "dist")
src = os.path.join(root, "src")
license = os.path.join(root, "LICENSE")
manifest = os.path.join(dist, "manifest.json")

betterbird_block_files = [
    os.path.join(dist, "closeToTray.js"),
    os.path.join(dist, "ui/error.html")
]

def get_archive_name(betterbird_enabled):
    archive_name = "closeToTray-"

    with open(manifest) as file:
        manifest_data = json.load(file)
        archive_name += manifest_data["version"]

        if "strict_max_version" in manifest_data["browser_specific_settings"]["gecko"]:
            max_version = manifest_data["browser_specific_settings"]["gecko"]["strict_max_version"]
            max_version = max_version.replace(".*", "")

            archive_name += f"-tb{max_version}"

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

def amend_extension_name():
    with open(manifest) as file:
        manifest_data = json.load(file)

    manifest_data["name"] += " (for Windows)"

    with open(manifest, "w") as file:
        json.dump(manifest_data, file, indent=4)

def remove_max_version():
    with open(manifest) as file:
        manifest_data = json.load(file)

    del manifest_data["browser_specific_settings"]["gecko"]["strict_max_version"]

    with open(manifest, "w") as file:
        json.dump(manifest_data, file, indent=4)

def ensure_no_betterbird():
    for root, dirs, files in os.walk(dist):
        for path in files:
            if path.endswith(".png"):
                continue

            with open(os.path.join(root, path)) as file:
                assert not re.search("betterbird", file.read(), re.IGNORECASE)

for betterbird_enabled in [False, True]:
    shutil.rmtree(dist, ignore_errors=True)
    shutil.copytree(src, dist)
    shutil.copy(license, dist)

    for file in betterbird_block_files:
        remove_betterbird_blocks(file, betterbird_enabled)

    if betterbird_enabled:
        remove_max_version()
    else:
        amend_extension_name()
        ensure_no_betterbird()

    archive_name = get_archive_name(betterbird_enabled)

    archive_name_zip = shutil.make_archive(archive_name, "zip", dist)
    os.rename(archive_name_zip, archive_name)

shutil.rmtree(dist)
