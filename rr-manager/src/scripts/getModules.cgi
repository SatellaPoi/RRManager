#!/usr/bin/env python

import os
import json
import sys
import glob
import shutil
import tarfile
import subprocess
from pathlib import Path
import kmodule

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
def read_modules(modules_path, user_config):
    MS = glob.glob(os.path.join(modules_path, "*.tgz"))
    MS.sort()
    modules = {}
    TMP_PATH = "/tmp/modules"
    if os.path.exists(TMP_PATH):
        shutil.rmtree(TMP_PATH)
    for M in MS:
        M_name = os.path.splitext(os.path.basename(M))[0]
        M_modules = {}
        os.makedirs(TMP_PATH, exist_ok=True)
        with tarfile.open(M, "r") as tar:
            tar.extractall(TMP_PATH)
        KS = glob.glob(os.path.join(TMP_PATH, "*.ko"))
        KS.sort()
        for K in KS:
            K_name = os.path.splitext(os.path.basename(K))[0]
            K_info = kmodule.modinfo(K, basedir=os.path.dirname(K), kernel=None)[0]
            K_description = K_info.get("description", "")
            K_depends = K_info.get("depends", "")
            M_modules[K_name] = {"description": K_description, "depends": K_depends}
        modules[M_name] = M_modules
        if os.path.exists(TMP_PATH):
            shutil.rmtree(TMP_PATH)
    return modules


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

            # Read user configuration
            user_config = read_user_config()
            if isinstance(user_config, dict):
                # Read manifests
                modules = read_modules(
                    os.path.join("/", "mnt", "p3", "modules"), user_config
                )

                # Construct the response
                response = {
                    "success": True,
                    "result": modules,
                    "userConfig": user_config,
                    "total": len(modules),
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
