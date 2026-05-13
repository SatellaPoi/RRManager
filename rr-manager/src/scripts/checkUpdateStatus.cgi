#!/usr/bin/env python

import os
import json
import cgi
import cgitb

cgitb.enable()  # Enable CGI error reporting


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


if __name__ == "__main__":
    user = os.popen("/usr/syno/synoman/webman/modules/authenticate.cgi", "r").read().strip()

    # Debug
    if not user:
        import getpass

        user = getpass.getuser()
        if user != "root":
            user = ""

    response = {}
    response["success"] = False
    if user:
        # Parse query string
        arguments = cgi.FieldStorage()
        rr_manager_config = read_rrmanager_config(
            "/var/packages/rr-manager/target/app/config.txt"
        )
        RR_TMP_DIR = rr_manager_config.get("RR_TMP_DIR")
        RR_UPDATE_PROGRESS_FILE = rr_manager_config.get("RR_UPDATE_PROGRESS_FILE")

        if RR_TMP_DIR and RR_UPDATE_PROGRESS_FILE:
            # Construct file path
            file_path = os.path.join("/", RR_TMP_DIR, RR_UPDATE_PROGRESS_FILE)

            if os.path.abspath(file_path).startswith("/tmp/"):
                try:
                    if os.path.exists(file_path):
                        with open(file_path, "r") as file:
                            content = file.read()
                            # Attempt to parse the content as JSON
                            parsed_content = json.loads(content)
                            # Success, set the result
                            response["result"] = parsed_content
                            response["success"] = True
                    else:
                        response["result"] = {"progress": "--", "progressmsg": "--"}
                        response["success"] = True
                except json.JSONDecodeError:
                    response["status"] = "File content is not valid JSON."
                except Exception as e:
                    response["status"] = f"Could not read file: {str(e)}"
            else:
                response["status"] = "Invalid file path."
        else:
            response["status"] = "Filename parameter is missing."
    else:
        response["status"] = "Authentication failed."

    print("Content-type: application/json\n")
    print(json.dumps(response, indent=4))
