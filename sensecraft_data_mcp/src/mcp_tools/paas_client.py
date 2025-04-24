from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp import Context
import httpx
import logging
import base64
import os
from typing import Any, Dict, Optional
from .error_info import FAULT


logger = logging.getLogger(__name__)

HOST_NAME = os.getenv("SENSECRAFT_DATA_SERVER_URL")

access_id = os.environ.get('ACCESS_ID')
access_key = os.environ.get('ACCESS_KEY')
if not access_id or not access_key:
    logger.error(f"ACCESS_ID or ACCESS_KEY is not set\n\tACCESS_ID: {access_id}\n\tACCESS_KEY: {access_key}")
    exit(1)
TOKEN = f"Basic {base64.b64encode(f'{access_id}:{access_key}'.encode()).decode()}"
logger.info(f"access_id: {access_id}, access_key: {access_key}, token: {TOKEN}")

logger.info(f"paas_client==>paas_client==>本次使用站点: {HOST_NAME}!")
logger.info("paas_client init successfully.....")


def add_tools(server: FastMCP):
    @server.tool(name="register_device", description="向sensecraft data(sensecap paas)平台注册设备, 会返回设备的eui和device_key")
    async def register_device(device_name, ctx: Context) -> str:
        logger.info(f"paas_client==>register_device device_name: {device_name}")
        url = f"/openapi/device/create_development_kit"
        param = {
            "dev_name": device_name,
            "sku": "blank_device"
        }

        headers = {
            "Authorization": TOKEN
        }
        try:
            result = await http_post(url, param, headers)
        except Exception as e:
            logger.error(f"paas_client==>paas_client==>register_device device_name: {device_name}")
            return ""
        logger.info(f"paas_client==>paas_client==>register_device result: {result}")
        if "eui" not in result and "device_key" not in result:
            logger.info(f"paas_client==>register_device error, message: {result.get('msg')}")
            return ""
        return result['eui']

    @server.tool(name="get_device_key", description="根据sensecraft data(sensecap paas)平台的eui获取设备的device_key和token")
    async def get_device_key(node_eui, ctx: Context) -> dict[str, str]:
        logger.info(f"paas_client==>get_device_key node_eui: {node_eui}")
        url = f"/openapi/device/view_node_key"
        param = {
            "node_eui": node_eui
        }

        headers = {
            "Authorization": TOKEN
        }
        try:
            result = await http_get(url, param, headers)
        except Exception as e:
            logger.error(f"paas_client==>get_device_key error, message: {e}")
            return {"error": f"获取设备的device_key失败, 请稍后重试"}

        if "device_key" not in result:
            logger.info(f"paas_client==>get_device_key error, message: {result}")
            return {"error": f"获取设备的device_key失败, 请稍后重试"}
        return result

    logger.info("paas_client register tools successfully.....")

async def http_post(url: str, params: Dict[str, Any], headers: dict[str, any] = {}) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{HOST_NAME}{url}", json=params, headers=headers)
        if response.status_code != 200:
            raise Exception(f"HTTP请求失败，状态码: {response.status_code}")
        result = response.json()
        if result.get("code") != '0':
            if result.get("code") in FAULT:
                return {
                    "message": FAULT[result.get("code")]
                }
            else:
                raise Exception(f"http_get error, message: {result.get('msg')}")
        return result.get("data", {})


async def http_get(url: str, params: Dict[str, Any] = {}, headers: dict[str, any] = {}) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{HOST_NAME}{url}", params=params, headers=headers)
        if response.status_code != 200:
            raise Exception(f"HTTP请求失败，状态码: {response.status_code}")
        result = response.json()
        if result.get("code") != '0':
            if result.get("code") in FAULT:
                return {
                    "message": FAULT[result.get("code")]
                }
            else:
                raise Exception(f"http_get error, message: {result.get('msg')}")
        return result.get("data", {})