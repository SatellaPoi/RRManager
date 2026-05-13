#!/usr/bin/env python

import os
import json
import sys
import subprocess
from pathlib import Path

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


def read_rrmanager_config(file_path):
    try:
        config = {}
        with open(file_path, "r") as file:
            for line in file:
                line = line.strip()
                if line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip().replace('"', "")
        return config
    except IOError as e:
        return f"Error reading {file_path}: {e}"
    except Exception as e:
        return "{}"


def read_rrmanager_privilege(file_path):
    try:
        with open(file_path, "r") as file:
            return json.load(file)
    except IOError as e:
        # Handle I/O errors (e.g., file not found)
        return f"Error reading {file_path}: {e}"
    except json.JSONDecodeError as e:
        # Handle errors caused by incorrect JSON formatting
        return f"Error decoding JSON from {file_path}: {e}"
    except Exception as e:
        # Generic exception handler for any other unforeseen errors
        return "{}"


def read_rr_awaiting_update(file_name):
    file_path = os.path.join("/tmp", file_name)
    try:
        with open(file_path, "r"):
            return "awaiting_reboot"
    except IOError:
        return "healthy"
    except Exception:
        return "healthy"


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
        response["status"] = "authenticated"
        response["user"] = user
        response["rr_version"] = read_rrmanager_config("/usr/rr/VERSION")
        call_mount_loader_script("mountLoaderDisk")
        response["user_config"] = read_user_config()
        call_mount_loader_script("unmountLoaderDisk")
        response["rr_manager_config"] = read_rrmanager_config(
            "/var/packages/rr-manager/target/app/config.txt"
        )
        response["rr_manager_privilege"] = read_rrmanager_privilege(
            "/var/packages/rr-manager/conf/privilege"
        )
        response["rr_health"] = read_rr_awaiting_update(
            response["rr_manager_config"].get("RR_UPDATE_PROGRESS_FILE")
        )
    else:
        response["status"] = "not authenticated"

    print("Content-type: application/json\n")
    print(json.dumps(response, indent=4))
