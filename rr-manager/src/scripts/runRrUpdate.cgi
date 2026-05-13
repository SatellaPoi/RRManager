#!/usr/bin/env python

import os
import json
import sys
import cgi
import cgitb
import shlex
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, unquote

path_root = Path(__file__).parents[1]
sys.path.append(str(path_root) + "/libs")
import libs.yaml as yaml

cgitb.enable()  # Enable CGI error reporting


def call_mount_loader_script(action):
    subprocess.run(
        ["/usr/bin/rr-loaderdisk.sh", action],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )


def read_config(file_path):
    try:
        config = {}
        with open(file_path, "r") as file:
            for line in file:
                line = line.strip()
                if line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip()
        return config
    except IOError as e:
        return f"Error reading user-config.yml: {e}"
    except Exception:
        return "{}"


def rmove_file(path, default=None):
    try:
        safe_path = shlex.quote(path)
        if os.path.exists("/usr/sbin/rrmdo"):
            return os.popen(f"/usr/sbin/rrmdo rm -f {safe_path}").read().strip()
        else:
            return os.popen(f"rm -f {safe_path}").read().strip()
    except Exception:
        return default


def updateRR(file, progress):
    try:
        safe_file = shlex.quote(file)
        safe_progress = shlex.quote(progress)
        subprocess.Popen(
            f"/usr/bin/rr-loaderdisk.sh mountLoaderDisk && /usr/bin/rr-update.sh updateRR {safe_file} {safe_progress} && /usr/bin/rr-loaderdisk.sh unmountLoaderDisk",
            preexec_fn=os.setsid,
            close_fds=False,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


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
            if os.environ.get("REQUEST_METHOD") == "GET":
                # Extract query string from environment variable
                query_string = os.environ.get("QUERY_STRING", "")
                query_params = parse_qs(query_string)
                file_update_encoded = query_params.get("file", [None])[0]
                file_update = unquote(file_update_encoded or "").strip()

                response["file"] = file_update
                if not file_update:
                    raise Exception("file is empty")

                rr_manager_config = read_config("/var/packages/rr-manager/target/app/config.txt")
                RR_TMP_DIR = rr_manager_config.get("RR_TMP_DIR")
                RR_UPDATE_PROGRESS_FILE = rr_manager_config.get("RR_UPDATE_PROGRESS_FILE")
                # 删除文件
                file_progress = os.path.join("/", RR_TMP_DIR, RR_UPDATE_PROGRESS_FILE)
                rmove_file(file_progress)
                # call_mount_loader_script("mountLoaderDisk")
                updateRR(file_update, file_progress)
                # call_mount_loader_script("umountLoaderDisk")
                response["success"] = True
            else:
                response["success"] = False
                response["message"] = "Invalid request method"
        except Exception as e:
            response["success"] = False
            response["error"] = str(e)
    else:
        response["success"] = False
        response["status"] = "not authenticated"

    print("Content-type: application/json\n")
    print(json.dumps(response, indent=4))
