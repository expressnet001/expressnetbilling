"""Small GenieACS NBI client used by tenant-scoped TR-069 router tools."""
import json
import os
import re
from urllib.parse import quote

import requests
from django.conf import settings


class Tr069Error(Exception):
    def __init__(self, message, status_code=502):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _config():
    base_url = str(getattr(settings, "GENIEACS_NBI_URL", "") or os.getenv("GENIEACS_NBI_URL", "")).strip().rstrip("/")
    username = str(getattr(settings, "GENIEACS_NBI_USERNAME", "") or os.getenv("GENIEACS_NBI_USERNAME", "")).strip()
    password = str(getattr(settings, "GENIEACS_NBI_PASSWORD", "") or os.getenv("GENIEACS_NBI_PASSWORD", ""))
    if not base_url:
        raise Tr069Error("TR-069 is not connected. Configure the GenieACS NBI URL and credentials in the server environment.", 503)
    if not base_url.startswith(("https://", "http://")):
        raise Tr069Error("The GenieACS NBI URL must start with http:// or https://.", 503)
    return base_url, (username, password) if username else None


def _request(method, path, *, params=None, payload=None):
    base_url, auth = _config()
    try:
        response = requests.request(
            method,
            f"{base_url}/{path.lstrip('/')}",
            params=params,
            json=payload,
            auth=auth,
            timeout=20,
        )
    except requests.RequestException as exc:
        raise Tr069Error("Could not reach the TR-069 ACS. Check the GenieACS service and server network connection.", 502) from exc
    if response.status_code >= 400:
        if response.status_code in {401, 403}:
            raise Tr069Error("The GenieACS NBI rejected its credentials. Check the server environment settings.", 502)
        if response.status_code == 404:
            return None
        raise Tr069Error(f"GenieACS returned an error (HTTP {response.status_code}).", 502)
    if response.status_code == 204 or not response.content:
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise Tr069Error("GenieACS returned an unreadable response.", 502) from exc


def find_device_by_serial(serial_number):
    serial = str(serial_number or "").strip()
    if not serial:
        return None
    records = _request("GET", "/devices/", params={"query": json.dumps({"_deviceId._SerialNumber": serial})}) or []
    if not records:
        # GenieACS device IDs conventionally end with the CPE serial number.
        records = _request(
            "GET",
            "/devices/",
            params={"query": json.dumps({"_id": {"$regex": f"-{re.escape(serial)}$"}})},
        ) or []
    if not isinstance(records, list):
        raise Tr069Error("GenieACS returned an unexpected device list.")
    return records[0] if records else None


def _flatten_parameters(value, prefix="", result=None):
    result = result if result is not None else []
    if len(result) >= 400:
        return result
    if isinstance(value, dict):
        if "_value" in value:
            # Do not return cached credentials or secret values to the browser.
            if not re.search(r"password|secret|privatekey|pre.?shared.?key|credential", prefix, re.I):
                result.append({"name": prefix, "value": value.get("_value"), "writable": bool(value.get("_writable"))})
            return result
        for key, child in value.items():
            if key.startswith("_"):
                continue
            _flatten_parameters(child, f"{prefix}.{key}" if prefix else key, result)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _flatten_parameters(child, f"{prefix}.{index}" if prefix else str(index), result)
    return result


def writable_parameter_names(value, prefix="", result=None):
    result = result if result is not None else set()
    if isinstance(value, dict):
        if "_value" in value:
            if value.get("_writable"):
                result.add(prefix)
            return result
        for key, child in value.items():
            if key.startswith("_"):
                continue
            writable_parameter_names(child, f"{prefix}.{key}" if prefix else key, result)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            writable_parameter_names(child, f"{prefix}.{index}" if prefix else str(index), result)
    return result


def public_device(device):
    if not device:
        return None
    device_id = str(device.get("_id") or "")
    device_info = device.get("InternetGatewayDevice", {}).get("DeviceInfo", {})
    device_root = device.get("Device", {}).get("DeviceInfo", {})
    get_value = lambda mapping, key: (mapping.get(key) or {}).get("_value") if isinstance(mapping.get(key), dict) else mapping.get(key)
    return {
        "device_id": device_id,
        "manufacturer": get_value(device_info, "Manufacturer") or get_value(device_root, "Manufacturer") or "",
        "model": get_value(device_info, "ModelName") or get_value(device_root, "ModelName") or "",
        "serial_number": get_value(device_info, "SerialNumber") or get_value(device_root, "SerialNumber") or "",
        "last_inform": device.get("_lastInform") or "",
        "parameters": _flatten_parameters(device),
        "writable_parameters": sorted(writable_parameter_names(device))[:500],
    }


def queue_task(device_id, task, *, connection_request=True):
    safe_id = quote(str(device_id or ""), safe="")
    if not safe_id:
        raise Tr069Error("The ACS device identifier is missing.", 400)
    params = {"connection_request": ""} if connection_request else None
    return _request("POST", f"/devices/{safe_id}/tasks", params=params, payload=task)


def validate_parameter_name(name):
    value = str(name or "").strip()
    if len(value) > 512 or not re.fullmatch(r"(?:InternetGatewayDevice|Device)\.[A-Za-z0-9_\-\.]+", value):
        raise Tr069Error("Enter a valid TR-069 parameter path beginning with InternetGatewayDevice. or Device.", 400)
    if re.search(r"(?:^|\.)(?:ManagementServer|X_.*ACS|FactoryReset)(?:\.|$)", value, re.I):
        raise Tr069Error("ACS connection and factory reset settings cannot be changed from this page.", 400)
    return value
