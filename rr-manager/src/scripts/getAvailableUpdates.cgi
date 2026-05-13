#!/usr/bin/env python

import os
import re
import json
import sys
import cgi
import cgitb
from pathlib import Path

path_root = Path(__file__).parents[1]
sys.path.append(str(path_root) + "/libs")
import libs.yaml as yaml

cgitb.enable()  # Enable CGI error reporting


# Function to read user configuration from a YAML file
def read_rrmanager_config(file_path):
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


def get_zip_file_metadata(parent_directory):
    zip_files_metadata = []
    # Regex to match files like 'update-24.4.6.zip' or 'updateall-24.4.6.zip'
    pattern = re.compile(r"^(update(?:all)?)-(\d+\.\d+\.\d+)\.zip$")

    # Iterate over all files in the directory
    for entry in os.scandir(parent_directory):
        if entry.is_file() and entry.name.endswith(".zip"):
            match = pattern.match(entry.name)
            if match:
                # Extracting metadata
                file_metadata = {
                    "fileName": entry.name,
                    "filePath": entry.path,
                    "fileSize": round(entry.stat().st_size / (1024 * 1024), 2),
                    "fileVersion": match.group(2),
                }
                zip_files_metadata.append(file_metadata)

    return zip_files_metadata


if __name__ == "__main__":
    user = os.popen("/usr/syno/synoman/webman/modules/authenticate.cgi", "r").read().strip()

    # Debug
    if not user:
        import getpass

        user = getpass.getuser()
        if user != "root":
            user = ""

    response = {}

    if user:
        try:
            rr_config = read_rrmanager_config(
                "/var/packages/rr-manager/target/app/config.txt"
            )
            uploadUpdatesFolder = os.path.join(
                rr_config.get("UPLOAD_DIR_PATH", ""),
                rr_config.get("RR_TMP_DIR", "").lstrip("/"),
            )
            response["result"] = get_zip_file_metadata(uploadUpdatesFolder)
            response["success"] = True
        except Exception as e:
            response["error"] = str(e)
    else:
        response["status"] = "not authenticated"

    print("Content-type: application/json\n")
    print(json.dumps(response, indent=4))
