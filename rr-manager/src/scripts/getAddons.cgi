#!/usr/bin/env python

import os
import json
import sys
import glob
import shutil
import subprocess
from pathlib import Path
from urllib.parse import parse_qs

path_root = Path(__file__).parents[1]
sys.path.append(str(path_root) + "/libs")
import libs.yaml as yaml


def call_mount_loader_script(action):
    subprocess.run(
        ["/usr/bin/rr-loaderdisk.sh", action],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )


# Function to read user configuration from a YAML file
def read_user_config():
    data = "{}"
    # call_mount_loader_script("mountLoaderDisk")
    try:
        with open("/mnt/p1/user-config.yml", "r") as file:
            data = yaml.safe_load(file)
    except Exception as e:
        data = f"Exception: {e}"
    # call_mount_loader_script("unmountLoaderDisk")
    return data


# Function to read manifests in subdirectories
def read_addons(addons_path, user_config, category):
    installed = user_config.get("addons", [])
    addons = []

    AS = glob.glob(os.path.join(addons_path, "*", "manifest.yml"))
    AS.sort()

    for A in AS:
        with open(A, "r") as file:
            A_data = yaml.safe_load(file)
            A_data["installed"] = A_data.get("name", "") in installed
            if category != "system" or A_data.get("system") == True:
                addons.append(A_data)

    return addons


if __name__ == "__main__":
    user = (
        os.popen("/usr/syno/synoman/webman/modules/authenticate.cgi", "r")
        .read()
        .strip()
    )

    # Debug
    if not user:
        import getpass

        user = getpass.getuser()
        if user != "root":
            user = ""

    response = {}

    if user:
        try:
            call_mount_loader_script("mountLoaderDisk")

            # Extract category from query string
            query_string = os.environ.get("QUERY_STRING", "")
            category = parse_qs(query_string).get("category", [None])[0]

            # Read user configuration
            user_config = read_user_config()
            if isinstance(user_config, dict):
                # Read manifests
                addons = read_addons(
                    os.path.join("/", "mnt", "p3", "addons"), user_config, category
                )

                # Construct the response
                response = {
                    "success": True,
                    "result": addons,
                    "userConfig": user_config,
                    "total": len(addons),
                }
            else:
                response = {"success": False, "error": "Error reading user-config.yml"}

            call_mount_loader_script("unmountLoaderDisk")
        except Exception as e:
            response = {"success": False, "error": f"An exception occurred: {str(e)}"}
    else:
        response = {"status": "not authenticated"}

    print("Content-type: application/json\n")
    print(json.dumps(response, indent=4))
